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

  // 1. Create Temp Sheet
  const tempSheet = templateSheet.copyTo(ss);
  const timestamp = new Date().getTime();
  tempSheet.setName("Temp_Print_" + timestamp);

  try {
    // 2. Write Basic Data (Headers/Footers)
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

    const range = tempSheet.getDataRange();
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
    if (templateRowIndex !== -1 && data.rows && data.rows.length > 0) {
        
        let leftProducts = [];
        let rightProducts = [];

        if (splitKey) {
            // 檢查是否為數字索引
            const splitIndex = parseInt(splitKey, 10);
            
            if (!isNaN(splitIndex)) {
                // 方案 1: 使用索引分割
                leftProducts = data.rows.slice(0, splitIndex);
                rightProducts = data.rows.slice(splitIndex);
            } else {
                // 備用方案: 使用名稱分割(嚴格匹配)
                const normKey = normalizeStr(splitKey).replace(/\s+/g, '');
                let didSplit = false;
                
                for (const p of data.rows) {
                    if (didSplit) {
                        rightProducts.push(p);
                    } else {
                        leftProducts.push(p);
                        const pName = normalizeStr(p.name).replace(/\s+/g, '');
                        if (pName === normKey) {  // 改用嚴格匹配
                            didSplit = true;
                        }
                    }
                }
            }
        } else {
             leftProducts = data.rows;
        }

        // --- Auto-Balance Fallback ---
        if (colLeftIndex !== -1 && colRightIndex !== -1 && rightProducts.length === 0 && leftProducts.length > 5) {
            const total = leftProducts.length;
            const mid = Math.ceil(total / 2);
            const secondHalf = leftProducts.splice(mid); 
            rightProducts = secondHalf;
        }

        // --- 直接填入,不做空間計算 ---
        const maxRows = Math.max(leftProducts.length, rightProducts.length);



        // Prepare Data Grid
        const templateRowValues = range.getValues()[templateRowIndex];
        // 直接逐行逐格寫入,不建立 outputGrid
        for (let i = 0; i < maxRows; i++) {
            const rowNum = templateRowIndex + 1 + i;
            const targetRowIndex = templateRowIndex + i; // 0-based for values array
            
            const leftItem = leftProducts[i] || null;
            const rightItem = rightProducts[i] || null;

            for (let c = 0; c < rangeWidth; c++) {
                // Check if target cell has existing content (Footer/Fixed)
                let originalCellValue = '';
                if (targetRowIndex < values.length) {
                    originalCellValue = String(values[targetRowIndex][c]);
                }
                
                const isWritable = originalCellValue.trim() === '' || 
                                   originalCellValue.includes('{{') || 
                                   originalCellValue.toLowerCase().includes('product');

                if (!isWritable) {
                    continue; // Skip writing, preserve footer content
                }

                const cellTemplate = String(templateRowValues[c] || '');
                const cleanTemplate = cleanTag(cellTemplate);
                
                let activeItem = null;
                if (colRightIndex !== -1 && c >= colRightIndex) {
                    activeItem = rightItem;
                } else if (colLeftIndex !== -1 && c >= colLeftIndex) {
                     activeItem = leftItem;
                }
                
                let cellVal = null; // null 表示不寫入
                
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
                    // Empty slot logic: 清空產品相關標記
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
                
                // 只寫入有值的欄位
                if (cellVal !== null) {
                    const cell = tempSheet.getRange(rowNum, c + 1);
                    cell.setValue(cellVal);
                    // [Fix] 強制覆蓋單價欄位的數字格式，避免模板預設的 0.00
                    // 設定為 0.## (最多兩位小數，整數不顯示小數點)
                    if (cleanTemplate.includes('{{price}}')) {
                        cell.setNumberFormat('0.##'); 
                    }
                }
            }
        }
    }

    // --- Global Replacement ---
    SpreadsheetApp.flush();
    const finalRange = tempSheet.getDataRange();
    const finalValues = finalRange.getValues();
    
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
           tempSheet.getRange(r+1, c+1).setValue(val);
        }
      }
    }

    SpreadsheetApp.flush(); 

    // 3. Export to PDF
    const ssId = ss.getId();
    const sheetId = tempSheet.getSheetId();
    // Export URL Construction
    // Margins converted to inches: 
    // Top 0.473cm ~ 0.186in
    // Left/Right 0.43cm ~ 0.169in
    // Bottom 1.524cm ~ 0.600in
    const url = 'https://docs.google.com/spreadsheets/d/' + ssId + '/export?' +
      'exportFormat=pdf&format=pdf' +
      '&size=7' + // A4
      '&portrait=true' + 
      '&fitw=true' + // Fit to width
      '&gridlines=false' + 
      '&top_margin=0.186' + 
      '&bottom_margin=0.5' + 
      '&left_margin=0.169' + 
      '&right_margin=0.169' +
      '&gid=' + sheetId;

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

    ss.deleteSheet(tempSheet);

    return { 
      success: true, 
      pdfBase64: base64, 
      filename: `Sales_Print_${new Date().toISOString()}.pdf` 
    };

  } catch (e) {
    try { ss.deleteSheet(tempSheet); } catch(ex) {}
    throw new Error('PDF Error: ' + e.message);
  }
}
