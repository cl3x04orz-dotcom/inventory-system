import { prisma } from '../src/database/context.js';

async function purgeOnlyWebPushSubscriptions() {
  console.log('=== SAFE PURGE OF WEBPUSH SUBSCRIPTIONS ONLY ===');
  
  // 嚴格僅清理單一 SettingKey 'boss_webpush_subscriptions'，絕不觸碰任何其他資料表或設定！
  const result = await prisma.groupBuySystemSetting.upsert({
    where: { settingKey: 'boss_webpush_subscriptions' },
    update: { settingValue: '[]' },
    create: { settingKey: 'boss_webpush_subscriptions', settingValue: '[]' }
  });

  console.log('✅ Safely reset boss_webpush_subscriptions to empty array []. DB setting result:', result);
}

purgeOnlyWebPushSubscriptions().catch(err => {
  console.error('❌ Safe purge error:', err);
});
