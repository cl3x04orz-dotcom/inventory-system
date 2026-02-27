/**
 * Inventory.gs
 * Combined Inventory Module
 * Includes: Helper, Main, Adjust, Valuation/Stocktake
 */

// ==========================================
// Helper_Inventory_Commons.gs
// ==========================================
function getProductMap() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const pSheet = ss.getSheetByName('Products') || ss.getSheetByName('Inventory');
  if (!pSheet) return {};
  const data = pSheet.getDataRange().getValues();
  const map = {};
  for (let i = 1; i < data.length; i++) {
    map[data[i][0]] = data[i][1]; // ID -> Name
  }
  return map;
}

// ==========================================
// Service_Inventory_Main.gs
// ==========================================
function getInventoryService() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const iSheet = ss.getSheetByName('Inventory');
    if (!iSheet) return [];
    
    const inventory = iSheet.getDataRange().getValues().slice(1);
    const productMap = typeof getProductMap !== 'undefined' ? getProductMap() : {};
    
    // 讀取 Products 分頁的排序權重
    const productsSheet = ss.getSheetByName('Products');
    const sortWeightMap = {}; // { productId: sortWeight }
    
    if (productsSheet) {
        const productData = productsSheet.getDataRange().getValues();
        if (productData.length > 1) {
            const headers = productData[0].map(h => String(h || '').trim().toLowerCase());
            const idxId = headers.findIndex(h => h.includes('id') || h.includes('序號') || h.includes('uuid'));
            const idxWeight = headers.indexOf('排序權重') !== -1 ? headers.indexOf('排序權重') : 
                             headers.indexOf('sortweight') !== -1 ? headers.indexOf('sortweight') :
                             headers.findIndex(h => h.includes('權重') && !h.includes('單位'));
            
            if (idxId !== -1 && idxWeight !== -1) {
                for (let i = 1; i < productData.length; i++) {
                    const productId = String(productData[i][idxId] || '').trim();
                    const weight = Number(productData[i][idxWeight]) || 999999; // 沒有權重的排最後
                    if (productId) sortWeightMap[productId] = weight;
                }
            }
        }
    }
    
    const result = inventory.map(row => ({
        batchId: row[0],
        productId: row[1],
        productName: productMap[row[1]] || 'Unknown',
        quantity: row[2],
        expiry: row[3],
        type: row[5],
        sortWeight: sortWeightMap[row[1]] || 999999
    }));
    
    // 按照排序權重排序
    result.sort((a, b) => a.sortWeight - b.sortWeight);
    
    return result;
}

function getInventoryWithSafety() {
  const inv = getInventoryService(); 
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const prodSheet = ss.getSheetByName('Products');
  if (!prodSheet) return { inventory: inv, safetyStocks: {} };
  
  const prodData = prodSheet.getDataRange().getValues();
  const safetyStocks = {};
  for (let i = 1; i < prodData.length; i++) {
    const pName = prodData[i][1];
    const safeLv = prodData[i][5] || 0; 
    safetyStocks[pName] = safeLv;
  }
  return { inventory: inv, safetyStocks: safetyStocks };
}

function updateSafetyStock(payload) {
  const { productName, level } = payload;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const prodSheet = ss.getSheetByName('Products');
  const prodData = prodSheet.getDataRange().getValues();
  for (let i = 1; i < prodData.length; i++) {
    if (prodData[i][1] === productName) {
      prodSheet.getRange(i + 1, 6).setValue(level);
      return { success: true };
    }
  }
  throw new Error('找不到該產品');
}

function getInventoryForStocktake() {
  const totals = {};
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const iSheet = ss.getSheetByName('Inventory');
  const inventory = iSheet.getDataRange().getValues().slice(1);
  const productMap = typeof getProductMap !== 'undefined' ? getProductMap() : {};
  
  inventory.forEach(row => {
    const pId = row[1];
    const qty = Number(row[2]);
    const type = row[5];
    if (type === 'STOCK' || type === 'VOID_REFUND') {
      totals[pId] = (totals[pId] || 0) + qty;
    }
  });
  
  return Object.keys(totals).map(pId => ({
    productId: pId,
    productName: productMap[pId] || pId,
    bookQty: totals[pId]
  }));
}

// ==========================================
// Service_Inventory_Adjust.gs
// ==========================================
function adjustInventoryService(payload, user) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const iSheet = ss.getSheetByName('Inventory');
  const adjSheet = ss.getSheetByName('Adjustments') || ss.insertSheet('Adjustments').appendRow(['ID', '時間', '產品ID', '類型', '數量', '執行人', '備註', '產品名稱']);
  const productMap = typeof getProductMap !== 'undefined' ? getProductMap() : {};
  
  const iData = iSheet.getDataRange().getValues();
  let productId = "";
  for (let i = 1; i < iData.length; i++) {
    if (iData[i][0] === payload.batchId) {
      productId = iData[i][1];
      const currentQty = Number(iData[i][2]);
      iSheet.getRange(i + 1, 3).setValue(currentQty - payload.quantity);
      break;
    }
  }

  adjSheet.appendRow([
    Utilities.getUuid(),
    new Date(),
    productId,
    payload.type,
    payload.quantity,
    user.username || user.userId,
    payload.note,
    productMap[productId] || ''
  ]);
  return { success: true };
}

function getAdjustmentHistory(filter) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const adjSheet = ss.getSheetByName('Adjustments');
  const uSheet = ss.getSheetByName('Users');
  if (!adjSheet) return [];
  
  const adjRows = adjSheet.getDataRange().getValues().slice(1);
  const productMap = typeof getProductMap !== 'undefined' ? getProductMap() : {};
  const uData = uSheet ? uSheet.getDataRange().getValues().slice(1) : [];
  const userMap = {};
  uData.forEach(r => { if(r[0]) userMap[r[0]] = r[1]; });

  return adjRows.filter(row => {
    const rowDate = new Date(row[1]);
    const start = new Date(filter.startDate);
    const end = new Date(filter.endDate);
    end.setHours(23, 59, 59);

    const pName = String(productMap[row[2]] || 'Unknown').toLowerCase();
    const typeMatch = !filter.type || row[3] === filter.type;
    const nameMatch = !filter.productName || pName.includes(filter.productName.toLowerCase());
    
    return rowDate >= start && rowDate <= end && typeMatch && nameMatch;
  }).map(row => ({
    date: Utilities.formatDate(new Date(row[1]), "GMT+8", "yyyy-MM-dd HH:mm"),
    productName: productMap[row[2]] || 'Unknown',
    type: row[3],
    quantity: row[4],
    operator: userMap[row[5]] || row[5],
    note: row[6]
  })).reverse();
}

// ==========================================
// Service_Valuation_Stocktake.gs
// ==========================================
function getInventoryValuation() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let iSheet = ss.getSheetByName('Inventory') || ss.getSheetByName('inventory');
  let pSheet = ss.getSheetByName('Products') || ss.getSheetByName('products');
  if (!iSheet) return [];

  const invData = iSheet.getDataRange().getValues();
  if (invData.length <= 1) return [];

  const invHeaders = invData[0].map(h => String(h || '').trim().toLowerCase());
    // 優先使用標準索引 (對齊 getInventoryService)
    let idxPId = 1;
    let idxQty = 2;
    let idxType = 5;
    let idxPrice = 6;

    // 若標題列不符標準，則動態搜尋備用
    if (invHeaders[idxPId] !== 'productid' && invHeaders[idxPId] !== '產品id') {
      const found = invHeaders.findIndex(h => (h.includes('product') || h.includes('產品')) && h.includes('id'));
      if (found !== -1) idxPId = found;
    }
    if (invHeaders[idxQty] !== 'quantity' && invHeaders[idxQty] !== '數量') {
      const found = invHeaders.findIndex(h => h.includes('量') || h.includes('qty'));
      if (found !== -1) idxQty = found;
    }
    if (invHeaders[idxType] !== 'type' && invHeaders[idxType] !== '類型') {
      const found = invHeaders.findIndex(h => h.includes('類') || h === 'type');
      if (found !== -1) idxType = found;
    }
    if (invHeaders[idxPrice] !== 'cost' && invHeaders[idxPrice] !== '成本') {
      const found = invHeaders.findIndex(h => h.includes('價') || h.includes('cost') || h.includes('金額'));
      if (found !== -1) idxPrice = found;
    }

  // 讀取 Products 分頁以取得名稱、排序權重與備用單價
  const dynamicProductMap = {};
  const sortWeightMap = {};
  const defaultPriceMap = {};
  
  if (pSheet) {
    const productData = pSheet.getDataRange().getValues();
    if (productData.length > 1) {
      const pHeaders = productData[0].map(h => String(h || '').trim().toLowerCase());
      
      // 0. 優先嘗試精確匹配 (根據用戶截圖 id, name)
      let pIdxId = pHeaders.indexOf('id');
      let pIdxName = pHeaders.indexOf('name');
      
      // 1. 如果沒找到，才使用模糊搜尋
      if (pIdxId === -1) {
        pIdxId = pHeaders.findIndex(h => h.includes('id') || h.includes('序號') || h.includes('uuid') || h === '序');
      }
      
      if (pIdxName === -1) {
        pIdxName = pHeaders.findIndex(h => {
            const isNameKeyword = h.includes('名稱') || h.includes('品項') || h.includes('品名') || h === 'name' || h.includes('product') || h.includes('商品');
            const isIdKeyword = h.includes('id') || h.includes('uuid') || h.includes('編號') || h.includes('code');
            return isNameKeyword && !isIdKeyword;
        });
      }

      // Fallbacks if not found - 強制預設
      if (pIdxId === -1) pIdxId = 0; // Default to column A (ID is usually first)
      if (pIdxName === -1) pIdxName = 1; // Default to column B (Name is usually second)
      
      const pIdxWeight = pHeaders.indexOf('排序權重') !== -1 ? pHeaders.indexOf('排序權重') : 
                         pHeaders.indexOf('sortweight') !== -1 ? pHeaders.indexOf('sortweight') :
                         pHeaders.findIndex(h => h.includes('權重') && !h.includes('單位'));
      const pIdxPrice = pHeaders.findIndex(h => h.includes('單價') || h.includes('價格') || h.includes('price') || h === '錢');
      
      for (let i = 1; i < productData.length; i++) {
        const row = productData[i];
        const productId = String(row[pIdxId] || '').trim();
        const productName = String(row[pIdxName] || '').trim();
        
        if (!productId && !productName) continue;
        const key = productId || productName;
        
        dynamicProductMap[key] = productName || productId;
        
        if (pIdxWeight !== -1) {
          sortWeightMap[key] = Number(row[pIdxWeight]) || 999999;
        }
        if (pIdxPrice !== -1) {
          defaultPriceMap[key] = Number(row[pIdxPrice]) || 0;
        }
      }
    }
  }

  const valuations = {};
  for (let i = 1; i < invData.length; i++) {
    const row = invData[i];
    const pId = String(row[idxPId] || '').trim();
    const qty = Number(row[idxQty]) || 0;
    const type = String(row[idxType] || '').trim().toUpperCase();
    
    // 優先使用庫存表內的價格，若無則使用產品表預設單價
    let price = idxPrice !== -1 ? Number(row[idxPrice]) : 0;
    if (!price || price === 0) {
      price = defaultPriceMap[pId] || 0;
    }

    if (!pId) continue; // 以前會過濾 qty <= 0，導致負數庫存沒被扣除，現在允許負數計入估值以反映淨額
    
    // [Fix] 嚴格對齊盤點邏輯：如果對不到 ID，代表是無效或髒資料，不列入估值
    const pName = dynamicProductMap[pId];
    if (!pName) {
      console.warn(`估值跳過無效品項: ${pId} (請檢查庫存表資料格式)`);
      continue;
    }
    
    if (!valuations[pName]) {
      valuations[pName] = { 
        name: pName, 
        stockQty: 0,
        stockValue: 0,
        originalQty: 0,
        originalValue: 0,
        totalQty: 0, 
        totalValue: 0,
        productId: pId,
        sortWeight: sortWeightMap[pId] || 999999
      };
    }
    
    // 根據類型分別累加
    if (type === 'STOCK' || type === 'VOID_REFUND') {
      valuations[pName].stockQty += qty;
      valuations[pName].stockValue += (qty * price);
      // 累計總額
      valuations[pName].totalQty += qty;
      valuations[pName].totalValue += (qty * price);
    } else if (type === 'ORIGINAL') {
      valuations[pName].originalQty += qty;
      valuations[pName].originalValue += (qty * price);
      // 累計總額
      valuations[pName].totalQty += qty;
      valuations[pName].totalValue += (qty * price);
    }
  }
  
  // 按照排序權重排序
  return Object.values(valuations).sort((a, b) => a.sortWeight - b.sortWeight);
}

function saveStocktake(payload) {
  const { items, operator } = payload;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Stocktakes') || ss.insertSheet('Stocktakes');
  const today = new Date();
  items.forEach(item => {
    sheet.appendRow([Utilities.getUuid(), today, item.productId, item.productName, item.bookQty, item.physicalQty, item.diff, item.reason, item.accountability, operator]);
  });
  return { success: true };
}

function getStocktakeHistory(filter) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Stocktakes');
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  
  const startDate = filter.startDate ? new Date(filter.startDate) : null;
  const endDate = filter.endDate ? new Date(filter.endDate) : null;
  if (endDate) endDate.setHours(23, 59, 59, 999);
  const productName = filter.productName ? filter.productName.toLowerCase() : '';
  const diffOnly = filter.diffOnly || false;
  
  // 讀取 Products 分頁的排序權重
  const productsSheet = ss.getSheetByName('Products');
  const sortWeightMap = {};
  
  if (productsSheet) {
    const productData = productsSheet.getDataRange().getValues();
    if (productData.length > 1) {
      const headers = productData[0].map(h => String(h || '').trim().toLowerCase());
      const idxId = headers.findIndex(h => h.includes('id') || h.includes('序號') || h.includes('uuid'));
      const idxWeight = headers.indexOf('排序權重') !== -1 ? headers.indexOf('排序權重') : 
                       headers.indexOf('sortweight') !== -1 ? headers.indexOf('sortweight') :
                       headers.findIndex(h => h.includes('權重') && !h.includes('單位'));
      
      if (idxId !== -1 && idxWeight !== -1) {
        for (let i = 1; i < productData.length; i++) {
          const productId = String(productData[i][idxId] || '').trim();
          const weight = Number(productData[i][idxWeight]) || 999999;
          if (productId) sortWeightMap[productId] = weight;
        }
      }
    }
  }
  
  const results = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i], rowDate = new Date(row[1]);
    if (startDate && rowDate < startDate) continue;
    if (endDate && rowDate > endDate) continue;
    const pName = String(row[3] || '').toLowerCase();
    if (productName && pName.indexOf(productName) === -1) continue;
    const diff = Number(row[6]) || 0;
    if (diffOnly && diff === 0) continue;
    
    const productId = row[2]; // ProductID 在第3欄
    results.push({
      id: row[0], 
      date: Utilities.formatDate(rowDate, "GMT+8", "yyyy-MM-dd HH:mm"),
      productId: productId,
      productName: row[3], 
      bookQty: Number(row[4]) || 0, 
      physicalQty: Number(row[5]) || 0,
      diff: diff, 
      reason: row[7] || '', 
      accountability: row[8] || '', 
      operator: row[9] || '',
      sortWeight: sortWeightMap[productId] || 999999
    });
  }
  
  // 先按照排序權重排序，再按照日期倒序（最新的在前）
  results.sort((a, b) => {
    const weightDiff = a.sortWeight - b.sortWeight;
    if (weightDiff !== 0) return weightDiff;
    return new Date(b.date) - new Date(a.date);
  });
  
  return results;
}

/**
 * 一次性遷移腳本：為現有的 Inventory 資料補上商品名稱
 * 執行後可讓試算表後台更易讀
 */
function migrateInventoryProductNames() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const iSheet = ss.getSheetByName('Inventory');
  const productMap = typeof getProductMap !== 'undefined' ? getProductMap() : {};
  
  if (!iSheet) return "找不到 Inventory 分頁";
  
  const data = iSheet.getDataRange().getValues();
  if (data.length <= 1) return "無資料可遷移";
  
  // 檢查是否已有正確的標題，若無則更新
  const headers = data[0];
  if (headers.length < 8) {
    iSheet.getRange(1, 8).setValue("ProductName");
  }
  
  const updates = [];
  for (let i = 1; i < data.length; i++) {
    const pId = String(data[i][1]).trim();
    const existingName = data[i][7] || ""; // 第 8 欄
    
    if (pId && !existingName) {
      updates.push([productMap[pId] || "Unknown"]);
    } else {
      updates.push([existingName]);
    }
  }
  
  if (updates.length > 0) {
    iSheet.getRange(2, 8, updates.length, 1).setValues(updates);
    return `遷移完成：已更新 ${updates.length} 列資料`;
  }
  
  return "無須更新";
}

/**
 * 補齊舊調整紀錄的產品名稱 (一次性執行)
 */
function backfillAdjustmentProductNames() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const adjSheet = ss.getSheetByName('Adjustments');
  const productMap = typeof getProductMap !== 'undefined' ? getProductMap() : {};
  if (!adjSheet) return "找不到 Adjustments 分頁";

  const data = adjSheet.getDataRange().getValues();
  if (data.length <= 1) return "無資料可補齊";

  // 檢查標題，確保第 8 欄有產品名稱標題
  if (data[0].length < 8) {
    adjSheet.getRange(1, 8).setValue("產品名稱");
  }

  let updatedCount = 0;
  for (let i = 1; i < data.length; i++) {
    const pId = String(data[i][2]).trim(); // 產品ID 在第 3 欄 (index 2)
    const existingName = data[i][7] || ""; // 產品名稱 在第 8 欄 (index 7)
    
    if (pId && !existingName) {
      const name = productMap[pId] || "Unknown";
      adjSheet.getRange(i + 1, 8).setValue(name);
      updatedCount++;
    }
  }

  return `補齊完成：已更新 ${updatedCount} 筆資料`;
}
