/**
 * Products.gs
 * [Service] 產品查詢與排序權重管理
 */

function getProductsService() {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var productsSheet = ss.getSheetByName("Products");
    var inventorySheet = ss.getSheetByName("Inventory");
    
    if (!productsSheet) return { error: "找不到 'Products' 分頁" };
    
    // 1. 讀取 Products 分頁（產品主檔）
    var productData = productsSheet.getDataRange().getValues();
    if (productData.length < 2) return [];
    
    var productHeaders = productData[0].map(h => String(h || '').trim().toLowerCase());
    var idxId = productHeaders.findIndex(h => h.includes('id') || h.includes('序號') || h.includes('uuid'));
    var idxName = productHeaders.findIndex(h => h.includes('名稱') || h.includes('name') || h.includes('品項') || h.includes('品名') || h.includes('product'));
    var idxPrice = productHeaders.findIndex(h => h.includes('單價') || h.includes('價格') || h.includes('price') || h.includes('unitprice'));
    var idxWeight = productHeaders.indexOf('排序權重');
    if (idxWeight === -1) idxWeight = productHeaders.indexOf('sortweight');
    if (idxWeight === -1) idxWeight = productHeaders.findIndex(h => h.includes('權重') && !h.includes('單位'));
    
    if (idxName === -1) idxName = 1; // Fallback
    
    // 2. 從 Inventory 分頁彙總庫存
    var stockMap = {}; // { productId: { stock: 0, originalStock: 0 } }
    if (inventorySheet) {
        var invData = inventorySheet.getDataRange().getValues();
        if (invData.length > 1) {
            var invHeaders = invData[0].map(h => String(h || '').trim().toLowerCase());
            var invIdxProductId = invHeaders.findIndex(h => h.includes('productid') || h.includes('產品id'));
            var invIdxQty = invHeaders.findIndex(h => h.includes('quantity') || h.includes('數量'));
            var invIdxType = invHeaders.findIndex(h => h.includes('type') || h.includes('類型'));
            
            for (var i = 1; i < invData.length; i++) {
                var invRow = invData[i];
                var productId = invIdxProductId !== -1 ? String(invRow[invIdxProductId] || '').trim() : '';
                var qty = invIdxQty !== -1 ? Number(invRow[invIdxQty]) || 0 : 0;
                var type = invIdxType !== -1 ? String(invRow[invIdxType] || '').trim().toUpperCase() : '';
                
                if (!productId) continue;
                if (!stockMap[productId]) stockMap[productId] = { stock: 0, originalStock: 0 };
                
                if (type === 'STOCK') {
                    stockMap[productId].stock += qty;
                } else if (type === 'ORIGINAL') {
                    stockMap[productId].originalStock += qty;
                }
            }
        }
    }
    
    // 3. 組合產品資料
    var products = [];
    for (var i = 1; i < productData.length; i++) {
        var row = productData[i];
        var nameCell = idxName !== -1 ? String(row[idxName] || '').trim() : "";
        var idCell = idxId !== -1 ? String(row[idxId] || '').trim() : "";
        if (!nameCell && !idCell) continue;
        
        var productId = idCell || nameCell;
        var p = {
            id: productId,
            name: nameCell,
            price: idxPrice !== -1 ? row[idxPrice] : 0,
            stock: 0,
            originalStock: 0,
            _fromSheet: 'Products'
        };
        
        // 從 Inventory 取得實際庫存
        if (stockMap[productId]) {
            p.stock = stockMap[productId].stock;
            p.originalStock = stockMap[productId].originalStock;
        }
        
        // 排序權重
        if (idxWeight !== -1) {
            var cellValue = row[idxWeight];
            if (cellValue !== '' && cellValue !== null && cellValue !== undefined) {
                var val = Number(cellValue);
                if (!isNaN(val)) p.sortWeight = val;
            }
        }
        
        if (p.name) products.push(p);
    }
    
    return products;
}

function updateProductSortOrderService(payload) {
    if (!payload.productIds || !Array.isArray(payload.productIds)) return { error: 'Invalid productIds' };

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("Products") || ss.getSheetByName("Inventory");
    if (!sheet) return { error: "找不到分頁" };

    var data = sheet.getDataRange().getValues();
    var headers = data[0].map(h => String(h || '').trim().toLowerCase());
    // 優先尋找精確匹配「排序權重」，找不到再找包含「權重」但排除「單位」的
    var weightColIdx = headers.indexOf('排序權重');
    if (weightColIdx === -1) weightColIdx = headers.indexOf('sortweight');
    if (weightColIdx === -1) weightColIdx = headers.findIndex(h => h.includes('權重') && !h.includes('單位'));
    if (weightColIdx === -1) weightColIdx = headers.findIndex(h => h.includes('weight'));

    var idColIdx = headers.findIndex(h => h.includes('id') || h.includes('序號') || h.includes('uuid'));
    var nameColIdx = headers.findIndex(h => h.includes('名稱') || h.includes('name') || h.includes('品項') || h.includes('品名') || h === 'product');

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
