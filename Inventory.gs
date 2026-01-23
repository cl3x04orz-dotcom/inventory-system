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
    if (type === 'STOCK') {
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
  const adjSheet = ss.getSheetByName('Adjustments') || ss.insertSheet('Adjustments').appendRow(['ID', '時間', '產品ID', '類型', '數量', '執行人', '備註']);
  
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
    payload.note
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
  const iSheet = ss.getSheetByName('Inventory');
  const inventory = iSheet.getDataRange().getValues().slice(1);
  const productMap = typeof getProductMap !== 'undefined' ? getProductMap() : {};
  const valuations = {};

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

  inventory.forEach(row => {
    const pId = row[1], qty = Number(row[2]), price = Number(row[6] || 0); 
    if (qty <= 0) return;
    const pName = productMap[pId] || pId;
    if (!valuations[pName]) {
      valuations[pName] = { 
        name: pName, 
        totalQty: 0, 
        totalValue: 0,
        productId: pId,
        sortWeight: sortWeightMap[pId] || 999999
      };
    }
    valuations[pName].totalQty += qty;
    valuations[pName].totalValue += (qty * price);
  });
  
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
