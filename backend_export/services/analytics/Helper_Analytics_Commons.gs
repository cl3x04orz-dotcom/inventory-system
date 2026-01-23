/**
 * Helper_Analytics_Commons.gs
 * [Helper] 數據分析模組共用邏輯 (標頭標準化、日期解析、有效銷售映射)
 */

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
    if (dVal && sid && dVal >= start && dVal <= end) map[sid] = true;
  }
  return map;
}
