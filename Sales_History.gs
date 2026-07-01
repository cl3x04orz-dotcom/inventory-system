/**
 * Sales_History.gs
 * 銷售歷史查詢、合併列印相關查詢
 */

// ===========================================
// 1. 銷售報表查詢 (Get Sales History)
// ===========================================
function getSalesHistory(payload) {
  const { startDate, endDate, customer, salesRep, token, category } = payload;
  
  const categoryMap = typeof getCustomerCategoryMap_ !== 'undefined' ? getCustomerCategoryMap_() : {};
  
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
  const t0 = Date.now();
  
  const qCust = (customer || "").trim().toLowerCase();
  const qRep = (salesRep || "").trim().toLowerCase();

  const t1 = Date.now();
  const salesMaxRows = salesSheet.getMaxRows();
  const salesLastRow = salesSheet.getLastRow();
  const salesLastCol = salesSheet.getLastColumn();

  const salesRows = salesSheet.getDataRange().getValues();
  const t2 = Date.now();
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

    // [新增] 類別過濾 (市場 / 批發)
    if (category && category !== '全部') {
        const cat = categoryMap[rowCust] || '市場';
        if (cat !== category) continue;
    }

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
  const t3 = Date.now();

  const detailsMaxRows = detailsSheet.getMaxRows();
  const detailsLastRow = Math.max(1, detailsSheet.getLastRow());
  const detailsLastCol = Math.max(1, detailsSheet.getLastColumn());

  // 1. 動態 Header Mapping
  const detailsHeaders = detailsSheet.getRange(1, 1, 1, detailsLastCol).getValues()[0];
  const headerMap = {};
  detailsHeaders.forEach((h, idx) => { if (h) headerMap[String(h).trim()] = idx; });
  
  const D_IDX_SID = headerMap['SaleID'] !== undefined ? headerMap['SaleID'] : 0;
  const D_IDX_PID = headerMap['ProductID'] !== undefined ? headerMap['ProductID'] : 1;
  const D_IDX_SOLD = headerMap['Sold'] !== undefined ? headerMap['Sold'] : 5;
  const D_IDX_AMT = headerMap['Subtotal'] !== undefined ? headerMap['Subtotal'] : 7;
  const D_IDX_DATE = headerMap['Date']; 

  let detailRows = [];
  let dateColValues = [];

  if (D_IDX_DATE !== undefined && detailsLastRow > 1) {
    // 第一階讀取：僅拉取 Date 欄
    dateColValues = detailsSheet.getRange(2, D_IDX_DATE + 1, detailsLastRow - 1, 1).getValues();
    
    const getT = (idx) => {
       const v = dateColValues[idx][0];
       if (v && typeof v.getTime === 'function') return v.getTime();
       if (v) { const d = new Date(v); if (!isNaN(d.getTime())) return d.getTime(); }
       return null;
    };
    
    const startMs = start.getTime();
    const endMs = end.getTime();
    
    // Binary Search First >= startMs
    let l = 0, r = dateColValues.length - 1;
    let minIdx = -1;
    while(l <= r) {
      let m = Math.floor((l+r)/2);
      let t = getT(m);
      if (t === null) { l = m+1; continue; } 
      if (t >= startMs) { minIdx = m; r = m - 1; }
      else { l = m + 1; }
    }
    
    // Binary Search Last <= endMs
    l = minIdx !== -1 ? minIdx : 0;
    r = dateColValues.length - 1;
    let maxIdx = -1;
    while(l <= r) {
      let m = Math.floor((l+r)/2);
      let t = getT(m);
      if (t === null) { l = m+1; continue; }
      if (t <= endMs) { maxIdx = m; l = m + 1; }
      else { r = m - 1; }
    }
    
    if (minIdx !== -1 && maxIdx !== -1 && minIdx <= maxIdx) {
       // 放寬 300 筆緩衝，避免些微無序(例如晚補的單)被遺漏
       minIdx = Math.max(0, minIdx - 300);
       maxIdx = Math.min(dateColValues.length - 1, maxIdx + 300);
       const startSheetRow = minIdx + 2;
       const numRows = maxIdx - minIdx + 1;
       detailRows = detailsSheet.getRange(startSheetRow, 1, numRows, detailsLastCol).getValues();
    } else {
       // Fallback
       detailRows = detailsSheet.getRange(2, 1, detailsLastRow - 1, detailsLastCol).getValues();
    }
  } else {
    // 尚未 Migration，退回全表
    detailRows = detailsLastRow > 1 ? detailsSheet.getRange(2, 1, detailsLastRow - 1, detailsLastCol).getValues() : [];
  }

  const t4 = Date.now();
  const results = [];

  for (let i = 0; i < detailRows.length; i++) {
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
  const t5 = Date.now();

  const finalResults = results.sort((a, b) => new Date(b.date) - new Date(a.date));
  const t6 = Date.now();
  
  return {
    data: finalResults,
    benchmark: {
      total: t6 - t0,
      init: t1 - t0,
      readSalesSheet: t2 - t1,
      processSalesRows: t3 - t2,
      readDetailsSheet: t4 - t3,
      processDetails: t5 - t4,
      sortResults: t6 - t5,
      metrics: {
        sales: {
          lastRow: salesLastRow,
          maxRows: salesMaxRows,
          lastColumn: salesLastCol,
          totalCellsRead: salesLastRow * salesLastCol,
          processedRecords: salesRows.length - 1
        },
        details: {
          lastRow: detailsLastRow,
          maxRows: detailsMaxRows,
          lastColumn: detailsLastCol,
          totalCellsRead: (detailRows.length || 0) * detailsLastCol,
          processedRecords: detailRows.length || 0
        }
      }
    }
  };
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
  
  // 建立 O(1) 的 SalesDetails HashMap
  const detailsBySaleId = {};
  for (let j = 1; j < detailsData.length; j++) {
    const sId = String(detailsData[j][0]).trim();
    if (!sId) continue;
    if (!detailsBySaleId[sId]) detailsBySaleId[sId] = [];
    detailsBySaleId[sId].push(detailsData[j]);
  }
  
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
    const matchedDetails = detailsBySaleId[saleId] || [];
    for (const dRow of matchedDetails) {
      const productId = String(dRow[1]);
      const picked = Number(dRow[2] || 0);
      const original = Number(dRow[3] || 0);
      const returns = Number(dRow[4] || 0);
      const sold = Number(dRow[5] || 0);
      const unitPrice = Number(dRow[6] || 0);
      
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

  // 建立 O(1) 的 SalesDetails HashMap
  const detailsBySaleId = {};
  for (let j = 1; j < detailsData.length; j++) {
    const sId = String(detailsData[j][0]).trim();
    if (!sId) continue;
    if (!detailsBySaleId[sId]) detailsBySaleId[sId] = [];
    detailsBySaleId[sId].push(detailsData[j]);
  }
  
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
    const matchedDetails = detailsBySaleId[saleId] || [];
    for (const dRow of matchedDetails) {
      const productId = String(dRow[1]);
      const picked = Number(dRow[2] || 0);
      const original = Number(dRow[3] || 0);
      const returns = Number(dRow[4] || 0);
      const sold = Number(dRow[5] || 0);
      const unitPrice = Number(dRow[6] || 0);
      
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
