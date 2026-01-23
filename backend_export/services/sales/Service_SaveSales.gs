/**
 * Service_SaveSales.gs
 * [Service] 銷售存檔與庫存扣除
 */
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

  let finalSalesRep = operator;
  if (!finalSalesRep || finalSalesRep === '???') finalSalesRep = salesRep;
  if (user) {
    if (!finalSalesRep || finalSalesRep === '???') finalSalesRep = user.displayName || user.name || user.username;
  }
  if (!finalSalesRep) finalSalesRep = 'Unknown';
  
  salesSheet.appendRow([
    saleId, today, finalSalesRep, cashData.totalCash, cashData.reserve, 
    expenseData.finalTotal, customer || '', finalSalesRep, method, status             
  ]);
  
  expSheet.appendRow([
    saleId, 
    expenseData.stall, expenseData.cleaning, expenseData.electricity, 
    expenseData.gas, expenseData.parking, expenseData.goods, 
    expenseData.bags, expenseData.others || 0, expenseData.linePay, 
    expenseData.serviceFee, expenseData.finalTotal,
    customer || '', finalSalesRep, today             
  ]);
  
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
