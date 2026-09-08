/**
 * Purchases.gs
 * [Service] 進貨管理與建議
 */

// ===========================================
// 1. 進貨存檔 (Transaction Safe)
// ===========================================
function addPurchaseService(data, user) {
  const { submissionId, items: rawItems, vendor, paymentMethod, serverTimestamp, newProductSettings } = data;
  
  // [防重複存檔]
  if (submissionId) {
    const cache = CacheService.getScriptCache();
    if (cache.get(submissionId)) return { success: true, duplicate: true, message: "已偵測到重複請求" };
    cache.put(submissionId, "PROCESSED", 600);
  }

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000); // Wait up to 30 sec

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const pSheet = ss.getSheetByName('Products');
    const iSheet = ss.getSheetByName('Inventory');
    const purSheet = ss.getSheetByName('Purchases');
    
    if (!pSheet || !iSheet || !purSheet) throw new Error("資料表缺失");

    let items = Array.isArray(rawItems) ? rawItems : [data];
    const entryDate = serverTimestamp ? new Date(serverTimestamp) : new Date();
    const operator = data.operator || (user ? (user.username || user.userId || user.name) : 'Unknown');
    
    // Pre-fetch product map to minimize reads
    const productMap = {}; 
    const pData = pSheet.getDataRange().getValues();
    // Start from row 1 (header is 0)
    for (let i = 1; i < pData.length; i++) {
        productMap[pData[i][1]] = pData[i][0]; // Name -> UUID
    }

    const newProducts = [];
    const purchaseRows = [];
    const inventoryRows = [];

    items.forEach(item => {
        const rowVendor = item.vendor || vendor;
        let productId = item.productId || productMap[item.productName];
        
        // Auto-create product if missing (and track it to avoid duplicates in same batch)
        if (!productId && item.productName) {
            productId = Utilities.getUuid();
            productMap[item.productName] = productId;
            
            // [新增] 從前端傳入的新產品設定 (I-M 欄位)
            const settings = (newProductSettings && newProductSettings[item.productName]) ? newProductSettings[item.productName] : {};
            
            const packSize = settings.packSize || "";
            const dispatchSteps = String(settings.dispatchSteps || "").trim();
            const roundThreshold = settings.roundThreshold || "";
            const autoSuppress = settings.autoSuppress ? "Y" : "";
            const maxSuggestion = settings.maxSuggestion || "";

            // 建立完整的產品行 (A-M 欄位，共 13 欄)
            // A:ID, B:Name, C:Type, D:Price, E:Unit, F:SafeLevel, G:Weight, H:Reserved, I:PackSize, J:Steps, K:Threshold, L:Suppress, M:Max
            const newRow = new Array(13).fill("");
            newRow[0] = productId;
            newRow[1] = item.productName;
            newRow[2] = 'General';
            newRow[3] = item.price;
            newRow[4] = ""; // Unit
            newRow[5] = 0;  // SafeLevel
            newRow[8] = packSize;
            newRow[9] = dispatchSteps;
            newRow[10] = roundThreshold;
            newRow[11] = autoSuppress;
            newRow[12] = maxSuggestion;
            
            newProducts.push(newRow);
        }
        
        if (productId) {
            const currPaymentMethod = item.paymentMethod || paymentMethod || 'CASH';
            const status = item.status || ((currPaymentMethod === 'CREDIT') ? 'UNPAID' : 'PAID');
            const uuid = Utilities.getUuid();
            
            // Collect Purchase Row
            // Col 0: UUID, 1: Date, 2: Vendor, 3: ProductID, 4: Qty, 5: Price, 6: Expiry, 7: Operator, 8: Method, 9: Status, 10: SubmissionID(Note), 11: ProductName
            purchaseRows.push([
              uuid, entryDate, rowVendor, productId, item.quantity, 
              item.price, item.expiry, operator, currPaymentMethod, status, submissionId || operator, item.productName || ''
            ]);
            
            // Collect Inventory Row
            // Col 0: UUID, 1: ProductID, 2: Qty, 3: Expiry, 4: Date, 5: Type, 6: Price/Note
            if (status !== 'ORDERED') {
                inventoryRows.push([
                  Utilities.getUuid(), productId, item.quantity, item.expiry, entryDate, 'STOCK', item.price, item.productName
                ]);
            }
        }
    });

    // --- Batch Write Section (Atomic-like) ---
    
    // 1. Add new products first
    if (newProducts.length > 0) {
        pSheet.getRange(pSheet.getLastRow() + 1, 1, newProducts.length, newProducts[0].length).setValues(newProducts);
    }
    
    // 2. Add purchases
    if (purchaseRows.length > 0) {
        // Use helper if available, or direct write
        if (typeof batchAppendNoLock_ !== 'undefined') {
            batchAppendNoLock_(purSheet, purchaseRows);
        } else {
            purSheet.getRange(purSheet.getLastRow() + 1, 1, purchaseRows.length, purchaseRows[0].length).setValues(purchaseRows);
        }
    }
    
    // 3. Add inventory
    if (inventoryRows.length > 0) {
        if (typeof batchAppendNoLock_ !== 'undefined') {
            batchAppendNoLock_(iSheet, inventoryRows);
        } else {
            iSheet.getRange(iSheet.getLastRow() + 1, 1, inventoryRows.length, inventoryRows[0].length).setValues(inventoryRows);
        }
    }

    // 4. Update latest cost in Products sheet for existing products
    const pValues = pSheet.getDataRange().getValues();
    const headers = pValues[0];
    const pidIdx = 0; // Col A
    const costIdx = headers.findIndex(h => h.includes('成本') || h.toLowerCase() === 'cost');
    
    if (costIdx !== -1) {
        items.forEach(item => {
            const pid = productMap[item.productName];
            if (pid) {
                // Find the row for this PID
                for (let i = 1; i < pValues.length; i++) {
                    if (String(pValues[i][pidIdx]) === String(pid)) {
                        pSheet.getRange(i + 1, costIdx + 1).setValue(item.price);
                        break;
                    }
                }
            }
        });
    }

    SpreadsheetApp.flush(); 
    if (typeof invalidateStockCache_ !== 'undefined') invalidateStockCache_();
    return { success: true, count: items.length };

  } catch (e) {
    throw new Error("進貨存檔失敗: " + e.message);
  } finally {
    lock.releaseLock();
  }
}

function getPurchaseHistory(filter) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const purSheet = ss.getSheetByName('Purchases');
  const uSheet = ss.getSheetByName('Users');
  if (!purSheet) return [];

  const lastRow = Math.max(1, purSheet.getLastRow());
  const lastCol = Math.max(1, purSheet.getLastColumn());
  
  let purData = [];
  if (lastRow > 1) {
    // 讀取日期欄與狀態欄（減少資料量）
    const metaValues = purSheet.getRange(2, 1, lastRow - 1, 10).getValues();
    const start = new Date(filter.startDate); start.setHours(0, 0, 0, 0);
    const end = new Date(filter.endDate); end.setHours(23, 59, 59, 999);
    const startMs = start.getTime();
    const endMs = end.getTime();
    
    let minIdx = -1;
    let maxIdx = -1;
    for (let i = 0; i < metaValues.length; i++) {
      const v = metaValues[i][1]; // Date
      const status = String(metaValues[i][9] || '').toUpperCase();
      const isOrdered = (status === 'ORDERED');
      
      let t = null;
      if (v && typeof v.getTime === 'function') t = v.getTime();
      else if (v) { const d = new Date(v); if (!isNaN(d.getTime())) t = d.getTime(); }
      
      const dateMatch = isOrdered || (t !== null && t >= startMs && t <= endMs);
      if (dateMatch) {
        if (minIdx === -1) minIdx = i;
        maxIdx = i;
      }
    }
    
    if (minIdx !== -1 && maxIdx !== -1) {
      const startRow = minIdx + 2;
      const numRows = maxIdx - minIdx + 1;
      purData = purSheet.getRange(startRow, 1, numRows, lastCol).getValues();
    }
  }

  const productMap = typeof getProductMap !== 'undefined' ? getProductMap() : {};
  const userMap = {};
  if (uSheet) uSheet.getDataRange().getValues().slice(1).forEach(r => { if (r[0]) userMap[r[0]] = r[1]; });

  return purData.filter(row => {
    const status = String(row[9] || '').toUpperCase();
    const isOrdered = (status === 'ORDERED');
    
    const rowDate = new Date(row[1]);
    const start = new Date(filter.startDate), end = new Date(filter.endDate);
    end.setHours(23, 59, 59);
    
    const vName = String(row[2] || '').toLowerCase();
    const pName = String(row[11] || productMap[row[3]] || 'Unknown').toLowerCase();
    const keyword = filter.keyword ? filter.keyword.toLowerCase() : '';
    
    // 如果是 ORDERED (待驗收)，直接無視日期區間篩選，但仍會受到關鍵字搜尋篩選
    const dateMatch = isOrdered || (rowDate >= start && rowDate <= end);
    
    return dateMatch && (!keyword || vName.includes(keyword) || pName.includes(keyword));
  }).map(row => {
      // 抓取執行人邏輯：
      // 1. 優先抓第 11 欄 (index 10)，看是否有 "VOID_BY: " 標記
      // 2. 如果沒有標記，檢查是否為技術 ID (如果不是則為修改人)
      // 3. 都沒有則抓第 8 欄 (index 7) 採購人
      const modBy = String(row[10] || '');
      const status = String(row[9] || '').toUpperCase();
      let finalOperatorName = '-';
      
      const buyerName = userMap[row[7]] || row[7] || '-';

      if (modBy.startsWith('VOID_BY: ')) {
        const voidName = modBy.replace('VOID_BY: ', '');
        finalOperatorName = `${buyerName} (作廢: ${userMap[voidName] || voidName})`;
      } else if (status === 'VOID' && modBy && !modBy.startsWith('purchase_') && !modBy.includes('-')) {
        // 舊單處理：如果是 VOID 且 modBy 是名字而非技術 ID
        finalOperatorName = `${buyerName} (作廢: ${userMap[modBy] || modBy})`;
      } else {
        const isTechnicalId = modBy.startsWith('purchase_') || modBy.includes('-');
        const finalOperatorKey = (!modBy || isTechnicalId) ? row[7] : modBy;
        finalOperatorName = userMap[finalOperatorKey] || finalOperatorKey || '-';
      }
      
      return {
        id: row[0],
        date: row[1],
        vendorName: row[2],
        productName: row[11] || productMap[row[3]] || 'Unknown',
        productId: row[3],
        quantity: Number(row[4]) || 0,
        unitPrice: Number(row[5]) || 0,
        totalPrice: (Number(row[4]) || 0) * (Number(row[5]) || 0),
        expiry: row[6],
        operator: finalOperatorName,
        paymentMethod: row[8] || 'CASH',
        status: status
      };
  }).reverse();
}

/**
 * 作廢進貨並獲取資料 (用於修正)
 */
function voidAndFetchPurchaseService(payload, user) {
  const { id } = payload;
  if (!id) throw new Error("缺少單據 ID");

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const purSheet = ss.getSheetByName('Purchases');
  const iSheet = ss.getSheetByName('Inventory');
  
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);

    const purData = purSheet.getDataRange().getValues();
    let rowIndex = -1;
    let originalData = null;

    for (let i = 1; i < purData.length; i++) {
        if (String(purData[i][0]) === String(id)) {
            rowIndex = i + 1;
            originalData = purData[i];
            break;
        }
    }

    if (rowIndex === -1) throw new Error("找不到進貨紀錄");
    if (String(originalData[9]).toUpperCase() === 'VOID') throw new Error("此單據已作廢");

    // 1. 標記進貨表為 VOID，並紀錄修改人
    purSheet.getRange(rowIndex, 10).setValue('VOID');
    if (user) {
      const opName = user.username || user.userId || user.displayName || '';
      purSheet.getRange(rowIndex, 11).setValue('VOID_BY: ' + opName);
    }

    // 2. 扣回庫存
    const productId = originalData[3];
    const qty = Number(originalData[4]) || 0;
    const expiry = originalData[6];
    const pName = originalData[11] || productMap[productId] || 'Unknown';
    const price = originalData[5];

    if (qty > 0) {
        const invRow = [
            Utilities.getUuid(),
            productId,
            -qty,
            expiry,
            new Date(),
            'STOCK', // Use STOCK to ensure it's counted in totals
            `VOID_REFUND: ${id}`,
            pName
        ];
        
        if (typeof batchAppendNoLock_ !== 'undefined') {
            batchAppendNoLock_(iSheet, [invRow]);
        } else {
            iSheet.appendRow(invRow);
        }
    }

    SpreadsheetApp.flush();
    if (typeof invalidateStockCache_ !== 'undefined') invalidateStockCache_();

    // 3. 回傳原始資料供克隆
    return {
        success: true,
        originalRecord: {
            vendor: originalData[2],
            productName: pName,
            productId: productId,
            quantity: qty,
            unitPrice: price,
            expiry: expiry,
            paymentMethod: originalData[8] || 'CASH'
        }
    };

  } catch (e) {
    throw new Error("作廢失敗: " + e.message);
  } finally {
    lock.releaseLock();
  }
}

function getPurchaseSuggestionsService() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const purSheet = ss.getSheetByName('Purchases');
    if (!purSheet) return { vendors: [], vendorProductMap: {}, vendorProductPriceMap: {} };
    
    const purData = purSheet.getDataRange().getValues().slice(1);
    const productMap = typeof getProductMap !== 'undefined' ? getProductMap() : {};
    
    const vendors = new Set();
    const vpMap = {};   // Vendor -> Set of Product Names
    const vppMap = {};  // Vendor -> { ProductName -> Latest Price }

    // 依照進貨紀錄順序遍歷，後面的紀錄（最新的）會覆蓋前面的價格
    purData.forEach(r => {
        const v = String(r[2] || '').trim();
        const pId = String(r[3] || '').trim();
        const pName = productMap[pId] || pId;
        const price = Number(r[5]) || 0;
        
        if (v && pName) {
            vendors.add(v);
            if (!vpMap[v]) vpMap[v] = new Set();
            vpMap[v].add(pName);
            
            if (!vppMap[v]) vppMap[v] = {};
            vppMap[v][pName] = price;
        }
    });

    // 獲取預設支付方式
    const vendorDefaults = typeof getVendorsData_ !== 'undefined' ? getVendorsData_() : {};

    const finalVpMap = {};
    for (let v in vpMap) {
        finalVpMap[v] = Array.from(vpMap[v]);
    }

    return { 
        vendors: Array.from(vendors).sort(), 
        vendorProductMap: finalVpMap,
        vendorProductPriceMap: vppMap,
        vendorDefaults: vendorDefaults 
    };
}

/**
 * 保存廠商預設方式
 */
function saveVendorDefaultService(payload) {
  const { vendor, method } = payload;
  if (!vendor) return { error: "缺乏廠商名稱" };

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('Vendors');
  if (!sheet) {
    sheet = ss.insertSheet('Vendors');
    sheet.appendRow(['廠商名稱', '預設支付方式']);
  }

  const data = sheet.getDataRange().getValues();
  let found = false;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(vendor).trim()) {
      sheet.getRange(i + 1, 2).setValue(method);
      found = true;
      break;
    }
  }

  if (!found) {
    sheet.appendRow([vendor, method]);
  }

  return { success: true };
}

/**
 * 獲取所有廠商的預設方式
 */
function getVendorsData_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('Vendors');
  if (!sheet) return {};

  const data = sheet.getDataRange().getValues();
  const map = {};
  for (let i = 1; i < data.length; i++) {
    const v = String(data[i][0]).trim();
    const m = String(data[i][1]).trim();
    if (v) map[v] = m;
  }
  return map;
}

// ===========================================
// 5. 補齊舊進貨資料的產品名稱 (一次性執行)
// ===========================================
function backfillPurchaseProductNames() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const purSheet = ss.getSheetByName('Purchases');
  const pSheet = ss.getSheetByName('Products');
  if (!purSheet || !pSheet) { Logger.log('資料表缺失'); return; }

  // 建立 ProductID -> Name 對照表
  const productMap = {};
  pSheet.getDataRange().getValues().slice(1).forEach(r => {
    if (r[0]) productMap[String(r[0])] = String(r[1] || '');
  });

  const allData = purSheet.getDataRange().getValues();
  let updated = 0;

  for (let i = 1; i < allData.length; i++) {
    const productId = String(allData[i][3] || '').trim();
    const currentName = String(allData[i][11] || '').trim();

    // 只補空白的欄位
    if (productId && !currentName && productMap[productId]) {
      purSheet.getRange(i + 1, 12).setValue(productMap[productId]);
      updated++;
    }
  }

  SpreadsheetApp.flush();
  Logger.log(`補齊完成：共更新 ${updated} 筆紀錄`);
  return { success: true, updated: updated };
}

/**
 * 一次性庫存修復：將 VOID_REFUND 類別改回 STOCK
 * 解決前端顯示分成兩個表格的問題
 */
function repairInventoryTypes() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const iSheet = ss.getSheetByName('Inventory');
  if (!iSheet) return;

  const data = iSheet.getDataRange().getValues();
  let updated = 0;
  for (let i = 1; i < data.length; i++) {
    if (data[i][5] === 'VOID_REFUND') {
      iSheet.getRange(i + 1, 6).setValue('STOCK');
      updated++;
    }
  }
  SpreadsheetApp.flush();
  Logger.log(`修復完成：共更新 ${updated} 筆庫存紀錄`);
  return { success: true, updated };
}

/**
 * 確認進貨到貨 (實收驗收)
 * 允許修改實到數量與單價，並正式入庫
 */
function confirmPurchaseReceipt(payload, user) {
  const { id, actualQty, actualPrice } = payload;
  if (!id) throw new Error("缺少單據 ID");

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const purSheet = ss.getSheetByName('Purchases');
  const iSheet = ss.getSheetByName('Inventory');
  
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    const purData = purSheet.getDataRange().getValues();
    
    for (let i = 1; i < purData.length; i++) {
      if (String(purData[i][0]) === String(id)) {
        const currentStatus = purData[i][9];
        if (currentStatus !== 'ORDERED') throw new Error("此單據非待驗收狀態，或已驗收過");
        
        const finalQty = typeof actualQty !== 'undefined' ? Number(actualQty) : Number(purData[i][4]);
        const finalPrice = typeof actualPrice !== 'undefined' ? Number(actualPrice) : Number(purData[i][5]);
        
        const originalDate = new Date(purData[i][1]);
        const formattedOldDate = Utilities.formatDate(originalDate, "Asia/Taipei", "yyyy/MM/dd HH:mm");
        const verifyDate = new Date();

        // 1. 更新 Purchases 表中的日期(改為驗收日)、數量與單價
        purSheet.getRange(i + 1, 2).setValue(verifyDate); 
        purSheet.getRange(i + 1, 5).setValue(finalQty); 
        purSheet.getRange(i + 1, 6).setValue(finalPrice); 
        
        // 更新狀態為已結帳 (依據付款方式)
        const paymentMethod = purData[i][8] || 'CASH';
        const newStatus = (paymentMethod === 'CREDIT') ? 'UNPAID' : 'PAID';
        purSheet.getRange(i + 1, 10).setValue(newStatus);
        
        // 記錄驗收人與原下單時間
        const operator = user ? (user.displayName || user.name || user.username || 'Unknown') : '系統/LINE';
        const oldNote = String(purData[i][10] || '').trim();
        purSheet.getRange(i + 1, 11).setValue(`[下單:${formattedOldDate}] [驗收:${operator}] ${oldNote}`.trim());
        
        // 2. 正式寫入庫存日誌 (使用同一個驗收時間 verifyDate)
        const productId = purData[i][3];
        const pName = purData[i][11];
        
        if (finalQty > 0) {
            iSheet.appendRow([
              Utilities.getUuid(), productId, finalQty, "", verifyDate, 'STOCK', finalPrice, pName
            ]);
        }
        
        // 3. 更新 Products 表最新成本
        const pSheet = ss.getSheetByName('Products');
        if (pSheet && finalQty > 0) {
            const pValues = pSheet.getDataRange().getValues();
            const headers = pValues[0];
            const costIdx = headers.findIndex(h => h.includes('成本') || h.toLowerCase() === 'cost');
            if (costIdx !== -1) {
                for (let j = 1; j < pValues.length; j++) {
                    if (String(pValues[j][0]) === String(productId)) {
                        pSheet.getRange(j + 1, costIdx + 1).setValue(finalPrice);
                        break;
                    }
                }
            }
        }
        
        SpreadsheetApp.flush();
        if (typeof invalidateStockCache_ !== 'undefined') invalidateStockCache_();
        return { success: true, actualQty: finalQty, actualPrice: finalPrice };
      }
    }
    throw new Error("找不到該筆在途叫貨紀錄");
  } catch (e) {
      throw new Error("驗收失敗: " + e.message);
  } finally {
    lock.releaseLock();
  }
}
