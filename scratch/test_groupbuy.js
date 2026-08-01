import { GroupBuyService } from './backend/dist/services/groupbuy.service.js';
(async () => {
  try {
    const res = await GroupBuyService.getPendingOrders({}, { role: 'ADMIN' });
    console.log('Success:', res.length);
  } catch (err) {
    console.error('Error:', err);
  }
})();
