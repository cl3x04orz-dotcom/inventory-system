/**
 * Service_SalesHistory.gs
 * [Service] 銷售報表查詢 (含 RBAC 權限控管)
 */
function getSalesHistory(payload) {
  const { startDate, endDate, customer, salesRep, token } = payload;
  
  let currentUser = null;
  if (token && typeof verifyToken !== 'undefined') {
      currentUser = verifyToken(token);
  }
  if (!currentUser && payload.userRole) {
      currentUser = { role: payload.userRole, username: payload.operator || '' };
  }
  
  const isAdmin = currentUser && (currentUser.role === 'BOSS' || currentUser.role === 'ADMIN');
  const currentUsername = currentUser ? String(currentUser.username || '').trim().toLowerCase() : '';

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const salesSheet = ss.getSheetByName('Sales');
  const detailsSheet = ss.getSheetByName('SalesDetails');
  
  if (!salesSheet || !detailsSheet) return [];
  const productMap = typeof getProductMap_ !== 'undefined' ? getProductMap_() : {};

  const start = new Date(startDate); start.setHours(0,0,0,0);
  const end = new Date(endDate); end.setHours(23,59,59,999);
  
  const qCust = (customer || "").trim().toLowerCase();
  const qRep = (salesRep || "").trim().toLowerCase();
  const salesRows = salesSheet.getDataRange().getValues();
  
  const IDX_ID = 0, IDX_DATE = 1, IDX_REP1 = 2, IDX_CUST = 6, IDX_REP2 = 7;
  const matchedSales = {}; 

  for (let i = 1; i < salesRows.length; i++) {
    const row = salesRows[i];
    const sId = String(row[IDX_ID] || "").trim();
    if (!sId) continue;

    const dateVal = row[IDX_DATE];
    const sDate = new Date(dateVal);
    if (isNaN(sDate.getTime()) || sDate < start || sDate > end) continue;

    const rowCust = String(row[IDX_CUST] || "").trim();
    if (qCust && !rowCust.toLowerCase().includes(qCust)) continue;

    let rowRep = String(row[IDX_REP2] || "").trim();
    if (!rowRep || rowRep === '???') rowRep = String(row[IDX_REP1] || "").trim();
    
    if (qRep && !rowRep.toLowerCase().includes(qRep)) continue;

    if (!isAdmin && currentUsername) {
        if (rowRep.toLowerCase() !== currentUsername) continue;
    }

    matchedSales[sId] = { date: sDate, customer: rowCust, salesRep: rowRep };
  }

  const detailRows = detailsSheet.getDataRange().getValues();
  const results = [];
  const D_IDX_SID = 0, D_IDX_PID = 1, D_IDX_SOLD = 5, D_IDX_AMT = 7;

  for (let i = 1; i < detailRows.length; i++) {
    const row = detailRows[i];
    const dSaleId = String(row[D_IDX_SID] || "").trim();
    
    if (dSaleId && matchedSales[dSaleId]) {
      const soldQty = Number(row[D_IDX_SOLD] || 0);
      if (soldQty <= 0) continue;

      const info = matchedSales[dSaleId];
      const pId = String(row[D_IDX_PID] || "").trim();
      const pName = productMap[pId] || pId || '未知商品';
      
      results.push({
        date: info.date.toISOString(),
        location: info.customer, 
        salesRep: info.salesRep,
        productName: pName,
        soldQty: soldQty,
        totalAmount: Number(row[D_IDX_AMT] || 0)
      });
    }
  }

  return results.sort((a, b) => new Date(b.date) - new Date(a.date));
}
