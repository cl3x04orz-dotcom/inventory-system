/**
 * Service_Receivables.gs
 * [Service] 應收帳款查詢與核銷
 */

function getReceivablesService() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const salesSheet = ss.getSheetByName('Sales');
  const detailsSheet = ss.getSheetByName('SalesDetails');
  
  if (!salesSheet || !detailsSheet) return [];
  const productMap = typeof getProductMap_ !== 'undefined' ? getProductMap_() : {};
  const salesRows = salesSheet.getDataRange().getValues();
  const detailRows = detailsSheet.getDataRange().getValues();
  
  const IDX_ID = 0, IDX_DATE = 1, IDX_TOTAL = 5, IDX_CUST = 6, IDX_REP = 7, IDX_METHOD = 8, IDX_STATUS = 9;
  const results = [];
  
  for (let i = 1; i < salesRows.length; i++) {
    const row = salesRows[i];
    const method = String(row[IDX_METHOD] || "").toUpperCase();
    const status = String(row[IDX_STATUS] || "").toUpperCase();
    
    if (method === 'CREDIT' && status === 'UNPAID') {
      const saleId = row[IDX_ID];
      const dateVal = row[IDX_DATE];
      const dateStr = dateVal ? Utilities.formatDate(new Date(dateVal), "GMT+8", "yyyy-MM-dd'T'HH:mm:ss") : "";
      
      const items = [];
      for (let j = 1; j < detailRows.length; j++) {
        if (String(detailRows[j][0]) === String(saleId)) {
           const qty = Number(detailRows[j][5] || 0);
           if (qty > 0) {
             const pId = detailRows[j][1];
             items.push({
               productName: productMap[pId] || pId,
               qty: qty, price: Number(detailRows[j][6] || 0), subtotal: Number(detailRows[j][7] || 0)
             });
           }
        }
      }
      
      results.push({
        id: i + 1, saleId: saleId, date: dateStr,
        customer: row[IDX_CUST] || "", salesRep: row[IDX_REP] || "未知",
        amount: Number(row[IDX_TOTAL] || 0), items: items
      });
    }
  }
  return results;
}

function markAsPaidService(payload) {
  const { recordId } = payload;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const salesSheet = ss.getSheetByName('Sales');
  // 假設狀態欄在第 10 欄 (J)
  salesSheet.getRange(recordId, 10).setValue('PAID');
  return { success: true };
}
