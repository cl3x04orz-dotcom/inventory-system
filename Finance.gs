/**
 * Finance.gs
 * [Service] 財務管理 (應付帳款)
 */

function getPayablesService(payload) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Purchases');
  const productsSheet = ss.getSheetByName('Products');
  const usersSheet = ss.getSheetByName('Users');
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  
  const productMap = {};
  if (productsSheet) {
    const productData = productsSheet.getDataRange().getValues();
    for (let i = 1; i < productData.length; i++) productMap[productData[i][0]] = productData[i][1];
  }
  
  const userMap = {};
  if (usersSheet) {
    const userData = usersSheet.getDataRange().getValues();
    for (let i = 1; i < userData.length; i++) if (userData[i][0]) userMap[userData[i][0]] = userData[i][1];
  }
  
  const headers = data[0];
  const uuidIdx = headers.indexOf('UUID');
  const dateIdx = headers.indexOf('Date'), vendorIdx = headers.indexOf('Vendor'), productIdIdx = headers.indexOf('ProductID'), qtyIdx = headers.indexOf('Quantity'), priceIdx = headers.indexOf('UnitPrice'), methodIdx = headers.indexOf('PaymentMethod'), statusIdx = headers.indexOf('Status');
  let operatorIdx = headers.indexOf('Operator'); if (operatorIdx === -1) operatorIdx = headers.indexOf('Buyer');
  
  if (methodIdx === -1 || statusIdx === -1) return [];

  const startDate = (payload && payload.startDate) ? new Date(payload.startDate) : null;
  const endDate = (payload && payload.endDate) ? new Date(payload.endDate) : null;
  if (endDate) endDate.setHours(23, 59, 59);

  const purchaseGroups = {};
  for (let i = 1; i < data.length; i++) {
    const row = data[i], rowDate = new Date(row[dateIdx]);
    if (row[methodIdx] === 'CREDIT' && row[statusIdx] === 'UNPAID') {
      if (startDate && rowDate < startDate) continue;
      if (endDate && rowDate > endDate) continue;
      const vendor = row[vendorIdx], dateStr = Utilities.formatDate(rowDate, "GMT+8", "yyyy-MM-dd"), rawOperator = row[operatorIdx] || '', operatorName = userMap[rawOperator] || rawOperator || '未知';
      const groupKey = `${vendor}_${dateStr}_${rawOperator}`;
      if (!purchaseGroups[groupKey]) {
        purchaseGroups[groupKey] = { uuids: [], date: dateStr, serverTimestamp: rowDate, vendor: vendor, operator: operatorName, amount: 0, items: [] };
      }
      // 收集該組所有 UUID，以便批次更新整組
      if (uuidIdx !== -1 && row[uuidIdx]) {
        purchaseGroups[groupKey].uuids.push(String(row[uuidIdx]));
      }
      const productId = row[productIdIdx], productName = productMap[productId] || productId, qty = Number(row[qtyIdx]), price = Number(row[priceIdx]), subtotal = qty * price;
      purchaseGroups[groupKey].amount += subtotal;
      purchaseGroups[groupKey].items.push({ productName: productName, qty: qty, price: price, subtotal: subtotal });
    }
  }
  return Object.values(purchaseGroups).reverse();
}

function markPayableAsPaidService(payload) {
  const { targetUuids } = payload;
  if (!targetUuids || targetUuids.length === 0) throw new Error('未提供 UUID');

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Purchases');
    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();

    if (lastRow <= 1) return { success: true, updated: 0 };

    // 一次讀取整表（最小化 I/O 次數）
    const data = sheet.getRange(1, 1, lastRow, lastCol).getValues();
    const headers = data[0];
    const uuidColIdx = headers.indexOf('UUID');
    const statusColIdx = headers.indexOf('Status');

    if (uuidColIdx === -1 || statusColIdx === -1) throw new Error('找不到必要欄位 UUID 或 Status');

    const targetSet = new Set(targetUuids.map(String));
    let updatedCount = 0;

    for (let i = 1; i < data.length; i++) {
      if (targetSet.has(String(data[i][uuidColIdx]))) {
        data[i][statusColIdx] = 'PAID';
        updatedCount++;
      }
    }

    if (updatedCount > 0) {
      // 批次寫回整表（原子操作）
      sheet.getRange(1, 1, lastRow, lastCol).setValues(data);
      SpreadsheetApp.flush();
    }

    return { success: true, updated: updatedCount };

  } catch (e) {
    throw new Error('批次更新失敗: ' + e.message);
  } finally {
    lock.releaseLock();
  }
}
