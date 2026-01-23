/**
 * Service_Inventory_Adjust.gs
 * [Service] 庫存異動與調整歷史
 */

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
