/**
 * Products.gs
 * [Service] 產品查詢與排序權重管理
 */

function getProductsService() {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var productsSheet = ss.getSheetByName("Products");
    var inventorySheet = ss.getSheetByName("Inventory");
    
    if (!productsSheet) return { error: "找不到 'Products' 分頁" };
    
    // [新增] 自動初始化擴充欄位
    var headerRow = productsSheet.getRange(1, 1, 1, productsSheet.getLastColumn()).getValues()[0];
    var headerStrs = headerRow.map(h => String(h || '').trim());
    var newCols = [
        '是否上架', '圖片網址', '有效日期', '分類',
        'has_flavor_attributes', 'flavor_choices', 'single_price',
        'has_volume_pricing', 'volume_pricing_settings'
    ];
    newCols.forEach(col => {
        if (!headerStrs.includes(col)) {
            var nextCol = productsSheet.getLastColumn() + 1;
            productsSheet.getRange(1, nextCol).setValue(col);
            // 如果是「是否上架」，預設現有所有列為 TRUE
            if (col === '是否上架' && productsSheet.getLastRow() > 1) {
                var rows = productsSheet.getLastRow() - 1;
                var trueValues = Array.from({length: rows}, () => [true]);
                productsSheet.getRange(2, nextCol, rows, 1).setValues(trueValues);
                // 在該欄設定資料驗證（核取方塊）
                var rule = SpreadsheetApp.newDataValidation().requireCheckbox().build();
                productsSheet.getRange(2, nextCol, rows, 1).setDataValidation(rule);
            }
            if ((col === 'has_flavor_attributes' || col === 'has_volume_pricing') && productsSheet.getLastRow() > 1) {
                var rows = productsSheet.getLastRow() - 1;
                var falseValues = Array.from({length: rows}, () => [false]);
                productsSheet.getRange(2, nextCol, rows, 1).setValues(falseValues);
                var rule = SpreadsheetApp.newDataValidation().requireCheckbox().build();
                productsSheet.getRange(2, nextCol, rows, 1).setDataValidation(rule);
            }
        }
    });

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
    
    // [新增] 擴充欄位 index
    var idxActive = productData[0].findIndex(h => String(h || '').trim() === '是否上架');
    var idxImage = productData[0].findIndex(h => String(h || '').trim() === '圖片網址');
    var idxExpiry = productData[0].findIndex(h => String(h || '').trim() === '有效日期');
    var idxCategory = productData[0].findIndex(h => String(h || '').trim() === '分類');
    
    var idxHasFlavor = productData[0].findIndex(h => {
        var s = String(h || '').trim().toLowerCase();
        return s === 'has_flavor_attributes' || s === '是否有多規格口味' || s === '多規格口味';
    });
    var idxFlavorChoices = productData[0].findIndex(h => {
        var s = String(h || '').trim().toLowerCase();
        return s === 'flavor_choices' || s === '規格口味選項' || s === '口味選項' || s === '口味';
    });
    var idxSinglePrice = productData[0].findIndex(h => {
        var s = String(h || '').trim().toLowerCase();
        return s === 'single_price' || s === '單件原價' || s === '原價';
    });
    var idxHasVolumePricing = productData[0].findIndex(h => {
        var s = String(h || '').trim().toLowerCase();
        return s === 'has_volume_pricing' || s === '是否啟用組合價' || s === '啟用組合價' || s === '是否啟用滿件組合價';
    });
    var idxVolumePricingSettings = productData[0].findIndex(h => {
        var s = String(h || '').trim().toLowerCase();
        return s === 'volume_pricing_settings' || s === '組合價設定' || s === '滿件組合價設定';
    });
    
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
        
        // 讀取 I 欄位作包裝規格 (Index 8)
        var packSize = 1;
        if (row.length > 8) {
            var psVal = Number(row[8]);
            if (!isNaN(psVal) && psVal > 0) packSize = psVal;
        }

        // [新增] 有效日期格式化
        var expiryStr = '';
        if (idxExpiry !== -1 && row[idxExpiry]) {
            var expVal = row[idxExpiry];
            if (expVal instanceof Date) {
                expiryStr = Utilities.formatDate(expVal, 'GMT+8', 'yyyy-MM-dd');
            } else {
                expiryStr = String(expVal).trim();
            }
        }

        var p = {
            id: productId,
            name: nameCell,
            price: idxPrice !== -1 ? row[idxPrice] : 0,
            packSize: packSize,
            stock: 0,
            originalStock: 0,
            isActive: idxActive !== -1 ? (row[idxActive] === true || row[idxActive] === 'TRUE' || row[idxActive] === '是') : true,
            imageUrl: idxImage !== -1 ? String(row[idxImage] || '').trim() : '',
            expiryDate: expiryStr,
            category: idxCategory !== -1 ? String(row[idxCategory] || '').trim() : '',
            has_flavor_attributes: idxHasFlavor !== -1 ? (row[idxHasFlavor] === true || row[idxHasFlavor] === 'TRUE' || row[idxHasFlavor] === '是' || row[idxHasFlavor] === 1 || row[idxHasFlavor] === '1') : false,
            flavor_choices: [],
            single_price: 0,
            has_volume_pricing: idxHasVolumePricing !== -1 ? (row[idxHasVolumePricing] === true || row[idxHasVolumePricing] === 'TRUE' || row[idxHasVolumePricing] === '是' || row[idxHasVolumePricing] === 1 || row[idxHasVolumePricing] === '1') : false,
            volume_pricing_settings: null,
            _fromSheet: 'Products'
        };

        // 解析多口味選項
        if (idxFlavorChoices !== -1 && row[idxFlavorChoices]) {
            var rawChoices = String(row[idxFlavorChoices]).trim();
            if (rawChoices.startsWith('[') && rawChoices.endsWith(']')) {
                try {
                    p.flavor_choices = JSON.parse(rawChoices);
                } catch (e) {
                    p.flavor_choices = rawChoices.slice(1, -1).split(',').map(function(s) { return s.trim().replace(/^["']|["']$/g, ''); });
                }
            } else if (rawChoices) {
                p.flavor_choices = rawChoices.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
            }
        }

        // 解析單件原價
        var rawSinglePrice = idxSinglePrice !== -1 && row[idxSinglePrice] !== '' ? Number(row[idxSinglePrice]) : NaN;
        p.single_price = !isNaN(rawSinglePrice) ? rawSinglePrice : Number(p.price) || 0;

        // 解析組合價設定
        if (idxVolumePricingSettings !== -1 && row[idxVolumePricingSettings]) {
            var rawSettings = String(row[idxVolumePricingSettings]).trim();
            try {
                p.volume_pricing_settings = JSON.parse(rawSettings);
            } catch (e) {
                // Ignore parsing errors
            }
        }
        
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

/**
 * [Service] 更新商品擴充屬性（是否上架、圖片網址、有效日期）
 * 只有 BOSS 可以操作
 */
function updateProductDetailsService(payload, user) {
    if (user.role !== 'BOSS') throw new Error('權限不足');

    const { productId, isActive, imageUrl, expiryDate, has_flavor_attributes, flavor_choices, single_price, has_volume_pricing, volume_pricing_settings } = payload;
    if (!productId) throw new Error('缺少 productId');

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Products');
    if (!sheet) throw new Error('找不到 Products 分頁');

    const data = sheet.getDataRange().getValues();
    const headers = data[0];

    const idColIdx = headers.findIndex(h => {
        const s = String(h || '').trim().toLowerCase();
        return s.includes('id') || s.includes('序號') || s.includes('uuid');
    });
    const nameColIdx = headers.findIndex(h => {
        const s = String(h || '').trim().toLowerCase();
        return s.includes('名稱') || s.includes('name') || s.includes('品項') || s.includes('品名');
    });
    const idxActive = headers.findIndex(h => String(h || '').trim() === '是否上架');
    const idxImage = headers.findIndex(h => String(h || '').trim() === '圖片網址');
    const idxExpiry = headers.findIndex(h => String(h || '').trim() === '有效日期');

    const idxHasFlavor = headers.findIndex(h => {
        const s = String(h || '').trim().toLowerCase();
        return s === 'has_flavor_attributes' || s === '是否有多規格口味' || s === '多規格口味';
    });
    const idxFlavorChoices = headers.findIndex(h => {
        const s = String(h || '').trim().toLowerCase();
        return s === 'flavor_choices' || s === '規格口味選項' || s === '口味選項' || s === '口味';
    });
    const idxSinglePrice = headers.findIndex(h => {
        const s = String(h || '').trim().toLowerCase();
        return s === 'single_price' || s === '單件原價' || s === '原價';
    });
    const idxHasVolumePricing = headers.findIndex(h => {
        const s = String(h || '').trim().toLowerCase();
        return s === 'has_volume_pricing' || s === '是否啟用組合價' || s === '啟用組合價' || s === '是否啟用滿件組合價';
    });
    const idxVolumePricingSettings = headers.findIndex(h => {
        const s = String(h || '').trim().toLowerCase();
        return s === 'volume_pricing_settings' || s === '組合價設定' || s === '滿件組合價設定';
    });

    let foundRow = -1;
    for (let i = 1; i < data.length; i++) {
        const idVal = idColIdx !== -1 ? String(data[i][idColIdx] || '').trim() : '';
        const nameVal = nameColIdx !== -1 ? String(data[i][nameColIdx] || '').trim() : '';
        if (idVal === productId || nameVal === productId) {
            foundRow = i + 1;
            break;
        }
    }
    if (foundRow === -1) throw new Error('找不到商品：' + productId);

    // 逐欄更新
    if (idxActive !== -1 && isActive !== undefined) {
        sheet.getRange(foundRow, idxActive + 1).setValue(isActive === true || isActive === 'true');
    }
    if (idxImage !== -1 && imageUrl !== undefined) {
        sheet.getRange(foundRow, idxImage + 1).setValue(imageUrl || '');
    }
    if (idxExpiry !== -1 && expiryDate !== undefined) {
        sheet.getRange(foundRow, idxExpiry + 1).setValue(expiryDate || '');
    }
    if (idxHasFlavor !== -1 && has_flavor_attributes !== undefined) {
        sheet.getRange(foundRow, idxHasFlavor + 1).setValue(has_flavor_attributes === true || has_flavor_attributes === 'true');
    }
    if (idxFlavorChoices !== -1 && flavor_choices !== undefined) {
        sheet.getRange(foundRow, idxFlavorChoices + 1).setValue(Array.isArray(flavor_choices) ? JSON.stringify(flavor_choices) : (flavor_choices || ''));
    }
    if (idxSinglePrice !== -1 && single_price !== undefined) {
        sheet.getRange(foundRow, idxSinglePrice + 1).setValue(single_price !== '' && single_price !== null && !isNaN(Number(single_price)) ? Number(single_price) : '');
    }
    if (idxHasVolumePricing !== -1 && has_volume_pricing !== undefined) {
        sheet.getRange(foundRow, idxHasVolumePricing + 1).setValue(has_volume_pricing === true || has_volume_pricing === 'true');
    }
    if (idxVolumePricingSettings !== -1 && volume_pricing_settings !== undefined) {
        var settingsStr = '';
        if (volume_pricing_settings) {
            settingsStr = typeof volume_pricing_settings === 'string' ? volume_pricing_settings : JSON.stringify(volume_pricing_settings);
        }
        sheet.getRange(foundRow, idxVolumePricingSettings + 1).setValue(settingsStr);
    }

    SpreadsheetApp.flush();
    return { success: true };
}
