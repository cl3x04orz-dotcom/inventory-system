/**
 * Service_Analytics.gs
 * [Service] 數據分析模組 (完整版)
 * 包含：銷售排行、毛利分析、客戶排行、週轉率
 */

function getSalesRanking(payload) {
  const { startDate, endDate } = payload;
  const validSales = getValidSalesMap_(startDate, endDate);
  const productMap = getProductInfoMap_();
  const detailsData = getDataWithNormalizedHeaders_('SalesDetails');
  const stats = {};

  detailsData.forEach((row) => {
    const saleId = String(row['saleid'] || row[0]).trim();
    if (validSales[saleId]) {
      const pid = String(row['productid'] || row[1]).trim();
      const name = (productMap[pid] && productMap[pid].name) ? productMap[pid].name : pid;
      const qty = Number(row['sold'] || row[5] || 0);
      const amount = Number(row['subtotal'] || row[7] || 0);
      if (pid) {
        if (!stats[pid]) stats[pid] = { productName: name, totalQty: 0, totalAmount: 0 };
        stats[pid].totalQty += qty;
        stats[pid].totalAmount += amount;
      }
    }
  });
  return Object.values(stats).sort((a, b) => b.totalAmount - a.totalAmount);
}

function getProfitAnalysis(payload) {
  const { startDate, endDate } = payload;
  const validSales = getValidSalesMap_(startDate, endDate);
  const productMap = getProductInfoMap_(); 
  const detailsData = getDataWithNormalizedHeaders_('SalesDetails');
  const stats = {};

  detailsData.forEach(row => {
    const saleId = String(row['saleid'] || row[0]).trim();
    if (validSales[saleId]) {
      const pid = String(row['productid'] || row[1]).trim();
      const info = productMap[pid] || { name: pid, cost: 0 };
      const qty = Number(row['sold'] || row[5] || 0);
      const revenue = Number(row['subtotal'] || row[7] || 0);
      const cost = qty * info.cost;
      if (pid) {
        if (!stats[pid]) stats[pid] = { productName: info.name, revenue: 0, cost: 0 };
        stats[pid].revenue += revenue;
        stats[pid].cost += cost;
      }
    }
  });
  return Object.values(stats).sort((a, b) => (b.revenue - b.cost) - (a.revenue - a.cost));
}

function getCustomerRanking(payload) {
  const { startDate, endDate } = payload;
  const salesData = getDataWithNormalizedHeaders_('Sales');
  const start = new Date(startDate); start.setHours(0,0,0,0);
  const end = new Date(endDate); end.setHours(23,59,59,999);
  const stats = {};

  salesData.forEach(row => {
    const dVal = parseSheetDate_(row['date'] || row[1]);
    if (!dVal || dVal < start || dVal > end) return;
    let customer = String(row['location'] || row['customer'] || row[6] || '未指定').trim();
    const amount = Number(row['finaltotal'] || row[5] || 0);
    if (!stats[customer]) stats[customer] = { customerName: customer, transactionCount: 0, totalAmount: 0 };
    stats[customer].transactionCount += 1;
    stats[customer].totalAmount += amount;
  });
  return Object.values(stats).sort((a, b) => b.totalAmount - a.totalAmount);
}

function getTurnoverRate(payload) {
  const profitData = getProfitAnalysis(payload);
  const productMap = getProductInfoMap_();
  return Object.values(productMap).map(p => {
    const analysis = profitData.find(d => d.productName === p.name) || { cost: 0 };
    return { productName: p.name, cogs: analysis.cost, avgInventory: p.stock };
  }).sort((a, b) => {
    const rateA = a.avgInventory > 0 ? a.cogs / a.avgInventory : 0;
    const rateB = b.avgInventory > 0 ? b.cogs / b.avgInventory : 0;
    return rateB - rateA;
  });
}
