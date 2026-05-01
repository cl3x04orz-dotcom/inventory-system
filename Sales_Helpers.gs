/**
 * Sales_Helpers.gs
 * 銷售模組輔助工具、效期庫存邏輯、一次性資料遷移腳本
 */

/**
 * 建立產品 ID -> 名稱 對照表
 */
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
      // 讀取 I 欄位 (Index 8) 作為基礎單位，預設 1
      let packSize = 1;
      if (row.length > 8) {
        const val = Number(row[8]);
        if (!isNaN(val) && val > 0) packSize = val;
      }

      // 讀取 J 欄位 (Index 9) 作為發貨階梯，格式例如 "28,42,70"
      let dispatchSteps = [];
      if (row.length > 9 && String(row[9] || "").trim()) {
        dispatchSteps = String(row[9])
          .split(/[,,，]/)
          .map(s => Number(s.trim()))
          .filter(n => !isNaN(n) && n > 0)
          .sort((a, b) => a - b);
      }

      // 讀取 K 欄位 (Index 10) 作為進位門檻，預設 0 (無門檻)
      let roundThreshold = 0;
      if (row.length > 10) {
        const val = Number(row[10]);
        if (!isNaN(val) && val > 0) roundThreshold = val;
      }

      // 讀取 L 欄位 (Index 11) 作為智慧抑制開關，不為空即視為開啟
      let autoSuppress = false;
      if (row.length > 11 && String(row[11] || "").trim()) {
        autoSuppress = true;
      }

      // 讀取 M 欄位 (Index 12) 作為最大建議量上限
      let maxSuggestion = 0;
      if (row.length > 12) {
        const val = Number(row[12]);
        if (!isNaN(val) && val > 0) maxSuggestion = val;
      }

      map[String(id).trim()] = {
        name: idxName !== -1 ? String(row[idxName] || "").trim() : String(id).trim(),
        packSize: packSize,
        dispatchSteps: dispatchSteps,
        roundThreshold: roundThreshold,
        autoSuppress: autoSuppress,
        maxSuggestion: maxSuggestion
      };
    }
  }
  return map;
}

/**
 * 獲取產品資訊（名稱、成本、庫存）的對照表
 */
function getProductInfoMap_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const prodSheet = ss.getSheetByName('Products');
  const invSheet = ss.getSheetByName('Inventory');
  const map = {};

  if (prodSheet) {
    const pValues = prodSheet.getDataRange().getValues();
    const headers = pValues[0].map(h => String(h || '').trim().toLowerCase());
    const pidIdx = headers.findIndex(h => h.includes('id') || h.includes('序號'));
    const nameIdx = headers.findIndex(h => h.includes('名稱') || h.includes('name'));
    const costIdx = headers.findIndex(h => h.includes('成本') || h === 'cost' || h === 'unitcost');

    for (let i = 1; i < pValues.length; i++) {
      const pid = String(pValues[i][pidIdx !== -1 ? pidIdx : 0] || "").trim();
      if (pid) {
        map[pid] = { 
          name: nameIdx !== -1 ? String(pValues[i][nameIdx] || "").trim() : pid,
          cost: costIdx !== -1 ? (Number(pValues[i][costIdx]) || 0) : 0,
          stock: 0 
        };
      }
    }
  }

  if (invSheet) {
    const iValues = invSheet.getDataRange().getValues();
    const iHeaders = iValues[0].map(h => String(h || '').trim().toLowerCase());
    const iPidIdx = iHeaders.findIndex(h => h.includes('productid') || h.includes('產品id'));
    const iQtyIdx = iHeaders.findIndex(h => h.includes('quantity') || h.includes('數量'));
    const iNameIdx = iHeaders.findIndex(h => h.includes('productname') || h.includes('名稱'));

    for (let i = 1; i < iValues.length; i++) {
        const pid = iPidIdx !== -1 ? String(iValues[i][iPidIdx] || "").trim() : "";
        if (pid && pid !== "ProductID") {
            if (!map[pid]) {
                const rowName = iNameIdx !== -1 ? String(iValues[i][iNameIdx] || "").trim() : pid;
                map[pid] = { name: rowName, cost: 0, stock: 0 };
            }
            if (iQtyIdx !== -1) {
                map[pid].stock += (Number(iValues[i][iQtyIdx]) || 0);
            }
        }
    }
  }
  return map;
}

/**
 * 扣除庫存邏輯 [Memory-only]
 * 直接修改傳入的陣列，不執行 Spreadsheet 寫入
 */
function deductInventory_(sheetData, productId, qtyToDeduct, targetType) {
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
      batches.push({ rowRef: row, qty: qty, expiry: expiry }); 
    }
  }
  batches.sort((a, b) => new Date(a.expiry) - new Date(b.expiry));
  
  for (let batch of batches) {
    if (remaining <= 0) break;
    const deduct = Math.min(batch.qty, remaining);
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
 * 補齊舊銷售明細的產品名稱 (一次性執行)
 */
function backfillSalesDetailsProductNames() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const detailsSheet = ss.getSheetByName('SalesDetails');
  const productMap = getProductMap_();
  if (!detailsSheet) return "找不到 SalesDetails 分頁";

  const data = detailsSheet.getDataRange().getValues();
  if (data.length <= 1) return "無資料可補齊";

  if (data[0].length < 9) {
    detailsSheet.getRange(1, 9).setValue("ProductName");
  }

  const updates = [];
  let updatedCount = 0;
  
  for (let i = 1; i < data.length; i++) {
    const pId = String(data[i][1]).trim();
    const existingName = String(data[i][8] || "").trim(); 
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

  const salesData = salesSheet.getDataRange().getDisplayValues();
  const saleToCustomerMap = {};
  const salesHeaders = salesData[0];
  
  let idIdx = salesHeaders.indexOf('ID');
  if (idIdx === -1) idIdx = 0; 
  let customerIdx = salesHeaders.indexOf('Customer');
  if (customerIdx === -1) customerIdx = 6; 

  for (let i = 1; i < salesData.length; i++) {
    const sId = String(salesData[i][idIdx] || "").trim();
    const cust = String(salesData[i][customerIdx] || "").trim();
    if (sId) saleToCustomerMap[sId] = cust;
  }

  const detailsData = detailsSheet.getDataRange().getValues();
  if (detailsData.length <= 1) return "明細表無資料";

  if (detailsData[0].length < 10) {
    detailsSheet.getRange(1, 10).setValue("Target");
  }

  const updates = [];
  let updatedCount = 0;

  for (let i = 1; i < detailsData.length; i++) {
    const sId = String(detailsData[i][0] || "").trim(); 
    const existingTarget = detailsData[i][9] || ""; 
    
    if (sId && !existingTarget) {
      const target = saleToCustomerMap[sId];
      if (target !== undefined) {
        updates.push([target]);
        updatedCount++;
      } else {
        updates.push([""]);
      }
    } else {
      updates.push([existingTarget]);
    }
  }

  if (updatedCount > 0) {
    detailsSheet.getRange(2, 10, updates.length, 1).setValues(updates);
    SpreadsheetApp.flush();
    return `補齊完成：更新 ${updatedCount} 筆。`;
  }
  return `無須更新或未匹配到任何資料。`;
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
  if (headers.length < 11) {
    detailsSheet.getRange(1, 11).setValue("UnitCost");
  }

  const updates = [];
  let updatedCount = 0;
  
  for (let i = 1; i < data.length; i++) {
    const pId = String(data[i][1] || "").trim(); 
    const existingCost = data[i][10]; 
    
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

/**
 * 取得客戶類別地圖 (名稱 -> 類別)
 * 用於區分 市場 (有分紅) 或 批發 (無分紅)
 */
function getCustomerCategoryMap_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Customers');
  if (!sheet) return {};
  
  const values = sheet.getDataRange().getValues();
  const map = {};
  
  // 第一列標題不計。第 1 欄 (A) 是名稱，第 10 欄 (J) 是類別
  for (let i = 1; i < values.length; i++) {
    const name = String(values[i][0] || "").trim();
    // 預設為市場，若欄位存在則取欄位值
    let category = "市場";
    if (values[i].length >= 10) {
      category = String(values[i][9] || "市場").trim();
    }
    if (name) map[name] = category;
  }
  return map;
}

