/**
 * 系統精確調試工具：分析「崙背1L」的銷量、庫存與叫貨建議計算過程
 */
function debugProductSales() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const salesSheet = ss.getSheetByName('Sales');
  const detailsSheet = ss.getSheetByName('SalesDetails');
  const invSheet = ss.getSheetByName('Inventory');
  const prodSheet = ss.getSheetByName('Products');
  
  const targetProductName = "桂格顆粒燕麥";
  
  // 💡 【調試模擬設定】模擬星期幾執行：1=一, 2=二, 3=三, 4=四, 5=五, 6=六, 0=日。設為 null 代表使用今天真實時間。
  const simulateWeekday = null; 
  
  // Find Product ID
  let productId = "";
  let safeLevel = 0;
  let packSize = 1;
  let minOrderQty = 0;
  const prodData = prodSheet.getDataRange().getValues();
  const prodHeaders = prodData[0].map(h => String(h || '').trim().toLowerCase());
  const prodRows = prodData.slice(1);
  
  const orderPackSizeIdx = prodHeaders.findIndex(h => h.includes('訂貨箱規') || h.includes('叫貨箱規'));
  const minOrderQtyIdx = prodHeaders.findIndex(h => h.includes('最低起訂') || h.includes('起訂量'));

  for (let r of prodRows) {
    if (String(r[1]).trim() === targetProductName) {
      productId = String(r[0]).trim();
      safeLevel = Number(r[5]) || 0;
      packSize = (orderPackSizeIdx !== -1 && r[orderPackSizeIdx] !== '') ? Number(r[orderPackSizeIdx]) : (Number(r[8]) || 1);
      minOrderQty = (minOrderQtyIdx !== -1 && r[minOrderQtyIdx] !== '') ? Number(r[minOrderQtyIdx]) : 0;
      break;
    }
  }
  
  if (!productId) {
    Logger.log("❌ 找不到商品: " + targetProductName);
    return;
  }
  Logger.log("=========================================");
  Logger.log("✅ 找到商品: " + targetProductName);
  Logger.log("ID: " + productId);
  Logger.log("安全存量: " + safeLevel);
  Logger.log("=========================================");
  
  // Date setup
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const oneDayMs = 24 * 60 * 60 * 1000;
  
  const w1Start = new Date(startOfToday.getTime() - 7 * oneDayMs);
  const w1End = startOfToday;
  const w2Start = new Date(startOfToday.getTime() - 14 * oneDayMs);
  const w2End = w1Start;
  const w3Start = new Date(startOfToday.getTime() - 21 * oneDayMs);
  const w3End = w2Start;
  
  Logger.log("W1 區間 (過去 1~7 天): " + w1Start.toLocaleString("zh-TW", {timeZone:"Asia/Taipei"}) + " ~ " + w1End.toLocaleString("zh-TW", {timeZone:"Asia/Taipei"}));
  Logger.log("W2 區間 (過去 8~14 天): " + w2Start.toLocaleString("zh-TW", {timeZone:"Asia/Taipei"}) + " ~ " + w2End.toLocaleString("zh-TW", {timeZone:"Asia/Taipei"}));
  Logger.log("W3 區間 (過去 15~21 天): " + w3Start.toLocaleString("zh-TW", {timeZone:"Asia/Taipei"}) + " ~ " + w3End.toLocaleString("zh-TW", {timeZone:"Asia/Taipei"}));
  
  const salesRows = salesSheet.getDataRange().getValues().slice(1);
  const w1SalesIds = new Set();
  const w2SalesIds = new Set();
  const w3SalesIds = new Set();
  const saleWeekdayMap = {};
  const saleDateMap = {};
  
  salesRows.forEach(row => {
    const saleId = String(row[0]).trim();
    const date = new Date(row[1]);
    const status = String(row[9]).toUpperCase();
    
    if (status !== 'VOID' && saleId) {
      saleWeekdayMap[saleId] = date.getDay();
      saleDateMap[saleId] = date;
      
      if (date >= w1Start && date < w1End) {
        w1SalesIds.add(saleId);
      } else if (date >= w2Start && date < w2End) {
        w2SalesIds.add(saleId);
      } else if (date >= w3Start && date < w3End) {
        w3SalesIds.add(saleId);
      }
    }
  });
  
  Logger.log("W1 Sales 總訂單數: " + w1SalesIds.size);
  Logger.log("W2 Sales 總訂單數: " + w2SalesIds.size);
  Logger.log("W3 Sales 總訂單數: " + w3SalesIds.size);
  
  // Read details
  const detailsRows = detailsSheet.getDataRange().getValues().slice(1);
  let totalSoldW1 = 0;
  let totalSoldW2 = 0;
  let totalSoldW3 = 0;
  
  const salesList = [];
  
  detailsRows.forEach(row => {
    const saleId = String(row[0]).trim();
    const pId = String(row[1]).trim();
    const soldQty = Number(row[5]) || 0;
    
    if (pId === productId) {
      const date = saleDateMap[saleId];
      if (!date) return;
      const weekday = date.getDay();
      const status = w1SalesIds.has(saleId) ? "W1" : (w2SalesIds.has(saleId) ? "W2" : (w3SalesIds.has(saleId) ? "W3" : "OTHER"));
      
      salesList.push({
        saleId: saleId,
        date: date.toLocaleString("zh-TW", {timeZone:"Asia/Taipei"}),
        weekday: weekday,
        soldQty: soldQty,
        status: status
      });
      
      if (status === "W1") totalSoldW1 += soldQty;
      else if (status === "W2") totalSoldW2 += soldQty;
      else if (status === "W3") totalSoldW3 += soldQty;
    }
  });
  
  Logger.log("--- " + targetProductName + " 的所有歷史銷售明細 (最近3週) ---");
  salesList.forEach(s => {
    Logger.log(`[${s.status}] 日期: ${s.date} (星期 ${s.weekday}) | 實銷: ${s.soldQty} | 銷售單號: ${s.saleId}`);
  });
  Logger.log(`合計銷量：W1 = ${totalSoldW1}, W2 = ${totalSoldW2}, W3 = ${totalSoldW3}`);
  Logger.log("=========================================");
  
  // Tracing target weekdays
  const productVendorMap = getLatestProductVendorMap_();
  const vendorConfigs = getVendorConfigs_();
  const vendor = productVendorMap[productId] || "未指定廠商";
  const config = vendorConfigs[vendor] || {};
  
  Logger.log(`廠商: ${vendor}`);
  Logger.log(`叫貨排程: ${config.orderDays} | 到貨排程: ${config.deliveryDays}`);
  
  if (simulateWeekday !== null) {
    Logger.log(`⚠️ 啟動「模擬叫貨日」調試測試！正在模擬星期: ${simulateWeekday}`);
  }
  
  const targetWeekdays = getTargetWeekdays_(config.orderDays, config.deliveryDays, simulateWeekday);
  Logger.log(`本次覆蓋星期 (0=日, 1=一 ...): [${targetWeekdays.join(", ")}]`);
  
  let q1 = 0, q2 = 0, q3 = 0;
  salesList.forEach(s => {
    if (targetWeekdays.indexOf(s.weekday) !== -1) {
      if (s.status === "W1") q1 += s.soldQty;
      else if (s.status === "W2") q2 += s.soldQty;
      else if (s.status === "W3") q3 += s.soldQty;
    }
  });
  
  Logger.log(`匹配特定星期銷量：q1 = ${q1}, q2 = ${q2}, q3 = ${q3}`);
  
  let forecastDemand = 0;
  if (q1 > 0 || q2 > 0 || q3 > 0) {
    forecastDemand = (q1 * 0.5) + (q2 * 0.3) + (q3 * 0.2);
  }
  forecastDemand = Math.ceil(forecastDemand * 1.1);
  Logger.log(`加權預估銷量 (已加10%安全門檻): ${forecastDemand}`);
  
  let currentStock = 0;
  const invRows = invSheet.getDataRange().getValues().slice(1);
  invRows.forEach(row => {
    const pId = String(row[1]).trim();
    const qty = Number(row[2]) || 0;
    const type = String(row[5]).toUpperCase();
    if (pId === productId && (type === 'STOCK' || type === 'VOID_REFUND')) {
      currentStock += qty;
    }
  });
  Logger.log(`現有實體庫存: ${currentStock}`);
  
  let orderedStock = 0;
  const purSheet = ss.getSheetByName('Purchases');
  if (purSheet) {
    const purRows = purSheet.getDataRange().getValues().slice(1);
    purRows.forEach(row => {
      const pId = String(row[3]).trim();
      const qty = Number(row[4]) || 0;
      const status = String(row[9]).trim().toUpperCase();
      if (pId === productId && status === 'ORDERED') {
        orderedStock += qty;
      }
    });
  }
  Logger.log(`在途待驗收庫存: ${orderedStock}`);
  
  const totalStock = currentStock + orderedStock;
  let netNeed = (forecastDemand + safeLevel) - totalStock;
  Logger.log(`原始缺口計算: (${forecastDemand} + ${safeLevel}) - ${totalStock} = ${netNeed}`);
  
  if (netNeed > 0) {
    if (netNeed < minOrderQty) {
      Logger.log(`⚠️ 缺口 ${netNeed} 小於最低起訂量 ${minOrderQty}，強制拉升至 ${minOrderQty}`);
      netNeed = minOrderQty;
    }
    const finalOrder = Math.ceil(netNeed / packSize) * packSize;
    Logger.log(`📦 套用訂貨箱規 (${packSize}) 向上進位: ${finalOrder}`);
  } else {
    Logger.log(`✅ 庫存充足，建議叫貨量: 0`);
  }
}
