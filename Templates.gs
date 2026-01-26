/**
 * Templates.gs
 * 動態模板系統後端服務
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
 * @param {Object} payload { templateId, data: { ... } }
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
    // 2. Write Data
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

    // A. Scalar Replacement (Search & Replace text in the whole sheet)
    // This is inefficient for large sheets but fine for print templates
    const range = tempSheet.getDataRange();
    const values = range.getValues();
    const rangeHeight = values.length;
    const rangeWidth = values[0].length;
    
    // Determine Product Row (Strategy: Find '{{product_name}}')
    let productRowIndex = -1;
    for(let r=0; r<rangeHeight; r++) {
      for(let c=0; c<rangeWidth; c++) {
        if(String(values[r][c]).includes('{{product_name}}')) {
          productRowIndex = r;
          break;
        }
      }
      if(productRowIndex !== -1) break;
    }

    // B. Fill Product Rows
    if (productRowIndex !== -1 && data.rows && data.rows.length > 0) {
      const productList = data.rows;
      // If we need more rows than available in the "template zone" (assuming 1 row template), insert them
      // But usually templates have empty rows. Let's simplify: 
      // We will overwrite the template row and subsequent rows. 
      // If list > distinct empty rows, we might need insert.
      // For Safety: We INSERT rows after the template row to match data length - 1
      
      if (productList.length > 1) {
        tempSheet.insertRowsAfter(productRowIndex + 1, productList.length - 1);
      }

      // Prepare 2D array for write
      // We need to know which column maps to which field. 
      // Reuse the "Strategy" logic or just hardcoded mapping if known? 
      // Since it's generic, we scan the template row again to match columns.
      const templateRow = values[productRowIndex];
      const outputGrid = [];

      productList.forEach(prod => {
        const rowData = [];
        for (let c = 0; c < rangeWidth; c++) {
          const cellVal = String(templateRow[c] || '');
          let newVal = cellVal;
          
          if (cellVal.includes('{{')) {
             newVal = newVal
              .replace(/\{\{product_name\}\}/g, prod.name || '')
              .replace(/\{\{products_left\}\}/g, prod.name || '') // Legacy support
              .replace(/\{\{products_right\}\}/g, prod.name || '') // Legacy support
              .replace(/\{\{stock\}\}/g, `${prod.stock}/${prod.originalStock || 0}`)
              .replace(/\{\{picked\}\}/g, prod.picked || '')
              .replace(/\{\{original\}\}/g, prod.original || '')
              .replace(/\{\{returns\}\}/g, prod.returns || '')
              .replace(/\{\{sold\}\}/g, prod.sold || '')
              .replace(/\{\{price\}\}/g, prod.price || '')
              .replace(/\{\{subtotal\}\}/g, typeof prod.subtotal === 'number' ? prod.subtotal.toLocaleString() : (prod.subtotal || ''));
          } else if (productRowIndex > 0) {
             // Copy styles/formulas from previous row if needed? 
             // For now, simpler to just assume empty cells stay empty
          }
          rowData.push(newVal);
        }
        outputGrid.push(rowData);
      });

      // Write Products
      if (outputGrid.length > 0) {
        tempSheet.getRange(productRowIndex + 1, 1, outputGrid.length, outputGrid[0].length).setValues(outputGrid);
      }
      
      // Clear the "original" template tags if we inserted rows? 
      // Actually we overwrote the first raw and inserted others. 
      // BUT `insertRowsAfter` copies the formatting of the previous row (the template row), which is good.
    } else if (productRowIndex !== -1) {
        // No products? Clear the template row tags
        tempSheet.getRange(productRowIndex + 1, 1, 1, rangeWidth).clearContent();
    }
    
    // C. Replace Global Tags (Headers/Footers)
    // We do this AFTER product insertion because products pushed rows down
    // Re-fetch data range as it might have changed size
    const finalRange = tempSheet.getDataRange();
    const textFinder = finalRange.createTextFinder('{{');
    textFinder.useRegularExpression(false);
    // Note: createTextFinder is globally fast but simple replace logic in GAS is tricky for partial matches.
    // Let's do a simple getValues traverse for remaining tags.
    const finalValues = finalRange.getValues();
    const finalUpdates = [];
    
    for(let r=0; r<finalValues.length; r++) {
      for(let c=0; c<finalValues[r].length; c++) {
        let val = String(finalValues[r][c]);
        let changed = false;
        Object.keys(replacements).forEach(tag => {
           if (val.includes(tag)) {
             val = val.replace(new RegExp(tag, 'g'), replacements[tag]);
             changed = true;
           }
        });
        if (changed) {
           // batch update not easy here, just set immediately or track
           tempSheet.getRange(r+1, c+1).setValue(val);
        }
      }
    }

    SpreadsheetApp.flush(); // Commit all changes

    // 3. Export to PDF
    const ssId = ss.getId();
    const sheetId = tempSheet.getSheetId();
    
    // Export URL Construction
    const url = 'https://docs.google.com/spreadsheets/d/' + ssId + '/export?' +
      'exportFormat=pdf&format=pdf' +
      '&size=7' + // A4
      '&portrait=true' +
      '&fitw=true' + // Fit to width
      '&gridlines=false' + 
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

    // 4. Cleanup
    ss.deleteSheet(tempSheet);

    return { 
      success: true, 
      pdfBase64: base64, 
      filename: `Sales_Print_${new Date().toISOString()}.pdf` 
    };

  } catch (e) {
    // Cleanup on error
    try { ss.deleteSheet(tempSheet); } catch(ex) {}
    throw new Error('PDF Error: ' + e.message);
  }
}
