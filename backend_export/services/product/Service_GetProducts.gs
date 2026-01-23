/**
 * Service_GetProducts.gs
 * [Service] 獲取產品清單 (優化標頭偵測版)
 */
function getProductsService() {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("Products") || ss.getSheetByName("Inventory");
    if (!sheet) return { error: "找不到 'Products' 或 'Inventory' 分頁" };
  
    var data = sheet.getDataRange().getValues();
    if (data.length < 1) return [];
    
    var headers = data[0].map(h => String(h || '').trim().toLowerCase());
    
    var idxId = headers.findIndex(h => h.includes('id') || h.includes('序號') || h.includes('uuid'));
    var idxName = headers.findIndex(h => h.includes('名稱') || h.includes('name') || h.includes('品項') || h.includes('品名') || h.includes('product'));
    var idxPrice = headers.findIndex(h => h.includes('單價') || h.includes('價格') || h.includes('price') || h.includes('unitprice'));
    
    var idxOriginalStock = headers.findIndex(h => h.includes('原始') && (h.includes('庫存') || h.includes('stock')));
    var idxStock = headers.findIndex(function(h, i) {
        return (h.includes('庫存') || h.includes('stock')) && i !== idxOriginalStock;
    });
    
    if (idxStock === -1) idxStock = headers.indexOf('庫存');
    if (idxName === -1) idxName = 1; 
    
    var idxWeight = headers.indexOf('排序權重');
    if (idxWeight === -1) idxWeight = headers.indexOf('sortweight');
    if (idxWeight === -1) idxWeight = headers.findIndex(h => h.includes('權重') && !h.includes('單位'));

    var products = [];
    for (var i = 1; i < data.length; i++) {
        var row = data[i];
        var nameCell = idxName !== -1 ? String(row[idxName] || '').trim() : "";
        var idCell = idxId !== -1 ? String(row[idxId] || '').trim() : "";
        if (!nameCell && !idCell) continue; 
        
        var p = { _fromSheet: sheet.getName() };
        if (idxId !== -1) p.id = String(row[idxId] || '').trim();
        if (idxName !== -1) p.name = String(row[idxName] || '').trim();
        if (idxPrice !== -1) p.price = row[idxPrice];
        if (idxStock !== -1) p.stock = row[idxStock];
        if (idxOriginalStock !== -1) p.originalStock = row[idxOriginalStock];
        
        if (idxWeight !== -1) {
            var cellValue = row[idxWeight];
            if (cellValue !== '' && cellValue !== null && cellValue !== undefined) {
                var val = Number(cellValue);
                if (!isNaN(val)) p.sortWeight = val;
            }
        }
        if (p.name && !p.id) p.id = p.name;
        if (p.name) products.push(p);
    }
    return products;
}
