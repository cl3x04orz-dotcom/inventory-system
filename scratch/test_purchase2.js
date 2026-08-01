import { PurchaseService } from '../backend/dist/services/purchase.service.js';
(async () => {
  try {
    const res = await PurchaseService.getPurchaseSuggestions({ storeCode: 'MILI001' });
    console.log("Vendors count:", res.vendors.length);
    console.log("Vendor defaults count:", Object.keys(res.vendorDefaults).length);
  } catch (err) {
    console.error('Error:', err);
  }
})();
