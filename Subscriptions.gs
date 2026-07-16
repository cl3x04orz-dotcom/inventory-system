/**
 * Subscriptions.gs
 * 定期配 / 月訂鮮奶模組
 */

const SUB_SHEET_NAME = 'Subscriptions';
const SUB_HEADERS = [
  'subscriptionId', 'building', 'customerName', 'phone', 
  'productId', 'productName', 'quantity', 'frequency', 
  'paymentMethod', 'isActive', 'createdAt', 'note'
];

function initSubscriptionsSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SUB_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SUB_SHEET_NAME);
    sheet.appendRow(SUB_HEADERS);
    sheet.setFrozenRows(1);
  } else {
    // 補齊欄位
    const existingHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(h => String(h).trim());
    SUB_HEADERS.forEach(col => {
      if (!existingHeaders.includes(col)) {
        sheet.getRange(1, sheet.getLastColumn() + 1).setValue(col);
      }
    });
  }
  return sheet;
}

/**
 * 讀取所有訂閱計畫
 */
function getSubscriptionsService(payload, user) {
  initSubscriptionsSheet_();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SUB_SHEET_NAME);
  const rows = sheet.getDataRange().getValues();
  if (rows.length < 2) return [];

  const headers = rows[0].map(h => String(h).trim());
  const hIdx = name => headers.indexOf(name);

  const subIdIdx = hIdx('subscriptionId');
  const bIdx = hIdx('building');
  const cNameIdx = hIdx('customerName');
  const phoneIdx = hIdx('phone');
  const pIdIdx = hIdx('productId');
  const pNameIdx = hIdx('productName');
  const qtyIdx = hIdx('quantity');
  const freqIdx = hIdx('frequency');
  const pmIdx = hIdx('paymentMethod');
  const activeIdx = hIdx('isActive');
  const caIdx = hIdx('createdAt');
  const noteIdx = hIdx('note');

  const subs = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const subId = subIdIdx >= 0 ? String(row[subIdIdx] || '').trim() : '';
    if (!subId) continue;

    // 解析 frequency 欄位，可能是 JSON string，如 "[1,3,5]"
    let frequency = [];
    if (freqIdx >= 0 && row[freqIdx]) {
      const rawFreq = String(row[freqIdx]).trim();
      try {
        frequency = JSON.parse(rawFreq);
      } catch (e) {
        frequency = rawFreq.split(',').map(s => Number(s.trim())).filter(n => !isNaN(n));
      }
    }

    subs.push({
      subscriptionId: subId,
      building: bIdx >= 0 ? String(row[bIdx] || '') : '',
      customerName: cNameIdx >= 0 ? String(row[cNameIdx] || '') : '',
      phone: phoneIdx >= 0 ? String(row[phoneIdx] || '') : '',
      productId: pIdIdx >= 0 ? String(row[pIdIdx] || '') : '',
      productName: pNameIdx >= 0 ? String(row[pNameIdx] || '') : '',
      quantity: qtyIdx >= 0 ? (Number(row[qtyIdx]) || 0) : 0,
      frequency: frequency,
      paymentMethod: pmIdx >= 0 ? String(row[pmIdx] || '') : '奶包金',
      isActive: activeIdx >= 0 ? (row[activeIdx] === true || row[activeIdx] === 'TRUE' || row[activeIdx] === '是' || row[activeIdx] === 1) : true,
      createdAt: caIdx >= 0 && row[caIdx] ? new Date(row[caIdx]).toISOString() : '',
      note: noteIdx >= 0 ? String(row[noteIdx] || '') : ''
    });
  }

  return subs;
}

/**
 * 新增/更新訂閱計畫
 */
function saveSubscriptionService(payload, user) {
  if (user.role !== 'BOSS') throw new Error('權限不足');

  const { subscriptionId, building, customerName, phone, productId, productName, quantity, frequency, paymentMethod, isActive, note } = payload;
  if (!building || !customerName || !productId || !productName || !quantity) {
    throw new Error('缺少必要欄位');
  }

  const sheet = initSubscriptionsSheet_();
  const data = sheet.getDataRange().getValues();
  const headers = data[0].map(h => String(h).trim());

  let foundRow = -1;
  const targetId = subscriptionId || Utilities.getUuid();

  if (subscriptionId) {
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim() === String(subscriptionId).trim()) {
        foundRow = i + 1;
        break;
      }
    }
  }

  const freqStr = Array.isArray(frequency) ? JSON.stringify(frequency) : '[]';
  const now = new Date();

  const setVal = (rowNum, name, val) => {
    const idx = headers.indexOf(name);
    if (idx >= 0) {
      sheet.getRange(rowNum, idx + 1).setValue(val);
    }
  };

  if (foundRow !== -1) {
    setVal(foundRow, 'building', building);
    setVal(foundRow, 'customerName', customerName);
    setVal(foundRow, 'phone', phone || '');
    setVal(foundRow, 'productId', productId);
    setVal(foundRow, 'productName', productName);
    setVal(foundRow, 'quantity', Number(quantity) || 0);
    setVal(foundRow, 'frequency', freqStr);
    setVal(foundRow, 'paymentMethod', paymentMethod || '奶包金');
    setVal(foundRow, 'isActive', isActive !== undefined ? isActive : true);
    setVal(foundRow, 'note', note || '');
  } else {
    const newRow = new Array(headers.length).fill('');
    const setLocal = (name, val) => {
      const idx = headers.indexOf(name);
      if (idx >= 0) newRow[idx] = val;
    };

    setLocal('subscriptionId', targetId);
    setLocal('building', building);
    setLocal('customerName', customerName);
    setLocal('phone', phone || '');
    setLocal('productId', productId);
    setLocal('productName', productName);
    setLocal('quantity', Number(quantity) || 0);
    setLocal('frequency', freqStr);
    setLocal('paymentMethod', paymentMethod || '奶包金');
    setLocal('isActive', isActive !== undefined ? isActive : true);
    setLocal('createdAt', now);
    setLocal('note', note || '');

    sheet.appendRow(newRow);
  }

  SpreadsheetApp.flush();
  return { success: true, subscriptionId: targetId };
}

/**
 * 刪除訂閱計畫
 */
function deleteSubscriptionService(payload, user) {
  if (user.role !== 'BOSS') throw new Error('權限不足');

  const { subscriptionId } = payload;
  if (!subscriptionId) throw new Error('缺少 subscriptionId');

  const sheet = initSubscriptionsSheet_();
  const data = sheet.getDataRange().getValues();

  let foundRow = -1;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(subscriptionId).trim()) {
      foundRow = i + 1;
      break;
    }
  }

  if (foundRow === -1) throw new Error('找不到該訂閱計畫');

  sheet.deleteRow(foundRow);
  SpreadsheetApp.flush();
  return { success: true };
}

/**
 * 一鍵生成定期配今日配送訂單
 */
function generateSubscriptionOrdersService(payload, user) {
  if (user.role !== 'BOSS') throw new Error('權限不足');

  const { building, date } = payload;
  if (!building) throw new Error('請指定配送大樓');

  // date 格式為 YYYY-MM-DD，若未傳則預設今天
  const targetDateStr = date || Utilities.formatDate(new Date(), "Asia/Taipei", "yyyy-MM-dd");
  // 建立 Date 物件，需注意以 / 替換 - 以免時區偏差
  const parts = targetDateStr.split('-');
  const targetDate = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  const dayOfWeek = targetDate.getDay(); // 0 = 日, 1-6 = 一到六

  // 1. 取得所有有效的訂閱計畫
  const allSubs = getSubscriptionsService();
  const filteredSubs = allSubs.filter(sub => {
    return sub.building === building && 
           sub.isActive === true && 
           sub.frequency.includes(dayOfWeek);
  });

  if (filteredSubs.length === 0) {
    return { success: true, count: 0, message: `今日無符合的定期配項目` };
  }

  // 2. 獲取商品售價
  const products = typeof getProductsService !== 'undefined' ? getProductsService() : [];
  const prodPriceMap = {};
  products.forEach(p => {
    prodPriceMap[p.id] = p.single_price || p.price || 0;
  });

  // 3. 將相同的客戶（依據姓名+電話）分組，合併成一張訂單
  const customerGroups = {};
  filteredSubs.forEach(sub => {
    const key = `${sub.customerName}_${sub.phone}`;
    if (!customerGroups[key]) {
      customerGroups[key] = {
        customerName: sub.customerName,
        phone: sub.phone,
        paymentMethod: sub.paymentMethod || '奶包金',
        note: sub.note || '',
        items: []
      };
    }
    const unitPrice = prodPriceMap[sub.productId] || 0;
    customerGroups[key].items.push({
      productId: sub.productId,
      productName: sub.productName,
      unitPrice: unitPrice,
      qty: sub.quantity,
      remark: '定期配匯入'
    });
  });

  // 4. 初始化 GroupBuy 訂單表，準備插入與防重複
  const { orderSheet, detailSheet } = initGroupBuySheets_();
  const existingOrders = orderSheet.getDataRange().getValues();

  // 動態尋找欄位 index
  const orderHeaders = existingOrders[0].map(h => String(h).trim());
  const hIdx = name => orderHeaders.indexOf(name);
  const oIdIdx = hIdx('OrderId');
  const cnIdx = hIdx('CustomerName');
  const cpIdx = hIdx('CustomerPhone');
  const noteIdx = hIdx('Note');
  const statusIdx = hIdx('Status');

  // 用於判斷今天該客戶是否已有定期配訂單的 Map
  const flagNote = `定期配(${targetDateStr})`;

  const alreadyImportedKeys = new Set();
  for (let i = 1; i < existingOrders.length; i++) {
    const name = cnIdx >= 0 ? String(existingOrders[i][cnIdx]).trim() : '';
    const phone = cpIdx >= 0 ? String(existingOrders[i][cpIdx]).trim() : '';
    const note = noteIdx >= 0 ? String(existingOrders[i][noteIdx]).trim() : '';
    const status = statusIdx >= 0 ? String(existingOrders[i][statusIdx]).trim() : '';

    if (status !== 'CANCELLED' && note.includes(flagNote)) {
      alreadyImportedKeys.add(`${name}_${phone}`);
    }
  }

  let importCount = 0;
  const now = new Date();

  // 5. 進行轉單寫入
  for (let key in customerGroups) {
    if (alreadyImportedKeys.has(key)) {
      continue;
    }

    const group = customerGroups[key];
    const orderId = generateOrderId_() + '_' + Math.floor(Math.random() * 100);
    const totalAmount = group.items.reduce((sum, item) => sum + (item.unitPrice * item.qty), 0);

    // 主單寫入
    const row = new Array(orderHeaders.length).fill('');
    const set = (name, val) => { const i = orderHeaders.indexOf(name); if (i >= 0) row[i] = val; };

    set('OrderId', orderId);
    set('Status', 'PENDING');
    set('CustomerName', group.customerName);
    set('CustomerPhone', group.phone);
    set('DeliveryAddress', `${building} ${group.note}`.trim());
    set('Note', flagNote);
    set('TotalAmount', totalAmount);
    set('PaymentMethod', group.paymentMethod);
    set('PaymentStatus', group.paymentMethod === '奶包金' ? '已付款(扣餘額)' : '待確認');
    set('CommunityNameSnapshot', building);
    set('Source', 'SUBSCRIPTION');
    set('CreatedAt', now);
    set('UpdatedAt', now);

    orderSheet.appendRow(row);

    // 明細寫入
    group.items.forEach(item => {
      const subtotal = item.unitPrice * item.qty;
      const detailHeaders = detailSheet.getRange(1, 1, 1, detailSheet.getLastColumn()).getValues()[0].map(h => String(h).trim());
      const remarkIdx = detailHeaders.findIndex(h => h === 'Remark' || h === '備註' || h === '商品備註');
      
      const detailRow = [
          orderId,
          item.productId,
          item.productName,
          item.unitPrice,
          item.qty,
          subtotal
      ];
      if (remarkIdx >= 0) {
          while (detailRow.length < remarkIdx) detailRow.push('');
          detailRow[remarkIdx] = item.remark;
      } else {
          detailRow.push(item.remark);
      }
      detailSheet.appendRow(detailRow);
    });

    importCount++;
  }

  SpreadsheetApp.flush();
  return { 
    success: true, 
    count: importCount, 
    message: `成功導入 ${importCount} 筆定期配訂單` 
  };
}
