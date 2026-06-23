/**
 * GroupBuy_Orders.gs
 * 團購待確認訂單管理
 * 訂單流程：客戶下單 → PENDING → 管理員審核/修改 → CONFIRMED（扣庫存）
 */

const GB_SHEET_NAME = 'GroupBuy_Orders';
const GB_DETAIL_SHEET_NAME = 'GroupBuy_OrderDetails';
const GB_BINDINGS_SHEET_NAME = 'GroupBuy_GroupBindings';
const GB_HEADERS = ['OrderId', 'Status', 'CustomerLineId', 'CustomerName', 'CustomerPhone', 'DeliveryAddress', 'SourceGroup', 'Note', 'TotalAmount', 'CreatedAt', 'UpdatedAt', 'ConfirmedAt', 'ConfirmedBy', 'LineDisplayName'];
const GB_DETAIL_HEADERS = ['OrderId', 'ProductId', 'ProductName', 'UnitPrice', 'Qty', 'Subtotal'];

function initGroupBuySheets_() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    
    // 初始化大樓群組綁定表
    let bindingSheet = ss.getSheetByName(GB_BINDINGS_SHEET_NAME);
    if (!bindingSheet) {
        bindingSheet = ss.insertSheet(GB_BINDINGS_SHEET_NAME);
        bindingSheet.appendRow(['GroupId', 'GroupName', 'UpdatedAt']);
        bindingSheet.setFrozenRows(1);
    }

    let orderSheet = ss.getSheetByName(GB_SHEET_NAME);
    if (!orderSheet) {
        orderSheet = ss.insertSheet(GB_SHEET_NAME);
        orderSheet.appendRow([...GB_HEADERS, 'PaymentMethod', 'TransferLastFive', 'PaymentStatus']);
        orderSheet.setFrozenRows(1);
    } else {
        // 自動偵測並補入缺少的付款與 LINE 暱稱欄位（不覆蓋現有資料）
        const existingHeaders = orderSheet.getRange(1, 1, 1, orderSheet.getLastColumn()).getValues()[0].map(h => String(h).trim());
        ['PaymentMethod', 'TransferLastFive', 'PaymentStatus', 'LineDisplayName'].forEach(col => {
            if (!existingHeaders.includes(col)) {
                orderSheet.getRange(1, orderSheet.getLastColumn() + 1).setValue(col);
            }
        });
    }
    let detailSheet = ss.getSheetByName(GB_DETAIL_SHEET_NAME);
    if (!detailSheet) {
        detailSheet = ss.insertSheet(GB_DETAIL_SHEET_NAME);
        detailSheet.appendRow([...GB_DETAIL_HEADERS, 'Remark']);
        detailSheet.setFrozenRows(1);
    } else {
        const existingDetailHeaders = detailSheet.getRange(1, 1, 1, detailSheet.getLastColumn()).getValues()[0].map(h => String(h).trim());
        if (!existingDetailHeaders.includes('Remark') && !existingDetailHeaders.includes('備註') && !existingDetailHeaders.includes('商品備註')) {
            detailSheet.getRange(1, detailSheet.getLastColumn() + 1).setValue('Remark');
        }
    }
    return { orderSheet, detailSheet };
}

function generateOrderId_() {
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    return `GB${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

/**
 * [Service] 客戶送出訂單 (寫入 PENDING，不扣庫存)
 */
function savePendingOrderService(payload, user) {
    const { customerName, customerPhone, deliveryAddress, sourceGroup, note, items, paymentMethod, transferLastFive, lineDisplayName, lineUserId } = payload;

    if (!items || !Array.isArray(items) || items.length === 0) {
        throw new Error('訂單明細不得為空');
    }

    const { orderSheet, detailSheet } = initGroupBuySheets_();
    const orderId = generateOrderId_();
    const now = new Date();

    const totalAmount = items.reduce((sum, item) => sum + (Number(item.unitPrice) * Number(item.qty)), 0);

    // 根據付款方式設定初始付款狀態
    let paymentStatus = '';
    if (paymentMethod === '現金') paymentStatus = '貨到付款';
    else if (paymentMethod === '轉帳') paymentStatus = '待對帳';
    else if (paymentMethod === 'LINE Pay') paymentStatus = '待確認';

    // 動態找欄位 index，避免欄位順序不同造成錯誤
    const headers = orderSheet.getRange(1, 1, 1, orderSheet.getLastColumn()).getValues()[0].map(h => String(h).trim());
    const row = new Array(headers.length).fill('');
    const set = (name, val) => { const i = headers.indexOf(name); if (i >= 0) row[i] = val; };

    set('OrderId', orderId);
    set('Status', 'PENDING');
    set('CustomerLineId', lineUserId || user.lineUserId || user.username || '');
    set('CustomerName', customerName || '');
    set('CustomerPhone', customerPhone || '');
    set('DeliveryAddress', deliveryAddress || '');
    set('SourceGroup', sourceGroup || '');
    set('Note', note || '');
    set('TotalAmount', totalAmount);
    set('PaymentMethod', paymentMethod || '');
    set('TransferLastFive', transferLastFive || '');
    set('PaymentStatus', paymentStatus);
    set('LineDisplayName', lineDisplayName || '');
    set('CreatedAt', now);
    set('UpdatedAt', now);

    orderSheet.appendRow(row);

    // 寫入明細
    items.forEach(item => {
        const subtotal = Number(item.unitPrice) * Number(item.qty);
        const detailHeaders = detailSheet.getRange(1, 1, 1, detailSheet.getLastColumn()).getValues()[0].map(h => String(h).trim());
        const remarkIdx = detailHeaders.findIndex(h => h === 'Remark' || h === '備註' || h === '商品備註');
        
        const row = [
            orderId,
            item.productId || '',
            item.productName || '',
            Number(item.unitPrice) || 0,
            Number(item.qty) || 0,
            subtotal
        ];
        if (remarkIdx >= 0) {
            while (row.length < remarkIdx) row.push('');
            row[remarkIdx] = item.remark || '';
        } else {
            row.push(item.remark || '');
        }
        detailSheet.appendRow(row);
    });

    SpreadsheetApp.flush();
    return { success: true, orderId };
}

/**
 * [Service] 取得所有待確認訂單 (僅 BOSS 可用)
 */
function getPendingOrdersService(payload, user) {
    if (user.role !== 'BOSS') throw new Error('權限不足');

    const { status } = payload || {};
    const { orderSheet, detailSheet } = initGroupBuySheets_();

    const orderRows = orderSheet.getDataRange().getValues();
    const detailRows = detailSheet.getDataRange().getValues();

    // 動態讀取欄位 index
    const orderHeaders = orderRows[0].map(h => String(h).trim());
    const hIdx = name => orderHeaders.indexOf(name);
    const pmIdx  = hIdx('PaymentMethod');
    const tlIdx  = hIdx('TransferLastFive');
    const psIdx  = hIdx('PaymentStatus');
    const ldnIdx = hIdx('LineDisplayName');

    // 組織明細 Map
    const detailMap = {};
    const detailHeaders = detailRows[0].map(h => String(h).trim());
    const dRemarkIdx = detailHeaders.findIndex(h => h === 'Remark' || h === '備註' || h === '商品備註');
    
    for (let i = 1; i < detailRows.length; i++) {
        const row = detailRows[i];
        const oid = String(row[0] || '').trim();
        if (!oid) continue;
        if (!detailMap[oid]) detailMap[oid] = [];
        detailMap[oid].push({
            productId: String(row[1] || ''),
            productName: String(row[2] || ''),
            unitPrice: Number(row[3]) || 0,
            qty: Number(row[4]) || 0,
            subtotal: Number(row[5]) || 0,
            remark: dRemarkIdx >= 0 && row.length > dRemarkIdx ? String(row[dRemarkIdx] || '') : ''
        });
    }

    const orders = [];
    for (let i = 1; i < orderRows.length; i++) {
        const row = orderRows[i];
        const orderId = String(row[0] || '').trim();
        const rowStatus = String(row[1] || '').trim();
        if (!orderId) continue;
        if (status && rowStatus !== status) continue;

        orders.push({
            orderId,
            status: rowStatus,
            customerLineId: String(row[2] || ''),
            customerName: String(row[3] || ''),
            customerPhone: String(row[4] || ''),
            deliveryAddress: String(row[5] || ''),
            sourceGroup: String(row[6] || ''),
            note: String(row[7] || ''),
            totalAmount: Number(row[8]) || 0,
            paymentMethod: pmIdx >= 0 ? String(row[pmIdx] || '') : '',
            transferLastFive: tlIdx >= 0 ? String(row[tlIdx] || '') : '',
            paymentStatus: psIdx >= 0 ? String(row[psIdx] || '') : '',
            lineDisplayName: ldnIdx >= 0 ? String(row[ldnIdx] || '') : '',
            createdAt: row[hIdx('CreatedAt')] ? new Date(row[hIdx('CreatedAt')]).toISOString() : '',
            updatedAt: row[hIdx('UpdatedAt')] ? new Date(row[hIdx('UpdatedAt')]).toISOString() : '',
            confirmedAt: row[hIdx('ConfirmedAt')] ? new Date(row[hIdx('ConfirmedAt')]).toISOString() : '',
            confirmedBy: String(row[hIdx('ConfirmedBy')] || ''),
            items: detailMap[orderId] || []
        });
    }

    return orders.sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));
}

/**
 * [Service] 管理員修改待確認訂單（商品、數量、收件資訊全可改）
 */
function updatePendingOrderService(payload, user) {
    if (user.role !== 'BOSS') throw new Error('權限不足');

    const { orderId, customerName, customerPhone, deliveryAddress, note, items } = payload;
    if (!orderId) throw new Error('缺少 orderId');

    const { orderSheet, detailSheet } = initGroupBuySheets_();
    const orderData = orderSheet.getDataRange().getValues();

    // 找主單列
    let foundOrderRow = -1;
    for (let i = 1; i < orderData.length; i++) {
        if (String(orderData[i][0]).trim() === orderId) {
            foundOrderRow = i + 1;
            break;
        }
    }
    if (foundOrderRow === -1) throw new Error('找不到訂單：' + orderId);

    const now = new Date();
    const totalAmount = (items || []).reduce((sum, item) => sum + (Number(item.unitPrice) * Number(item.qty)), 0);

    // 更新主單欄位 (保留 OrderId, Status, CustomerLineId, CreatedAt 不動)
    orderSheet.getRange(foundOrderRow, 4, 1, 6).setValues([[
        customerName || orderData[foundOrderRow-1][3],
        customerPhone || orderData[foundOrderRow-1][4],
        deliveryAddress || orderData[foundOrderRow-1][5],
        orderData[foundOrderRow-1][6], // sourceGroup 不改
        note !== undefined ? note : orderData[foundOrderRow-1][7],
        totalAmount
    ]]);
    // 更新 UpdatedAt (col 11)
    orderSheet.getRange(foundOrderRow, 11).setValue(now);

    // 清除舊明細並重寫
    if (items && items.length > 0) {
        const detailData = detailSheet.getDataRange().getValues();
        const rowsToDelete = [];
        for (let i = detailData.length - 1; i >= 1; i--) {
            if (String(detailData[i][0]).trim() === orderId) {
                rowsToDelete.push(i + 1);
            }
        }
        rowsToDelete.forEach(r => detailSheet.deleteRow(r));

        items.forEach(item => {
            const subtotal = Number(item.unitPrice) * Number(item.qty);
            const detailHeaders = detailSheet.getRange(1, 1, 1, detailSheet.getLastColumn()).getValues()[0].map(h => String(h).trim());
            const remarkIdx = detailHeaders.findIndex(h => h === 'Remark' || h === '備註' || h === '商品備註');
            
            const row = [
                orderId,
                item.productId || '',
                item.productName || '',
                Number(item.unitPrice) || 0,
                Number(item.qty) || 0,
                subtotal
            ];
            if (remarkIdx >= 0) {
                while (row.length < remarkIdx) row.push('');
                row[remarkIdx] = item.remark || '';
            } else {
                row.push(item.remark || '');
            }
            detailSheet.appendRow(row);
        });
    }

    SpreadsheetApp.flush();
    return { success: true };
}

/**
 * [Service] 確認出貨：將 PENDING 訂單轉為 CONFIRMED，並寫入正式銷售
 */
function confirmPendingOrderService(payload, user) {
    if (user.role !== 'BOSS') throw new Error('權限不足');

    const { orderId } = payload;
    if (!orderId) throw new Error('缺少 orderId');

    const { orderSheet, detailSheet } = initGroupBuySheets_();
    const orderData = orderSheet.getDataRange().getValues();

    let foundOrderRow = -1;
    let orderRecord = null;
    for (let i = 1; i < orderData.length; i++) {
        if (String(orderData[i][0]).trim() === orderId) {
            foundOrderRow = i + 1;
            orderRecord = orderData[i];
            break;
        }
    }
    if (foundOrderRow === -1) throw new Error('找不到訂單：' + orderId);
    if (orderRecord[1] !== 'PENDING') throw new Error('此訂單已不是 PENDING 狀態');

    // 讀取明細
    const detailData = detailSheet.getDataRange().getValues();
    const items = [];
    for (let i = 1; i < detailData.length; i++) {
        if (String(detailData[i][0]).trim() === orderId) {
            items.push({
                productId: String(detailData[i][1] || ''),
                productName: String(detailData[i][2] || ''),
                unitPrice: Number(detailData[i][3]) || 0,
                qty: Number(detailData[i][4]) || 0,
                subtotal: Number(detailData[i][5]) || 0
            });
        }
    }
    if (items.length === 0) throw new Error('訂單明細為空，無法確認出貨');

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const salesSheet = ss.getSheetByName('Sales');
    const salesDetailSheet = ss.getSheetByName('SalesDetails');
    const now = new Date();

    const customerName = String(orderRecord[3] || '');
    const totalAmount = Number(orderRecord[8]) || 0;
    const deliveryAddress = String(orderRecord[5] || '');
    const sourceGroup = String(orderRecord[6] || '');

    // 寫入 Sales 主單（使用 orderId 作為 SaleID）
    if (salesSheet) {
        const salesHeaders = salesSheet.getRange(1, 1, 1, salesSheet.getLastColumn()).getValues()[0];
        const findSalesIdx = kws => salesHeaders.findIndex(h => kws.some(k => String(h || '').toLowerCase().includes(k)));

        const sIdIdx    = findSalesIdx(['saleid', '編號', 'id']);
        const sDateIdx  = findSalesIdx(['日期', 'date', 'time']);
        const sUserIdx  = findSalesIdx(['業務', 'rep', 'user', 'operator']);
        const sCustIdx  = findSalesIdx(['客戶', 'customer']);
        const sTotalIdx = findSalesIdx(['total', '金額', 'amount']);
        const sNoteIdx  = findSalesIdx(['備註', 'note']);

        const colCount  = Math.max(salesHeaders.length, 12);
        const newRow    = new Array(colCount).fill('');
        if (sIdIdx   !== -1) newRow[sIdIdx]   = orderId;
        if (sDateIdx !== -1) newRow[sDateIdx]  = now;
        if (sUserIdx !== -1) newRow[sUserIdx]  = user.username;
        if (sCustIdx !== -1) newRow[sCustIdx]  = customerName + (deliveryAddress ? ' ' + deliveryAddress : '');
        if (sTotalIdx !== -1) newRow[sTotalIdx] = totalAmount;
        if (sNoteIdx !== -1) newRow[sNoteIdx] = '團購' + (sourceGroup ? '/' + sourceGroup : '');
        salesSheet.appendRow(newRow);
    }

    // 寫入 SalesDetails
    if (salesDetailSheet) {
        const salesDetailHeaders = salesDetailSheet.getRange(1, 1, 1, salesDetailSheet.getLastColumn()).getValues()[0].map(h => String(h).trim());
        if (!salesDetailHeaders.includes('Remark') && !salesDetailHeaders.includes('備註') && !salesDetailHeaders.includes('商品備註')) {
            salesDetailSheet.getRange(1, salesDetailSheet.getLastColumn() + 1).setValue('Remark');
        }
        
        const detailHeaders = salesDetailSheet.getRange(1, 1, 1, salesDetailSheet.getLastColumn()).getValues()[0];
        const findDIdx = kws => detailHeaders.findIndex(h => kws.some(k => String(h || '').toLowerCase().includes(k)));
        const dIdIdx  = findDIdx(['saleid', '訂單', '編號', 'id']);
        const dPidIdx = findDIdx(['productid', '商品id', '產品id']);
        const dNameIdx = findDIdx(['name', '名稱', '品名', '品項']);
        const dPriceIdx = findDIdx(['price', '單價', 'unitprice']);
        const dQtyIdx = findDIdx(['qty', 'quantity', '數量']);
        const dSubIdx = findDIdx(['subtotal', '小計', '金額']);
        const dRemarkIdx = detailHeaders.findIndex(h => {
            const s = String(h || '').trim().toLowerCase();
            return s === 'remark' || s === '備註' || s === '商品備註';
        });

        items.forEach(item => {
            const colCount = Math.max(detailHeaders.length, 9);
            const newRow = new Array(colCount).fill('');
            if (dIdIdx   !== -1) newRow[dIdIdx]   = orderId;
            if (dPidIdx  !== -1) newRow[dPidIdx]  = item.productId;
            if (dNameIdx !== -1) newRow[dNameIdx] = item.productName;
            if (dPriceIdx !== -1) newRow[dPriceIdx] = item.unitPrice;
            if (dQtyIdx  !== -1) newRow[dQtyIdx]  = item.qty;
            if (dSubIdx  !== -1) newRow[dSubIdx]  = item.subtotal;
            if (dRemarkIdx !== -1) newRow[dRemarkIdx] = item.remark;
            salesDetailSheet.appendRow(newRow);
        });
    }

    // 更新主單狀態
    const now2 = new Date();
    orderSheet.getRange(foundOrderRow, 2).setValue('CONFIRMED');
    orderSheet.getRange(foundOrderRow, 11).setValue(now2); // UpdatedAt
    orderSheet.getRange(foundOrderRow, 12).setValue(now2); // ConfirmedAt
    orderSheet.getRange(foundOrderRow, 13).setValue(user.username); // ConfirmedBy

    SpreadsheetApp.flush();
    return { success: true, orderId };
}
/**
 * [Service] 刪除 PENDING 訂單（誤按返還用）
 * 只有 BOSS 可以操作，且只能刪除狀態為 PENDING 的訂單
 */
function deletePendingOrderService(payload, user) {
    if (user.role !== 'BOSS') throw new Error('權限不足');

    const { orderId } = payload;
    if (!orderId) throw new Error('缺少 orderId');

    const { orderSheet, detailSheet } = initGroupBuySheets_();

    // 找主單並確認狀態為 PENDING
    const orderData = orderSheet.getDataRange().getValues();
    const orderHeaders = orderData[0].map(h => String(h).trim());
    const statusIdx = orderHeaders.indexOf('Status');

    let foundOrderRow = -1;
    for (let i = 1; i < orderData.length; i++) {
        if (String(orderData[i][0]).trim() === orderId) {
            const status = statusIdx >= 0 ? String(orderData[i][statusIdx]).trim() : String(orderData[i][1]).trim();
            if (status !== 'PENDING') throw new Error('此訂單已非 PENDING 狀態，無法刪除');
            foundOrderRow = i + 1; // 1-indexed
            break;
        }
    }
    if (foundOrderRow === -1) throw new Error('找不到訂單：' + orderId);

    // 刪除明細（從下往上刪，避免位移）
    const detailData = detailSheet.getDataRange().getValues();
    const rowsToDelete = [];
    for (let i = detailData.length - 1; i >= 1; i--) {
        if (String(detailData[i][0]).trim() === orderId) {
            rowsToDelete.push(i + 1);
        }
    }
    rowsToDelete.forEach(r => detailSheet.deleteRow(r));

    // 刪除主單
    orderSheet.deleteRow(foundOrderRow);

    SpreadsheetApp.flush();
    return { success: true, orderId };
}

/**
 * [Service] 取得所有群組對照綁定
 */
function getGroupBindingsService(payload, user) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(GB_BINDINGS_SHEET_NAME);
    if (!sheet) return {};

    const rows = sheet.getDataRange().getValues();
    const bindings = {};
    for (let i = 1; i < rows.length; i++) {
        const gid = String(rows[i][0] || '').trim();
        const gname = String(rows[i][1] || '').trim();
        if (gid) {
            bindings[gid] = gname;
        }
    }
    return bindings;
}

/**
 * [Service] 新增或更新群組對照綁定
 */
function saveGroupBindingService(payload, user) {
    const { groupId, groupName } = payload;
    if (!groupId || !groupName) throw new Error('缺少群組 ID 或名稱');

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(GB_BINDINGS_SHEET_NAME);
    if (!sheet) {
        sheet = ss.insertSheet(GB_BINDINGS_SHEET_NAME);
        sheet.appendRow(['GroupId', 'GroupName', 'UpdatedAt']);
        sheet.setFrozenRows(1);
    }

    const rows = sheet.getDataRange().getValues();
    let foundRow = -1;
    for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][0] || '').trim() === String(groupId).trim()) {
            foundRow = i + 1;
            break;
        }
    }

    const now = new Date();
    if (foundRow !== -1) {
        sheet.getRange(foundRow, 2, 1, 2).setValues([[groupName, now]]);
    } else {
        sheet.appendRow([groupId, groupName, now]);
    }
    SpreadsheetApp.flush();
    return { success: true };
}

/**
 * [Service] 管理員快速變更訂單狀態或付款狀態
 */
function updateOrderStatusService(payload, user) {
    if (user.role !== 'BOSS') throw new Error('權限不足');
    const { orderId, status, paymentStatus } = payload;
    if (!orderId) throw new Error('缺少 orderId');

    const { orderSheet } = initGroupBuySheets_();
    const orderData = orderSheet.getDataRange().getValues();

    let foundOrderRow = -1;
    for (let i = 1; i < orderData.length; i++) {
        if (String(orderData[i][0]).trim() === orderId) {
            foundOrderRow = i + 1;
            break;
        }
    }
    if (foundOrderRow === -1) throw new Error('找不到訂單：' + orderId);

    const now = new Date();
    const orderHeaders = orderSheet.getRange(1, 1, 1, orderSheet.getLastColumn()).getValues()[0].map(h => String(h).trim());

    if (status !== undefined) {
        const sIdx = orderHeaders.indexOf('Status');
        if (sIdx >= 0) orderSheet.getRange(foundOrderRow, sIdx + 1).setValue(status);
    }
    if (paymentStatus !== undefined) {
        const psIdx = orderHeaders.indexOf('PaymentStatus');
        if (psIdx >= 0) orderSheet.getRange(foundOrderRow, psIdx + 1).setValue(paymentStatus);
    }

    const uIdx = orderHeaders.indexOf('UpdatedAt');
    if (uIdx >= 0) orderSheet.getRange(foundOrderRow, uIdx + 1).setValue(now);

    SpreadsheetApp.flush();
    return { success: true };
}

/**
 * [Service] 管理員使用密碼登入 (免 Token)
 */
function loginAdminByPassword(payload) {
    const { password } = payload;
    if (password !== 'mlw888') {
        return { error: '密碼錯誤' };
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Users');
    if (!sheet) return { error: '使用者資料庫不存在' };

    const data = sheet.getDataRange().getValues();
    let bossUser = null;
    for (let i = 1; i < data.length; i++) {
        if (data[i][3] === 'BOSS') {
            bossUser = {
                username: data[i][1],
                role: data[i][3],
                status: data[i][4],
                permissions: []
            };
            try {
                if (data[i][6]) {
                    bossUser.permissions = JSON.parse(data[i][6]);
                }
            } catch (_) {}
            break;
        }
    }

    if (!bossUser) {
        return { error: '找不到 BOSS 權限帳號，請確認 Users 表設定' };
    }

    if (bossUser.status !== 'ACTIVE') {
        return { error: 'BOSS 帳號已被停用' };
    }

    // 簽發 JWT Token (12小時)
    const tokenPayload = {
        username: bossUser.username,
        role: bossUser.role,
        permissions: bossUser.permissions,
        timestamp: new Date().getTime(),
        exp: new Date().getTime() + (12 * 60 * 60 * 1000)
    };

    const token = createJWT(tokenPayload);

    return {
        success: true,
        token: token,
        username: bossUser.username,
        role: bossUser.role,
        permissions: bossUser.permissions
    };
}

