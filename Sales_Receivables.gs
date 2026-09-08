/**
 * Sales_Receivables.gs
 * 應收帳款管理與收款狀態轉換
 */

// ===========================================
// 1. 應收帳款查詢 (Get Receivables)
// ===========================================
function getReceivablesService(payload) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const salesSheet = ss.getSheetByName('Sales');
  const detailsSheet = ss.getSheetByName('SalesDetails');
  
  if (!salesSheet || !detailsSheet) return [];
  
  const productMap = getProductMap_();
  const salesRows = salesSheet.getDataRange().getValues();
  const detailRows = detailsSheet.getDataRange().getValues();
  
  const IDX_ID = 0;
  const IDX_DATE = 1;
  const IDX_TOTAL = 5; 
  const IDX_CUST = 6;
  const IDX_REP = 7;
  const IDX_METHOD = 8;
  const IDX_STATUS = 9;

  const startDate = payload.startDate ? parseLocalYMD_(payload.startDate) : null;
  const endDate = payload.endDate ? parseLocalYMD_(payload.endDate) : null;
  if (startDate) startDate.setHours(0, 0, 0, 0);
  if (endDate) endDate.setHours(23, 59, 59, 999);

  const results = [];
  
  for (let i = 1; i < salesRows.length; i++) {
    const row = salesRows[i];
    const method = String(row[IDX_METHOD] || '').toUpperCase();
    const status = String(row[IDX_STATUS] || '').toUpperCase();
    
    if (method === 'CREDIT' && status === 'UNPAID') {
      const saleId = String(row[IDX_ID] || '');
      if (!saleId) continue;
      const rowDate = new Date(row[IDX_DATE]);
      if (startDate && rowDate < startDate) continue;
      if (endDate && rowDate > endDate) continue;

      const dateStr = row[IDX_DATE] ? Utilities.formatDate(rowDate, 'GMT+8', "yyyy-MM-dd'T'HH:mm:ss") : '';
      
      const items = [];
      for (let j = 1; j < detailRows.length; j++) {
        if (String(detailRows[j][0]) === saleId) {
          const qty = Number(detailRows[j][5] || 0);
          if (qty > 0) {
            const pId = detailRows[j][1];
            const pEntry = productMap[pId];
            items.push({
              saleId: saleId,
              productName: pEntry ? pEntry.name : pId,
              qty: qty,
              price: Number(detailRows[j][6] || 0),
              subtotal: Number(detailRows[j][7] || 0)
            });
          }
        }
      }
      
      results.push({
        uuids: [saleId],
        saleId: saleId,
        date: dateStr,
        customer: row[IDX_CUST] || '',
        salesRep: row[IDX_REP] || '未知',
        amount: Number(row[IDX_TOTAL] || 0),
        items: items
      });
    }
  }
  
  return results;
}

/**
 * 標記單據為已收款
 */
function markAsPaidService(payload) {
  const { targetUuids, paymentMethod } = payload;
  if (!targetUuids || targetUuids.length === 0) throw new Error('未提供有效 SaleID');

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const salesSheet = ss.getSheetByName('Sales');
    const lastRow = salesSheet.getLastRow();
    const lastCol = salesSheet.getLastColumn();
    if (lastRow <= 1) return { success: true, updated: 0 };

    if (lastCol < 14) {
        salesSheet.getRange(1, 13).setValue("PaymentDate");
        salesSheet.getRange(1, 14).setValue("ActualPaymentMethod");
    }

    const data = salesSheet.getRange(1, 1, lastRow, Math.max(lastCol, 14)).getValues();
    const IDX_ID = 0;
    const IDX_STATUS = 9;
    const IDX_PAY_DATE = 12;
    const IDX_ACT_METHOD = 13;

    const targetSet = new Set(targetUuids.map(String));
    let updatedCount = 0;
    const now = new Date();

    for (let i = 1; i < data.length; i++) {
        if (targetSet.has(String(data[i][IDX_ID]))) {
            data[i][IDX_STATUS] = 'PAID';
            data[i][IDX_PAY_DATE] = now;
            data[i][IDX_ACT_METHOD] = paymentMethod || 'CASH';
            updatedCount++;
        }
    }

    if (updatedCount > 0) {
      salesSheet.getRange(1, 1, lastRow, Math.max(lastCol, 14)).setValues(data);
      SpreadsheetApp.flush();
    }
    return { success: true, updated: updatedCount };
  } catch (e) {
    throw new Error('標記收款失敗: ' + e.message);
  } finally {
    lock.releaseLock();
  }
}
