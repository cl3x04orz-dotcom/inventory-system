/**
 * Purchases.gs
 * [Service] 進貨管理與建議
 */

// ===========================================
// 1. 進貨存檔 (Transaction Safe)
// ===========================================
function addPurchaseService(data, user) {
  const { submissionId, items: rawItems, vendor, paymentMethod, serverTimestamp } = data;
  
  // [防重複存檔]
  if (submissionId) {
    const cache = CacheService.getScriptCache();
    if (cache.get(submissionId)) return { success: true, duplicate: true, message: "已偵測到重複請求" };
    cache.put(submissionId, "PROCESSED", 600);
  }

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000); // Wait up to 30 sec

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const pSheet = ss.getSheetByName('Products');
    const iSheet = ss.getSheetByName('Inventory');
    const purSheet = ss.getSheetByName('Purchases');
    
    if (!pSheet || !iSheet || !purSheet) throw new Error("資料表缺失");

    let items = Array.isArray(rawItems) ? rawItems : [data];
    const entryDate = serverTimestamp ? new Date(serverTimestamp) : new Date();
    const operator = data.operator || (user ? (user.username || user.userId || user.name) : 'Unknown');
    
    // Pre-fetch product map to minimize reads
    const productMap = {}; 
    const pData = pSheet.getDataRange().getValues();
    // Start from row 1 (header is 0)
    for (let i = 1; i < pData.length; i++) {
        productMap[pData[i][1]] = pData[i][0]; // Name -> UUID
    }

    const newProducts = [];
    const purchaseRows = [];
    const inventoryRows = [];

    items.forEach(item => {
        const rowVendor = item.vendor || vendor;
        let productId = productMap[item.productName];
        
        // Auto-create product if missing (and track it to avoid duplicates in same batch)
        if (!productId && item.productName) {
            productId = Utilities.getUuid();
            // Add to map immediately for subsequent items in this batch
            productMap[item.productName] = productId;
            // Add to new products list
            newProducts.push([productId, item.productName, 'General', item.price, "", 0]);
        }
        
        if (productId) {
            const currPaymentMethod = item.paymentMethod || paymentMethod || 'CASH';
            const status = (currPaymentMethod === 'CREDIT') ? 'UNPAID' : 'PAID';
            const uuid = Utilities.getUuid();
            
            // Collect Purchase Row
            // Col 0: UUID, 1: Date, 2: Vendor, 3: ProductID, 4: Qty, 5: Price, 6: Expiry, 7: Operator, 8: Method, 9: Status, 10: SubmissionID(Note)
            purchaseRows.push([
              uuid, entryDate, rowVendor, productId, item.quantity, 
              item.price, item.expiry, operator, currPaymentMethod, status, submissionId || operator
            ]);
            
            // Collect Inventory Row
            // Col 0: UUID, 1: ProductID, 2: Qty, 3: Expiry, 4: Date, 5: Type, 6: Price/Note
            inventoryRows.push([
              Utilities.getUuid(), productId, item.quantity, item.expiry, entryDate, 'STOCK', item.price
            ]);
        }
    });

    // --- Batch Write Section (Atomic-like) ---
    
    // 1. Add new products first
    if (newProducts.length > 0) {
        pSheet.getRange(pSheet.getLastRow() + 1, 1, newProducts.length, newProducts[0].length).setValues(newProducts);
    }
    
    // 2. Add purchases
    if (purchaseRows.length > 0) {
        // Use helper if available, or direct write
        if (typeof batchAppendNoLock_ !== 'undefined') {
            batchAppendNoLock_(purSheet, purchaseRows);
        } else {
            purSheet.getRange(purSheet.getLastRow() + 1, 1, purchaseRows.length, purchaseRows[0].length).setValues(purchaseRows);
        }
    }
    
    // 3. Add inventory
    if (inventoryRows.length > 0) {
        if (typeof batchAppendNoLock_ !== 'undefined') {
            batchAppendNoLock_(iSheet, inventoryRows);
        } else {
            iSheet.getRange(iSheet.getLastRow() + 1, 1, inventoryRows.length, inventoryRows[0].length).setValues(inventoryRows);
        }
    }

    SpreadsheetApp.flush(); // Force write
    return { success: true, count: items.length };

  } catch (e) {
    throw new Error("進貨存檔失敗: " + e.message);
  } finally {
    lock.releaseLock();
  }
}

function getPurchaseHistory(filter) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const purSheet = ss.getSheetByName('Purchases');
  const uSheet = ss.getSheetByName('Users');
  const purData = purSheet.getDataRange().getValues().slice(1);
  const productMap = typeof getProductMap !== 'undefined' ? getProductMap() : {};
  const userMap = {};
  if (uSheet) uSheet.getDataRange().getValues().slice(1).forEach(r => { if (r[0]) userMap[r[0]] = r[1]; });

  return purData.filter(row => {
    const rowDate = new Date(row[1]);
    const start = new Date(filter.startDate), end = new Date(filter.endDate);
    end.setHours(23, 59, 59);
    const vName = String(row[2] || '').toLowerCase();
    const pName = String(productMap[row[3]] || 'Unknown').toLowerCase();
    const keyword = filter.keyword ? filter.keyword.toLowerCase() : '';
    return (rowDate >= start && rowDate <= end) && (!keyword || vName.includes(keyword) || pName.includes(keyword));
  }).map(row => ({
      date: row[1],
      vendorName: row[2],
      productName: productMap[row[3]] || 'Unknown',
      quantity: Number(row[4]) || 0,
      unitPrice: Number(row[5]) || 0,
      totalPrice: (Number(row[4]) || 0) * (Number(row[5]) || 0),
      expiry: row[6],
      operator: userMap[row[7]] || row[7] || '-'
  })).reverse();
}

function getPurchaseSuggestionsService() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const purSheet = ss.getSheetByName('Purchases');
    if (!purSheet) return { vendors: [], vendorProductMap: {}, vendorProductPriceMap: {} };
    
    const purData = purSheet.getDataRange().getValues().slice(1);
    const productMap = typeof getProductMap !== 'undefined' ? getProductMap() : {};
    
    const vendors = new Set();
    const vpMap = {};   // Vendor -> Set of Product Names
    const vppMap = {};  // Vendor -> { ProductName -> Latest Price }

    // 依照進貨紀錄順序遍歷，後面的紀錄（最新的）會覆蓋前面的價格
    purData.forEach(r => {
        const v = String(r[2] || '').trim();
        const pId = String(r[3] || '').trim();
        const pName = productMap[pId] || pId;
        const price = Number(r[5]) || 0;
        
        if (v && pName) {
            vendors.add(v);
            if (!vpMap[v]) vpMap[v] = new Set();
            vpMap[v].add(pName);
            
            if (!vppMap[v]) vppMap[v] = {};
            vppMap[v][pName] = price;
        }
    });

    // 獲取預設支付方式
    const vendorDefaults = typeof getVendorsData_ !== 'undefined' ? getVendorsData_() : {};

    const finalVpMap = {};
    for (let v in vpMap) {
        finalVpMap[v] = Array.from(vpMap[v]);
    }

    return { 
        vendors: Array.from(vendors).sort(), 
        vendorProductMap: finalVpMap,
        vendorProductPriceMap: vppMap,
        vendorDefaults: vendorDefaults 
    };
}

/**
 * 保存廠商預設方式
 */
function saveVendorDefaultService(payload) {
  const { vendor, method } = payload;
  if (!vendor) return { error: "缺乏廠商名稱" };

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('Vendors');
  if (!sheet) {
    sheet = ss.insertSheet('Vendors');
    sheet.appendRow(['廠商名稱', '預設支付方式']);
  }

  const data = sheet.getDataRange().getValues();
  let found = false;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(vendor).trim()) {
      sheet.getRange(i + 1, 2).setValue(method);
      found = true;
      break;
    }
  }

  if (!found) {
    sheet.appendRow([vendor, method]);
  }

  return { success: true };
}

/**
 * 獲取所有廠商的預設方式
 */
function getVendorsData_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('Vendors');
  if (!sheet) return {};

  const data = sheet.getDataRange().getValues();
  const map = {};
  for (let i = 1; i < data.length; i++) {
    const v = String(data[i][0]).trim();
    const m = String(data[i][1]).trim();
    if (v) map[v] = m;
  }
  return map;
}
