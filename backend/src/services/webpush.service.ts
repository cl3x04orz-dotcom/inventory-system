import webpush from 'web-push';
import { prisma } from '../database/context.js';

// 初始化預設 VAPID 鑰匙 (用於 Web Push 加密發射)
const DEFAULT_VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY || 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMe566_fJ0N4Z1n16-92q0x794vB902v1j826x78941n71';
const DEFAULT_VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || 'a897126n172894n17892461n7892419n78241n97';

let vapidKeysLoaded = false;
let currentPublicVapidKey = '';

async function initVapidKeys() {
  if (vapidKeysLoaded) return currentPublicVapidKey;

  try {
    const setting = await prisma.groupBuySystemSetting.findUnique({
      where: { settingKey: 'vapid_keys' }
    });

    let keys: { publicKey: string; privateKey: string };

    if (setting && setting.settingValue) {
      keys = typeof setting.settingValue === 'string'
        ? JSON.parse(setting.settingValue)
        : setting.settingValue;
    } else {
      // 第一次啟動自動產生 VAPID 鑰匙對並永久存入 DB
      keys = webpush.generateVAPIDKeys();
      await prisma.groupBuySystemSetting.upsert({
        where: { settingKey: 'vapid_keys' },
        update: { settingValue: JSON.stringify(keys) },
        create: { settingKey: 'vapid_keys', settingValue: JSON.stringify(keys) }
      });
    }

    webpush.setVapidDetails(
      'https://cl3x04orz-dotcom.github.io/inventory-system/',
      keys.publicKey,
      keys.privateKey
    );

    currentPublicVapidKey = keys.publicKey;
    vapidKeysLoaded = true;
    return currentPublicVapidKey;
  } catch (err: any) {
    console.error('[WebPush] Error initializing VAPID keys:', err.message);
    const fallbackKeys = { publicKey: DEFAULT_VAPID_PUBLIC, privateKey: DEFAULT_VAPID_PRIVATE };
    try {
      webpush.setVapidDetails('https://cl3x04orz-dotcom.github.io/inventory-system/', fallbackKeys.publicKey, fallbackKeys.privateKey);
    } catch (e) {}
    currentPublicVapidKey = fallbackKeys.publicKey;
    vapidKeysLoaded = true;
    return currentPublicVapidKey;
  }
}

export const WebPushService = {
  /**
   * 取得公鑰 (供前端 訂閱使用)
   */
  async getPublicKey() {
    return await initVapidKeys();
  },

  /**
   * BOSS 綁定設備背景離線推播憑證
   */
  async subscribeBoss(payload: any, user: any) {
    const userRole = String(user?.role || user?.userRole || user?.type || '').toUpperCase();
    const isBossOrAdmin = userRole === 'BOSS' || userRole === 'SUPER_ADMIN' || userRole === 'ADMIN';

    console.log('[WebPush] subscribeBoss request by user:', user?.username || user?.id, 'Role:', userRole);

    if (!user || !isBossOrAdmin) {
      console.warn('[WebPush] Auth failed for subscribeBoss. Current User:', user);
      return { success: false, message: '權限不足 (僅 BOSS、SUPER_ADMIN 或 ADMIN 帳號可訂閱推播)' };
    }

    const { subscription } = payload || {};
    if (!subscription || !subscription.endpoint) {
      throw new Error('無效的推播訂閱憑證');
    }

    await initVapidKeys();

    try {
      const setting = await prisma.groupBuySystemSetting.findUnique({
        where: { settingKey: 'boss_webpush_subscriptions' }
      });

      let subs: any[] = [];
      if (setting && setting.settingValue) {
        subs = typeof setting.settingValue === 'string'
          ? JSON.parse(setting.settingValue)
          : setting.settingValue;
      }

      // 去重：若此 endpoint 已存在則不重複寫入
      if (!subs.some((s: any) => s.endpoint === subscription.endpoint)) {
        subs.push(subscription);
        // 只保留最新 10 個常用設備憑證
        if (subs.length > 10) subs = subs.slice(subs.length - 10);

        await prisma.groupBuySystemSetting.upsert({
          where: { settingKey: 'boss_webpush_subscriptions' },
          update: { settingValue: JSON.stringify(subs) },
          create: { settingKey: 'boss_webpush_subscriptions', settingValue: JSON.stringify(subs) }
        });
      }

      console.log(`[WebPush] BOSS 裝置憑證寫入成功！目前有效離線推播裝置數：${subs.length}`);
      return { success: true, message: 'BOSS 背景離線推播設備綁定成功', activeDevices: subs.length };
    } catch (err: any) {
      console.error('[WebPush] Failed to save subscription:', err.message);
      throw new Error('無法儲存背景推播訂閱: ' + err.message);
    }
  },

  /**
   * 當新訂單成立時，強制對 Apple/Google 伺服器發射離線 Push 訊號
   */
  async sendOrderPush(orderData: { orderId: string; customerName: string; totalAmount: number; sourceGroup?: string }) {
    await initVapidKeys();

    try {
      console.log(`[WebPush] sendOrderPush triggered for Order #${orderData.orderId}`);

      const setting = await prisma.groupBuySystemSetting.findUnique({
        where: { settingKey: 'boss_webpush_subscriptions' }
      });

      if (!setting || !setting.settingValue) {
        console.warn('[WebPush] No boss_webpush_subscriptions setting found in DB!');
        return;
      }

      let subs: any[] = typeof setting.settingValue === 'string'
        ? JSON.parse(setting.settingValue)
        : setting.settingValue;

      console.log(`[WebPush] Found ${subs?.length || 0} active BOSS subscriptions in DB.`);
      if (!Array.isArray(subs) || subs.length === 0) return;

      const pushPayload = JSON.stringify({
        title: '🛒 有人線上下單囉！',
        body: `顧客：${orderData.customerName || '顧客'} | 金額：$${orderData.totalAmount} 元 (${orderData.sourceGroup || '線上下單'})`,
        url: './#pendingOrders',
        orderId: orderData.orderId
      });

      const invalidEndpoints: string[] = [];

      for (const sub of subs) {
        try {
          const res = await webpush.sendNotification(sub, pushPayload);
          console.log('[WebPush] Successfully sent Push to FCM/APNs! Endpoint:', sub.endpoint.substring(0, 40) + '...', 'StatusCode:', res.statusCode);
        } catch (err: any) {
          console.warn('[WebPush] Push notification error for endpoint:', sub.endpoint.substring(0, 40) + '...', 'StatusCode:', err.statusCode || err.message);
          // 若 403/404/410 或金鑰格式錯誤，代表訂閱已過期/無效/不匹配，一律自動註記刪除
          if (err.statusCode === 403 || err.statusCode === 404 || err.statusCode === 410 || !err.statusCode) {
            console.log('[WebPush] Automatically purging invalid/expired endpoint:', sub.endpoint.substring(0, 40) + '...');
            invalidEndpoints.push(sub.endpoint);
          }
        }
      }

      // 清除過期的無效設備憑證
      if (invalidEndpoints.length > 0) {
        subs = subs.filter(s => !invalidEndpoints.includes(s.endpoint));
        await prisma.groupBuySystemSetting.upsert({
          where: { settingKey: 'boss_webpush_subscriptions' },
          update: { settingValue: JSON.stringify(subs) },
          create: { settingKey: 'boss_webpush_subscriptions', settingValue: JSON.stringify(subs) }
        });
      }
    } catch (err: any) {
      console.error('[WebPush] Error sending order push:', err.message);
    }
  }
};
