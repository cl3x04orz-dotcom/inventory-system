/**
 * Sales_AI.gs
 * AI 智慧補貨建議核心邏輯 (含 5:3:2 趨勢加權與庫存感知)
 */

/**
 * 全域設定：領貨進位門檻 (Threshold)
 * 當需求量 >= 此數值時，自動進位到整箱 (packSize)
 * 當需求量 < 此數值時，維持精準領貨量 (不進位)
 */
const PICK_ROUND_THRESHOLD = 5;

/**
 * AI 智慧補貨建議核心邏輯 執行加權計算與庫存截切
 */
function getSmartPickSuggestionService(customer, dayOfWeek, weather, currentOriginals) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const salesSheet = ss.getSheetByName('Sales');
  const detailsSheet = ss.getSheetByName('SalesDetails');
  const invSheet = ss.getSheetByName('Inventory');
  if (!salesSheet || !detailsSheet) return { success: false, error: "Sheet not found" };

  const salesValues = salesSheet.getDataRange().getValues();
  const detailsValues = detailsSheet.getDataRange().getValues();
  
  // 1. 讀取倉庫庫存地圖 (僅計算 STOCK 與 VOID_REFUND)
  const warehouseStockMap = {};
  if (invSheet) {
    const invData = invSheet.getDataRange().getValues();
    const h = invData[0].map(v => String(v || '').trim().toLowerCase());
    
    let pidIdx = h.indexOf('productid');
    if (pidIdx === -1) pidIdx = h.findIndex(v => v.includes('產品id') || v.includes('商品id'));
    if (pidIdx === -1) pidIdx = 1; 

    let qtyIdx = h.indexOf('quantity');
    if (qtyIdx === -1) qtyIdx = h.findIndex(v => v.includes('數量') || v.includes('庫存量'));
    if (qtyIdx === -1) qtyIdx = 2; 
    
    let typeIdx = h.indexOf('type');
    if (typeIdx === -1) typeIdx = h.findIndex(v => v.includes('類') || v.includes('型'));
    if (typeIdx === -1) typeIdx = 5;

    for (let i = 1; i < invData.length; i++) {
        const pid = String(invData[i][pidIdx] || "").trim();
        const qty = Number(invData[i][qtyIdx]) || 0;
        const type = String(invData[i][typeIdx] || "").trim().toUpperCase();
        
        if (pid && (type === 'STOCK' || type === 'VOID_REFUND')) {
            warehouseStockMap[pid] = (warehouseStockMap[pid] || 0) + qty;
        }
    }
  }
  
  const IDX_ID = 0;
  const IDX_DATE = 1;
  const IDX_CUST = 6;
  const IDX_WEATHER = 15; 

  const targetCustomer = (customer || "").trim().toLowerCase();
  
  const tier1Ids = []; 
  const tier2Ids = []; 
  
  for (let i = salesValues.length - 1; i >= 1; i--) {
    const row = salesValues[i];
    const sId = String(row[IDX_ID] || "").trim();
    const rowCust = String(row[IDX_CUST] || "").trim().toLowerCase();
    const rowStatus = String(row[9] || "").toUpperCase();
    if (rowStatus === 'VOID') continue;
    
    if (rowCust === targetCustomer) {
      const rowDate = new Date(row[IDX_DATE]);
      if (rowDate.getDay() === dayOfWeek) {
        tier2Ids.push(sId);
        const rowWeather = String(row[IDX_WEATHER] || "SUNNY").toUpperCase();
        if (rowWeather === weather.toUpperCase()) {
          tier1Ids.push(sId);
        }
      }
    }
  }

  const finalSampleIds = tier1Ids.length >= 3 ? tier1Ids.slice(0, 3) : tier2Ids.slice(0, 3);
  const fallbackLevel = tier1Ids.length >= 3 ? "EXACT" : (tier2Ids.length > 0 ? "DOW_ONLY" : "NO_DATA");

  if (finalSampleIds.length === 0) {
    return { success: true, suggestions: {}, fallbackLevel: "NO_DATA", message: "此星期尚無歷史數據可供分析" };
  }

  const salesStatsMap = {}; 
  const sampleIdSet = new Set(finalSampleIds);
  
  for (let j = 1; j < detailsValues.length; j++) {
    const dSaleId = String(detailsValues[j][0] || "").trim();
    if (sampleIdSet.has(dSaleId)) {
      const pId = String(detailsValues[j][1] || "").trim();
      const sold = Number(detailsValues[j][5] || 0); 
      if (!salesStatsMap[pId]) salesStatsMap[pId] = {};
      salesStatsMap[pId][dSaleId] = sold;
    }
  }

  const suggestions = {};
  const productMap = getProductMap_(); 
  let hasStockShortage = false;

  const weightsConfig = {
    1: [1.0],
    2: [0.6, 0.4],
    3: [0.5, 0.3, 0.2]
  };

  for (const pId in salesStatsMap) {
    const pEntry = productMap[pId];
    const pName = pEntry ? pEntry.name : pId;
    const itemSalesGrid = salesStatsMap[pId];
    
    const actualValues = finalSampleIds.map(id => itemSalesGrid[id] || 0);
    const count = actualValues.length;
    const activeWeights = weightsConfig[count] || [1 / count];
    
    let weightedAvg = 0;
    for (let i = 0; i < count; i++) {
        weightedAvg += actualValues[i] * activeWeights[i];
    }
    
    // 從產品主檔讀取包裝規格、階梯與門檻 (預設為 1 與 5)
    let packSize = (pEntry && pEntry.packSize) ? pEntry.packSize : 1;
    let dispatchSteps = pEntry ? pEntry.dispatchSteps : [];
    let currentThreshold = (pEntry && pEntry.roundThreshold) ? pEntry.roundThreshold : PICK_ROUND_THRESHOLD;

    let target = Math.ceil(weightedAvg * 1.1); 
    
    // 如果有定義發貨階梯，則使用階梯對齊；否則使用 packSize 倍數對齊 (套用各產品門檻)
    if (dispatchSteps && dispatchSteps.length > 0) {
      target = snapToDispatchSteps_(target, dispatchSteps);
    } else {
      if (target >= currentThreshold) {
        target = Math.ceil(target / packSize) * packSize;
      } else {
        target = Math.ceil(target); // 低於門檻，領精準值
      }
    }
    
    const onTruck = Number(currentOriginals[pId] || 0);
    let needToPick = Math.max(0, target - onTruck);

    if (needToPick > 0) {
      if (dispatchSteps && dispatchSteps.length > 0) {
        needToPick = snapToDispatchSteps_(needToPick, dispatchSteps);
      } else {
        // 領貨量的點位進位邏輯也同步
        if (needToPick >= currentThreshold) {
          needToPick = Math.ceil(needToPick / packSize) * packSize;
        } else {
          needToPick = Math.ceil(needToPick);
        }
      }
      
      const currentWarehouseQty = warehouseStockMap[pId] || 0;
      if (needToPick > currentWarehouseQty) {
          needToPick = currentWarehouseQty;
          hasStockShortage = true;
      }

      if (needToPick > 0) {
        suggestions[pId] = needToPick;
      }
    }
  }

  const messageMap = {
    "EXACT": `已根據過去同一星期及相同天氣環境為您預估${hasStockShortage ? " (⚠️ 部分品項庫存不足)" : ""}。`,
    "DOW_ONLY": `天氣環境樣不足，已根據過去同一星期的平均銷售量為您預估${hasStockShortage ? " (⚠️ 部分品項庫存不足)" : ""}。`,
    "NO_DATA": `此星期尚無歷史數據可供分析。`
  };

  return {
    success: true,
    suggestions,
    fallbackLevel,
    message: messageMap[fallbackLevel]
  };
}

/**
 * 取得系統中所有不重複的客戶地點名稱 (供 AI 預測下拉選單使用)
 */
function getAllUniqueCustomersService() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const salesSheet = ss.getSheetByName('Sales');
  if (!salesSheet) return [];
  
  const values = salesSheet.getDataRange().getValues();
  const IDX_CUST = 6; 
  const customers = new Set();
  
  for (let i = 1; i < values.length; i++) {
    const cust = String(values[i][IDX_CUST] || "").trim();
    if (cust && cust !== "客戶/地點") customers.add(cust);
  }
  
  return Array.from(customers).sort();
}

/**
 * 輔助函式：將數值吸附到指定的發貨階梯 (支援循環累加)
 * @param {number} target 目標量
 * @param {number[]} steps 階梯數組 (如 [28, 42, 70])
 */
function snapToDispatchSteps_(target, steps) {
  if (!steps || steps.length === 0) return target;
  
  // 確保降序排列以便處理
  const sortedSteps = [...steps].sort((a, b) => a - b);
  const maxStep = sortedSteps[sortedSteps.length - 1];
  const minStep = sortedSteps[0];
  
  if (target <= 0) return 0;
  
  if (target <= maxStep) {
    // 尋找第一個大於等於 target 的階梯
    const matched = sortedSteps.find(s => s >= target);
    return matched || maxStep;
  } else {
    // 超過最大上限時，先填滿一個最大規格，剩下的循環找最小階梯
    // 基於使用者要求：超過 70 之後是在回到 28, 42
    return maxStep + snapToDispatchSteps_(target - maxStep, sortedSteps);
  }
}
