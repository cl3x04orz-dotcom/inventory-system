/**
 * Service_ActivityLog.gs
 * [Service] 操作紀錄紀錄與查詢
 */

function initActivityLogsSheet() {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("ActivityLogs");
    if (!sheet) {
        sheet = ss.insertSheet("ActivityLogs");
        sheet.getRange(1, 1, 1, 8).setValues([[
            "Timestamp", "Username", "Action Type", "Page", "Details", "User Agent", "Screen Resolution", "IP Address"
        ]]);
        sheet.setFrozenRows(1);
    }
    return sheet;
}

function logActivityService(payload) {
    var sheet = initActivityLogsSheet();
    var logs = payload.logs || [];
    if (logs.length === 0) return { success: true, count: 0 };
    var rows = logs.map(l => [l.timestamp || new Date().toISOString(), l.username || '', l.actionType || '', l.page || '', l.details || '', l.userAgent || '', l.screenResolution || '', l.ipAddress || '']);
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 8).setValues(rows);
    return { success: true, count: rows.length };
}

function getActivityLogsService(payload, userRole, username) {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("ActivityLogs");
    if (!sheet) return [];
    var data = sheet.getDataRange().getValues();
    var logs = [];
    var start = payload.startDate ? new Date(payload.startDate) : null;
    var end = payload.endDate ? new Date(payload.endDate) : null;
    if (start) start.setHours(0,0,0,0);
    if (end) end.setHours(23,59,59,999);
    
    var filterUser = (userRole !== 'BOSS' && userRole !== 'ADMIN') ? username : (payload.username || null);

    for (var i = 1; i < data.length; i++) {
        var time = new Date(data[i][0]);
        if (start && time < start) continue;
        if (end && time > end) continue;
        if (filterUser && data[i][1] !== filterUser) continue;
        logs.push({ timestamp: data[i][0], username: data[i][1], actionType: data[i][2], page: data[i][3], details: data[i][4] });
    }
    return logs.sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 1000);
}
