/**
 * Service_Print.gs
 * 動態模板與列印系統服務
 */

/**
 * [Service] 獲取所有可用模板列表 (Sheet Name start with "Template_")
 */
function getTemplatesListService() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = ss.getSheets();
  const templates = [];

  sheets.forEach(sheet => {
    const name = sheet.getName();
    if (name.startsWith('Template_')) {
      templates.push({
        id: name,
        name: name.replace('Template_', '') // User-friendly name
      });
    }
  });

  return templates;
}

/**
 * [Service] 獲取指定模板的詳細佈局 (Grid Layout)
 * @param {Object} payload { templateId: "Template_Name" }
 */
function getTemplateLayoutService(payload) {
  const templateId = payload.templateId;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(templateId);
  
  if (!sheet) {
    return { error: 'Template not found' };
  }

  const range = sheet.getDataRange();
  const numRows = range.getNumRows();
  const numCols = range.getNumColumns();

  // 1. Basic Data
  const values = range.getDisplayValues();
  const backgrounds = range.getBackgrounds();
  const fontWeights = range.getFontWeights();
  const fontColors = range.getFontColors();
  const horizontalAlignments = range.getHorizontalAlignments();
  const verticalAlignments = range.getVerticalAlignments();
  const fontSizes = range.getFontSizes();

  // 2. Merges
  const merges = range.getMergedRanges().map(r => ({
    startRow: r.getRow() - 1, // 0-indexed
    startCol: r.getColumn() - 1,
    endRow: r.getLastRow() - 1,
    endCol: r.getLastColumn() - 1,
    numRows: r.getNumRows(),
    numCols: r.getNumColumns()
  }));

  // 3. Grid Construction
  const grid = [];
  for (let r = 0; r < numRows; r++) {
    const rowData = [];
    for (let c = 0; c < numCols; c++) {
      // Check if this cell is part of a merge but NOT the top-left cell
      // If so, we mark it as 'skip' so frontend logic doesn't render it
      const parentMerge = merges.find(m => 
        r >= m.startRow && r <= m.endRow && 
        c >= m.startCol && c <= m.endCol
      );

      let isMergeStart = false;
      let isSkipped = false;
      let rowSpan = 1;
      let colSpan = 1;

      if (parentMerge) {
        if (r === parentMerge.startRow && c === parentMerge.startCol) {
          isMergeStart = true;
          rowSpan = parentMerge.numRows;
          colSpan = parentMerge.numCols;
        } else {
          isSkipped = true;
        }
      }

      if (!isSkipped) {
        rowData.push({
          value: values[r][c],
          style: {
            backgroundColor: backgrounds[r][c],
            fontWeight: fontWeights[r][c],
            color: fontColors[r][c],
            textAlign: horizontalAlignments[r][c], // center, left, right
            verticalAlign: verticalAlignments[r][c], // top, middle, bottom
            fontSize: fontSizes[r][c] + 'pt',
            border: '1px solid #000' // Default grid border
          },
          rowSpan: rowSpan,
          colSpan: colSpan,
          rowIndex: r,
          colIndex: c
        });
      } else {
         rowData.push(null); // Placeholder for grid alignment
      }
    }
    grid.push(rowData);
  }

  return {
    templateId: templateId,
    grid: grid,
    merges: merges // Optional, for debug
  };
}

/**
 * [Service] 生成 PDF (Backend Generation)
 * 支援雙欄位邏輯 + 自動填入 (不破壞版面)
 */
function generatePdfService(payload) {
  const { templateId, data } = payload;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const templateSheet = ss.getSheetByName(templateId);
  
  if (!templateSheet) {
    throw new Error('找不到模板: ' + templateId);
  }

  // 1. 記錄當前所有可見的工作表，確保轉檔後能 100% 復原顯示狀態
  const timestamp = new Date().getTime();
  const originallyVisibleSheets = [];
  const allSheets = ss.getSheets();
  for (const s of allSheets) {
    if (!s.isSheetHidden()) {
      originallyVisibleSheets.push(s);
    }
  }

  const createdPageSheets = [];

  try {
    const replacements = {
      '{{date}}': data.date ? new Date(data.date).toLocaleDateString('zh-TW') : new Date().toLocaleDateString('zh-TW'),
      '{{location}}': data.location || '',
      '{{sales_rep}}': data.salesRep || '',
      '{{total_sales}}': data.totalSalesAmount || '0',
      '{{total_cash}}': data.totalCashCalc || '0',
      '{{final_total}}': data.finalTotal || '0',
      '{{reserve}}': data.reserve || '0',
      '{{exp_stall}}': data.expenses?.stall || '',
      '{{exp_cleaning}}': data.expenses?.cleaning || '',
      '{{exp_electricity}}': data.expenses?.electricity || '',
      '{{exp_others}}': data.expenses?.others || ''
    };

    const range = templateSheet.getDataRange();
    const values = range.getValues(); // raw values
    const rangeHeight = values.length;
    const rangeWidth = values[0].length;
    
    // --- Strategy: Locate Product Row and Split Config ---
    let templateRowIndex = -1;
    let splitKey = null; // 可以是數字索引或產品名稱
    let colLeftIndex = -1;
    let colRightIndex = -1;

    const cleanTag = (str) => String(str || '').replace(/\s+/g, '').replace(/：/g, ':');
    const normalizeStr = (str) => String(str || '').normalize('NFC').trim();

    // Scan for tags
    for(let r=0; r<rangeHeight; r++) {
      for(let c=0; c<rangeWidth; c++) {
        const rawVal = String(values[r][c]);
        const val = cleanTag(rawVal);
        
        if (val.includes('products_until:') || val.includes('product_until:')) {
            templateRowIndex = r;
            colLeftIndex = c;
            const parts = val.split(/products?_until:/);
            if (parts[1]) splitKey = parts[1].trim();
        } else if (val.includes('{{products_left}}')) {
             templateRowIndex = r;
             colLeftIndex = c;
        }

        if (val.includes('products_after:') || val.includes('product_after:')) {
            templateRowIndex = r;
            colRightIndex = c;
            if (!splitKey) {
                const parts = val.split(/products?_after:/);
                if (parts[1]) splitKey = parts[1].trim();
            }
        } else if (val.includes('{{products_right}}')) {
             templateRowIndex = r;
             colRightIndex = c;
        }
      }
      if(templateRowIndex !== -1 && (colLeftIndex !== -1 || colRightIndex !== -1)) break;
    }

    // --- Product List Processing ---
    let leftProducts = [];
    let rightProducts = [];

    if (templateRowIndex !== -1 && data.rows && data.rows.length > 0) {
        if (splitKey) {
            const splitIndex = parseInt(splitKey, 10);
            if (!isNaN(splitIndex)) {
                leftProducts = data.rows.slice(0, splitIndex);
                rightProducts = data.rows.slice(splitIndex);
            } else {
                const normKey = normalizeStr(splitKey).replace(/\s+/g, '');
                let didSplit = false;
                for (const p of data.rows) {
                    if (didSplit) {
                        rightProducts.push(p);
                    } else {
                        leftProducts.push(p);
                        const pName = normalizeStr(p.name).replace(/\s+/g, '');
                        if (pName === normKey) {
                            didSplit = true;
                        }
                    }
                }
            }
        } else {
             leftProducts = data.rows.slice();
        }

        // --- Auto-Balance Fallback ---
        if (colLeftIndex !== -1 && colRightIndex !== -1 && rightProducts.length === 0 && leftProducts.length > 5) {
            const total = leftProducts.length;
            const mid = Math.ceil(total / 2);
            const secondHalf = leftProducts.splice(mid); 
            rightProducts = secondHalf;
        }
    }

    // 算出單頁左、右兩欄各自有多少個「可寫入商品」的行數容量
    let leftCapacityPerPage = 0;
    let rightCapacityPerPage = 0;
    if (colLeftIndex !== -1) {
        for (let r = templateRowIndex; r < rangeHeight; r++) {
            const originalCellValue = String(values[r][colLeftIndex] || '');
            const isWritable = originalCellValue.trim() === '' || 
                               originalCellValue.includes('{{') || 
                               originalCellValue.toLowerCase().includes('product');
            if (isWritable) leftCapacityPerPage++;
            else break;
        }
    }
    if (colRightIndex !== -1) {
        for (let r = templateRowIndex; r < rangeHeight; r++) {
            const originalCellValue = String(values[r][colRightIndex] || '');
            const isWritable = originalCellValue.trim() === '' || 
                               originalCellValue.includes('{{') || 
                               originalCellValue.toLowerCase().includes('product');
            if (isWritable) rightCapacityPerPage++;
            else break;
        }
    }
    if (leftCapacityPerPage <= 0) leftCapacityPerPage = 38;
    if (rightCapacityPerPage <= 0) rightCapacityPerPage = 25;

    // --- 方案 B (同一個模組複製成多個獨立 Sheet 分頁) ---
    let pageNum = 0;
    const templateRowValues = templateRowIndex !== -1 ? values[templateRowIndex] : [];

    // 至少執行一頁（就算沒有商品也能印出報表表頭與底稿）
    do {
        let pageLeftItems = [];
        let pageRightItems = [];

        if (pageNum === 0) {
            pageLeftItems = colLeftIndex !== -1 ? leftProducts.splice(0, leftCapacityPerPage) : [];
            pageRightItems = colRightIndex !== -1 ? rightProducts.splice(0, rightCapacityPerPage) : [];
        } else {
            // 第 2 頁及之後，將剩餘的所有商品合併，一律「先填入左欄，若左欄滿了再填入右欄」
            const overflowPool = [...leftProducts, ...rightProducts];
            leftProducts = [];
            rightProducts = [];
            pageLeftItems = colLeftIndex !== -1 ? overflowPool.splice(0, leftCapacityPerPage) : [];
            pageRightItems = colRightIndex !== -1 ? overflowPool.splice(0, rightCapacityPerPage) : [];
            if (overflowPool.length > 0) leftProducts = overflowPool;
        }

        const maxRows = Math.max(
            pageLeftItems.length, 
            pageRightItems.length, 
            colLeftIndex !== -1 ? leftCapacityPerPage : 0, 
            colRightIndex !== -1 ? rightCapacityPerPage : 0
        );

        // [方案 B 核心] 每一頁都是由 templateSheet 完整複製出來的獨立 Sheet！這樣最上面的領貨人簽名等排版完全 identical！
        const pageSheet = templateSheet.copyTo(ss);
        pageSheet.setName(`Print_P${pageNum + 1}_${timestamp}`);
        createdPageSheets.push(pageSheet);

        if (templateRowIndex !== -1 && maxRows > 0) {
            const targetBlockRange = pageSheet.getRange(templateRowIndex + 1, 1, maxRows, rangeWidth);
            const targetValues = targetBlockRange.getValues();
            const targetFormats = targetBlockRange.getNumberFormats();
            let hasChanges = false;
            let hasFormatChanges = false;

            for (let i = 0; i < maxRows; i++) {
                const originalRowIndex = templateRowIndex + i;
                const leftItem = i < pageLeftItems.length ? pageLeftItems[i] : null;
                const rightItem = i < pageRightItems.length ? pageRightItems[i] : null;

                for (let c = 0; c < rangeWidth; c++) {
                    let originalCellValue = '';
                    if (originalRowIndex < values.length) {
                        originalCellValue = String(values[originalRowIndex][c] || '');
                    }
                    const isWritable = originalCellValue.trim() === '' || 
                                       originalCellValue.includes('{{') || 
                                       originalCellValue.toLowerCase().includes('product');

                    if (!isWritable) continue;

                    const cellTemplate = String(templateRowValues[c] || '');
                    const cleanTemplate = cleanTag(cellTemplate);
                    
                    let activeItem = null;
                    if (colRightIndex !== -1 && c >= colRightIndex) {
                        activeItem = rightItem;
                    } else if (colLeftIndex !== -1 && c >= colLeftIndex) {
                         activeItem = leftItem;
                    }
                    
                    let cellVal = null;
                    if (activeItem) {
                         if (cleanTemplate.includes('products_until:') || cleanTemplate.includes('product_until:') || cleanTemplate.includes('{{products_left}}') ||
                             cleanTemplate.includes('products_after:') || cleanTemplate.includes('product_after:') || cleanTemplate.includes('{{products_right}}')) {
                            cellVal = activeItem.name;
                         } else if (cellTemplate.includes('{{stock}}')) {
                             cellVal = `${activeItem.stock}/${activeItem.originalStock || 0}`;
                         } else if (cellTemplate.includes('{{picked}}')) {
                             cellVal = activeItem.picked || '';
                         } else if (cellTemplate.includes('{{original}}')) {
                             cellVal = activeItem.original || '';
                         } else if (cellTemplate.includes('{{returns}}')) {
                             cellVal = activeItem.returns || '';
                         } else if (cellTemplate.includes('{{sold}}')) {
                             cellVal = activeItem.sold || '';
                         } else if (cellTemplate.includes('{{price}}')) {
                             const p = parseFloat(activeItem.price);
                             cellVal = isNaN(p) ? (activeItem.price || '') : String(p);
                         } else if (cellTemplate.includes('{{subtotal}}')) {
                             cellVal = typeof activeItem.subtotal === 'number' ? activeItem.subtotal.toLocaleString() : (activeItem.subtotal || '');
                         }
                    } else {
                        if (cleanTemplate.includes('products_until:') || cleanTemplate.includes('product_until:') || 
                            cleanTemplate.includes('products_after:') || cleanTemplate.includes('product_after:') ||
                            cleanTemplate.includes('{{products_left}}') || cleanTemplate.includes('{{products_right}}') ||
                            cleanTemplate.includes('{{stock}}') || cleanTemplate.includes('{{picked}}') ||
                            cleanTemplate.includes('{{original}}') || cleanTemplate.includes('{{returns}}') ||
                            cleanTemplate.includes('{{sold}}') || cleanTemplate.includes('{{price}}') ||
                            cleanTemplate.includes('{{subtotal}}')) {
                            cellVal = '';
                        }
                    }
                    
                    if (cellVal !== null) {
                        targetValues[i][c] = cellVal;
                        hasChanges = true;
                        if (cleanTemplate.includes('{{price}}')) {
                            targetFormats[i][c] = '0.##';
                            hasFormatChanges = true;
                        }
                    }
                }
            }

            if (hasChanges) targetBlockRange.setValues(targetValues);
            if (hasFormatChanges) targetBlockRange.setNumberFormats(targetFormats);
        }

        // --- Global Replacement for this specific Page Sheet ---
        const finalRange = pageSheet.getDataRange();
        const finalValues = finalRange.getValues();
        let globalChanged = false;
        
        for(let r=0; r<finalValues.length; r++) {
          for(let c=0; c<finalValues[r].length; c++) {
            let val = String(finalValues[r][c]);
            if (!val.includes('{{')) continue;
            
            let changed = false;
            Object.keys(replacements).forEach(tag => {
               if (val.includes(tag)) {
                 val = val.replace(new RegExp(tag, 'g'), replacements[tag]);
                 changed = true;
               }
            });
            if (changed) {
               finalValues[r][c] = val;
               globalChanged = true;
            }
          }
        }
        if (globalChanged) finalRange.setValues(finalValues);

        pageNum++;
        if (pageNum >= 10) break; // 最多保護 10 頁
    } while (leftProducts.length > 0 || rightProducts.length > 0);

    SpreadsheetApp.flush(); 

    // 3. Export to PDF (隱藏原有 Sheets，只保留新產生的 Page Sheets 以便轉成一份多頁 PDF)
    for (const s of originallyVisibleSheets) {
        try { s.hideSheet(); } catch(ex) {}
    }

    const ssId = ss.getId();
    // 不傳 gid 參數，Google 會自動把目前可見的所有 sheets (也就是我們的 createdPageSheets) 依序輸出到一份 PDF
    const url = 'https://docs.google.com/spreadsheets/d/' + ssId + '/export?' +
      'exportFormat=pdf&format=pdf' +
      '&size=7' + // A4
      '&portrait=true' + 
      '&fitw=true' + // Fit to width
      '&gridlines=false' + 
      '&top_margin=0.186' + 
      '&bottom_margin=0.5' + 
      '&left_margin=0.169' + 
      '&right_margin=0.169';

    const params = {
      method: 'GET',
      headers: { 'Authorization': 'Bearer ' + ScriptApp.getOAuthToken() },
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(url, params);
    if (response.getResponseCode() !== 200) {
       throw new Error('PDF Generation Failed: ' + response.getContentText());
    }

    const blob = response.getBlob();
    const base64 = Utilities.base64Encode(blob.getBytes());

    return { 
      success: true, 
      pdfBase64: base64, 
      filename: `Sales_Print_${new Date().toISOString()}.pdf` 
    };

  } catch (e) {
    throw new Error('PDF Error: ' + e.message);
  } finally {
    // 確保無論成功或失敗，都把原本的工作表恢復顯示，並刪除這次產生的多頁臨時工作表
    for (const s of originallyVisibleSheets) {
        try { s.showSheet(); } catch(ex) {}
    }
    for (const ps of createdPageSheets) {
        try { ss.deleteSheet(ps); } catch(ex) {}
    }
  }
}
