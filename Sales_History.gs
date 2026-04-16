/**
 * Sales_History.gs
 * 銷售歷史查詢、合併列印相關查詢
 */

// ===========================================
// 1. 銷售報表查詢 (Get Sales History)
// ===========================================
function getSalesHistory(payload) {
  const { startDate, endDate, customer, salesRep, token } = payload;
  
  let currentUser = null;
  if (token && typeof verifyToken !== 'undefined') {
      currentUser = verifyToken(token);
  }
  if (!currentUser && payload.userRole) {
      currentUser = { 
          role: payload.userRole, 
          username: payload.operator || '' 
      };
  }
  
  const isAdmin = currentUser && (currentUser.role === 'BOSS' || currentUser.role === 'ADMIN');
  const currentUsername = currentUser ? String(currentUser.username || '').trim().toLowerCase() : '';

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const salesSheet = ss.getSheetByName('Sales');
  const detailsSheet = ss.getSheetByName('SalesDetails');
  
  if (!salesSheet || !detailsSheet) return [];
  
  const productMap = getProductMap_();

  const start = parseLocalYMD_(startDate); start.setHours(0,0,0,0);
  const end = parseLocalYMD_(endDate); end.setHours(23,59,59,999);
  
  const qCust = (customer || "").trim().toLowerCase();
  const qRep = (salesRep || "").trim().toLowerCase();

  const salesRows = salesSheet.getDataRange().getValues();
  
  const IDX_ID = 0;   
  const IDX_DATE = 1; 
  const IDX_REP1 = 2; 
  const IDX_CUST = 6; 
  const IDX_REP2 = 7; 
  const IDX_METHOD = 8; 
  const IDX_STATUS = 9; 
  const IDX_PAY_DATE = 12; 
  const IDX_ACTUAL_METHOD = 13; 
  const IDX_WORK_HOURS = 14;    
  const IDX_WEATHER = 15;       

  const matchedSales = {}; 

  for (let i = 1; i < salesRows.length; i++) {
    const row = salesRows[i];
    const sId = String(row[IDX_ID] || "").trim();
    if (!sId) continue;

    const rowStatus = String(row[IDX_STATUS] || "").toUpperCase();
    if (rowStatus === 'VOID') continue;

    const dateVal = row[IDX_DATE];
    const sDate = new Date(dateVal);
    const payDateVal = row[IDX_PAY_DATE];
    const pDate = payDateVal ? new Date(payDateVal) : null;
    
    const rowCust = String(row[IDX_CUST] || "").trim();
    if (qCust && !rowCust.toLowerCase().includes(qCust)) continue;

    let rowRep = String(row[IDX_REP2] || "").trim();
    if (!rowRep || rowRep === '???') rowRep = String(row[IDX_REP1] || "").trim();
    if (qRep && !rowRep.toLowerCase().includes(qRep)) continue;

    if (!isAdmin && currentUsername) {
        if (rowRep.toLowerCase() !== currentUsername.toLowerCase()) continue;
    }

    const isSaleInBatch = (!isNaN(sDate.getTime()) && sDate >= start && sDate <= end);
    const isCollectionInBatch = (pDate && !isNaN(pDate.getTime()) && pDate >= start && pDate <= end);

    if (!isSaleInBatch && !isCollectionInBatch) continue;

    matchedSales[sId] = {
      date: sDate,
      customer: rowCust,
      salesRep: rowRep,
      paymentMethod: String(row[IDX_METHOD] || "CASH"),
      actualPaymentMethod: String(row[IDX_ACTUAL_METHOD] || ""),
      paymentDate: pDate,
      status: rowStatus,
      operator: String(row[11] || ""),
      isCollectionReportMode: isCollectionInBatch && !isSaleInBatch, 
      workHours: row[IDX_WORK_HOURS] || "",
      weather: row[IDX_WEATHER] || "SUNNY"
    };
  }

  const detailRows = detailsSheet.getDataRange().getValues();
  const results = [];
  
  const D_IDX_SID = 0;
  const D_IDX_PID = 1;
  const D_IDX_SOLD = 5;
  const D_IDX_AMT = 7;

  for (let i = 1; i < detailRows.length; i++) {
    const row = detailRows[i];
    const dSaleId = String(row[D_IDX_SID] || "").trim();
    
    if (dSaleId && matchedSales[dSaleId]) {
      const info = matchedSales[dSaleId];
      const soldQty = Number(row[D_IDX_SOLD] || 0);
      if (soldQty <= 0) continue;

      const pId = String(row[D_IDX_PID] || "").trim();
      const pEntry = productMap[pId];
      const pName = pEntry ? pEntry.name : (pId || '未知商品');
      
      let collectionNote = "";
      let displayMethod = info.paymentMethod;
      if (info.isCollectionReportMode) {
          collectionNote = info.actualPaymentMethod === 'TRANSFER' ? "(匯款補收)" : "(現金補收)";
          if (info.actualPaymentMethod) displayMethod = info.actualPaymentMethod;
      }

      results.push({
        date: info.isCollectionReportMode ? info.paymentDate.toISOString() : info.date.toISOString(),
        location: info.customer, 
        collectionNote: collectionNote, 
        salesRep: info.salesRep,
        productName: pName,
        soldQty: soldQty,
        totalAmount: Number(row[D_IDX_AMT] || 0),
        paymentMethod: displayMethod,
        saleId: dSaleId,
        operator: info.operator,
        isCollectionReportMode: info.isCollectionReportMode, 
        workHours: info.workHours,
        weather: info.weather
      });
    }
  }

  return results.sort((a, b) => new Date(b.date) - new Date(a.date));
}

/**
 * 獲取當前使用者當天的銷售紀錄（非作廢）
 * 用於合併列印功能
 */
function getRecentSalesToday(payload) {
  const { token } = payload;
  
  let currentUser = null;
  if (token && typeof verifyToken !== 'undefined') {
    currentUser = verifyToken(token);
  }
  if (!currentUser && payload.userRole) {
    currentUser = { 
      role: payload.userRole, 
      username: payload.operator || '' 
    };
  }
  
  if (!currentUser || !currentUser.username) {
    throw new Error('使用者驗證失敗');
  }
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const salesSheet = ss.getSheetByName('Sales');
  const detailsSheet = ss.getSheetByName('SalesDetails');
  
  if (!salesSheet || !detailsSheet) return [];
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  const salesData = salesSheet.getDataRange().getValues();
  const detailsData = detailsSheet.getDataRange().getValues();
  const productMap = getProductMap_();
  
  const results = [];
  
  const IDX_ID = 0;
  const IDX_DATE = 1;
  const IDX_REP1 = 2;
  const IDX_TOTAL = 5;
  const IDX_CUST = 6;
  const IDX_REP2 = 7;
  const IDX_METHOD = 8;
  const IDX_STATUS = 9;
  
  for (let i = 1; i < salesData.length; i++) {
    const row = salesData[i];
    const saleId = String(row[IDX_ID] || '').trim();
    if (!saleId) continue;
    
    const saleDate = new Date(row[IDX_DATE]);
    const salesRep1 = String(row[IDX_REP1] || '').trim();
    const salesRep2 = String(row[IDX_REP2] || '').trim();
    const customer = String(row[IDX_CUST] || '').trim();
    const paymentMethod = String(row[IDX_METHOD] || 'CASH');
    const status = String(row[IDX_STATUS] || '').toUpperCase();
    const totalAmount = Number(row[IDX_TOTAL] || 0);
    
    if (isNaN(saleDate.getTime()) || saleDate < today || saleDate >= tomorrow) continue;
    if (status === 'VOID') continue;
    
    let rowRep = salesRep2 || salesRep1;
    
    const salesDetails = [];
    for (let j = 1; j < detailsData.length; j++) {
      if (String(detailsData[j][0]) === saleId) {
        const productId = String(detailsData[j][1]);
        const picked = Number(detailsData[j][2] || 0);
        const original = Number(detailsData[j][3] || 0);
        const returns = Number(detailsData[j][4] || 0);
        const sold = Number(detailsData[j][5] || 0);
        const unitPrice = Number(detailsData[j][6] || 0);
        
        if (sold > 0 || picked > 0 || original > 0) {
          const pEntry = productMap[productId];
          salesDetails.push({
            productId: productId,
            productName: pEntry ? pEntry.name : productId,
            picked: picked,
            original: original,
            returns: returns,
            sold: sold,
            unitPrice: unitPrice
          });
        }
      }
    }
    
    results.push({
      saleId: saleId,
      date: saleDate.toISOString(),
      customer: customer,
      salesRep: rowRep,
      paymentMethod: paymentMethod,
      totalAmount: totalAmount,
      salesData: salesDetails
    });
  }
  
  return results.sort((a, b) => new Date(b.date) - new Date(a.date));
}

/**
 * 獲取指定日期範圍的銷售紀錄
 * 用於合併列印功能 (彈性日期) 與 導入前期退貨
 */
function getSalesByDateRange(payload) {
  const { token, startDate, endDate } = payload;
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const salesSheet = ss.getSheetByName('Sales');
  const detailsSheet = ss.getSheetByName('SalesDetails');
  
  if (!salesSheet || !detailsSheet) return [];
  
  const start = parseLocalYMD_(startDate);
  start.setHours(0, 0, 0, 0);
  
  const end = parseLocalYMD_(endDate);
  end.setHours(23, 59, 59, 999);
  
  const salesData = salesSheet.getDataRange().getValues();
  const detailsData = detailsSheet.getDataRange().getValues();
  const productMap = getProductMap_();
  
  const results = [];
  
  const IDX_ID = 0;
  const IDX_DATE = 1;
  const IDX_REP1 = 2;
  const IDX_TOTAL = 5;
  const IDX_CUST = 6;
  const IDX_REP2 = 7;
  const IDX_METHOD = 8;
  const IDX_STATUS = 9;
  const IDX_WORKHOURS = 14; 
  
  for (let i = 1; i < salesData.length; i++) {
    const row = salesData[i];
    const saleId = String(row[IDX_ID] || '').trim();
    if (!saleId) continue;
    
    const saleDate = new Date(row[IDX_DATE]);
    const salesRep1 = String(row[IDX_REP1] || '').trim();
    const salesRep2 = String(row[IDX_REP2] || '').trim();
    const customer = String(row[IDX_CUST] || '').trim();
    const paymentMethod = String(row[IDX_METHOD] || 'CASH');
    const status = String(row[IDX_STATUS] || '').toUpperCase();
    const totalAmount = Number(row[IDX_TOTAL] || 0);
    const workHours = Number(row[IDX_WORKHOURS] || 0); 
    
    if (isNaN(saleDate.getTime()) || saleDate < start || saleDate > end) continue;
    if (status === 'VOID') continue;
    
    const rowRep = salesRep2 || salesRep1;
    
    const salesDetails = [];
    for (let j = 1; j < detailsData.length; j++) {
      if (String(detailsData[j][0]) === saleId) {
        const productId = String(detailsData[j][1]);
        const picked = Number(detailsData[j][2] || 0);
        const original = Number(detailsData[j][3] || 0);
        const returns = Number(detailsData[j][4] || 0);
        const sold = Number(detailsData[j][5] || 0);
        const unitPrice = Number(detailsData[j][6] || 0);
        
        if (sold > 0 || picked > 0 || original > 0) {
          const pEntry = productMap[productId];
          salesDetails.push({
            productId: productId,
            productName: pEntry ? pEntry.name : productId,
            picked: picked,
            original: original,
            returns: returns,
            sold: sold,
            unitPrice: unitPrice
          });
        }
      }
    }
    
    results.push({
      saleId: saleId,
      date: saleDate.toISOString(),
      customer: customer,
      salesRep: rowRep,
      paymentMethod: paymentMethod,
      totalAmount: totalAmount,
      workHours: workHours,
      salesData: salesDetails
    });
  }
  
  return results.sort((a, b) => new Date(b.date) - new Date(a.date));
}
