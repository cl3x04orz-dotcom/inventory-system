/**
 * Purchases.gs
 * [Service] 進貨管理與建議
 */

function addPurchaseService(data, user) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const pSheet = ss.getSheetByName('Products');
    const iSheet = ss.getSheetByName('Inventory');
    const purSheet = ss.getSheetByName('Purchases');
    
    let items = Array.isArray(data.items) ? data.items : [data];
    const entryDate = data.serverTimestamp ? new Date(data.serverTimestamp) : new Date();
    const operator = data.operator || user.username || user.userId || user.name || 'Unknown';
    
    const productMap = {}; 
    pSheet.getDataRange().getValues().slice(1).forEach(r => { productMap[r[1]] = r[0]; });

    items.forEach(item => {
        const rowVendor = item.vendor || data.vendor;
        let productId = productMap[item.productName];
        if (!productId && item.productName) {
            productId = Utilities.getUuid();
            pSheet.appendRow([productId, item.productName, 'General', item.price, "", 0]);
            productMap[item.productName] = productId;
        }
        
        if (productId) {
            const itemPaymentMethod = item.paymentMethod || data.paymentMethod || 'CASH';
            const itemStatus = (itemPaymentMethod === 'CREDIT') ? 'UNPAID' : 'PAID';
            
            purSheet.appendRow([
              Utilities.getUuid(), entryDate, rowVendor, productId, item.quantity, 
              item.price, item.expiry, operator, itemPaymentMethod, itemStatus, operator
            ]);
            iSheet.appendRow([Utilities.getUuid(), productId, item.quantity, item.expiry, entryDate, 'STOCK', item.price]);
        }
    });
    return { success: true, count: items.length };
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
    if (!purSheet) return { vendors: [], vendorProductMap: {} };
    const purData = purSheet.getDataRange().getValues().slice(1);
    const productMap = typeof getProductMap !== 'undefined' ? getProductMap() : {};
    const vendors = new Set(), vpMap = {};

    purData.forEach(r => {
        const v = r[2], pId = r[3], pName = productMap[pId];
        if (v) {
            vendors.add(v);
            if (!vpMap[v]) vpMap[v] = new Set();
            if (pName) vpMap[v].add(pName);
        }
    });

    // 獲取預設支付方式
    const vendorDefaults = getVendorsData_();

    const finalVpMap = {};
    for (let v in vpMap) finalVpMap[v] = Array.from(vpMap[v]);
    return { 
      vendors: Array.from(vendors), 
      vendorProductMap: finalVpMap,
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
