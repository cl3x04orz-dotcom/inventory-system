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
  // Purchases 表頭: ID, Date, Vendor, ProductID, Quantity, UnitPrice, Expiry, Buyer, PaymentMethod, Status, Operator
  const idIdx = headers.indexOf('ID');
  const dateIdx = headers.indexOf('Date');
  const vendorIdx = headers.indexOf('Vendor');
  const productIdIdx = headers.indexOf('ProductID');
  const qtyIdx = headers.indexOf('Quantity');
  const priceIdx = headers.indexOf('UnitPrice');
  const methodIdx = headers.indexOf('PaymentMethod');
  const statusIdx = headers.indexOf('Status');
  let operatorIdx = headers.indexOf('Buyer');
  if (operatorIdx === -1) operatorIdx = headers.indexOf('Operator');
  // 如果自動偵測失敗或指向錯誤位置（例如最後一欄 K），強制修正為 index 7 (H 欄)
  if (operatorIdx === -1 || operatorIdx > 7) operatorIdx = 7; 

  if (methodIdx === -1 || statusIdx === -1) return [];

  const startDate = payload.startDate ? parseLocalYMD_(payload.startDate) : null;
  const endDate = payload.endDate ? parseLocalYMD_(payload.endDate) : null;
  if (startDate) startDate.setHours(0, 0, 0, 0);
  if (endDate) endDate.setHours(23, 59, 59, 999);

  const purchaseGroups = {};
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const rowDate = new Date(row[dateIdx]);
    const status = String(row[statusIdx] || '').toUpperCase();
    if (row[methodIdx] === 'CREDIT' && status === 'UNPAID' && status !== 'VOID') {
      if (startDate && rowDate < startDate) continue;
      if (endDate && rowDate > endDate) continue;
      const vendor = row[vendorIdx];
      const dateStr = Utilities.formatDate(rowDate, 'GMT+8', 'yyyy-MM-dd');
      
      const modBy = String(row[10] || '');
      const status = String(row[9] || '').toUpperCase();
      let operatorName = '未知';
      let rawOperator = row[operatorIdx] || ''; // Buyer

      const buyerName = userMap[rawOperator] || rawOperator || '未知';

      if (modBy.startsWith('VOID_BY: ')) {
        const voidName = modBy.replace('VOID_BY: ', '');
        operatorName = `${buyerName} (作廢: ${userMap[voidName] || voidName})`;
      } else if (status === 'VOID' && modBy && !modBy.startsWith('purchase_') && !modBy.includes('-')) {
        operatorName = `${buyerName} (作廢: ${userMap[modBy] || modBy})`;
      } else {
        const isTechnicalId = modBy.startsWith('purchase_') || modBy.includes('-');
        rawOperator = (!modBy || isTechnicalId) ? rawOperator : modBy;
        operatorName = userMap[rawOperator] || rawOperator || '未知';
      }

      const groupKey = `${vendor}_${dateStr}_${rawOperator}`;
      if (!purchaseGroups[groupKey]) {
        purchaseGroups[groupKey] = { uuids: [], date: dateStr, serverTimestamp: rowDate, vendor: vendor, operator: operatorName, amount: 0, items: [] };
      }
      const uuid = (idIdx !== -1 && row[idIdx]) ? String(row[idIdx]) : '';
      if (uuid) {
        purchaseGroups[groupKey].uuids.push(uuid);
      }
      const productId = row[productIdIdx];
      const productName = productMap[productId] || productId;
      const qty = Number(row[qtyIdx]) || 0;
      const price = Number(row[priceIdx]) || 0;
      purchaseGroups[groupKey].amount += qty * price;
      purchaseGroups[groupKey].items.push({ uuid, productName, qty, price, subtotal: qty * price });
    }
  }
  return Object.values(purchaseGroups).reverse();
}

function markPayableAsPaidService(payload) {
  const { targetUuids } = payload;
  if (!targetUuids || targetUuids.length === 0) throw new Error('未提供有效 ID');

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Purchases');
    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();
    if (lastRow <= 1) return { success: true, updated: 0 };

    const data = sheet.getRange(1, 1, lastRow, lastCol).getValues();
    const headers = data[0];
    const idColIdx = headers.indexOf('ID');
    const statusColIdx = headers.indexOf('Status');

    if (idColIdx === -1 || statusColIdx === -1) throw new Error('找不到 ID 或 Status 欄位');

    const targetSet = new Set(targetUuids.map(String));
    let updatedCount = 0;

    for (let i = 1; i < data.length; i++) {
      if (targetSet.has(String(data[i][idColIdx]))) {
        data[i][statusColIdx] = 'PAID';
        updatedCount++;
      }
    }

    if (updatedCount > 0) {
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
