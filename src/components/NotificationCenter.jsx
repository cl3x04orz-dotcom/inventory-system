import React, { useState, useEffect, useRef } from 'react';
import { ShoppingBag, Bell, BellOff, ArrowRight, X } from 'lucide-react';
import { callGAS } from '../utils/api';

export default function NotificationCenter({ user, apiUrl, setPage }) {
  const [notifications, setNotifications] = useState([]);
  const [activeToast, setActiveToast] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [permissionRequested, setPermissionRequested] = useState(false);
  const lastTimestampRef = useRef(new Date().toISOString());

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
        const n = new Notification('🛒 有人線上下單囉！', {
          body: `顧客：${notif.customerName} | 金額：$${notif.totalAmount} 元 (${notif.sourceGroup || '線上下單'})`,
          icon: '/favicon.ico',
          tag: notif.id
        });
        n.onclick = () => {
          window.focus();
          if (typeof setPage === 'function') setPage('pendingOrders');
        };
      } catch (e) {
        console.warn('[Notification] Desktop notification error:', e);
      }
    }
  };

  // 請求瀏覽器桌面通知權限
  useEffect(() => {
    if (!isBoss) return;
    if ('Notification' in window && Notification.permission === 'default' && !permissionRequested) {
      setPermissionRequested(true);
      Notification.requestPermission().catch(() => {});
    }
  }, [isBoss, permissionRequested]);

  // 定時輪詢新訂單通知 (每 5 秒一次)
  useEffect(() => {
    if (!isBoss || !apiUrl) return;

    let isMounted = true;
    const fetchNotifications = async () => {
      try {
        const res = await callGAS(apiUrl, 'getRecentNotifications', {
          sinceTimestamp: lastTimestampRef.current
        });

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
    const interval = setInterval(fetchNotifications, 5000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [isBoss, apiUrl, isMuted]);

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
    </>
  );
}
