/**
 * Service_Valuation_Stocktake.gs
 * [Service] 資產估值與盤點歷史
 */

function getInventoryValuation() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const iSheet = ss.getSheetByName('Inventory');
  const inventory = iSheet.getDataRange().getValues().slice(1);
  const productMap = typeof getProductMap !== 'undefined' ? getProductMap() : {};
  const valuations = {};

  inventory.forEach(row => {
    const pId = row[1], qty = Number(row[2]), price = Number(row[6] || 0); 
    if (qty <= 0) return;
    const pName = productMap[pId] || pId;
    if (!valuations[pName]) valuations[pName] = { name: pName, totalQty: 0, totalValue: 0 };
    valuations[pName].totalQty += qty;
    valuations[pName].totalValue += (qty * price);
  });
  return Object.values(valuations);
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
  
  const results = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i], rowDate = new Date(row[1]);
    if (startDate && rowDate < startDate) continue;
    if (endDate && rowDate > endDate) continue;
    const pName = String(row[3] || '').toLowerCase();
    if (productName && pName.indexOf(productName) === -1) continue;
    const diff = Number(row[6]) || 0;
    if (diffOnly && diff === 0) continue;
    
    results.push({
      id: row[0], date: Utilities.formatDate(rowDate, "GMT+8", "yyyy-MM-dd HH:mm"),
      productName: row[3], bookQty: Number(row[4]) || 0, physicalQty: Number(row[5]) || 0,
      diff: diff, reason: row[7] || '', accountability: row[8] || '', operator: row[9] || ''
    });
  }
  return results.reverse();
}
