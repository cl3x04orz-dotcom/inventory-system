/**
 * Analytics.gs
 * [Service] 數據分析模組
 * 包含：銷售排行、毛利分析、客戶排行、週轉率
 */

// ==========================================
// Helper_Analytics_Commons.gs
// ==========================================
function getProductInfoMap_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('Inventory') || ss.getSheetByName('Products');
  if (!sheet) return {};
  const values = sheet.getDataRange().getValues();
  const map = {};
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const pid = String(row[1] || "").trim();
    if (pid && pid !== "ProductID") {
      if (!map[pid]) {
        map[pid] = { name: row[1], cost: Number(row[6]) || 0, stock: Number(row[2]) || 0 };
      } else {
        map[pid].stock += (Number(row[2]) || 0);
        if (map[pid].cost === 0) map[pid].cost = Number(row[6]) || 0;
      }
    }
  }
  return map;
}

function parseSheetDate_(val) {
  if (!val) return null;
  if (val instanceof Date) return val;
  try {
    let s = String(val);
    s = s.replace(/下午/g, ' PM').replace(/上午/g, ' AM').replace(/\//g, '-');
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  } catch(e) { return null; }
}

function getDataWithNormalizedHeaders_(sheetName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0];
  const keys = headers.map(h => String(h).toLowerCase().replace(/\s+/g, ''));
  const data = [];
  for (let i = 1; i < values.length; i++) {
    const row = values[i], obj = {};
    keys.forEach((key, j) => { if (key) obj[key] = row[j]; });
    row.forEach((val, j) => { obj[j] = val; });
    data.push(obj);
  }
  return data;
}

function getValidSalesMap_(startDateStr, endDateStr) {
  const start = new Date(startDateStr); start.setHours(0,0,0,0);
  const end = new Date(endDateStr); end.setHours(23,59,59,999);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Sales');
  if (!sheet) return {};
  const values = sheet.getDataRange().getValues();
  const map = {};
  for (let i = 1; i < values.length; i++) {
    const dVal = parseSheetDate_(values[i][1]); 
    const sid = String(values[i][0]).trim();
    // [Fix] Check Status (Col J, index 9)
    const status = String(values[i][9] || "").toUpperCase(); 
    if (status === 'VOID') continue;

    if (dVal && sid && dVal >= start && dVal <= end) map[sid] = true;
  }
  return map;
}

// ==========================================
// Service_Analytics.gs
// ==========================================
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
    // [Fix] Check Status
    const status = String(row['status'] || row[9] || "").toUpperCase();
    if (status === 'VOID') return;

    const dVal = parseSheetDate_(row['date'] || row[1]);
    if (!dVal || dVal < start || dVal > end) return;
    let customer = String(row['location'] || row['customer'] || row[6] || '未指定').trim();
    // [Fix] User requested to use Column D (TotalCash) instead of FinalTotal
    // Column D = Index 3 (TotalCash)
    // Column F = Index 5 (FinalTotal)
    const amount = Number(row['totalcash'] || row[3] || 0);
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
