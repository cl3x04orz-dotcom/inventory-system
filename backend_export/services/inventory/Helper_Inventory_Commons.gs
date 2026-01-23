/**
 * Helper_Inventory_Commons.gs
 * [Helper] 庫存模組共用邏輯 (ID/名稱映射)
 */

function getProductMap() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const pSheet = ss.getSheetByName('Products') || ss.getSheetByName('Inventory');
  if (!pSheet) return {};
  const data = pSheet.getDataRange().getValues();
  const map = {};
  for (let i = 1; i < data.length; i++) {
    map[data[i][0]] = data[i][1]; // ID -> Name
  }
  return map;
}
