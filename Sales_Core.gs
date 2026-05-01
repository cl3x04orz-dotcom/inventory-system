/**
 * Sales_Core.gs
 * 銷售核心流程：存檔、複製、作廢
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
    
    // 3.1 準備 Sales Row (Col 0-12)
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
        finalOperator,                         // Col 11 (L 欄): 實際操作者
        '',                                    // Col 12 (M 欄): 保留
        '',                                    // Col 13 (N 欄): 保留
        data.workHours || '',                  // Col 14 (O 欄): 工讀生工時
        data.weather || 'SUNNY'                // Col 15 (P 欄): 天氣狀況
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
    salesSheet.appendRow(newSalesRow);
    expSheet.appendRow(newExpRow);
    
    if (newDetailRows.length > 0) batchAppendNoLock_(detailsSheet, newDetailRows);
    if (newInvLogRows.length > 0) batchAppendNoLock_(invSheet, newInvLogRows);

    if (isInventoryModified) {
        const qtyColumn = invData.slice(1).map(r => [r[2]]); 
        if (qtyColumn.length > 0) {
            invSheet.getRange(2, 3, qtyColumn.length, 1).setValues(qtyColumn);
        }
    }

    // [New] 自動將新客戶加入 Customers 資料庫並更新排程
    if (customer && customer !== '未指定') {
        ensureCustomerInList_(customer, today);
    }

    SpreadsheetApp.flush(); // 強制寫入
    return { success: true };

  } finally {
    lock.releaseLock(); // 5. 釋放號碼牌
  }
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
      
      break;
    }
  }

  return {
    success: true,
    cloneData: {
      customer: originalSaleData[6],
      salesRep: originalSaleData[2], 
      paymentMethod: originalSaleData[8],
      salesData: fetchedDetails,
      reserve: Number(originalSaleData[4] || 0),
      expenses: fetchedExpenses,
      cashCounts: (originalSaleData[10] && String(originalSaleData[10]).startsWith('{')) ? JSON.parse(originalSaleData[10]) : {},
      originalDate: originalSaleData[1], 
      originalSaleId: saleId,            
      workHours: originalSaleData[14] || '' 
    }
  };
}

/**
 * 銷售作廢與修正核心邏輯
 */
function voidAndFetchSaleService(payload) {
  const { saleId } = payload;
  if (!saleId) throw new Error("缺少銷售編號");

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const salesSheet = ss.getSheetByName('Sales');
    const detailsSheet = ss.getSheetByName('SalesDetails');
    const expSheet = ss.getSheetByName('Expenditures');
    const invSheet = ss.getSheetByName('Inventory');

    const salesData = salesSheet.getDataRange().getValues();
    let saleRowIndex = -1;
    let originalSaleData = null;
    for (let i = 1; i < salesData.length; i++) {
        if (String(salesData[i][0]) === saleId) {
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

  const detailsData = detailsSheet.getDataRange().getValues();
  const invData = invSheet.getDataRange().getValues(); 
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

      if (picked > 0) {
        let expiry = new Date();
        expiry.setDate(expiry.getDate() + 30);
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
        const deductResult = deductInventory_(invData, productId, returns, 'ORIGINAL');
        const totalDeducted = deductResult.consumed.reduce((sum, item) => sum + item.deductedQty, 0);
        if (totalDeducted > 0) isInventoryModified = true;

        const remainingToDeduct = returns - totalDeducted;
        if (remainingToDeduct > 0) {
           voidRefundInvRows.push([Utilities.getUuid(), productId, -remainingToDeduct, today, today, 'ORIGINAL', 'VOID_CANCEL_RETURN: ' + saleId, pName]);
        }
      }
    }
  }

  if (voidRefundInvRows.length > 0) {
    batchAppendNoLock_(invSheet, voidRefundInvRows);
  }

  if (isInventoryModified) {
    const qtyColumn = invData.slice(1).map(r => [r[2]]); 
    if (qtyColumn.length > 0) {
        invSheet.getRange(2, 3, qtyColumn.length, 1).setValues(qtyColumn);
    }
  }

  SpreadsheetApp.flush(); 
  return {
    success: true,
    cloneData: {
      customer: originalSaleData[6],
      paymentMethod: originalSaleData[8],
      salesData: fetchedDetails,
      reserve: Number(originalSaleData[4] || 0),
      expenses: fetchedExpenses,
      cashCounts: (originalSaleData[10] && String(originalSaleData[10]).startsWith('{')) ? JSON.parse(originalSaleData[10]) : {},
      originalDate: originalSaleData[1], 
      originalSaleId: saleId,            
      workHours: originalSaleData[14] || '' 
    }
  };

  } finally {
    lock.releaseLock(); 
  }
}

/**
 * [Helper] 確保客戶存在於 Customers 資料庫中，並更新其營業排程
 */
function ensureCustomerInList_(customer, saleDate) {
    if (!customer) return;
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let custSheet = ss.getSheetByName('Customers');
    if (!custSheet) return; 

    const customerName = String(customer).trim();
    const data = custSheet.getDataRange().getValues();

    let exists = false;
    for (let i = 1; i < data.length; i++) {
        if (String(data[i][0]).trim() === customerName) {
            exists = true;
            break;
        }
    }

    if (!exists) {
        // 新增客戶：僅填入名稱與類別，AI 開啟與星期排程維持空白供手動填入
        const newRow = [customerName, '', '', '', '', '', '', '', '', '市場'];
        custSheet.appendRow(newRow);
    }
    // 已存在客戶則不作任何動作，維持原本手動設定的排程
}
