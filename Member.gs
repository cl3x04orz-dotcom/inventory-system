/**
 * Member.gs
 * Sprint 5 會員中心
 */

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

