/**
 * GroupBuy_V2_Database.gs
 * Phase 2 新版核心資料庫 (Community & Campaign)
 */

const GB_COMMUNITIES_SHEET_NAME = 'GroupBuy_Communities';
const GB_CAMPAIGNS_SHEET_NAME = 'GroupBuy_Campaigns';
const GB_AUDITLOGS_SHEET_NAME = 'GroupBuy_AuditLogs';
const GB_ORDERSTATUSHISTORY_SHEET_NAME = 'GroupBuy_OrderStatusHistory'; // Phase 3 預留
const GB_NOTIFICATIONS_SHEET_NAME = 'GroupBuy_Notifications';         // Phase 3 預留
const GB_SYSTEMSETTINGS_SHEET_NAME = 'GroupBuy_SystemSettings';

const GB_COMMUNITIES_HEADERS = [
    'CommunityId', 'CommunityCode', 'CommunityName', 'CommunityType', 'OrderingMode',
    'ServiceArea', 'IsDefault', 'Icon', 'ContactPerson', 'ContactPhone',
    'OpenMessage', 'CloseMessage', 'DefaultDeliveryTime', 'DefaultFreeShipping',
    'DefaultPaymentMethods', 'DefaultRoute', 'DeliveryInstruction', 'Status',
    'Notes', 'CreatedBy', 'UpdatedBy', 'CreatedAt', 'UpdatedAt', 'DeletedAt'
];

const GB_CAMPAIGNS_HEADERS = [
    'CampaignId', 'CommunityId', 'CampaignName', 'CampaignType', 'CampaignStatus',
    'Version', 'AllowReorder', 'ThemeColor', 'DisplayOrder', 'Priority',
    'PublishedAt', 'StartTime', 'EndTime', 'DeliveryDate', 'DeliveryStartTime', 'DeliveryEndTime',
    'SystemAnnouncement', 'GroupAnnouncement', 'CreatedBy', 'UpdatedBy',
    'CreatedAt', 'UpdatedAt'
];

const GB_AUDITLOGS_HEADERS = [
    'LogId', 'Module', 'Action', 'TargetId', 'FieldName', 'OldValue', 'NewValue',
    'Operator', 'IPAddress', 'Device', 'CreatedAt'
];

const GB_ORDERSTATUSHISTORY_HEADERS = [
    'HistoryId', 'OrderId', 'Status', 'Remark', 'Operator', 'CreatedAt'
];

const GB_NOTIFICATIONS_HEADERS = [
    'NotificationId', 'OrderId', 'MemberId', 'Type', 'LINE', 'Email', 'Push',
    'Content', 'Status', 'CreatedAt'
];

const GB_SYSTEMSETTINGS_HEADERS = [
    'SettingKey', 'SettingValue'
];

function initGroupBuyV2Sheets_() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    
    // 初始化 Communities 表
    _initSheet(ss, GB_COMMUNITIES_SHEET_NAME, GB_COMMUNITIES_HEADERS);

    // 初始化 Campaigns 表
    _initSheet(ss, GB_CAMPAIGNS_SHEET_NAME, GB_CAMPAIGNS_HEADERS);
    
    // 初始化 AuditLogs 表
    _initSheet(ss, GB_AUDITLOGS_SHEET_NAME, GB_AUDITLOGS_HEADERS);

    // 初始化 Phase 3 預留表
    _initSheet(ss, GB_ORDERSTATUSHISTORY_SHEET_NAME, GB_ORDERSTATUSHISTORY_HEADERS);
    _initSheet(ss, GB_NOTIFICATIONS_SHEET_NAME, GB_NOTIFICATIONS_HEADERS);
    
    // 初始化系統全域設定表
    _initSheet(ss, GB_SYSTEMSETTINGS_SHEET_NAME, GB_SYSTEMSETTINGS_HEADERS);
}

function _initSheet(ss, sheetName, expectedHeaders) {
    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
        sheet = ss.insertSheet(sheetName);
        sheet.appendRow(expectedHeaders);
        sheet.setFrozenRows(1);
    } else {
        const lastCol = sheet.getLastColumn();
        if (lastCol === 0) {
            sheet.appendRow(expectedHeaders);
            sheet.setFrozenRows(1);
        } else {
            const existingHeaders = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h).trim());
            const newHeaders = [];
            expectedHeaders.forEach(col => {
                if (!existingHeaders.includes(col)) {
                    newHeaders.push(col);
                }
            });
            if (newHeaders.length > 0) {
                sheet.getRange(1, lastCol + 1, 1, newHeaders.length).setValues([newHeaders]);
            }
        }
    }
}

// --- Migrated V1 Constants & Init ---
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
