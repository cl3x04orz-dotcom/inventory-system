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
