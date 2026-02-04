/**
 * Sales.gs - 固定欄位索引修正版 + 權限控管合併
 * 解決：欄位錯位 (Misalignment)、業務員顯示 ???、地點改為銷售對象
 * 功能：包含 Save Sales, Get Sales History (RBAC), Get Receivables
 */

// ===========================================
// 1. 銷售存檔 (Save Sales)
// ===========================================
function saveSalesService(data, user) {
  const { salesData, cashData, expenseData, customer, paymentMethod, salesRep, operator } = data; 
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const salesSheet = ss.getSheetByName('Sales');
  const detailsSheet = ss.getSheetByName('SalesDetails');
  const expSheet = ss.getSheetByName('Expenditures');
  const invSheet = ss.getSheetByName('Inventory');
  
  if (!salesSheet || !detailsSheet || !expSheet || !invSheet) {
    throw new Error('資料庫結構缺失 (Missing Sheets)');
  }
  
  const saleId = Utilities.getUuid();
  const today = data.serverTimestamp ? new Date(data.serverTimestamp) : new Date();
  
  const status = (paymentMethod === 'CREDIT') ? 'UNPAID' : 'PAID';
  const method = paymentMethod || 'CASH';

  // 【名稱修正】：確保抓到 User 名稱
  let finalSalesRep = operator;
  if (!finalSalesRep || finalSalesRep === '???') finalSalesRep = salesRep;
  if (user) {
    if (!finalSalesRep || finalSalesRep === '???') finalSalesRep = user.displayName;
    if (!finalSalesRep || finalSalesRep === '???') finalSalesRep = user.name;
    if (!finalSalesRep || finalSalesRep === '???') finalSalesRep = user.username;
  }
  if (!finalSalesRep) finalSalesRep = 'Unknown';
  
  // 寫入 Sales 表 (維持固定順序，確保與讀取一致)
  // Col 0: ID, 1: Date, 2: SalesRep (Main), 3: Cash, 4: Reserve, 5: Total, 6: Customer, 7: SalesRep (Backup), 8: Method, 9: Status
  salesSheet.appendRow([
    saleId, 
    today, 
    finalSalesRep, 
    cashData.totalCash, 
    cashData.reserve, 
    expenseData.finalTotal,
    customer || '',    
    finalSalesRep,
    method,            
    status,
    JSON.stringify(data.cashCounts || {}) // [New] Col 10: Cash Breakdown Details
  ]);
  
  // 寫入 Expenditures 表
  expSheet.appendRow([
    saleId, 
    expenseData.stall, expenseData.cleaning, expenseData.electricity, 
    expenseData.gas, expenseData.parking, expenseData.goods, 
    expenseData.bags, expenseData.others || 0, expenseData.linePay, 
    expenseData.serviceFee, expenseData.finalTotal,
    customer || '',    
    finalSalesRep,
    today             
  ]);
  
  // 處理庫存扣除
  const invData = invSheet.getDataRange().getValues();
  salesData.forEach(item => {
    const hasActivity = (Number(item.sold) > 0) || (Number(item.picked) > 0) || (Number(item.original) > 0) || (Number(item.returns) > 0);
    if (!hasActivity) return; 

    detailsSheet.appendRow([
      saleId, item.productId, item.picked, item.original, item.returns, item.sold, item.unitPrice, (item.sold * item.unitPrice)
    ]);
    
    let consumedBatches = []; 
    if (item.picked > 0) {
      const result = deductInventory_(invSheet, invData, item.productId, item.picked, 'STOCK');
      consumedBatches = result.consumed;
    }
    if (item.original > 0) {
      deductInventory_(invSheet, invData, item.productId, item.original, 'ORIGINAL');
    }
    if (item.returns > 0) {
      handleReturns_(invSheet, invData, item, consumedBatches, today);
    }
  });
  return { success: true };
}

// ===========================================
// 2. 銷售報表查詢 (Get Sales History)
// ===========================================
function getSalesHistory(payload) {
  const { startDate, endDate, customer, salesRep, token } = payload;
  
  // --- [權限合併] ---
  // 嘗試從 token 還原使用者，若失敗則使用 payload 中 apiHandler 注入的資訊
  let currentUser = null;
  if (token && typeof verifyToken !== 'undefined') {
      currentUser = verifyToken(token);
  }
  // Fallback: 如果 token 無法解析，但 payload 有注入 userRole (由 Code.gs apiHandler 注入)
  if (!currentUser && payload.userRole) {
      currentUser = { 
          role: payload.userRole, 
          username: payload.operator || '' 
      };
  }
  
  const isAdmin = currentUser && (currentUser.role === 'BOSS' || currentUser.role === 'ADMIN');
  const currentUsername = currentUser ? String(currentUser.username || '').trim().toLowerCase() : '';
  // ------------------

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const salesSheet = ss.getSheetByName('Sales');
  const detailsSheet = ss.getSheetByName('SalesDetails');
  
  if (!salesSheet || !detailsSheet) return [];
  
  // 建立產品 Map (ID -> Name)
  const productMap = getProductMap_();

  const start = new Date(startDate); start.setHours(0,0,0,0);
  const end = new Date(endDate); end.setHours(23,59,59,999);
  
  const qCust = (customer || "").trim().toLowerCase();
  const qRep = (salesRep || "").trim().toLowerCase();

  const salesRows = salesSheet.getDataRange().getValues();
  
  // 【關鍵修正】：使用固定 Index 讀取，避免錯位
  const IDX_ID = 0;   // A欄
  const IDX_DATE = 1; // B欄
  const IDX_REP1 = 2; // C欄 (主要業務)
  const IDX_CUST = 6; // G欄 (客戶/地點)
  const IDX_REP2 = 7; // H欄 (備用業務)
  const IDX_METHOD = 8; // I欄 (交易方式)

  const matchedSales = {}; // SaleID -> Info

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
    
    // 搜尋過濾
    if (qRep && !rowRep.toLowerCase().includes(qRep)) continue;

    // --- [權限過濾] ---
    // 非管理員，且資料的業務員並非當前使用者 -> 跳過 (改為精準比對)
    if (!isAdmin && currentUsername) {
        const rRep = rowRep.toLowerCase();
        const cUser = currentUsername.toLowerCase();
        
        // 必須完全相等，或是符合 "Username (XXX)" 格式的前綴匹配 (如果系統有這種格式)
        // 這裡先採用嚴格相等，若有 "User A, User B" 多人情境需另行處理，但在 Sales 系統看起來是單一業務
        if (rRep !== cUser) {
            continue;
        }
    }
    // ------------------

    matchedSales[sId] = {
      date: sDate,
      customer: rowCust,
      salesRep: rowRep,
      paymentMethod: String(row[IDX_METHOD] || "CASH"),
      status: String(row[9] || "").toUpperCase()
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
      // [關鍵]：過濾掉已作廢的紀錄
      if (info.status === 'VOID') continue;

      const soldQty = Number(row[D_IDX_SOLD] || 0);
      if (soldQty <= 0) continue;

      const pId = String(row[D_IDX_PID] || "").trim();
      const pName = productMap[pId] || pId || '未知商品';
      
      results.push({
        date: info.date.toISOString(),
        location: info.customer, 
        salesRep: info.salesRep,
        productName: pName,
        soldQty: soldQty,
        totalAmount: Number(row[D_IDX_AMT] || 0),
        paymentMethod: info.paymentMethod,
        saleId: dSaleId
      });
    }
  }

  return results.sort((a, b) => new Date(b.date) - new Date(a.date));
}

// ===========================================
// 3. 應收帳款查詢 (Get Receivables)
// ===========================================
function getReceivablesService() {
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
               qty: qty,
               price: Number(detailRows[j][6] || 0),
               subtotal: Number(detailRows[j][7] || 0)
             });
           }
        }
      }
      
      results.push({
        id: i + 1, 
        saleId: saleId,
        date: dateStr,
        customer: row[IDX_CUST] || "",
        salesRep: row[IDX_REP] || "未知",
        amount: Number(row[IDX_TOTAL] || 0),
        items: items
      });
    }
  }
  
  return results;
}

// ===========================================
// 4. Helper Functions
// ===========================================

function markAsPaidService(payload) {
  const { recordId } = payload;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const salesSheet = ss.getSheetByName('Sales');
  salesSheet.getRange(recordId, 10).setValue('PAID');
  return { success: true };
}

function getProductMap_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('Products');
  if (!sheet) sheet = ss.getSheetByName('Inventory');
  if (!sheet) return {};
  
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return {};
  
  const headers = values[0].map(h => String(h).trim().toLowerCase().replace(/\s+/g, ''));
  const idxId = headers.findIndex(h => h.includes('id') || h.includes('uuid'));
  const idxName = headers.findIndex(h => h.includes('name') || h === 'product' || h.includes('名稱') || h.includes('品名'));
  
  if (idxId === -1) return {};
  
  const map = {};
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const id = row[idxId];
    if (id) {
      map[String(id).trim()] = idxName !== -1 ? row[idxName] : id;
    }
  }
  return map;
}

function deductInventory_(sheet, sheetData, productId, qtyToDeduct, targetType) {
  let remaining = Number(qtyToDeduct);
  let consumedStats = [];
  if (remaining <= 0) return { consumed: [] };
  
  let batches = [];
  for (let i = 1; i < sheetData.length; i++) {
    const row = sheetData[i];
    const pId = row[1];
    const qty = Number(row[2]);
    const expiry = row[3]; 
    const type = row[5];
    
    let isMatch = (targetType === 'STOCK') ? (type === 'STOCK') : (type !== 'STOCK');
    
    if (pId === productId && qty > 0 && isMatch) {
      batches.push({ rowIndex: i + 1, qty: qty, expiry: expiry }); 
    }
  }
  batches.sort((a, b) => new Date(a.expiry) - new Date(b.expiry));
  
  for (let batch of batches) {
    if (remaining <= 0) break;
    const deduct = Math.min(batch.qty, remaining);
    const newQty = batch.qty - deduct;
    sheet.getRange(batch.rowIndex, 3).setValue(newQty);
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
    sheet.appendRow([
      Utilities.getUuid(), item.productId, returnQty, batch.expiry, today, 'ORIGINAL'
    ]);
    remainingReturn -= returnQty;
  }
  if (remainingReturn > 0) {
      let fallbackExpiry = new Date('2099-12-31');
      const stockBatches = sheetData.slice(1).filter(r => r[1] === item.productId && r[5] === 'STOCK');
      if (stockBatches.length > 0) {
         stockBatches.sort((a, b) => new Date(a[3]) - new Date(b[3]));
         fallbackExpiry = stockBatches[0][3]; 
      }
      sheet.appendRow([
        Utilities.getUuid(), item.productId, remainingReturn, fallbackExpiry, today, 'ORIGINAL'
      ]);
  }
}
// ===========================================
// 5. 銷售作廢與修正 (Void & Fetch for Correction)
// ===========================================
function voidAndFetchSaleService(payload) {
  const { saleId } = payload;
  if (!saleId) throw new Error("缺少銷售編號 (Missing SaleId)");

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const salesSheet = ss.getSheetByName('Sales');
  const detailsSheet = ss.getSheetByName('SalesDetails');
  const expSheet = ss.getSheetByName('Expenditures');
  const invSheet = ss.getSheetByName('Inventory');

  // 1. 標記 Sales 表為 VOID
  const salesData = salesSheet.getDataRange().getValues();
  let saleRowIndex = -1;
  let originalSaleData = null;
  for (let i = 1; i < salesData.length; i++) {
    if (String(salesData[i][0]) === saleId) {
      saleRowIndex = i + 1;
      originalSaleData = salesData[i];
      break;
    }
  }
  if (saleRowIndex === -1) throw new Error("找不到該筆銷售紀錄");
  salesSheet.getRange(saleRowIndex, 10).setValue('VOID'); // J欄: Status

  // 2. 標記 Expenditures 表為 VOID 並獲取資料
  let fetchedExpenses = null;
  const expData = expSheet.getDataRange().getValues();
  for (let i = 1; i < expData.length; i++) {
    if (String(expData[i][0]) === saleId) {
      const expRow = i + 1;
      
      // 讀取原始支出資料
      fetchedExpenses = {
          stall: Number(expData[i][1] || 0),
          cleaning: Number(expData[i][2] || 0),
          electricity: Number(expData[i][3] || 0),
          gas: Number(expData[i][4] || 0),
          parking: Number(expData[i][5] || 0),
          goods: Number(expData[i][6] || 0),
          bags: Number(expData[i][7] || 0),
          others: Number(expData[i][8] || 0),
          linePay: Number(expData[i][9] || 0),
          serviceFee: Number(expData[i][10] || 0)
      };

      const oldNote = String(expData[i][18] || "");
      expSheet.getRange(expRow, 19).setValue("[VOID] " + (oldNote || "")); 
      expSheet.getRange(expRow, 20).setValue(0);
      for (let col = 2; col <= 11; col++) {
        expSheet.getRange(expRow, col).setValue(0);
      }
      break;
    }
  }

  // 3. 處理銷售明細與庫存回補
  const detailsData = detailsSheet.getDataRange().getValues();
  const fetchedDetails = [];
  const today = new Date();

  for (let i = 1; i < detailsData.length; i++) {
    if (String(detailsData[i][0]) === saleId) {
      const productId = String(detailsData[i][1]);
      const picked = Number(detailsData[i][2] || 0);
      const original = Number(detailsData[i][3] || 0);
      const returns = Number(detailsData[i][4] || 0);
      const sold = Number(detailsData[i][5] || 0);
      const unitPrice = Number(detailsData[i][6] || 0);

      fetchedDetails.push({ productId, picked, original, returns, sold, unitPrice });

      // 庫存回補
      if (picked > 0) {
        let expiry = new Date();
        expiry.setDate(expiry.getDate() + 30);
        const invRows = invSheet.getDataRange().getValues();
        for (let j = invRows.length - 1; j >= 1; j--) {
          if (invRows[j][1] === productId && invRows[j][5] === 'STOCK') {
            expiry = invRows[j][3];
            break;
          }
        }
        invSheet.appendRow([Utilities.getUuid(), productId, picked, expiry, today, 'STOCK', 'VOID_REFUND: ' + saleId]);
      }
      if (original > 0) {
        invSheet.appendRow([Utilities.getUuid(), productId, original, today, today, 'ORIGINAL', 'VOID_REFUND: ' + saleId]);
      }
      if (returns > 0) {
        // [Fix] Try to deduct from existing ORIGINAL rows first to avoid negative row fragmentation
        const invValues = invSheet.getDataRange().getValues(); // Refresh data
        const deductResult = deductInventory_(invSheet, invValues, productId, returns, 'ORIGINAL');
        const totalDeducted = deductResult.consumed.reduce((sum, item) => sum + item.deductedQty, 0);
        
        const remainingToDeduct = returns - totalDeducted;
        
        if (remainingToDeduct > 0) {
           // Only append negative row if we couldn't find enough positive rows to deduct
           invSheet.appendRow([Utilities.getUuid(), productId, -remainingToDeduct, today, today, 'ORIGINAL', 'VOID_CANCEL_RETURN: ' + saleId]);
        }
      }
    }
  }

  // 4. 重整回傳資料
  return {
    success: true,
    cloneData: {
      customer: originalSaleData[6],
      paymentMethod: originalSaleData[8],
      salesData: fetchedDetails,
      reserve: Number(originalSaleData[4] || 0),
      reserve: Number(originalSaleData[4] || 0),
      expenses: fetchedExpenses,
      cashCounts: (originalSaleData[10] && String(originalSaleData[10]).startsWith('{')) ? JSON.parse(originalSaleData[10]) : {}
    }
  };
}
