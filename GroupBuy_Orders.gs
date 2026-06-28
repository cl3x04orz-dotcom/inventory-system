/**
 * GroupBuy_Orders.gs
 * 團購待確認訂單管理
 * 訂單流程：客戶下單 → PENDING → 管理員審核/修改 → CONFIRMED（扣庫存）
 */

const GB_SHEET_NAME = 'GroupBuy_Orders';
const GB_DETAIL_SHEET_NAME = 'GroupBuy_OrderDetails';
const GB_BINDINGS_SHEET_NAME = 'GroupBuy_GroupBindings';
const GB_MEMBERS_SHEET_NAME = 'GroupBuy_Members';
const GB_WALLET_TX_SHEET_NAME = 'GroupBuy_WalletTransactions';
const GB_NOTIF_LOGS_SHEET_NAME = 'GroupBuy_NotificationLogs';
const GB_HEADERS = ['OrderId', 'OrderNo', 'OrderVersion', 'CommunityId', 'CampaignId', 'CommunityNameSnapshot', 'CampaignNameSnapshot', 'CampaignTypeSnapshot', 'DeliveryDateSnapshot', 'DeliveryTimeSnapshot', 'PaymentMethodSnapshot', 'DeliveryInstructionSnapshot', 'Status', 'DeliveryStatus', 'CustomerLineId', 'CustomerName', 'CustomerPhone', 'DeliveryAddress', 'SourceGroup', 'Note', 'TotalAmount', 'Source', 'ExpectedDeliveryDate', 'ActualDeliveryDate', 'CreatedAt', 'UpdatedAt', 'ConfirmedAt', 'ConfirmedBy', 'LineDisplayName', 'AcceptedAt', 'PaidAt', 'DeliveringAt', 'DeliveredAt'];
const GB_DETAIL_HEADERS = ['OrderId', 'ProductId', 'ProductName', 'UnitPrice', 'Qty', 'Subtotal'];
const GB_MEMBERS_HEADERS = ['MemberNo', 'MemberId', 'DisplayName', 'PictureUrl', 'ReceiverName', 'Phone', 'Community', 'FloorRoom', 'DetailAddress', 'Remark', 'MemberStatus', 'WalletBalance', 'WalletTransactions', 'TotalOrders', 'TotalAmount', 'LastOrderAt', 'LastLoginAt', 'LoginHistory', 'MemberLevel', 'ReferredBy', 'CouponIds', 'DefaultPayment', 'FavoriteProducts', 'DefaultCommunityId', 'CreatedAt', 'UpdatedAt'];

function initGroupBuySheets_() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    
    // 初始化大樓群組綁定表
    let bindingSheet = ss.getSheetByName(GB_BINDINGS_SHEET_NAME);
    if (!bindingSheet) {
        bindingSheet = ss.insertSheet(GB_BINDINGS_SHEET_NAME);
        bindingSheet.appendRow(['GroupId', 'GroupName', 'UpdatedAt']);
        bindingSheet.setFrozenRows(1);
    }

    // 初始化會員資料表
    let membersSheet = ss.getSheetByName(GB_MEMBERS_SHEET_NAME);
    if (!membersSheet) {
        membersSheet = ss.insertSheet(GB_MEMBERS_SHEET_NAME);
        membersSheet.appendRow(GB_MEMBERS_HEADERS);
        membersSheet.setFrozenRows(1);
    } else {
        const existingHeaders = membersSheet.getRange(1, 1, 1, membersSheet.getLastColumn()).getValues()[0].map(h => String(h).trim());
        GB_MEMBERS_HEADERS.forEach(col => {
            if (!existingHeaders.includes(col)) {
                membersSheet.getRange(1, membersSheet.getLastColumn() + 1).setValue(col);
            }
        });
    }

    let orderSheet = ss.getSheetByName(GB_SHEET_NAME);
    if (!orderSheet) {
        orderSheet = ss.insertSheet(GB_SHEET_NAME);
        orderSheet.appendRow([...GB_HEADERS, 'PaymentMethod', 'TransferLastFive', 'PaymentStatus']);
        orderSheet.setFrozenRows(1);
    } else {
        // 自動偵測並補入所有 GB_HEADERS 中定義但工作表中缺少的欄位，以及付款與 LINE 相關欄位
        const existingHeaders = orderSheet.getRange(1, 1, 1, orderSheet.getLastColumn()).getValues()[0].map(h => String(h).trim());
        const allRequiredHeaders = [...GB_HEADERS, 'PaymentMethod', 'TransferLastFive', 'PaymentStatus'];
        allRequiredHeaders.forEach(col => {
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

    // 預留：奶包金交易紀錄表
    let walletTxSheet = ss.getSheetByName(GB_WALLET_TX_SHEET_NAME);
    if (!walletTxSheet) {
        walletTxSheet = ss.insertSheet(GB_WALLET_TX_SHEET_NAME);
        walletTxSheet.appendRow(['TransactionId', 'MemberNo', 'MemberId', 'Type', 'Amount', 'BalanceAfter', 'OrderId', 'Remark', 'CreatedAt']);
        walletTxSheet.setFrozenRows(1);
    }

    // 預留：通知紀錄表
    let notifLogsSheet = ss.getSheetByName(GB_NOTIF_LOGS_SHEET_NAME);
    if (!notifLogsSheet) {
        notifLogsSheet = ss.insertSheet(GB_NOTIF_LOGS_SHEET_NAME);
        notifLogsSheet.appendRow(['LogId', 'MemberId', 'Type', 'Title', 'Content', 'Status', 'CreatedAt']);
        notifLogsSheet.setFrozenRows(1);
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
    const { customerName, customerPhone, deliveryAddress, sourceGroup, note, items, paymentMethod, transferLastFive, lineDisplayName, lineUserId, source } = payload;

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
    set('Source', source || 'NORMAL');
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
    
    const oIdIdx = hIdx('OrderId');
    const statusIdx = hIdx('Status');
    const cliIdx = hIdx('CustomerLineId');
    const cnIdx  = hIdx('CustomerName');
    const cpIdx  = hIdx('CustomerPhone');
    const daIdx  = hIdx('DeliveryAddress');
    const sgIdx  = hIdx('SourceGroup');
    const nIdx   = hIdx('Note');
    const taIdx  = hIdx('TotalAmount');
    const pmIdx  = hIdx('PaymentMethod');
    const tlIdx  = hIdx('TransferLastFive');
    const psIdx  = hIdx('PaymentStatus');
    const ldnIdx = hIdx('LineDisplayName');
    const caIdx  = hIdx('CreatedAt');
    const uaIdx  = hIdx('UpdatedAt');
    const cfaIdx = hIdx('ConfirmedAt');
    const cfbIdx = hIdx('ConfirmedBy');

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
        const orderId = oIdIdx >= 0 ? String(row[oIdIdx] || '').trim() : '';
        const rowStatus = statusIdx >= 0 ? String(row[statusIdx] || '').trim() : '';
        if (!orderId) continue;
        if (status && rowStatus !== status) continue;

        orders.push({
            orderId,
            status: rowStatus,
            customerLineId: cliIdx >= 0 ? String(row[cliIdx] || '') : '',
            customerName: cnIdx >= 0 ? String(row[cnIdx] || '') : '',
            customerPhone: cpIdx >= 0 ? String(row[cpIdx] || '') : '',
            deliveryAddress: daIdx >= 0 ? String(row[daIdx] || '') : '',
            sourceGroup: sgIdx >= 0 ? String(row[sgIdx] || '') : '',
            note: nIdx >= 0 ? String(row[nIdx] || '') : '',
            totalAmount: taIdx >= 0 ? Number(row[taIdx]) || 0 : 0,
            paymentMethod: pmIdx >= 0 ? String(row[pmIdx] || '') : '',
            transferLastFive: tlIdx >= 0 ? String(row[tlIdx] || '') : '',
            paymentStatus: psIdx >= 0 ? String(row[psIdx] || '') : '',
            lineDisplayName: ldnIdx >= 0 ? String(row[ldnIdx] || '') : '',
            createdAt: caIdx >= 0 && row[caIdx] ? new Date(row[caIdx]).toISOString() : '',
            updatedAt: uaIdx >= 0 && row[uaIdx] ? new Date(row[uaIdx]).toISOString() : '',
            confirmedAt: cfaIdx >= 0 && row[cfaIdx] ? new Date(row[cfaIdx]).toISOString() : '',
            confirmedBy: cfbIdx >= 0 ? String(row[cfbIdx] || '') : '',
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

    // 動態更新主單欄位
    const headers = orderSheet.getRange(1, 1, 1, orderSheet.getLastColumn()).getValues()[0].map(h => String(h).trim());
    const setVal = (name, val) => {
        const idx = headers.indexOf(name);
        if (idx >= 0) {
            orderSheet.getRange(foundOrderRow, idx + 1).setValue(val);
        }
    };
    
    const oNameIdx = headers.indexOf('CustomerName');
    const oPhoneIdx = headers.indexOf('CustomerPhone');
    const oAddrIdx = headers.indexOf('DeliveryAddress');
    const oNoteIdx = headers.indexOf('Note');

    setVal('CustomerName', customerName || (oNameIdx >= 0 ? orderData[foundOrderRow-1][oNameIdx] : ''));
    setVal('CustomerPhone', customerPhone || (oPhoneIdx >= 0 ? orderData[foundOrderRow-1][oPhoneIdx] : ''));
    setVal('DeliveryAddress', deliveryAddress !== undefined ? deliveryAddress : (oAddrIdx >= 0 ? orderData[foundOrderRow-1][oAddrIdx] : ''));
    setVal('Note', note !== undefined ? note : (oNoteIdx >= 0 ? orderData[foundOrderRow-1][oNoteIdx] : ''));
    setVal('TotalAmount', totalAmount);
    setVal('UpdatedAt', now);

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
    const orderHeaders = orderSheet.getRange(1, 1, 1, orderSheet.getLastColumn()).getValues()[0].map(h => String(h).trim());
    const hIdx = name => orderHeaders.indexOf(name);
    const statusIdx = hIdx('Status');
    const cnIdx = hIdx('CustomerName');
    const taIdx = hIdx('TotalAmount');
    const daIdx = hIdx('DeliveryAddress');
    const sgIdx = hIdx('SourceGroup');

    if (statusIdx >= 0 && orderRecord[statusIdx] !== 'PENDING') throw new Error('此訂單已不是 PENDING 狀態');

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

    const customerName = cnIdx >= 0 ? String(orderRecord[cnIdx] || '') : '';
    const totalAmount = taIdx >= 0 ? Number(orderRecord[taIdx]) || 0 : 0;
    const deliveryAddress = daIdx >= 0 ? String(orderRecord[daIdx] || '') : '';
    const sourceGroup = sgIdx >= 0 ? String(orderRecord[sgIdx] || '') : '';

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
    const setOrderVal = (name, val) => {
        const idx = hIdx(name);
        if (idx >= 0) {
            orderSheet.getRange(foundOrderRow, idx + 1).setValue(val);
        }
    };
    setOrderVal('Status', 'CONFIRMED');
    setOrderVal('UpdatedAt', now2);
    setOrderVal('ConfirmedAt', now2);
    setOrderVal('ConfirmedBy', user.username);

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

function initBuildingSettingsSheet_() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName('Building_Settings');
    if (!sheet) {
        sheet = ss.insertSheet('Building_Settings');
        sheet.appendRow(['building', 'start_time', 'end_time']);
        sheet.setFrozenRows(1);
        
        // Add default "一般散客" row
        sheet.appendRow(['一般散客', '', '']);
        
        // Populate from existing bindings if possible
        const bindingsSheet = ss.getSheetByName('GroupBuy_GroupBindings');
        if (bindingsSheet) {
            try {
                const rows = bindingsSheet.getDataRange().getValues();
                const uniqueBuildings = new Set();
                for (let i = 1; i < rows.length; i++) {
                    const bname = String(rows[i][1] || '').trim();
                    if (bname && bname !== '一般散客') {
                        uniqueBuildings.add(bname);
                    }
                }
                uniqueBuildings.forEach(bname => {
                    sheet.appendRow([bname, '', '']);
                });
            } catch (err) {
                console.error('Failed to import existing buildings:', err);
            }
        }
    }
    return sheet;
}

function getBuildingSettingsService(payload, user) {
    const sheet = initBuildingSettingsSheet_();
    const rows = sheet.getDataRange().getValues();
    const settings = [];
    
    const formatDate = (val) => {
        if (!val) return '';
        if (val instanceof Date) {
            const pad = n => String(n).padStart(2, '0');
            return `${val.getFullYear()}/${pad(val.getMonth()+1)}/${pad(val.getDate())} ${pad(val.getHours())}:${pad(val.getMinutes())}`;
        }
        return String(val);
    };

    for (let i = 1; i < rows.length; i++) {
        const bname = String(rows[i][0] || '').trim();
        if (!bname) continue;
        
        settings.push({
            building: bname,
            start_time: formatDate(rows[i][1]),
            end_time: formatDate(rows[i][2])
        });
    }
    return settings;
}

function saveBuildingSettingsService(payload, user) {
    if (user.role !== 'BOSS') throw new Error('權限不足');
    const { building, start_time, end_time } = payload;
    if (!building) throw new Error('缺少大樓名稱');
    
    const sheet = initBuildingSettingsSheet_();
    const data = sheet.getDataRange().getValues();
    let foundRow = -1;
    for (let i = 1; i < data.length; i++) {
        if (String(data[i][0]).trim() === String(building).trim()) {
            foundRow = i + 1;
            break;
        }
    }
    
    const parseDate = (str) => {
        if (!str) return '';
        const d = new Date(str.replace(/\//g, '-'));
        return isNaN(d.getTime()) ? str : d;
    };
    
    const sDate = parseDate(start_time);
    const eDate = parseDate(end_time);
    
    if (foundRow !== -1) {
        sheet.getRange(foundRow, 2).setValue(sDate);
        sheet.getRange(foundRow, 3).setValue(eDate);
    } else {
        sheet.appendRow([building, sDate, eDate]);
    }
    SpreadsheetApp.flush();
    return { success: true };
}

// ==========================================
// 米立微會員中心 V1 - API Services
// ==========================================

function getRowIndexByColumnValue_(sheet, colIdx, value) {
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
        if (String(data[i][colIdx]).trim() === String(value).trim()) {
            return i + 1;
        }
    }
    return -1;
}

function v1_getMemberService(payload) {
    const { userId, displayName, pictureUrl } = payload;
    if (!userId) throw new Error('缺少 userId');

    initGroupBuySheets_(); // 確保表存在
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(GB_MEMBERS_SHEET_NAME);
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(h => String(h).trim());
    
    const hIdx = name => headers.indexOf(name);
    const idIdx = hIdx('MemberId');
    if (idIdx === -1) throw new Error('找不到 MemberId 欄位');

    let rowIdx = getRowIndexByColumnValue_(sheet, idIdx, userId);
    const now = new Date();

    if (rowIdx === -1) {
        // 新會員
        const newRow = new Array(headers.length).fill('');
        const set = (name, val) => { const i = hIdx(name); if (i >= 0) newRow[i] = val; };
        
        const newMemberNoStr = String(sheet.getLastRow()).padStart(6, '0');
        set('MemberNo', 'ML' + newMemberNoStr);
        set('MemberId', userId);
        set('DisplayName', displayName || '');
        set('PictureUrl', pictureUrl || '');
        set('WalletBalance', 0);
        set('TotalOrders', 0);
        set('TotalAmount', 0);
        set('MemberLevel', 'General');
        set('CreatedAt', now);
        set('LastLoginAt', now);
        set('UpdatedAt', now);
        
        const loginHist = [{ time: Utilities.formatDate(now, "Asia/Taipei", "MM/dd HH:mm"), device: "LINE" }];
        set('LoginHistory', JSON.stringify(loginHist));
        
        sheet.appendRow(newRow);
        rowIdx = sheet.getLastRow();
    } else {
        // 更新最後登入時間與大頭貼/暱稱 (若有傳入且與舊有不同)
        const loginIdx = hIdx('LastLoginAt');
        if (loginIdx >= 0) sheet.getRange(rowIdx, loginIdx + 1).setValue(now);
        
        const histIdx = hIdx('LoginHistory');
        if (histIdx >= 0) {
            try {
                const raw = sheet.getRange(rowIdx, histIdx + 1).getValue();
                let currentHist = raw ? JSON.parse(raw) : [];
                currentHist.push({ time: Utilities.formatDate(now, "Asia/Taipei", "MM/dd HH:mm"), device: "LINE" });
                if (currentHist.length > 50) currentHist = currentHist.slice(-50);
                sheet.getRange(rowIdx, histIdx + 1).setValue(JSON.stringify(currentHist));
            } catch(e) {}
        }
        
        const currentDisplayName = sheet.getRange(rowIdx, hIdx('DisplayName') + 1).getValue();
        const currentPictureUrl = sheet.getRange(rowIdx, hIdx('PictureUrl') + 1).getValue();
        
        if (displayName && displayName !== currentDisplayName) {
            sheet.getRange(rowIdx, hIdx('DisplayName') + 1).setValue(displayName);
        }
        if (pictureUrl && pictureUrl !== currentPictureUrl) {
            sheet.getRange(rowIdx, hIdx('PictureUrl') + 1).setValue(pictureUrl);
        }
    }
    
    SpreadsheetApp.flush();
    
    // 回傳會員資料
    const rowData = sheet.getRange(rowIdx, 1, 1, headers.length).getValues()[0];
    const member = {};
    headers.forEach((h, i) => {
        if (h) member[h] = rowData[i];
    });
    
    return { success: true, member };
}

function v1_saveMemberService(payload) {
    const { userId, displayName, pictureUrl, receiverName, phone, community, floorRoom, detailAddress, remark } = payload;
    if (!userId) throw new Error('缺少 userId');

    initGroupBuySheets_();
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(GB_MEMBERS_SHEET_NAME);
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(h => String(h).trim());
    
    const hIdx = name => headers.indexOf(name);
    let rowIdx = getRowIndexByColumnValue_(sheet, hIdx('MemberId'), userId);
    const now = new Date();

    if (rowIdx === -1) {
        // 如果還沒有這個會員，幫他建一個
        v1_getMemberService({ userId, displayName, pictureUrl });
        rowIdx = getRowIndexByColumnValue_(sheet, hIdx('MemberId'), userId);
    }
    
    const updates = {
        ReceiverName: receiverName,
        Phone: phone,
        Community: community,
        FloorRoom: floorRoom,
        DetailAddress: detailAddress,
        Remark: remark
    };
    if (displayName) updates.DisplayName = displayName;
    if (pictureUrl) updates.PictureUrl = pictureUrl;
    
    let hasChanges = false;
    Object.keys(updates).forEach(key => {
        const cIdx = hIdx(key);
        if (cIdx >= 0 && updates[key] !== undefined) {
            const currentVal = sheet.getRange(rowIdx, cIdx + 1).getValue();
            if (String(currentVal) !== String(updates[key])) {
                sheet.getRange(rowIdx, cIdx + 1).setValue(updates[key]);
                hasChanges = true;
            }
        }
    });
    
    if (hasChanges) {
        sheet.getRange(rowIdx, hIdx('UpdatedAt') + 1).setValue(now);
        SpreadsheetApp.flush();
    }
    return { success: true };
}

function v1_getOrdersService(payload) {
    const { userId } = payload;
    if (!userId) throw new Error('缺少 userId');

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const orderSheet = ss.getSheetByName(GB_SHEET_NAME);
    const detailSheet = ss.getSheetByName(GB_DETAIL_SHEET_NAME);
    
    if (!orderSheet || !detailSheet) return { success: true, orders: [] };
    
    const orderData = orderSheet.getDataRange().getValues();
    const detailData = detailSheet.getDataRange().getValues();
    
    const oHeaders = orderData[0].map(h => String(h).trim());
    const dHeaders = detailData[0].map(h => String(h).trim());
    
    const ohIdx = name => oHeaders.indexOf(name);
    const dhIdx = name => dHeaders.indexOf(name);
    
    const cliIdx = ohIdx('CustomerLineId');
    if (cliIdx === -1) return { success: true, orders: [] };

    const userOrders = [];
    
    for (let i = 1; i < orderData.length; i++) {
        if (String(orderData[i][cliIdx]).trim() === String(userId).trim()) {
            const row = orderData[i];
            const orderId = row[ohIdx('OrderId')];
            
            const o = {};
            oHeaders.forEach((h, idx) => {
                if (h) o[h] = row[idx];
            });
            
            // 撈取明細
            o.items = [];
            for (let j = 1; j < detailData.length; j++) {
                if (String(detailData[j][dhIdx('OrderId')]).trim() === String(orderId).trim()) {
                    const item = {};
                    dHeaders.forEach((h, idx) => {
                        if (h) item[h] = detailData[j][idx];
                    });
                    o.items.push(item);
                }
            }
            
            userOrders.push(o);
        }
    }
    
    // 依建立時間反序排序
    userOrders.sort((a, b) => new Date(b.CreatedAt) - new Date(a.CreatedAt));
    
    return { success: true, orders: userOrders };
}

function v1_reorderService(payload) {
    const { orderId } = payload;
    if (!orderId) throw new Error('缺少 orderId');

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const orderSheet = ss.getSheetByName(GB_SHEET_NAME);
    const detailSheet = ss.getSheetByName(GB_DETAIL_SHEET_NAME);
    
    if (!orderSheet || !detailSheet) throw new Error('找不到訂單表');
    
    const orderData = orderSheet.getDataRange().getValues();
    const oHeaders = orderData[0].map(h => String(h).trim());
    const ohIdx = name => oHeaders.indexOf(name);
    
    let orderRow = null;
    for (let i = 1; i < orderData.length; i++) {
        if (String(orderData[i][ohIdx('OrderId')]).trim() === String(orderId).trim()) {
            orderRow = orderData[i];
            break;
        }
    }
    
    if (!orderRow) throw new Error('找不到該訂單');
    
    const deliveryAddress = orderRow[ohIdx('DeliveryAddress')] || '';
    const paymentMethod = orderRow[ohIdx('PaymentMethod')] || '';
    const note = orderRow[ohIdx('Note')] || '';
    
    const detailData = detailSheet.getDataRange().getValues();
    const dHeaders = detailData[0].map(h => String(h).trim());
    const dhIdx = name => dHeaders.indexOf(name);
    
    const items = [];
    for (let j = 1; j < detailData.length; j++) {
        if (String(detailData[j][dhIdx('OrderId')]).trim() === String(orderId).trim()) {
            const item = {};
            dHeaders.forEach((h, idx) => {
                if (h) item[h] = detailData[j][idx];
            });
            items.push(item);
        }
    }
    
    const cart = {};
    items.forEach(item => {
        if (item.ProductId) {
            cart[item.ProductId] = Number(item.Qty) || 1;
        }
    });

    let community = "";
    let floorRoom = "";
    if (deliveryAddress) {
        const match = deliveryAddress.match(/(.*?\s*)\s+(.*)/);
        if (match) {
            community = match[1].trim();
            floorRoom = match[2].trim();
        } else {
            floorRoom = deliveryAddress;
        }
    }

    return { 
        success: true, 
        cart,
        delivery: {
            community,
            floorRoom,
            deliveryAddress
        },
        payment: {
            method: paymentMethod
        },
        remark: {
            note
        },
        items 
    };
}

