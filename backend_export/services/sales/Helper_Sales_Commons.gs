/**
 * Helper_Sales_Commons.gs
 * [Helper] 銷售模組共用邏輯 (扣除庫存、處理退貨、產品映射)
 */

function getProductMap_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('Products') || ss.getSheetByName('Inventory');
  if (!sheet) return {};
  
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return {};
  
  const headers = values[0].map(h => String(h).trim().toLowerCase().replace(/\s+/g, ''));
  const idxId = headers.findIndex(h => h.includes('id') || h.includes('uuid'));
  const idxName = headers.findIndex(h => h.includes('名稱') || h === 'product' || h.includes('品項') || h.includes('品名'));
  
  if (idxId === -1) return {};
  const map = {};
  for (let i = 1; i < values.length; i++) {
    const id = values[i][idxId];
    if (id) map[String(id).trim()] = idxName !== -1 ? values[i][idxName] : id;
  }
  return map;
}

function deductInventory_(sheet, sheetData, productId, qtyToDeduct, targetType) {
  let remaining = Number(qtyToDeduct);
  let consumedStats = [];
  if (remaining <= 0) return { consumed: [] };
  
  let batches = [];
  for (let i = 1; i < sheetData.length; i++) {
    const row = sheetData[i], pId = row[1], qty = Number(row[2]), expiry = row[3], type = row[5];
    let isMatch = (targetType === 'STOCK') ? (type === 'STOCK') : (type !== 'STOCK');
    if (pId === productId && qty > 0 && isMatch) {
      batches.push({ rowIndex: i + 1, qty: qty, expiry: expiry }); 
    }
  }
  batches.sort((a, b) => new Date(a.expiry) - new Date(b.expiry));
  
  for (let batch of batches) {
    if (remaining <= 0) break;
    const deduct = Math.min(batch.qty, remaining);
    sheet.getRange(batch.rowIndex, 3).setValue(batch.qty - deduct);
    consumedStats.push({ expiry: batch.expiry, deductedQty: deduct });
    remaining -= deduct;
  }
  return { consumed: consumedStats };
}

function handleReturns_(sheet, sheetData, item, consumedBatches, today) {
  let remainingReturn = item.returns;
  for (let batch of consumedBatches) {
    if (remainingReturn <= 0) break;
    const returnQty = Math.min(remainingReturn, batch.deductedQty);
    sheet.appendRow([Utilities.getUuid(), item.productId, returnQty, batch.expiry, today, 'ORIGINAL']);
    remainingReturn -= returnQty;
  }
  if (remainingReturn > 0) {
      let fallbackExpiry = new Date('2099-12-31');
      const stockBatches = sheetData.slice(1).filter(r => r[1] === item.productId && r[5] === 'STOCK');
      if (stockBatches.length > 0) {
         stockBatches.sort((a, b) => new Date(a[3]) - new Date(b[3]));
         fallbackExpiry = stockBatches[0][3]; 
      }
      sheet.appendRow([Utilities.getUuid(), item.productId, remainingReturn, fallbackExpiry, today, 'ORIGINAL']);
  }
}
