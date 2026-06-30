/**
 * GroupBuy_V2_Order.gs
 * Phase 2 後端訂單 API
 */

function v2_createOrderService(payload) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const orderSheet = ss.getSheetByName(GB_SHEET_NAME);
    const detailSheet = ss.getSheetByName(GB_DETAIL_SHEET_NAME);
    const commSheet = ss.getSheetByName(GB_COMMUNITIES_SHEET_NAME);
    const campSheet = ss.getSheetByName(GB_CAMPAIGNS_SHEET_NAME);
    
    if (!orderSheet || !detailSheet || !commSheet || !campSheet) {
        return ApiResponse.error("DB_NOT_READY", "系統維護中");
    }

    const {
        customerName,
        customerPhone,
        deliveryAddress,
        CommunityId,
        CampaignId,
        sourceGroup, // fallback
        note,
        paymentMethod,
        transferLastFive,
        lineDisplayName,
        lineUserId,
        items
    } = payload;

    if (!items || items.length === 0) {
        return ApiResponse.error("EMPTY_CART", "購物車為空");
    }

    // 取得快照資訊
    let commNameSnap = sourceGroup;
    let campNameSnap = "";
    let campTypeSnap = "";
    let deliveryDateSnap = "";
    let deliveryTimeSnap = "";

    // 去查 Community
    if (CommunityId) {
        const commData = commSheet.getDataRange().getValues();
        const headers = commData[0].map(h => String(h).trim());
        const row = commData.find(r => r[headers.indexOf('CommunityId')] === CommunityId);
        if (row) {
            commNameSnap = row[headers.indexOf('CommunityName')];
        }
    }

    // 去查 Campaign
    if (CampaignId) {
        const campData = campSheet.getDataRange().getValues();
        const headers = campData[0].map(h => String(h).trim());
        const row = campData.find(r => r[headers.indexOf('CampaignId')] === CampaignId);
        if (row) {
            campNameSnap = row[headers.indexOf('CampaignName')];
            campTypeSnap = row[headers.indexOf('CampaignType')];
            deliveryDateSnap = row[headers.indexOf('DeliveryDate')];
            const startTime = row[headers.indexOf('DeliveryStartTime')];
            const endTime = row[headers.indexOf('DeliveryEndTime')];
            if (startTime && endTime) deliveryTimeSnap = `${startTime}~${endTime}`;
        }
    }

    // 產生訂單編號 OrderNo: GB202607010001
    const now = new Date();
    const dateStr = Utilities.formatDate(now, "GMT+8", "yyyyMMdd");
    const orderId = Utilities.getUuid();
    
    // 取得當日最後一筆序號
    let seq = 1;
    if (orderSheet.getLastRow() > 1) {
        const lastRow = orderSheet.getRange(orderSheet.getLastRow(), 1, 1, orderSheet.getLastColumn()).getValues()[0];
        const lastOrderNo = lastRow[1]; // 假設 OrderNo 在第 2 欄 (index 1)
        if (lastOrderNo && lastOrderNo.startsWith('GB' + dateStr)) {
            seq = parseInt(lastOrderNo.substring(10), 10) + 1;
        }
    }
    const orderNo = `GB${dateStr}${String(seq).padStart(4, '0')}`;
    const totalAmount = items.reduce((sum, item) => sum + (item.unitPrice * item.qty), 0);
    const combinedNote = [note, transferLastFive ? `後五碼:${transferLastFive}` : ""].filter(Boolean).join(" | ");

    const newOrderRow = new Array(GB_HEADERS.length).fill("");
    const headers = GB_HEADERS;

    newOrderRow[headers.indexOf('OrderId')] = orderId;
    newOrderRow[headers.indexOf('OrderNo')] = orderNo;
    newOrderRow[headers.indexOf('OrderVersion')] = 1;
    newOrderRow[headers.indexOf('CommunityId')] = CommunityId;
    newOrderRow[headers.indexOf('CampaignId')] = CampaignId;
    newOrderRow[headers.indexOf('CommunityNameSnapshot')] = commNameSnap;
    newOrderRow[headers.indexOf('CampaignNameSnapshot')] = campNameSnap;
    newOrderRow[headers.indexOf('CampaignTypeSnapshot')] = campTypeSnap;
    newOrderRow[headers.indexOf('DeliveryDateSnapshot')] = deliveryDateSnap;
    newOrderRow[headers.indexOf('DeliveryTimeSnapshot')] = deliveryTimeSnap;
    newOrderRow[headers.indexOf('PaymentMethodSnapshot')] = paymentMethod;
    newOrderRow[headers.indexOf('DeliveryInstructionSnapshot')] = "";
    newOrderRow[headers.indexOf('Status')] = '未確認';
    newOrderRow[headers.indexOf('DeliveryStatus')] = Enums.DeliveryStatus.ORDER_RECEIVED;
    newOrderRow[headers.indexOf('CustomerLineId')] = lineUserId;
    newOrderRow[headers.indexOf('CustomerName')] = customerName;
    newOrderRow[headers.indexOf('CustomerPhone')] = customerPhone;
    newOrderRow[headers.indexOf('DeliveryAddress')] = deliveryAddress;
    newOrderRow[headers.indexOf('SourceGroup')] = commNameSnap;
    newOrderRow[headers.indexOf('Note')] = combinedNote;
    newOrderRow[headers.indexOf('TotalAmount')] = totalAmount;
    newOrderRow[headers.indexOf('Source')] = 'LIFF_V2';
    newOrderRow[headers.indexOf('CreatedAt')] = now;
    newOrderRow[headers.indexOf('UpdatedAt')] = now;
    newOrderRow[headers.indexOf('LineDisplayName')] = lineDisplayName;

    orderSheet.appendRow(newOrderRow);

    const detailRows = items.map(item => {
        const row = new Array(GB_DETAIL_HEADERS.length).fill("");
        row[GB_DETAIL_HEADERS.indexOf('OrderId')] = orderId;
        row[GB_DETAIL_HEADERS.indexOf('ProductId')] = item.productId;
        row[GB_DETAIL_HEADERS.indexOf('ProductName')] = item.productName + (item.remark ? ` (${item.remark})` : '');
        row[GB_DETAIL_HEADERS.indexOf('UnitPrice')] = item.unitPrice;
        row[GB_DETAIL_HEADERS.indexOf('Qty')] = item.qty;
        row[GB_DETAIL_HEADERS.indexOf('Subtotal')] = item.unitPrice * item.qty;
        return row;
    });

    if (detailRows.length > 0) {
        detailSheet.getRange(detailSheet.getLastRow() + 1, 1, detailRows.length, detailRows[0].length).setValues(detailRows);
    }

    return ApiResponse.success({ orderId, orderNo });
}

// --- Migrated Admin Order Services ---
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
