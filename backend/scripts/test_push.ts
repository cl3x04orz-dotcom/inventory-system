import { WebPushService } from '../src/services/webpush.service.js';

async function main() {
  console.log('=== RUNNING OFFLINE PUSH TEST ===');
  await WebPushService.sendOrderPush({
    orderId: 'TEST_' + Math.floor(Math.random() * 10000),
    customerName: '測試老闆王小明',
    totalAmount: 888,
    sourceGroup: '離線測試'
  });
  console.log('=== PUSH TEST FINISHED ===');
}

main().catch(err => console.error(err));
