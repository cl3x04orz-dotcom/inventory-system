/**
 * Service_SalesAdjustment.gs
 * [Service] 銷售明細增量異動 (專業版：不刪減原始紀錄)
 */

function initSalesAdjustmentsSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('SalesAdjustments');
  const newHeader = [
      'AdjustmentID', 'SaleID', 'ProductID', 'ProductName', 
      'DPicked', 'DOriginal', 'DReturns', 'DPriceAmt', 'NewPrice', 
      'Reason', 'Operator', 'Timestamp'
  ];
  
  if (!sheet) {
    sheet = ss.insertSheet('SalesAdjustments');
    sheet.appendRow(newHeader);
    sheet.setFrozenRows(1);
  } else {
    // 檢查標題列，如果是舊版的則自動更新
    const firstRow = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    if (firstRow.length < newHeader.length || firstRow[4] === 'Type') {
      sheet.clear();
      sheet.appendRow(newHeader);
      sheet.setFrozenRows(1);
    }
  }
  return sheet;
}

function getSalesAdjustmentsBySaleId(saleId) {
  // 此函式目前僅供稽核，暫不改動以保持相容性，或未來擴充。
  return [];
}

/**
 * 執行寬表增量更正 (一筆異動存一列)
 */
function applySalesAdjustmentService(payload, user) {
  const { saleId, productId, productName, deltas, reason } = payload;
  const { dPicked, dOriginal, dReturns, dPriceAmt, newPrice } = deltas;
  
  const adjSheet = initSalesAdjustmentsSheet_();
  const invSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Inventory');

  // 1. 寫入異動紀錄表 (一列搞定)
  adjSheet.appendRow([
    Utilities.getUuid(),
    saleId,
    productId,
    productName || '',
    dPicked || 0,
    dOriginal || 0,
    dReturns || 0,
    dPriceAmt || 0,
    newPrice || 0,
    reason || '',
    user.username || 'Unknown',
    new Date()
  ]);

  // 2. 庫存聯動處理
  const invData = invSheet.getDataRange().getValues();

  // (A) 領貨變動 (Picked)
  if (dPicked !== 0) {
    if (dPicked > 0) {
      deductInventory_(invSheet, invData, productId, dPicked, 'STOCK');
    } else {
      returnStock_(invSheet, productId, Math.abs(dPicked));
    }
  }

  // (B) 原貨變動 (Original)
  if (dOriginal !== 0) {
    if (dOriginal > 0) {
      deductInventory_(invSheet, invData, productId, dOriginal, 'ORIGINAL');
    } else {
      returnStock_(invSheet, productId, Math.abs(dOriginal));
    }
  }

  // (C) 退貨變動 (Returns)
  if (dReturns !== 0) {
    if (dReturns > 0) {
      returnStock_(invSheet, productId, dReturns);
    } else {
      deductInventory_(invSheet, invData, productId, Math.abs(dReturns), 'ORIGINAL');
    }
  }

  // 3. 操作日誌
  if (typeof logActivityService !== 'undefined') {
    logActivityService({
      logs: [{
        username: user.username || 'Unknown',
        actionType: 'SALES_ADJUSTMENT_BATCH',
        page: 'ReportPage',
        details: `批次修正: SaleID=${saleId}, PID=${productId}, Reasons=${reason}`
      }]
    });
  }

  return { success: true };
}

/**
 * 內部輔助：強行補回庫存 (ORIGINAL 模式)
 */
function returnStock_(sheet, productId, qty) {
  sheet.appendRow([
    Utilities.getUuid(), productId, qty, new Date('2099-12-31'), new Date(), 'ORIGINAL'
  ]);
}
