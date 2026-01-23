/**
 * Service_Payables.gs
 * [Service] 應付帳款管理
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
        purchaseGroups[groupKey] = { id: i + 1, date: dateStr, serverTimestamp: rowDate, vendor: vendor, operator: operatorName, amount: 0, items: [] };
      }
      const productId = row[productIdIdx], productName = productMap[productId] || productId, qty = Number(row[qtyIdx]), price = Number(row[priceIdx]), subtotal = qty * price;
      purchaseGroups[groupKey].amount += subtotal;
      purchaseGroups[groupKey].items.push({ productName: productName, qty: qty, price: price, subtotal: subtotal });
    }
  }
  return Object.values(purchaseGroups).reverse();
}

function markPayableAsPaidService(payload) {
  const { recordId } = payload;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Purchases');
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const statusIdx = headers.indexOf('Status') + 1;
  if (statusIdx === 0) throw new Error('找不到狀態欄位');
  sheet.getRange(recordId, statusIdx).setValue('PAID');
  return { success: true };
}
