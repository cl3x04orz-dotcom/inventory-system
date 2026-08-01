import { PurchaseService } from '../backend/dist/services/purchase.service.js';
(async () => {
  try {
    const res = await PurchaseService.getPurchaseSuggestions({ storeCode: 'MILI001' });
    console.log(JSON.stringify(res, null, 2));
  } catch (err) {
    console.error('Error:', err);
  }
})();
