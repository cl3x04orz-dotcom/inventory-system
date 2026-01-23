/**
 * Service_Inventory_Main.gs
 * [Service] 庫存查詢與安全水位管理
 */

function getInventoryService() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const iSheet = ss.getSheetByName('Inventory');
    if (!iSheet) return [];
    const inventory = iSheet.getDataRange().getValues().slice(1);
    const productMap = typeof getProductMap !== 'undefined' ? getProductMap() : {};
    
    return inventory.map(row => ({
        batchId: row[0],
        productName: productMap[row[1]] || 'Unknown',
        quantity: row[2],
        expiry: row[3],
        type: row[5]
    }));
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
