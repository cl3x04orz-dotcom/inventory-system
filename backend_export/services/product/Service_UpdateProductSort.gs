/**
 * Service_UpdateProductSort.gs
 * [Service] 更新產品排序權重
 */
function updateProductSortOrderService(payload) {
    if (!payload.productIds || !Array.isArray(payload.productIds)) return { error: 'Invalid productIds' };

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("Products") || ss.getSheetByName("Inventory");
    if (!sheet) return { error: "找不到分頁" };

    var data = sheet.getDataRange().getValues();
    var headers = data[0].map(h => String(h || '').trim().toLowerCase());
    
    var weightColIdx = headers.indexOf('排序權重');
    if (weightColIdx === -1) weightColIdx = headers.indexOf('sortweight');
    if (weightColIdx === -1) weightColIdx = headers.findIndex(h => h.includes('權重') && !h.includes('單位'));

    var idColIdx = headers.findIndex(h => h.includes('id') || h.includes('序號') || h.includes('uuid'));
    var nameColIdx = headers.findIndex(h => h.includes('名稱') || h.includes('name') || h.includes('品項') || h.includes('品名'));

    if (weightColIdx === -1) {
        weightColIdx = headers.length;
        sheet.getRange(1, weightColIdx + 1).setValue('排序權重');
    }

    var idToRowMap = {};
    for (var i = 1; i < data.length; i++) {
        var idVal = idColIdx !== -1 ? String(data[i][idColIdx] || '').trim() : "";
        var nameVal = nameColIdx !== -1 ? String(data[i][nameColIdx] || '').trim() : "";
        var key = idVal || nameVal;
        if (key) idToRowMap[key] = i + 1;
    }

    var weightRange = sheet.getRange(2, weightColIdx + 1, data.length - 1, 1);
    var weightValues = weightRange.getValues();
    var updateCount = 0;

    payload.productIds.forEach((id, idx) => {
        var rowNum = idToRowMap[String(id || '').trim()];
        if (rowNum && rowNum >= 2) {
            weightValues[rowNum - 2][0] = (idx + 1) * 10;
            updateCount++;
        }
    });

    weightRange.setValues(weightValues);
    SpreadsheetApp.flush();
    return { success: true, updateCount: updateCount };
}
