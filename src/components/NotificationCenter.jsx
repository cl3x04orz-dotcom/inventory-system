import React, { useState, useEffect, useRef } from 'react';
import { ShoppingBag, Bell, BellOff, ArrowRight, X } from 'lucide-react';
import { callGAS } from '../utils/api';

export default function NotificationCenter({ user, apiUrl, setPage }) {
  const [notifications, setNotifications] = useState([]);
  const [activeToast, setActiveToast] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [permissionRequested, setPermissionRequested] = useState(false);
  // 初始化時間戳記錄 (設為 30 秒前，避免剛開網頁漏掉剛成立的訂單)
  const lastTimestampRef = useRef(new Date(Date.now() - 30000).toISOString());

  // 🛡️ 權限過濾：目前僅開通 BOSS (老闆) 角色接收下單通知
  const isBoss = user && (user.role === 'BOSS' || user.role === 'SUPER_ADMIN');

  // 播放 Web Audio API 提示音 (無需外部音效檔，相容所有瀏覽器)
  const playChimeSound = () => {
    if (isMuted) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();

      // 叮咚二連音 (Tone 1: 880Hz, Tone 2: 1320Hz)
      const playTone = (freq, startTime, duration) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + startTime);
        
        gain.gain.setValueAtTime(0.3, ctx.currentTime + startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startTime + duration);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(ctx.currentTime + startTime);
        osc.stop(ctx.currentTime + startTime + duration);
      };

      playTone(880, 0, 0.25);
      playTone(1320, 0.15, 0.5);
    } catch (e) {
      console.warn('[Notification] Sound autoplay prevented by browser:', e);
    }
  };

  // 發送 HTML5 桌面系統推播 (Desktop OS Notification)
  const triggerDesktopNotification = (notif) => {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') {
      try {
        const title = notif.title || '🛒 有人線上下單囉！';
        const body = notif.body || `顧客：${notif.customerName} | 金額：$${notif.totalAmount} 元 (${notif.sourceGroup || '線上下單'})`;
        const icon = './logo192.png';

        if (navigator.serviceWorker && navigator.serviceWorker.controller) {
          navigator.serviceWorker.ready.then(reg => {
            reg.showNotification(title, {
              body,
              icon,
              badge: icon,
              vibrate: [200, 100, 200, 100, 200],
              tag: notif.id || `notif_${Date.now()}`,
              renotify: true,
              data: { url: './#pendingOrders' }
            });
          }).catch(() => {
            new Notification(title, { body, icon, tag: notif.id || 'notif' });
          });
        } else {
          const n = new Notification(title, { body, icon, tag: notif.id || 'notif' });
          n.onclick = () => {
            window.focus();
            if (typeof setPage === 'function') setPage('pendingOrders');
          };
        }
      } catch (e) {
        console.warn('[Notification] Desktop notification error:', e);
      }
    }
  };

  // 測試通知與解鎖瀏覽器聲音
  const handleTestNotification = () => {
    playChimeSound();
    if ('Notification' in window) {
      if (Notification.permission === 'granted') {
        triggerDesktopNotification({
          id: `test_${Date.now()}`,
          title: '🔔 下單通知與音效測試成功！',
          body: '系統已準備就緒，當有人線上下單時將自動在此跳出提示！'
        });
      } else {
        Notification.requestPermission().then(permission => {
          if (permission === 'granted') {
            triggerDesktopNotification({
              id: `test_${Date.now()}`,
              title: '🔔 下單通知授權成功！',
              body: '系統已準備就緒，當有人線上下單時將自動在此跳出提示！'
            });
          }
        });
      }
    }
    setActiveToast({
      id: `test_${Date.now()}`,
      customerName: '測試顧客 (系統播報測試)',
      totalAmount: 168,
      sourceGroup: '測試按鈕'
    });
  };

  // 將 VAPID Base64 公鑰轉為 Uint8Array (瀏覽器 PushManager 標準格式)
  const urlBase64ToUint8Array = (base64String) => {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  };

  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);

  // 離線背景推播手動綁定按鈕 (解決瀏覽器 User Gesture 資安限制)
  const handleEnablePushNotification = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      alert('您的瀏覽器不支援 Web Push 離線推播功能');
      return;
    }

    setPushLoading(true);
    try {
      // 1. 請求通知權限 (User Gesture 下必定觸發彈窗)
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        alert('請在瀏覽器設定中允許「通知」權限，才能啟用離線背景推播！');
        setPushLoading(false);
        return;
      }

      const userToken = user?.token || user?.accessToken || safeLocalStorage.getItem('token');
      const swUrl = './sw.js';

      // 2. 註冊 Service Worker
      const reg = await navigator.serviceWorker.register(swUrl);
      await navigator.serviceWorker.ready;

      // 3. 取得 VAPID 公鑰
      const keyRes = await callGAS(apiUrl, 'getWebPushPublicKey', {}, userToken);
      if (!keyRes || !keyRes.success || !keyRes.publicKey) {
        throw new Error('無法取得推播加密公鑰');
      }

      // 4. 向 Apple / Google 官方推播網關訂閱此設備 (User Gesture 解鎖成功)
      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(keyRes.publicKey)
      });

      // 5. 傳送至後端儲存
      await callGAS(apiUrl, 'subscribeWebPush', { subscription: subscription.toJSON() }, userToken);

      setPushSubscribed(true);
      
      // 立即跳出 OS 背景推播確認
      if (reg.showNotification) {
        reg.showNotification('🎉 離線背景推播啟用成功！', {
          body: '這台設備已成功綁定！即使完全關閉 WEB 網頁，有人下單時也會跳出音效與通知卡片！',
          icon: `${import.meta.env.BASE_URL || '/'}logo.png`.replace(/\/+/g, '/'),
          vibrate: [200, 100, 200]
        });
      }

      alert('🎉 離線背景推播已成功開啟！即使關閉網頁也能收到下單通知！');
    } catch (err) {
      console.error('[WebPush] Manual subscribe error:', err);
      alert('離線推播綁定提示: ' + (err.message || '請確認通知權限已開啟'));
    } finally {
      setPushLoading(false);
    }
  };

  // 註冊 Service Worker (sw.js) 並自動嘗試檢查與同步綁定
  useEffect(() => {
    if (!isBoss || !apiUrl) return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

    const checkPushSub = async () => {
      try {
        const swUrl = './sw.js';
        const reg = await navigator.serviceWorker.register(swUrl);
        const sub = await reg.pushManager.getSubscription();
        
        const userToken = user?.token || user?.accessToken || safeLocalStorage.getItem('token');
        if (!userToken) return;

        // 取得後端最新公鑰，用於比對與確保同步
        const keyRes = await callGAS(apiUrl, 'getWebPushPublicKey', {}, userToken);
        if (!keyRes || !keyRes.success || !keyRes.publicKey) return;

        const serverKeyUint8 = urlBase64ToUint8Array(keyRes.publicKey);

        if (sub) {
          // 比對金鑰：若金鑰不匹配（過期或伺服器重置），自動退訂並重新訂閱新金鑰
          const clientKeyUint8 = new Uint8Array(sub.options.applicationServerKey);
          let keysMatch = serverKeyUint8.byteLength === clientKeyUint8.byteLength;
          if (keysMatch) {
            for (let i = 0; i < serverKeyUint8.byteLength; i++) {
              if (serverKeyUint8[i] !== clientKeyUint8[i]) {
                keysMatch = false;
                break;
              }
            }
          }

          if (keysMatch) {
            setPushSubscribed(true);
            // 自動向後端同步，確保 DB 中的推播訂閱絕對不遺失
            await callGAS(apiUrl, 'subscribeWebPush', { subscription: sub.toJSON() }, userToken);
            console.log('[WebPush] Auto-synced active subscription with backend DB.');
          } else {
            console.log('[WebPush] VAPID keys mismatch detected. Re-subscribing device...');
            try {
              await sub.unsubscribe();
              const newSub = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: serverKeyUint8
              });
              await callGAS(apiUrl, 'subscribeWebPush', { subscription: newSub.toJSON() }, userToken);
              setPushSubscribed(true);
              console.log('[WebPush] Successfully re-subscribed with new VAPID keys.');
            } catch (reSubErr) {
              console.warn('[WebPush] Auto re-subscribe failed:', reSubErr);
            }
          }
        }
      } catch (e) {
        console.warn('[WebPush] Auto subscription check or sync failed:', e);
      }
    };

    checkPushSub();
  }, [isBoss, apiUrl, user]);

  // 定時輪詢新訂單通知 (每 4 秒一次)
  useEffect(() => {
    if (!isBoss || !apiUrl) return;

    let isMounted = true;
    const userToken = user?.token || user?.accessToken || safeLocalStorage.getItem('token');

    const fetchNotifications = async () => {
      try {
        const res = await callGAS(
          apiUrl,
          'getRecentNotifications',
          { sinceTimestamp: lastTimestampRef.current },
          userToken
        );

        if (isMounted && res && res.success && Array.isArray(res.notifications) && res.notifications.length > 0) {
          lastTimestampRef.current = res.latestTimestamp || new Date().toISOString();
          
          // 最新一筆作為前景 Toast 彈窗
          const newest = res.notifications[0];
          setActiveToast(newest);
          setNotifications(prev => [...res.notifications, ...prev].slice(0, 30));

          // 播放提示音與系統推播
          playChimeSound();
          triggerDesktopNotification(newest);
        }
      } catch (err) {
        // Silent catch for network hiccup
      }
    };

    fetchNotifications();
    const interval = setInterval(fetchNotifications, 4000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [isBoss, apiUrl, isMuted, user]);

  // 若不是 BOSS 老闆角色，完全不渲染並停止一切排程
  if (!isBoss) return null;

  return (
    <>
      {/* 💬 WEB 右上角/頂部新訂單懸浮 Toast 通知卡片 */}
      {activeToast && (
        <div className="fixed top-4 right-4 z-[99999] max-w-sm w-full animate-in slide-in-from-top-5 fade-in duration-300">
          <div className="bg-slate-900/90 text-white rounded-2xl p-4 shadow-2xl border border-blue-500/40 backdrop-blur-md flex flex-col gap-2">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="p-2 bg-blue-500/20 text-blue-400 rounded-xl animate-pulse">
                  <ShoppingBag size={20} />
                </span>
                <span className="font-extrabold text-sm text-blue-400 tracking-wide">
                  🛒 有人線上下單囉！
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setIsMuted(!isMuted)}
                  className="p-1 text-slate-400 hover:text-white rounded-lg transition-colors"
                  title={isMuted ? "取消靜音" : "靜音通知"}
                >
                  {isMuted ? <BellOff size={16} /> : <Bell size={16} />}
                </button>
                <button
                  onClick={() => setActiveToast(null)}
                  className="p-1 text-slate-400 hover:text-white rounded-lg transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="text-xs text-slate-200 space-y-1 pl-1">
              <div>
                <span className="text-slate-400">顧客：</span>
                <strong className="text-white font-bold">{activeToast.customerName}</strong>
              </div>
              <div className="flex justify-between items-center">
                <span>
                  <span className="text-slate-400">金額：</span>
                  <strong className="text-emerald-400 font-mono font-bold text-sm">${activeToast.totalAmount}</strong>
                </span>
                <span className="text-[10px] text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full border border-slate-700">
                  {activeToast.sourceGroup}
                </span>
              </div>
            </div>

            <button
              onClick={() => {
                setActiveToast(null);
                if (typeof setPage === 'function') setPage('pendingOrders');
              }}
              className="mt-1 w-full bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs py-2 rounded-xl flex items-center justify-center gap-1 shadow-md shadow-blue-500/30 transition-all active:scale-95"
            >
              一鍵前往審核 <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* 🔊 BOSS 專屬：全時段離線背景推播啟用按鈕與測試通知 */}
      <div className="fixed bottom-4 left-4 z-[9990] opacity-90 hover:opacity-100 transition-opacity flex flex-col gap-2">
        <button
          onClick={handleEnablePushNotification}
          disabled={pushLoading}
          className={`px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 shadow-lg backdrop-blur-sm transition-all active:scale-95 border ${
            pushSubscribed
              ? "bg-emerald-950/90 text-emerald-300 border-emerald-500/50 hover:bg-emerald-900"
              : "bg-amber-950/90 text-amber-300 border-amber-500/60 animate-bounce hover:bg-amber-900"
          }`}
          title="點擊解鎖並開啟全時段離線背景推播 (即使關閉網頁也能收到 OS 系統卡片與音效)"
        >
          <Bell size={13} className={pushSubscribed ? "" : "animate-spin"} />
          <span>
            {pushLoading
              ? "設定中..."
              : pushSubscribed
              ? "✅ 已開啟全時段離線背景推播"
              : "🔔 點我開啟關閉網頁背景推播"}
          </span>
        </button>
        <button
          onClick={handleTestNotification}
          className="bg-slate-900/80 text-blue-400 hover:text-white border border-blue-500/30 px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 shadow-lg backdrop-blur-sm transition-all active:scale-95"
          title="點擊播放測試音效並解鎖瀏覽器聲音通知"
        >
          <Bell size={13} className="animate-bounce" />
          <span>🔊 測試下單音效</span>
        </button>
      </div>
    </>
  );
}
