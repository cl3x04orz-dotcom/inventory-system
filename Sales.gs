/**
 * Sales.gs - 固定欄位索引修正版 + 權限控管合併
 * 解決：欄位錯位 (Misalignment)、業務員顯示 ???、地點改為銷售對象
 * 功能：包含 Save Sales, Get Sales History (RBAC), Get Receivables
 */

// ===========================================
// 1. 銷售存檔 (Save Sales) - [Transaction Safe]
// ===========================================
function saveSalesService(data, user) {
  const { salesData, cashData, expenseData, customer, paymentMethod, salesRep, operator, submissionId, originalDate } = data; 
  
  // [防重複存檔] 檢查 submissionId
  if (submissionId) {
    const cache = CacheService.getScriptCache();
    const cached = cache.get(submissionId);
    if (cached) return { success: true, duplicate: true, message: "已偵測到重複請求" };
    cache.put(submissionId, "PROCESSED", 600);
  }

  // 1. 全局鎖定 (從這裡開始領號碼牌，確保計算期間沒人插隊)
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000); // 等待最多 30 秒
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const salesSheet = ss.getSheetByName('Sales');
    const detailsSheet = ss.getSheetByName('SalesDetails');
    const expSheet = ss.getSheetByName('Expenditures');
    const invSheet = ss.getSheetByName('Inventory');
  
    if (!salesSheet || !detailsSheet || !expSheet || !invSheet) {
      throw new Error('資料庫結構缺失 (Missing Sheets)');
    }
  
    // 2. 讀取所有必要資料 (Snapshot Read)
    const invData = invSheet.getDataRange().getValues(); // 讀取完整庫存
    
    // 3. 準備資料 (In-Memory Calculation)
    const saleId = Utilities.getUuid();
    
    // 如果是修正單據，優先使用原始日期 (originalDate)，否則使用當前時間
    let today = new Date();
    if (originalDate) {
      try {
        today = new Date(originalDate);
      } catch (e) {
        console.error("Failed to parse originalDate:", originalDate, e);
      }
    } else if (data.serverTimestamp) {
      today = new Date(data.serverTimestamp);
    }

    const status = (paymentMethod === 'CREDIT') ? 'UNPAID' : 'PAID';
    const method = paymentMethod || 'CASH';

    // 【名稱邏輯】：
    // salesRep 是由前端傳入的「業績歸屬人」(修正時會帶入舊單業務)
    // operator 是「實際操作者」(當前登入者)
    const finalSalesRep = salesRep || (user ? (user.displayName || user.name || user.username) : 'Unknown');
    const finalOperator = operator || (user ? (user.displayName || user.name || user.username) : 'Unknown');
    
    // 3.1 準備 Sales Row (Col 0-11)
    const newSalesRow = [
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
        JSON.stringify(data.cashCounts || {}), // Col 10: Cash Breakdown Details
        finalOperator                          // Col 11 (L 欄): 實際操作者
    ];

    // 3.2 準備 Expenditures Row (Col 0-18)
    const baseNote = originalDate ? `[修正] 於 ${Utilities.formatDate(new Date(), "GMT+8", "yyyy/MM/dd HH:mm")} 修改，原始 ID: ${data.originalSaleId || 'N/A'}` : "";
    
    // [Modified] 整合多個備註欄位
    const remarks = [];
    if (expenseData.goodsVendor) remarks.push(`貨款廠商: ${expenseData.goodsVendor}`);
    if (expenseData.gasRemark) remarks.push(`加油: ${expenseData.gasRemark}`);
    if (expenseData.parkingRemark) remarks.push(`停車: ${expenseData.parkingRemark}`);
    if (expenseData.othersRemark) remarks.push(`其他: ${expenseData.othersRemark}`);
    if (expenseData.salaryRemark) remarks.push(`薪資: ${expenseData.salaryRemark}`);
    if (expenseData.reserveFundRemark) remarks.push(`公積金: ${expenseData.reserveFundRemark}`);
    if (expenseData.vehicleMaintenanceRemark) remarks.push(`保養: ${expenseData.vehicleMaintenanceRemark}`);
    
    const combinedRemarks = remarks.length > 0 ? `[${remarks.join(', ')}] ` : "";
    const finalNote = (combinedRemarks + baseNote).trim();

    const newExpRow = [
        saleId, 
        expenseData.stall, expenseData.cleaning, expenseData.electricity, 
        expenseData.gas, expenseData.parking, expenseData.goods, 
        expenseData.bags, expenseData.others || 0, expenseData.linePay, 
        expenseData.serviceFee, expenseData.finalTotal, // L (11): 銷售產生維持 finalTotal (正常顯示)
        customer || '',    
        finalSalesRep,
        today,                                          // O (14): 時間戳記 ✅
        Number(expenseData.vehicleMaintenance) || 0,    // P (15): 車輛保養 ✅
        Number(expenseData.salary) || 0,                // Q (16): 薪資發放 ✅
        Number(expenseData.reserveFund) || Number(expenseData.reserve) || 0, // R (17): 公積金 (前端傳入 reserveFund)
        finalNote                                       // S (18): 備註
    ];
    
    // 3.3 處理庫存邏輯 (只修改記憶體 invData)
    const newDetailRows = [];
    const newInvLogRows = [];
    let isInventoryModified = false;

    // 獲取產品資訊（包含成本）對照表
    const productInfoMap = typeof getProductInfoMap_ !== 'undefined' ? getProductInfoMap_() : {};

    salesData.forEach(item => {
        const hasActivity = (Number(item.sold) > 0) || (Number(item.picked) > 0) || (Number(item.original) > 0) || (Number(item.returns) > 0);
        if (!hasActivity) return; 

        const pInfo = productInfoMap[item.productId] || {};
        const pName = pInfo.name || item.productName || 'Unknown';
        const unitCost = Number(pInfo.cost) || 0; // 獲得當下成本
        
        newDetailRows.push([
            saleId, 
            item.productId, 
            item.picked, 
            item.original, 
            item.returns, 
            item.sold, 
            item.unitPrice, 
            (item.sold * item.unitPrice), 
            pName, 
            (customer || ''),
            unitCost // 第 11 欄 (K): 銷售當下成本
        ]);
        
        let consumedBatches = []; 
        if (item.picked > 0) {
            // [Refactored] deductInventory_ now modifies invData in-place
            const result = deductInventory_(invData, item.productId, item.picked, 'STOCK');
            consumedBatches = result.consumed;
            if (consumedBatches.length > 0) isInventoryModified = true;
        }
        if (item.original > 0) {
            const result = deductInventory_(invData, item.productId, item.original, 'ORIGINAL');
            if (result.consumed.length > 0) isInventoryModified = true;
        }
        if (item.returns > 0) {
            // 計算退貨 (增加庫存日誌)
            const returnRows = getReturnRows_(invData, item, consumedBatches, today);
            newInvLogRows.push(...returnRows);
        }
    });

    // 4. 執行批次寫入 (Atomic-like Batch Write)
    
    // 4.1 寫入主表與明細 (Append)
    // 由於是單筆交易，可以直接 AppendRow 或用 BatchAppend
    // 為了統一，我們用 Helper (但這裡只有一行，如果不習慣用 Helper 可以直接 appendRow，但 Helper 比較快)
    // 這裡還是用 appendRow 比較簡單直觀，除了 Details 和 Logs 可能多筆
    
    salesSheet.appendRow(newSalesRow);
    expSheet.appendRow(newExpRow);
    
    if (newDetailRows.length > 0) batchAppendNoLock_(detailsSheet, newDetailRows);
    if (newInvLogRows.length > 0) batchAppendNoLock_(invSheet, newInvLogRows);

    // 4.2 寫入庫存更新 (Update Whole Column)
    // 為了確保原子性與效能，我們將記憶體中更新過的數量欄位 (Col C) 一次寫回
    if (isInventoryModified) {
        // 取第3欄 (Index 2), 去掉 Header (Row 0)
        // 注意：getDataRange 包含 Header，所以 invData[0] 是 Header
        const qtyColumn = invData.slice(1).map(r => [r[2]]); 
        if (qtyColumn.length > 0) {
            // 寫回 Range: Row 2, Col 3, Height = qtyColumn.length, Width = 1
            invSheet.getRange(2, 3, qtyColumn.length, 1).setValues(qtyColumn);
        }
    }

    SpreadsheetApp.flush(); // 強制寫入
    return { success: true };

  } finally {
    lock.releaseLock(); // 5. 釋放號碼牌
  }
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

  // [修正] 使用 parseLocalYMD_ 避免時區問題
  const start = parseLocalYMD_(startDate); start.setHours(0,0,0,0);
  const end = parseLocalYMD_(endDate); end.setHours(23,59,59,999);
  
  const qCust = (customer || "").trim().toLowerCase();
  const qRep = (salesRep || "").trim().toLowerCase();

  const salesRows = salesSheet.getDataRange().getValues();
  
  // 【關鍵修正】：使用固定 Index 讀取，避免錯位
  const IDX_ID = 0;   // A欄
  const IDX_DATE = 1; // B欄
  const IDX_REP1 = 2; // C欄 (主要業務)
  const IDX_CUST = 6; // G欄 (客戶/地點)
  const IDX_REP2 = 7; // H欄 (備用業務)
  const IDX_METHOD = 8; // I欄 (原始交易方式)
  const IDX_STATUS = 9; // J欄 (狀態)
  const IDX_PAY_DATE = 12; // M欄 (實際收款日期) - [New]
  const IDX_ACTUAL_METHOD = 13; // N欄 (實際收款方式) - [New]

  const matchedSales = {}; // SaleID -> Info

  for (let i = 1; i < salesRows.length; i++) {
    const row = salesRows[i];
    const sId = String(row[IDX_ID] || "").trim();
    if (!sId) continue;

    const rowStatus = String(row[IDX_STATUS] || "").toUpperCase();
    if (rowStatus === 'VOID') continue;

    const dateVal = row[IDX_DATE];
    const sDate = new Date(dateVal);
    
    // [New] 收款日期比對 (用於計入今日現金)
    const payDateVal = row[IDX_PAY_DATE];
    const pDate = payDateVal ? new Date(payDateVal) : null;
    
    const rowCust = String(row[IDX_CUST] || "").trim();
    if (qCust && !rowCust.toLowerCase().includes(qCust)) continue;

    let rowRep = String(row[IDX_REP2] || "").trim();
    if (!rowRep || rowRep === '???') rowRep = String(row[IDX_REP1] || "").trim();
    if (qRep && !rowRep.toLowerCase().includes(qRep)) continue;

    // --- [權限過濾] ---
    if (!isAdmin && currentUsername) {
        if (rowRep.toLowerCase() !== currentUsername.toLowerCase()) continue;
    }

    // --- [核心判斷：該筆單據是否屬於此日期範圍？] ---
    // 條件 A: 銷售日期在範圍內 (一般的本日銷貨)
    const isSaleInBatch = (!isNaN(sDate.getTime()) && sDate >= start && sDate <= end);
    
    // 條件 B: 實際收款日期在範圍內 (以前的欠款，今天收回現金)
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
      isCollectionReportMode: isCollectionInBatch && !isSaleInBatch // 標註這是補收回的單
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
      const pName = productMap[pId] || pId || '未知商品';
      
      // 決定顯示的名稱註解與付款方式
      let collectionNote = "";
      let displayMethod = info.paymentMethod;
      if (info.isCollectionReportMode) {
          collectionNote = info.actualPaymentMethod === 'TRANSFER' ? "(匯款補收)" : "(現金補收)";
          if (info.actualPaymentMethod) displayMethod = info.actualPaymentMethod;
      }

      results.push({
        date: info.isCollectionReportMode ? info.paymentDate.toISOString() : info.date.toISOString(),
        location: info.customer, // 保持原始純名字
        collectionNote: collectionNote, // 新增獨立註解欄位
        salesRep: info.salesRep,
        productName: pName,
        soldQty: soldQty,
        totalAmount: Number(row[D_IDX_AMT] || 0),
        paymentMethod: displayMethod,
        saleId: dSaleId,
        operator: info.operator,
        isCollectionReportMode: info.isCollectionReportMode // [New] 務必回傳此標記供前端判斷
      });
    }
  }

  return results.sort((a, b) => new Date(b.date) - new Date(a.date));
}

// ===========================================
// 3. 應收帳款查詢 (Get Receivables)
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
        // uuids 陣列包含此筆的 SaleID，供前端批次操作
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

// ===========================================
// 4. Helper Functions
// ===========================================

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

    // 擴充欄位檢查
    // M 欄 (Index 12): PaymentDate
    // N 欄 (Index 13): ActualPaymentMethod
    if (lastCol < 14) {
        // 先確保標題存在
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

// [已重構] 純邏輯運算，直接修改記憶體中的 invData，不執行寫入
function deductInventory_(sheetData, productId, qtyToDeduct, targetType) {
  let remaining = Number(qtyToDeduct);
  let consumedStats = [];
  if (remaining <= 0) return { consumed: [] };
  
  let batches = [];
  for (let i = 1; i < sheetData.length; i++) {
    const row = sheetData[i];
    const pId = row[1];
    const qty = Number(row[2]); // Index 2 is Qty
    const expiry = row[3]; 
    const type = row[5];
    
    let isMatch = (targetType === 'STOCK') ? (type === 'STOCK') : (type !== 'STOCK');
    
    if (pId === productId && qty > 0 && isMatch) {
      batches.push({ rowRef: row, qty: qty, expiry: expiry }); 
    }
  }
  batches.sort((a, b) => new Date(a.expiry) - new Date(b.expiry));
  
  for (let batch of batches) {
    if (remaining <= 0) break;
    const deduct = Math.min(batch.qty, remaining);
    
    // [重要] 直接修改陣列中的值 (Pass by reference)
    batch.rowRef[2] = batch.qty - deduct;
    
    consumedStats.push({ expiry: batch.expiry, deductedQty: deduct });
    remaining -= deduct;
  }
  return { consumed: consumedStats };
}

/**
 * 計算退貨紀錄 (回傳待寫入的二維陣列)
 */
function getReturnRows_(sheetData, item, consumedBatches, today) {
  let rows = [];
  let remainingReturn = item.returns;
  const productMap = typeof getProductMap !== 'undefined' ? getProductMap() : {};
  const pName = productMap[item.productId] || item.productName || 'Unknown';
  
  for (let batch of consumedBatches) {
    if (remainingReturn <= 0) break;
    const returnQty = Math.min(remainingReturn, batch.deductedQty);
    rows.push([
      Utilities.getUuid(), item.productId, returnQty, batch.expiry, today, 'ORIGINAL', '', pName
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
    rows.push([
      Utilities.getUuid(), item.productId, remainingReturn, fallbackExpiry, today, 'ORIGINAL', '', pName
    ]);
  }
  return rows;
}
/**
 * 獲取銷售資料用於「複製/修正」(單純讀取，速度快)
 */
function getSaleToCloneService(payload) {
  const { saleId } = payload;
  if (!saleId) throw new Error("缺少銷售編號");

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const salesSheet = ss.getSheetByName('Sales');
  const detailsSheet = ss.getSheetByName('SalesDetails');
  const expSheet = ss.getSheetByName('Expenditures');

  const salesData = salesSheet.getDataRange().getValues();
  let originalSaleData = null;
  for (let i = 1; i < salesData.length; i++) {
    if (String(salesData[i][0]) === saleId) {
      originalSaleData = salesData[i];
      break;
    }
  }
  if (!originalSaleData) throw new Error("找不到銷售紀錄");

  const detailsData = detailsSheet.getDataRange().getValues();
  const fetchedDetails = [];
  const productMap = getProductMap_();
  for (let i = 1; i < detailsData.length; i++) {
    if (String(detailsData[i][0]) === saleId) {
      fetchedDetails.push({
        productId: String(detailsData[i][1]),
        productName: productMap[String(detailsData[i][1])] || String(detailsData[i][1]),
        picked: Number(detailsData[i][2] || 0),
        original: Number(detailsData[i][3] || 0),
        returns: Number(detailsData[i][4] || 0),
        sold: Number(detailsData[i][5] || 0),
        unitPrice: Number(detailsData[i][6] || 0)
      });
    }
  }

  let fetchedExpenses = null;
  const expData = expSheet.getDataRange().getValues();
  for (let i = 1; i < expData.length; i++) {
    if (String(expData[i][0]) === saleId) {
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
        serviceFee: Number(expData[i][10] || 0),
        vehicleMaintenance: Number(expData[i][15] || 0),
        salary: Number(expData[i][16] || 0),
        reserveFund: Number(expData[i][17] || 0),
        // [New] 解析備註欄位以還原各項備註 (備註格式為 [貨款廠商: xxx, 加油: xxx, ...])
        remarksRaw: String(expData[i][18] || "")
      };
      
      // 嘗試從備註字串還原備註欄位 (Regex 解析)
      const parseRemark = (label) => {
        const regex = new RegExp(`${label}:\\s*([^,\\]]+)`);
        const match = fetchedExpenses.remarksRaw.match(regex);
        return match ? match[1].trim() : "";
      };
      
      fetchedExpenses.goodsVendor = parseRemark("貨款廠商");
      fetchedExpenses.gasRemark = parseRemark("加油");
      fetchedExpenses.parkingRemark = parseRemark("停車");
      fetchedExpenses.othersRemark = parseRemark("其他");
      fetchedExpenses.salaryRemark = parseRemark("薪資");
      fetchedExpenses.reserveFundRemark = parseRemark("公積金");
      fetchedExpenses.vehicleMaintenanceRemark = parseRemark("保養");
      
      break;
    }
  }

  return {
    success: true,
    cloneData: {
      customer: originalSaleData[6],
      salesRep: originalSaleData[2], // 新增：保留原始業務員
      paymentMethod: originalSaleData[8],
      salesData: fetchedDetails,
      reserve: Number(originalSaleData[4] || 0),
      expenses: fetchedExpenses,
      cashCounts: (originalSaleData[10] && String(originalSaleData[10]).startsWith('{')) ? JSON.parse(originalSaleData[10]) : {},
      originalDate: originalSaleData[1], // 新增：檢索原始日期
      originalSaleId: saleId            // 新增：紀錄來源 ID
    }
  };
}

// ===========================================
// 5. 銷售作廢與修正 (Void & Fetch for Correction)
// ===========================================
function voidAndFetchSaleService(payload) {
  const { saleId } = payload;
  if (!saleId) throw new Error("缺少銷售編號");

  // 1. 全局鎖定
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const salesSheet = ss.getSheetByName('Sales');
    const detailsSheet = ss.getSheetByName('SalesDetails');
    const expSheet = ss.getSheetByName('Expenditures');
    const invSheet = ss.getSheetByName('Inventory');

    // 2. 標記 Sales 表並檢查狀態
    const salesData = salesSheet.getDataRange().getValues();
    let saleRowIndex = -1;
    let originalSaleData = null;
    for (let i = 1; i < salesData.length; i++) {
        if (String(salesData[i][0]) === saleId) {
            // [Fix] 如果已經是 VOID，拒絕重複執行回補
            if (String(salesData[i][9]).toUpperCase() === 'VOID') {
                throw new Error("此單據已經作廢，不可重複操作。");
            }
            saleRowIndex = i + 1;
            originalSaleData = salesData[i];
            break;
        }
    }
    if (saleRowIndex === -1) throw new Error("找不到該筆銷售紀錄");
    salesSheet.getRange(saleRowIndex, 10).setValue('VOID');

  // 2. 標記 Expenditures 表為 VOID 並獲取資料
  let fetchedExpenses = null;
  const expData = expSheet.getDataRange().getValues();
  for (let i = 1; i < expData.length; i++) {
    if (String(expData[i][0]) === saleId) {
      const expRow = i + 1;
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
          serviceFee: Number(expData[i][10] || 0),
          // [New] 解析備註欄位
          remarksRaw: String(expData[i][18] || "")
      };
      
      const parseRemark = (label) => {
        const regex = new RegExp(`${label}:\\s*([^,\\]]+)`);
        const match = fetchedExpenses.remarksRaw.match(regex);
        return match ? match[1].trim() : "";
      };
      
      fetchedExpenses.goodsVendor = parseRemark("貨款廠商");
      fetchedExpenses.gasRemark = parseRemark("加油");
      fetchedExpenses.parkingRemark = parseRemark("停車");
      fetchedExpenses.othersRemark = parseRemark("其他");
      fetchedExpenses.salaryRemark = parseRemark("薪資");
      fetchedExpenses.reserveFundRemark = parseRemark("公積金");
      fetchedExpenses.vehicleMaintenanceRemark = parseRemark("保養");
      fetchedExpenses.reserveFund = Number(expData[i][17] || 0);
      fetchedExpenses.vehicleMaintenance = Number(expData[i][15] || 0);
      fetchedExpenses.salary = Number(expData[i][16] || 0);

      const oldNote = String(expData[i][18] || "");
      expSheet.getRange(expRow, 19).setValue("[VOID] " + (oldNote || "")); 
      break;
    }
  }

  // 3. 處理銷售明細與庫存回補
  const detailsData = detailsSheet.getDataRange().getValues();
  const invData = invSheet.getDataRange().getValues(); // Snapshot of Inventory
  const productMap = typeof getProductMap !== 'undefined' ? getProductMap() : {};
  const fetchedDetails = [];
  const today = new Date();
  const voidRefundInvRows = [];

  let isInventoryModified = false;

  for (let i = 1; i < detailsData.length; i++) {
    if (String(detailsData[i][0]) === saleId) {
      const productId = String(detailsData[i][1]);
      const picked = Number(detailsData[i][2] || 0);
      const original = Number(detailsData[i][3] || 0);
      const returns = Number(detailsData[i][4] || 0);
      const sold = Number(detailsData[i][5] || 0);
      const unitPrice = Number(detailsData[i][6] || 0);
      const pName = productMap[productId] || productId;

      fetchedDetails.push({ productId, picked, original, returns, sold, unitPrice });

      // 庫存回補 (Append New Stock/Original)
      if (picked > 0) {
        let expiry = new Date();
        expiry.setDate(expiry.getDate() + 30);
        // Find latest expiry for this product
        for (let j = invData.length - 1; j >= 1; j--) {
          if (invData[j][1] === productId && invData[j][5] === 'STOCK') {
            expiry = invData[j][3];
            break;
          }
        }
        voidRefundInvRows.push([Utilities.getUuid(), productId, picked, expiry, today, 'STOCK', 'VOID_REFUND: ' + saleId, pName]);
      }
      if (original > 0) {
        voidRefundInvRows.push([Utilities.getUuid(), productId, original, today, today, 'ORIGINAL', 'VOID_REFUND: ' + saleId, pName]);
      }
      if (returns > 0) {
        // [Voiding a Return] -> We must DEDUCT from ORIGINAL in Inventory
        // deductInventory_ modifies invData in-place
        // returns were added to Original, so to void, we remove from Original
        const deductResult = deductInventory_(invData, productId, returns, 'ORIGINAL');
        const totalDeducted = deductResult.consumed.reduce((sum, item) => sum + item.deductedQty, 0);
        
        if (totalDeducted > 0) isInventoryModified = true;

        const remainingToDeduct = returns - totalDeducted;
        if (remainingToDeduct > 0) {
           // Should not happen if data is consistent, but log if it does
           voidRefundInvRows.push([Utilities.getUuid(), productId, -remainingToDeduct, today, today, 'ORIGINAL', 'VOID_CANCEL_RETURN: ' + saleId, pName]);
        }
      }
    }
  }

  // 4. Atomic-like Writes

  // 4.1 Append Refund Logs
  if (voidRefundInvRows.length > 0) {
    batchAppendNoLock_(invSheet, voidRefundInvRows);
  }

  // 4.2 Write Back Modified Inventory (for Cancel Return deductions)
  if (isInventoryModified) {
    // 取第3欄 (Index 2), 去掉 Header (Row 0)
    const qtyColumn = invData.slice(1).map(r => [r[2]]); 
    if (qtyColumn.length > 0) {
        invSheet.getRange(2, 3, qtyColumn.length, 1).setValues(qtyColumn);
    }
  }

  SpreadsheetApp.flush(); // 強制同步
  return {
    success: true,
    cloneData: {
      customer: originalSaleData[6],
      paymentMethod: originalSaleData[8],
      salesData: fetchedDetails,
      reserve: Number(originalSaleData[4] || 0),
      expenses: fetchedExpenses,
      cashCounts: (originalSaleData[10] && String(originalSaleData[10]).startsWith('{')) ? JSON.parse(originalSaleData[10]) : {},
      originalDate: originalSaleData[1], // 新增：檢索原始日期
      originalSaleId: saleId            // 新增：紀錄來源 ID
    }
  };

  } finally {
    lock.releaseLock(); 
  }
}

// ===========================================
// 6. 當日紀錄查詢 (Get Recent Sales Today)
// ===========================================
/**
 * 獲取當前使用者當天的銷售紀錄（非作廢）
 * 用於合併列印功能
 */
function getRecentSalesToday(payload) {
  const { token } = payload;
  
  // 驗證使用者
  let currentUser = null;
  if (token && typeof verifyToken !== 'undefined') {
    currentUser = verifyToken(token);
  }
  // Fallback: 如果 token 無法解析，但 payload 有注入 userRole
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
  
  if (!salesSheet || !detailsSheet) {
    return [];
  }
  
  // 取得今天的日期範圍（使用 GMT+8）
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  const salesData = salesSheet.getDataRange().getValues();
  const detailsData = detailsSheet.getDataRange().getValues();
  const productMap = getProductMap_();
  
  const currentUsername = String(currentUser.username || '').trim().toLowerCase();
  const results = [];
  
  // 固定欄位索引（與 getSalesHistory 一致）
  const IDX_ID = 0;
  const IDX_DATE = 1;
  const IDX_REP1 = 2;
  const IDX_TOTAL = 5;
  const IDX_CUST = 6;
  const IDX_REP2 = 7;
  const IDX_METHOD = 8;
  const IDX_STATUS = 9;
  
  // 遍歷 Sales 表
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
    
    // 過濾條件：當天、非作廢、當前使用者
    if (isNaN(saleDate.getTime()) || saleDate < today || saleDate >= tomorrow) continue;
    if (status === 'VOID') continue;
    
    // 業務員匹配（優先使用 REP2，fallback 到 REP1）
    let rowRep = salesRep2 || salesRep1;
    // [Removed] 移除過濾，讓所有帳號都能進行合併列印操作
    // if (rowRep.toLowerCase() !== currentUsername) continue;
    
    // 提取該筆銷售的明細
    const salesDetails = [];
    for (let j = 1; j < detailsData.length; j++) {
      if (String(detailsData[j][0]) === saleId) {
        const productId = String(detailsData[j][1]);
        const picked = Number(detailsData[j][2] || 0);
        const original = Number(detailsData[j][3] || 0);
        const returns = Number(detailsData[j][4] || 0);
        const sold = Number(detailsData[j][5] || 0);
        const unitPrice = Number(detailsData[j][6] || 0);
        
        // 只包含有實際銷售的產品
        if (sold > 0 || picked > 0 || original > 0) {
          salesDetails.push({
            productId: productId,
            productName: productMap[productId] || productId,
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
  
  // 按時間倒序排列（最新的在前）
  return results.sort((a, b) => new Date(b.date) - new Date(a.date));
}

// ===========================================
// 7. 日期範圍查詢 (Get Sales By Date Range)
// ===========================================
/**
 * 獲取指定日期範圍的銷售紀錄
 * 用於合併列印功能 (彈性日期) 與 導入前期退貨
 */
function getSalesByDateRange(payload) {
  const { token, startDate, endDate } = payload;
  
  // 驗證使用者 (可選)
  // ... 略過嚴格驗證，允許前端調用

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const salesSheet = ss.getSheetByName('Sales');
  const detailsSheet = ss.getSheetByName('SalesDetails');
  
  if (!salesSheet || !detailsSheet) return [];
  
  // [修正] 使用 parseLocalYMD_ 解析日期，避免時區偏移
  const start = parseLocalYMD_(startDate);
  start.setHours(0, 0, 0, 0);
  
  const end = parseLocalYMD_(endDate);
  end.setHours(23, 59, 59, 999);
  
  const salesData = salesSheet.getDataRange().getValues();
  const detailsData = detailsSheet.getDataRange().getValues();
  const productMap = getProductMap_();
  
  const results = [];
  
  // 欄位索引
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
    
    // 過濾條件：日期範圍、非作廢
    if (isNaN(saleDate.getTime()) || saleDate < start || saleDate > end) continue;
    if (status === 'VOID') continue;
    
    const rowRep = salesRep2 || salesRep1;
    
    // 提取明細
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
          salesDetails.push({
            productId: productId,
            productName: productMap[productId] || productId,
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

// ===========================================
// 8. 通用 Helper Functions
// ===========================================


/**
 * 補齊舊銷售明細的產品名稱 (一次性執行)
 */
function backfillSalesDetailsProductNames() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const detailsSheet = ss.getSheetByName('SalesDetails');
  const productMap = getProductMap_();
  if (!detailsSheet) return "找不到 SalesDetails 分頁";

  const data = detailsSheet.getDataRange().getValues();
  if (data.length <= 1) return "無資料可補齊";

  // 檢查標題，確保第 9 欄有產品名稱標題
  if (data[0].length < 9) {
    detailsSheet.getRange(1, 9).setValue("ProductName");
  }

  const updates = [];
  let updatedCount = 0;
  
  // 遍歷所有列，ProductID 在第 2 欄 (index 1)
  for (let i = 1; i < data.length; i++) {
    const pId = String(data[i][1]).trim();
    const existingName = String(data[i][8] || "").trim(); // 產品名稱 在第 9 欄 (index 8)
    
    // 如果名稱為空，或是名稱看起來像 ID (包含連字號)，則補齊/修正
    const isIdLike = existingName.includes('-') && existingName.length > 20;
    
    if (pId && (!existingName || isIdLike)) {
      const name = productMap[pId] || "Unknown";
      updates.push([name]);
      updatedCount++;
    } else {
      updates.push([existingName]);
    }
  }

  if (updatedCount > 0) {
    detailsSheet.getRange(2, 9, updates.length, 1).setValues(updates);
    SpreadsheetApp.flush();
    return `補齊完成：共更新 ${updatedCount} 筆資料`;
  }

  return "無須更新";
}

/**
 * 補齊舊銷售明細的銷售對象 (一次性執行)
 */
function backfillSalesDetailsCustomerNames() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const salesSheet = ss.getSheetByName('Sales');
  const detailsSheet = ss.getSheetByName('SalesDetails');
  if (!salesSheet || !detailsSheet) return "找不到 Sales 或 SalesDetails 分頁";

  // 1. 建立 SaleID -> Customer 對照表
  const salesData = salesSheet.getDataRange().getDisplayValues();
  const saleToCustomerMap = {};
  
  const salesHeaders = salesData[0];
  
  // 尋找 ID 欄位 (index 0)
  let idIdx = salesHeaders.indexOf('ID');
  if (idIdx === -1) idIdx = salesHeaders.indexOf('編號');
  if (idIdx === -1) idIdx = 0; // 最終備案：A 欄

  // 尋找 Customer 欄位 (index 6, G 欄)
  let customerIdx = salesHeaders.indexOf('Customer');
  if (customerIdx === -1) customerIdx = salesHeaders.indexOf('銷售對象');
  if (customerIdx === -1) customerIdx = salesHeaders.indexOf('對象');
  if (customerIdx === -1) customerIdx = salesHeaders.indexOf('地點');
  if (customerIdx === -1) customerIdx = 6; // 最終備案：G 欄
  
  console.log(`Debug: ID Index = ${idIdx}, Customer Index = ${customerIdx}`);

  for (let i = 1; i < salesData.length; i++) {
    const sId = String(salesData[i][idIdx] || "").trim();
    const cust = String(salesData[i][customerIdx] || "").trim();
    if (sId) saleToCustomerMap[sId] = cust;
  }

  // 2. 處理 SalesDetails
  const detailsData = detailsSheet.getDataRange().getValues();
  if (detailsData.length <= 1) return "明細表無資料";

  // 檢查標題，確保第 10 欄 (J) 有標題
  if (detailsData[0].length < 10) {
    detailsSheet.getRange(1, 10).setValue("Target");
  }

  const updates = [];
  let updatedCount = 0;
  let missingInMap = 0;

  for (let i = 1; i < detailsData.length; i++) {
    const sId = String(detailsData[i][0] || "").trim(); // SaleID 在 A 欄 (index 0)
    const existingTarget = detailsData[i][9] || ""; // Target 在 J 欄 (index 9)
    
    if (sId && !existingTarget) {
      const target = saleToCustomerMap[sId];
      if (target !== undefined) {
        updates.push([target]);
        updatedCount++;
      } else {
        updates.push([""]);
        missingInMap++;
      }
    } else {
      updates.push([existingTarget]);
    }
  }

  if (updatedCount > 0) {
    detailsSheet.getRange(2, 10, updates.length, 1).setValues(updates);
    SpreadsheetApp.flush();
    return `補齊完成：更新 ${updatedCount} 筆。 (診斷: Sales標題為[${salesHeaders[idIdx]}]與[${salesHeaders[customerIdx]}], 未匹配到ID共 ${missingInMap} 筆)`;
  }

  return `無須更新或未匹配到任何資料。 (診斷: Sales標題為[${salesHeaders[idIdx]}]與[${salesHeaders[customerIdx]}], 找到ID對照共 ${Object.keys(saleToCustomerMap).length} 筆, 明細中未找到對應ID共 ${missingInMap} 筆)`;
}

/**
 * 補齊舊銷售明細的單位成本 (一次性執行)
 */
function backfillSalesDetailsUnitCosts() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const detailsSheet = ss.getSheetByName('SalesDetails');
  const productInfoMap = typeof getProductInfoMap_ !== 'undefined' ? getProductInfoMap_() : {};
  if (!detailsSheet) return "找不到 SalesDetails 分頁";

  const data = detailsSheet.getDataRange().getValues();
  if (data.length <= 1) return "無資料可補齊";

  const headers = data[0];
  // 檢查標題，確保第 11 欄 (K) 有 UnitCost 標題
  if (headers.length < 11) {
    detailsSheet.getRange(1, 11).setValue("UnitCost");
  }

  const updates = [];
  let updatedCount = 0;
  
  for (let i = 1; i < data.length; i++) {
    const pId = String(data[i][1] || "").trim(); // ProductID 在第 2 欄 (index 1)
    const existingCost = data[i][10]; // UnitCost 在第 11 欄 (index 10)
    
    if (pId && (existingCost === "" || existingCost === undefined)) {
      const cost = (productInfoMap[pId] && productInfoMap[pId].cost) ? productInfoMap[pId].cost : 0;
      updates.push([cost]);
      updatedCount++;
    } else {
      updates.push([existingCost || 0]);
    }
  }

  if (updatedCount > 0) {
    detailsSheet.getRange(2, 11, updates.length, 1).setValues(updates);
    SpreadsheetApp.flush();
    return `補齊完成：共更新 ${updatedCount} 筆資料`;
  }

  return "無須更新";
}
