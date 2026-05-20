/**
 * LineReplenishment.gs
 * LINE 智慧補貨系統 (多群組分流、趨勢加權、實收驗收)
 */

// 請在此設定你的 LINE Channel Access Token
const LINE_ACCESS_TOKEN = "VC6tkew0F+h0uXg7XRdjqbajXwKvbXLRK4VzXEAdWhwd6m/b9BsNJLoKgr9aXBlgbvZI+C/+Sz6ER6y8h2gDij4+YO8b4heIFzOupzwGJf/ZV8gAqHoaCGoNArQuN6+YdxqPjIIatQjUYC5P1+UCNQdB04t89/1O/w1cDnyilFU=";

// 🌟 常規叫貨白名單：只有這些商品會被預測並推播到 LINE 群組
const AUTO_ORDER_WHITELIST = [
  "商品A",
  "商品B",
  "商品C"
];

/**
 * 核心邏輯：計算智慧補貨量 (動態趨勢 + 庫存感知)
 */
function calculateSmartReplenishmentSuggestions(productVendorMap = {}, vendorConfigs = {}) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const salesSheet = ss.getSheetByName('Sales');
  const detailsSheet = ss.getSheetByName('SalesDetails');
  const invSheet = ss.getSheetByName('Inventory');
  const prodSheet = ss.getSheetByName('Products');
  
  if (!salesSheet || !detailsSheet || !invSheet || !prodSheet) {
    throw new Error("資料庫表單結構不完整，無法計算。");
  }

  // 取得台灣時間今天的 00:00:00 (排除今天不完整的資料，避免邊界重複計算)
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  
  const oneDayMs = 24 * 60 * 60 * 1000;
  
  // 精準對齊完整曆日 (W1: 過去 1~7 天, W2: 過去 8~14 天, W3: 過去 15~21 天)
  const w1Start = new Date(startOfToday.getTime() - 7 * oneDayMs);
  const w1End = startOfToday; // 不包含今日
  
  const w2Start = new Date(startOfToday.getTime() - 14 * oneDayMs);
  const w2End = w1Start;
  
  const w3Start = new Date(startOfToday.getTime() - 21 * oneDayMs);
  const w3End = w2Start;

  // 1. 篩選出各區間未作廢的 Sales ID 與對應的星期
  const salesRows = salesSheet.getDataRange().getValues().slice(1);
  const w1SalesIds = new Set();
  const w2SalesIds = new Set();
  const w3SalesIds = new Set();
  const saleWeekdayMap = {}; // { saleId: 星期 (0~6) }

  salesRows.forEach(row => {
    const saleId = String(row[0]).trim();
    const date = new Date(row[1]);
    const status = String(row[9]).toUpperCase();
    
    if (status !== 'VOID' && saleId) {
      saleWeekdayMap[saleId] = date.getDay(); // 0(日) ~ 6(六)
      
      if (date >= w1Start && date < w1End) {
        w1SalesIds.add(saleId);
      } else if (date >= w2Start && date < w2End) {
        w2SalesIds.add(saleId);
      } else if (date >= w3Start && date < w3End) {
        w3SalesIds.add(saleId);
      }
    }
  });

  // 2. 統計這三週內各商品的實際銷量 (依據星期細分)
  const detailsRows = detailsSheet.getDataRange().getValues().slice(1);
  const w1SalesMap = {}; // { productId: { 0: qty, 1: qty ... } }
  const w2SalesMap = {};
  const w3SalesMap = {};

  detailsRows.forEach(row => {
    const saleId = String(row[0]).trim();
    const productId = String(row[1]).trim();
    const soldQty = Number(row[5]) || 0; // 第6欄為 sold 數量
    const weekday = saleWeekdayMap[saleId];
    
    if (weekday === undefined) return;

    if (w1SalesIds.has(saleId)) {
      if (!w1SalesMap[productId]) w1SalesMap[productId] = {};
      w1SalesMap[productId][weekday] = (w1SalesMap[productId][weekday] || 0) + soldQty;
    } else if (w2SalesIds.has(saleId)) {
      if (!w2SalesMap[productId]) w2SalesMap[productId] = {};
      w2SalesMap[productId][weekday] = (w2SalesMap[productId][weekday] || 0) + soldQty;
    } else if (w3SalesIds.has(saleId)) {
      if (!w3SalesMap[productId]) w3SalesMap[productId] = {};
      w3SalesMap[productId][weekday] = (w3SalesMap[productId][weekday] || 0) + soldQty;
    }
  });

  // 3. 讀取當前「現有可用庫存」 (僅加總 STOCK 與 VOID_REFUND)
  const invRows = invSheet.getDataRange().getValues().slice(1);
  const currentStockMap = {}; // { productId: qty }
  
  invRows.forEach(row => {
    const productId = String(row[1]).trim();
    const qty = Number(row[2]) || 0;
    const type = String(row[5]).toUpperCase();
    
    if (productId && (type === 'STOCK' || type === 'VOID_REFUND')) {
      currentStockMap[productId] = (currentStockMap[productId] || 0) + qty;
    }
  });

  // 3b. 加上「在途庫存」 (Purchases 表中 status === 'ORDERED' 標記為在途、尚未驗收的進貨量)
  const purSheet = ss.getSheetByName('Purchases');
  if (purSheet) {
    const purRows = purSheet.getDataRange().getValues().slice(1);
    purRows.forEach(row => {
      const productId = String(row[3]).trim();
      const qty = Number(row[4]) || 0;
      const status = String(row[9]).trim().toUpperCase();
      if (productId && status === 'ORDERED') {
        currentStockMap[productId] = (currentStockMap[productId] || 0) + qty;
      }
    });
  }

  // 4. 開始對比產品主檔，計算下週訂貨建議
  const allProdData = prodSheet.getDataRange().getValues();
  const prodHeaders = allProdData[0].map(h => String(h || '').trim().toLowerCase());
  const prodRows = allProdData.slice(1);
  const suggestions = [];

  // 自動尋找試算表中的「自動叫貨」、「自動補貨」或「LINE補貨」等列欄位
  const autoOrderIdx = prodHeaders.findIndex(h => 
    h.includes('自動叫貨') || h.includes('自動補貨') || h.includes('line補貨') || h.includes('line智慧補貨') || h.includes('autoorder')
  );
  // 自動尋找「訂貨箱規」與「最低起訂量」欄位
  const orderPackSizeIdx = prodHeaders.findIndex(h => h.includes('訂貨箱規') || h.includes('叫貨箱規'));
  const minOrderQtyIdx = prodHeaders.findIndex(h => h.includes('最低起訂') || h.includes('起訂量'));
  const splitFlavorsIdx = prodHeaders.findIndex(h => h.includes('拆分口味') || h.includes('口味拆分') || h.includes('口味'));

  prodRows.forEach(row => {
    const productId = String(row[0]).trim();
    const productName = String(row[1]).trim();
    
    // 🌟 關鍵動態過濾：
    // 1. 如果 Products 表中有設定自動叫貨欄位，以該欄位的打勾狀態 (TRUE) 或填寫 Y/是 為準
    // 2. 如果沒有該欄位，則退回使用 LineReplenishment.gs 最上方的硬編碼白名單
    let isWhitelisted = false;
    if (autoOrderIdx !== -1) {
      const autoOrderVal = String(row[autoOrderIdx] || '').trim().toUpperCase();
      isWhitelisted = (autoOrderVal === 'TRUE' || autoOrderVal === 'Y' || autoOrderVal === '是' || autoOrderVal === '1');
    } else {
      isWhitelisted = (AUTO_ORDER_WHITELIST.length === 0 || AUTO_ORDER_WHITELIST.indexOf(productName) !== -1);
    }

    if (!isWhitelisted) {
      return; 
    }
    
    const price = Number(row[3]) || 0;
    const safeLevel = Number(row[5]) || 0; // 安全存量
    
    // 優先使用「訂貨箱規」，若未設定則退回使用物理「配貨箱規 (row[8])」
    const packSize = (orderPackSizeIdx !== -1 && row[orderPackSizeIdx] !== '') ? Number(row[orderPackSizeIdx]) : (Number(row[8]) || 1);
    
    const stepsStr = String(row[9] || '').trim(); // 發貨階梯
    const dispatchSteps = stepsStr ? stepsStr.split(',').map(Number) : [];
    const threshold = typeof row[10] !== 'undefined' ? Number(row[10]) : 99; // 進位門檻
    const minOrderQty = (minOrderQtyIdx !== -1 && row[minOrderQtyIdx] !== '') ? Number(row[minOrderQtyIdx]) : 0; // 最低起訂量
    const splitFlavorsStr = (splitFlavorsIdx !== -1 && row[splitFlavorsIdx] !== '') ? String(row[splitFlavorsIdx]).trim() : '';
    const flavors = splitFlavorsStr ? splitFlavorsStr.split(',').map(f => f.trim()).filter(Boolean) : [];

    // 動態計算叫貨覆蓋天數與目標覆蓋星期
    const vendor = productVendorMap[productId] || "未指定廠商";
    const config = vendorConfigs[vendor] || {};
    
    // 找出這單要覆蓋的「未來特定星期」(精確傳入叫貨星期與到貨星期)
    const targetWeekdays = getTargetWeekdays_(config.orderDays, config.deliveryDays);

    // 從歷史資料中，精準提取「相對應星期」的總銷量
    let q1 = 0, q2 = 0, q3 = 0;
    const pW1 = w1SalesMap[productId] || {};
    const pW2 = w2SalesMap[productId] || {};
    const pW3 = w3SalesMap[productId] || {};
    
    targetWeekdays.forEach(w => {
      q1 += (pW1[w] || 0);
      q2 += (pW2[w] || 0);
      q3 += (pW3[w] || 0);
    });

    // 直接針對特定星期進行 5:3:2 趨勢加權預估銷量 (完美捕捉平日與假日波動)
    let forecastDemand = 0;
    if (q1 > 0 || q2 > 0 || q3 > 0) {
      forecastDemand = (q1 * 0.5) + (q2 * 0.3) + (q3 * 0.2);
    }
    
    forecastDemand = Math.ceil(forecastDemand * 1.1); // 多給 10% 安全緩衝

    // 取得當前現有庫存
    const currentStock = currentStockMap[productId] || 0;

    // 核心計算：下週缺口 = (預估銷量 + 安全存量) - 當前庫存
    let netNeed = (forecastDemand + safeLevel) - currentStock;

    if (netNeed > 0) {
      // 確保大於最低起訂量
      if (netNeed < minOrderQty) {
        netNeed = minOrderQty;
      }
      
      // 廠商採購專用的【嚴格整箱向上進位】邏輯（忽略門市配貨階梯）
      netNeed = Math.ceil(netNeed / packSize) * packSize;

       if (netNeed > 0) {
        if (flavors.length > 0) {
          // 均分量並對齊各口味的箱規
          const qtyPerFlavor = Math.ceil((netNeed / flavors.length) / packSize) * packSize;
          if (qtyPerFlavor > 0) {
            flavors.forEach(flavor => {
              suggestions.push({
                productId: productId + "_" + flavor,
                productName: `${productName} (${flavor})`,
                quantity: qtyPerFlavor,
                price: price,
                forecast: Math.ceil(forecastDemand / flavors.length),
                currentStock: Math.ceil(currentStock / flavors.length),
                packSize: packSize
              });
            });
          }
        } else {
          suggestions.push({
            productId: productId,
            productName: productName,
            quantity: netNeed,
            price: price,
            forecast: forecastDemand,
            currentStock: currentStock,
            packSize: packSize
          });
        }
      }
    }
  });

  return suggestions;
}

/**
 * 將 LINE 群組綁定到特定廠商 (從 Webhook 呼叫)
 */
function bindGroupToVendor_(groupId, vendorName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('Vendors');
  if (!sheet) {
    sheet = ss.insertSheet('Vendors');
    sheet.appendRow(['廠商名稱', '預設支付方式', 'LINE群組ID']);
  }
  
  const data = sheet.getDataRange().getValues();
  let found = false;
  
  // 檢查是否原本只有兩欄，擴充標題
  if (data[0].length < 3) {
      sheet.getRange(1, 3).setValue('LINE群組ID');
  }
  
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === vendorName) {
      sheet.getRange(i + 1, 3).setValue(groupId); // 寫入第三欄
      found = true;
      break;
    }
  }
  
  if (!found) {
    sheet.appendRow([vendorName, "CASH", groupId]);
  }
  
  return { success: true, message: `✅ 成功！此群組已與【${vendorName}】完成綁定。` };
}

/**
 * 撈取商品最新一次進貨的廠商對照表
 */
function getLatestProductVendorMap_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const purSheet = ss.getSheetByName('Purchases');
  const map = {};
  if (!purSheet) return map;
  
  const data = purSheet.getDataRange().getValues().slice(1);
  data.forEach(row => {
    const vendor = String(row[2]).trim();
    const productId = String(row[3]).trim();
    const status = String(row[9]).toUpperCase();
    if (productId && vendor && status !== 'VOID') {
      map[productId] = vendor;
    }
  });
  return map;
}

/**
 * 讀取廠商設定 (LINE 群組 ID 與 叫貨星期)
 */
function getVendorConfigs_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Vendors');
  const map = {};
  if (!sheet) return map;
  
  const data = sheet.getDataRange().getValues();
  const headers = data[0] ? data[0].map(h => String(h || '').trim()) : [];
  const orderDayIdx = headers.findIndex(h => h.includes('叫貨星期') || h.includes('叫貨日') || h === '星期' || h === '排程');
  const deliveryDayIdx = headers.findIndex(h => h.includes('到貨星期') || h.includes('到貨日'));
  
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const vendor = String(row[0]).trim();
    const groupId = String(row[2]).trim(); // 第三欄是 LINE 群組 ID
    const orderDays = orderDayIdx !== -1 ? String(row[orderDayIdx]).trim() : '';
    const deliveryDays = deliveryDayIdx !== -1 ? String(row[deliveryDayIdx]).trim() : '';
    
    if (vendor && groupId) {
      map[vendor] = {
        groupId: groupId,
        orderDays: orderDays,
        deliveryDays: deliveryDays
      };
    }
  }
  return map;
}

/**
 * 判斷今天 (台灣時區) 是否為該廠商的叫貨日
 * @param {string} daysStr - 試算表上的字串，例如 "一,三,五", "1,3,5", "二五"
 */
function isTodayVendorOrderDay_(daysStr) {
  if (!daysStr || String(daysStr).trim() === '') return false; // 如果空白未設定，預設為不發送
  
  // 取得台灣時區的今天星期幾 (1=星期一, ..., 7=星期日)
  const dateStr = Utilities.formatDate(new Date(), "Asia/Taipei", "u"); 
  const todayDay = parseInt(dateStr, 10); 
  
  const str = String(daysStr).replace(/\s+/g, ''); // 移除所有空白
  
  const dayMap = {
    '一': 1, '1': 1,
    '二': 2, '2': 2,
    '三': 3, '3': 3,
    '四': 4, '4': 4,
    '五': 5, '5': 5,
    '六': 6, '6': 6,
    '日': 7, '天': 7, '7': 7, '0': 7
  };

  for (let char of str) {
    if (dayMap[char] === todayDay) {
      return true;
    }
  }
  
  return false;
}

/**
 * 將試算表填寫的字串轉換為數字陣列
 */
function parseDaysString_(daysStr) {
  if (!daysStr) return [];
  const str = String(daysStr).replace(/\s+/g, '');
  const dayMap = {
    '一': 1, '1': 1, '二': 2, '2': 2, '三': 3, '3': 3, '四': 4, '4': 4,
    '五': 5, '5': 5, '六': 6, '6': 6, '日': 7, '天': 7, '7': 7, '0': 7
  };
  const list = [];
  for (let char of str) {
    if (dayMap[char] !== undefined) {
      list.push(dayMap[char]);
    }
  }
  return list;
}

/**
 * 取得這批貨到貨後的「未來特定星期陣列」(精確考量到貨天數與間隔)
 */
function getTargetWeekdays_(orderDaysStr, deliveryDaysStr, fakeTodayJsDay) {
  let jsDay;
  if (typeof fakeTodayJsDay === 'number') {
    jsDay = fakeTodayJsDay;
  } else {
    const dateStr = Utilities.formatDate(new Date(), "Asia/Taipei", "u"); 
    const currentDay = parseInt(dateStr, 10); 
    jsDay = currentDay === 7 ? 0 : currentDay;
  }
  
  const orderDays = parseDaysString_(orderDaysStr);
  let deliveryDays = parseDaysString_(deliveryDaysStr);
  
  // 如果沒有設定叫貨日，預設覆蓋未來 7 天
  if (orderDays.length === 0) {
    return [0,1,2,3,4,5,6];
  }
  
  // 如果到貨日未設定或長度不對，預設為叫貨日的「隔天」
  if (deliveryDays.length !== orderDays.length) {
    deliveryDays = orderDays.map(d => (d + 1) % 7);
  }
  
  // 找出今天對應的陣列索引
  let idx = orderDays.indexOf(jsDay);
  if (idx === -1) {
    return [0,1,2,3,4,5,6]; // 防呆退回 7 天
  }
  
  const currentDeliveryDay = deliveryDays[idx];
  const nextDeliveryDay = deliveryDays[(idx + 1) % deliveryDays.length];
  
  // 1. 計算前置期天數 (Lead Time): 從叫貨日隔天開始，到到貨日當天
  let leadTime = (currentDeliveryDay - jsDay + 7) % 7;
  if (leadTime === 0) leadTime = 7;
  
  const leadWeekdays = [];
  for (let i = 0; i < leadTime; i++) {
    leadWeekdays.push((jsDay + 1 + i) % 7);
  }
  
  // 2. 計算覆蓋銷售期天數 (Selling Period): 從本次到貨日隔天開始，到下次到貨日當天
  let L = (nextDeliveryDay - currentDeliveryDay + 7) % 7;
  if (L === 0) L = 7; // 每週只叫一次貨，覆蓋 7 天
  
  const sellingWeekdays = [];
  const startSellingDay = (currentDeliveryDay + 1) % 7;
  for (let i = 0; i < L; i++) {
    sellingWeekdays.push((startSellingDay + i) % 7);
  }
  
  // 總防禦期 = 前置期消耗 + 銷售覆蓋期 (保證完美扣減今日當下庫存)
  return [...leadWeekdays, ...sellingWeekdays];
}

/**
 * 發送排程：計算並發送給各廠商群組
 */
function generateAndPushWeeklyOrderSuggestion() {
  // 1. 讀取商品對應的最新廠商名稱與設定
  const productVendorMap = getLatestProductVendorMap_();
  const vendorConfigs = getVendorConfigs_();

  // 2. 取得所有白名單商品的智慧建議 (傳入廠商設定以進行動態天數比例縮放)
  const allSuggestions = calculateSmartReplenishmentSuggestions(productVendorMap, vendorConfigs); 
  if (allSuggestions.length === 0) return;

  // 3. 將建議清單按廠商分群
  const vendorGroupedSuggestions = {}; 
  allSuggestions.forEach(item => {
    const vendor = productVendorMap[item.productId] || "未指定廠商";
    if (!vendorGroupedSuggestions[vendor]) {
      vendorGroupedSuggestions[vendor] = [];
    }
    vendorGroupedSuggestions[vendor].push(item);
  });

  // 4. 讀取廠商設定 (群組 ID 與 叫貨星期)

  // 5. 分流發送 Flex Message
  for (let vendor in vendorGroupedSuggestions) {
    const config = vendorConfigs[vendor];
    if (!config || !config.groupId) {
      console.warn(`廠商【${vendor}】尚未綁定 LINE 群組，跳過發送。`);
      continue;
    }
    
    // 檢查今天是否為該廠商的排定叫貨日
    if (!isTodayVendorOrderDay_(config.orderDays)) {
      console.log(`今天非廠商【${vendor}】的叫貨日 (設定:${config.orderDays})，跳過發送。`);
      continue;
    }

    const groupId = config.groupId;

    const suggestions = vendorGroupedSuggestions[vendor];
    const suggestionId = "sug_" + Utilities.getUuid().substring(0, 8);
    
    // 暫存這家廠商的訂單
    PropertiesService.getScriptProperties().setProperty(suggestionId, JSON.stringify({
        vendor: vendor,
        items: suggestions
    }));
    
    // 推播到群組
    pushWeeklyOrderFlexMessage(groupId, suggestionId, suggestions, vendor, config.orderDays, config.deliveryDays);
  }
}

/**
 * 發送 Flex Message
 */
function pushWeeklyOrderFlexMessage(targetId, suggestionId, suggestions, vendorName, orderDaysStr = '', deliveryDaysStr = '') {
  let subtitleText = "系統叫貨，點擊下方確認配送";
  
  if (orderDaysStr && deliveryDaysStr) {
    const dateStr = Utilities.formatDate(new Date(), "Asia/Taipei", "u"); 
    const todayDay = parseInt(dateStr, 10); 
    
    const orderDays = parseDaysString_(orderDaysStr);
    const deliveryDays = parseDaysString_(deliveryDaysStr);
    
    let idx = orderDays.indexOf(todayDay);
    if (idx !== -1 && deliveryDays[idx]) {
      const chWeekdays = ["", "週一", "週二", "週三", "週四", "週五", "週六", "週日"];
      const orderStr = chWeekdays[todayDay];
      const deliveryStr = chWeekdays[deliveryDays[idx]];
      subtitleText = `👉 ${orderStr}叫貨、${deliveryStr}到貨，點擊下方確認配送`;
    }
  }

  const bubbleContents = [];
  const displayItems = suggestions.slice(0, 15);
  
  displayItems.forEach(item => {
    const packSize = item.packSize || 1;
    const boxes = item.quantity / packSize;
    const boxesStr = (boxes % 1 === 0) ? `${boxes}` : boxes.toFixed(1);

    bubbleContents.push({
      type: "box",
      layout: "horizontal",
      margin: "md",
      alignItems: "center",
      contents: [
        { 
          type: "text", 
          text: item.productName, 
          size: "sm", 
          color: "#334155", 
          flex: 4, 
          wrap: true,
          weight: "bold"
        },
        { 
          type: "box",
          layout: "vertical",
          backgroundColor: "#EFF6FF", 
          cornerRadius: "md",
          paddingStart: "sm",
          paddingEnd: "sm",
          paddingTop: "xs",
          paddingBottom: "xs",
          flex: 2.2, // slightly larger flex to fit the text comfortably
          contents: [
            { 
              type: "text", 
              text: `${item.quantity} 罐 (${boxesStr} 箱)`, 
              size: "xs", 
              color: "#1E40AF", 
              align: "center", 
              weight: "bold" 
            }
          ]
        }
      ]
    });
    
    // Add subtle separator
    bubbleContents.push({
      type: "separator",
      margin: "md",
      color: "#F1F5F9"
    });
  });

  // Remove trailing separator
  if (bubbleContents.length > 0) {
    bubbleContents.pop();
  }

  if (suggestions.length > 15) {
    bubbleContents.push({
      type: "text",
      text: `...及其他 ${suggestions.length - 15} 項商品`,
      size: "xs",
      color: "#94A3B8",
      margin: "md",
      align: "center"
    });
  }

  const flexMessage = {
    type: "flex",
    altText: `📦 米立微 ➔ 『${vendorName}』採購單`,
    contents: {
      type: "bubble",
      styles: {
        header: {
          backgroundColor: "#0F172A"
        },
        body: {
          backgroundColor: "#FFFFFF"
        },
        footer: {
          backgroundColor: "#F8FAFC"
        }
      },
      header: {
        type: "box",
        layout: "horizontal",
        paddingAll: "lg",
        contents: [
          {
            type: "text",
            text: "📦",
            size: "xxl",
            flex: 0
          },
          {
            type: "box",
            layout: "vertical",
            flex: 1,
            margin: "md",
            contents: [
              { 
                type: "text", 
                text: `米立微 ➔ 『${vendorName}』採購單`, 
                color: "#FFFFFF", 
                weight: "bold", 
                size: "lg", 
                wrap: true 
              },
              { 
                type: "text", 
                text: subtitleText, 
                color: "#94A3B8", 
                size: "xs", 
                margin: "xs" 
              }
            ]
          }
        ]
      },
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "lg",
        contents: [
          {
            type: "box",
            layout: "horizontal",
            paddingBottom: "md",
            contents: [
              { type: "text", text: "品項", size: "xs", color: "#94A3B8", weight: "bold", flex: 4 },
              { type: "text", text: "數量", size: "xs", color: "#94A3B8", weight: "bold", flex: 2, align: "center" }
            ]
          },
          {
            type: "separator",
            color: "#CBD5E1"
          },
          ...bubbleContents
        ]
      },
      footer: {
        type: "box",
        layout: "vertical",
        paddingAll: "lg",
        spacing: "sm",
        contents: [
          {
            type: "button",
            style: "primary",
            color: "#F97316",
            action: {
              type: "postback",
              label: "確認訂單（配送中）",
              data: `action=execute_weekly_order&id=${suggestionId}`,
              displayText: "確認訂單（配送中）"
            }
          }
        ]
      }
    }
  };

  const url = "https://api.line.me/v2/bot/message/push";
  const payload = {
    to: targetId,
    messages: [flexMessage]
  };
  
  const options = {
    method: "post",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + LINE_ACCESS_TOKEN
    },
    payload: JSON.stringify(payload)
  };
  
  try {
    UrlFetchApp.fetch(url, options);
  } catch(e) {
    console.error("發送 LINE 訊息失敗: " + e.toString());
  }
}

/**
 * 主動發送文字訊息輔助函式
 */
function replyTextMessage(replyToken, text) {
  const url = "https://api.line.me/v2/bot/message/reply";
  const payload = {
    replyToken: replyToken,
    messages: [{ type: "text", text: text }]
  };
  
  const options = {
    method: "post",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + LINE_ACCESS_TOKEN
    },
    payload: JSON.stringify(payload)
  };
  
  try {
    UrlFetchApp.fetch(url, options);
  } catch(e) {}
}

/**
 * 處理 LINE Webhook 請求
 */
function handleLineWebhook_(events) {
  for (let event of events) {
    const replyToken = event.replyToken;
    const source = event.source;
    const sourceId = source.groupId || source.userId; 
    
    // 1. 處理文字輸入綁定群組
    if (event.type === 'message' && event.message.type === 'text') {
      const userText = event.message.text.trim();
      
      if (userText === "取得群組ID") {
        replyTextMessage(replyToken, `此群組的 ID 為:\n${sourceId}`);
        continue;
      }
      
      if (userText.indexOf("綁定廠商") === 0) {
        const vendorName = userText.replace("綁定廠商", "").trim();
        if (!vendorName) {
          replyTextMessage(replyToken, "⚠️ 請輸入正確格式，例如：『綁定廠商 廠商A』");
          continue;
        }
        const bindResult = bindGroupToVendor_(sourceId, vendorName);
        replyTextMessage(replyToken, bindResult.message);
        continue;
      }
    }

    // 2. 處理 Postback 按鈕動作 (加入 LockService 防重複點擊)
    if (event.type === 'postback') {
      const lock = LockService.getScriptLock();
      try {
        // 鎖定 30 秒防止並發
        lock.waitLock(30000);
        
        const query = parseQueryString_(event.postback.data);
        
        if (query.action === 'execute_weekly_order') {
          const suggestionId = query.id;
          const props = PropertiesService.getScriptProperties();
          const cachedDataStr = props.getProperty(suggestionId);
          
          if (!cachedDataStr) {
            replyTextMessage(replyToken, "⚠️ 此建議訂單已失效或已被其他成員送出過，請勿重複提交。");
            continue;
          }
          
          const cachedObj = JSON.parse(cachedDataStr);
          const vendor = cachedObj.vendor || "LINE智慧訂單";
          const items = cachedObj.items;
          
          // 立即刪除快取，防止第二個人讀到
          props.deleteProperty(suggestionId);
          
          // 查詢該廠商的預設支付方式 (賒帳 CREDIT 或是 現金 CASH)
          const vendorMap = typeof getVendorsData_ !== 'undefined' ? getVendorsData_() : {};
          const defaultMethod = vendorMap[vendor] || "CASH";
          
          // 組裝呼叫 addPurchaseService 的資料格式
          const purchasePayload = {
            submissionId: "line_" + suggestionId,
            vendor: vendor,
            paymentMethod: defaultMethod,
            serverTimestamp: new Date().getTime(),
            operator: "LINE_BOT",
            items: items.map(item => ({
              productName: item.productName,
              quantity: item.quantity,
              price: item.price,
              status: "ORDERED",  // 在庫在途分離：標記為在途，不寫入實體庫存
              expiry: ""
            }))
          };
          
          // 執行寫入邏輯
          const result = addPurchaseService(purchasePayload, { username: "LINE_BOT" });
          
          if (result.success) {
            replyTextMessage(replyToken, `✅ 訂單送出成功！\n已將【${vendor}】共 ${items.length} 項商品的預估單據寫入系統 (狀態：待驗收)。`);
          } else {
            replyTextMessage(replyToken, "❌ 訂單寫入失敗，請檢查系統後台。");
          }
        }
      } catch (e) {
        console.error("Webhook Postback Error:", e);
      } finally {
        lock.releaseLock();
      }
    }
  }
  return ContentService.createTextOutput(JSON.stringify({ content: "ok" })).setMimeType(ContentService.MimeType.JSON);
}

/**
 * 輔助函式：解析 Query String
 */
function parseQueryString_(str) {
  const obj = {};
  if (!str) return obj;
  const pairs = str.split('&');
  for (let i = 0; i < pairs.length; i++) {
    const pair = pairs[i].split('=');
    obj[decodeURIComponent(pair[0])] = decodeURIComponent(pair[1] || '');
  }
  return obj;
}

/**
 * 測試專用：手動發送模擬的進貨建議 Flex Message 到已綁定的群組
 */
function testPushReplenishmentToLine() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Vendors');
  if (!sheet) {
    throw new Error("請先建立 Vendors 表單並完成群組綁定。");
  }
  
  const data = sheet.getDataRange().getValues().slice(1);
  let boundVendor = null;
  let boundGroupId = null;
  
  // 尋找第一個有綁定 LINE群組ID 的廠商
  for (let row of data) {
    if (row[0] && row[2]) {
      boundVendor = String(row[0]).trim();
      boundGroupId = String(row[2]).trim();
      break;
    }
  }
  
  if (!boundGroupId) {
    throw new Error("❌ 尚未在 LINE 中將任何群組『綁定廠商』！請先完成綁定再執行此測試。");
  }
  
  // 準備模擬的叫貨品項
  const mockSuggestions = [
    { productName: "商品A", quantity: 30, price: 150 },
    { productName: "商品B", quantity: 50, price: 80 },
    { productName: "商品C", quantity: 12, price: 210 }
  ];
  
  const suggestionId = "test_sug_" + Utilities.getUuid().substring(0, 8);
  
  // 將模擬的資料寫入 Properties 供 Postback 驗收讀取
  PropertiesService.getScriptProperties().setProperty(suggestionId, JSON.stringify({
      vendor: boundVendor,
      items: mockSuggestions
  }));
  
  // 推播 Flex 訊息
  pushWeeklyOrderFlexMessage(boundGroupId, suggestionId, mockSuggestions, boundVendor);
  
  Logger.log(`✅ 成功向廠商【${boundVendor}】的群組推播測試訂貨 Flex Message！`);
  return `成功發送測試！請查看 LINE 群組。`;
}
