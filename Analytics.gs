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
  const prodSheet = ss.getSheetByName('Products');
  const invSheet = ss.getSheetByName('Inventory');
  const map = {};

  // 1. 從 Products 表抓取基本資訊 (最準確的名稱與最新成本)
  if (prodSheet) {
    const pValues = prodSheet.getDataRange().getValues();
    const headers = pValues[0];
    const pidIdx = 0; // Col A
    const nameIdx = 1; // Col B
    const costIdx = headers.findIndex(h => h.includes('成本') || h.toLowerCase() === 'cost');

    for (let i = 1; i < pValues.length; i++) {
      const pid = String(pValues[i][pidIdx] || "").trim();
      if (pid) {
        map[pid] = { 
          name: String(pValues[i][nameIdx] || "").trim(),
          cost: costIdx !== -1 ? (Number(pValues[i][costIdx]) || 0) : 0,
          stock: 0 
        };
      }
    }
  }

  // 2. 從 Inventory 表補充庫存數量
  if (invSheet) {
    const iValues = invSheet.getDataRange().getValues();
    for (let i = 1; i < iValues.length; i++) {
      const pid = String(iValues[i][1] || "").trim(); // Inventory B 欄是 PID
      if (pid && pid !== "ProductID") {
        if (!map[pid]) {
          const rowName = String(iValues[i][7] || "").trim(); // H 欄是名稱
          map[pid] = { name: rowName, cost: 0, stock: 0 };
        }
        // 累加庫存數量 (C 欄是數量)
        map[pid].stock += (Number(iValues[i][2]) || 0);
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
  const start = parseLocalYMD_(startDateStr); start.setHours(0,0,0,0);
  const end = parseLocalYMD_(endDateStr); end.setHours(23,59,59,999);
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
      
      // [優化] 優先使用明細中紀錄的當時成本 (index 10 / unitcost)，若無則用目前成本
      const recordedCost = row['unitcost'] !== undefined ? Number(row['unitcost']) : Number(row[10]);
      const actualUnitCost = (recordedCost !== undefined && !isNaN(recordedCost) && recordedCost !== 0) 
        ? recordedCost 
        : info.cost;
        
      const cost = qty * actualUnitCost;

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
  const start = parseLocalYMD_(startDate); start.setHours(0,0,0,0);
  const end = parseLocalYMD_(endDate); end.setHours(23,59,59,999);
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
