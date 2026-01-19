/**
 * ActivityLog.gs - 操作紀錄管理服務
 * 功能: 記錄使用者活動、查詢記錄、自動清理舊記錄
 */

/**
 * 初始化 ActivityLogs Sheet
 */
function initActivityLogsSheet() {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("ActivityLogs");
    
    if (!sheet) {
        sheet = ss.insertSheet("ActivityLogs");
        sheet.getRange(1, 1, 1, 8).setValues([[
            "Timestamp", "Username", "Action Type", "Page", "Details", "User Agent", "Screen Resolution", "IP Address"
        ]]);
        sheet.getRange(1, 1, 1, 8).setFontWeight("bold").setBackground("#4285f4").setFontColor("#ffffff");
        sheet.setFrozenRows(1);
    }
    
    return sheet;
}

/**
 * 記錄活動 (批次)
 */
function logActivityService(payload) {
    try {
        var sheet = initActivityLogsSheet();
        var logs = payload.logs || [];
        
        if (logs.length === 0) return { success: true, count: 0 };
        
        var rows = logs.map(function(log) {
            return [
                log.timestamp || new Date().toISOString(),
                log.username || '',
                log.actionType || '',
                log.page || '',
                log.details || '',
                log.userAgent || '',
                log.screenResolution || '',
                log.ipAddress || ''
            ];
        });
        
        sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 8).setValues(rows);
        
        return { success: true, count: rows.length };
    } catch (error) {
        console.error('Error logging activity:', error);
        return { success: false, error: error.message };
    }
}

/**
 * 查詢活動記錄
 */
function getActivityLogsService(payload, userRole, username) {
    try {
        var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("ActivityLogs");
        if (!sheet) return [];
        
        var data = sheet.getDataRange().getValues();
        var logs = [];
        
        var startDate = payload.startDate ? new Date(payload.startDate) : null;
        var endDate = payload.endDate ? new Date(payload.endDate) : null;
        
        // 確保搜尋範圍涵蓋當天全部時間 (修正 1/19 只能搜到 1/20 的問題)
        if (startDate) startDate.setHours(0, 0, 0, 0);
        if (endDate) endDate.setHours(23, 59, 59, 999);
        
        var filterUsername = payload.username || null;
        var filterActionType = payload.actionType || null;
        
        // 非 BOSS/ADMIN 只能看自己的記錄
        if (userRole !== 'BOSS' && userRole !== 'ADMIN') {
            filterUsername = username;
        }
        
        for (var i = 1; i < data.length; i++) {
            var timestamp = new Date(data[i][0]);
            var logUsername = data[i][1];
            var actionType = data[i][2];
            
            // 篩選條件
            if (startDate && timestamp < startDate) continue;
            if (endDate && timestamp > endDate) continue;
            if (filterUsername && logUsername !== filterUsername) continue;
            if (filterActionType && actionType !== filterActionType) continue;
            
            logs.push({
                timestamp: data[i][0],
                username: data[i][1],
                actionType: data[i][2],
                page: data[i][3],
                details: data[i][4],
                userAgent: data[i][5],
                screenResolution: data[i][6],
                ipAddress: data[i][7]
            });
        }
        
        // 按時間倒序排列
        logs.sort(function(a, b) {
            return new Date(b.timestamp) - new Date(a.timestamp);
        });
        
        // 限制返回數量 (最多 1000 筆)
        return logs.slice(0, 1000);
    } catch (error) {
        console.error('Error getting activity logs:', error);
        return [];
    }
}

/**
 * 清理 90 天前的舊記錄
 */
function cleanupOldLogs() {
    try {
        var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("ActivityLogs");
        if (!sheet) return { success: true, deleted: 0 };
        
        var data = sheet.getDataRange().getValues();
        var cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - 90); // 90 天前
        
        var rowsToDelete = [];
        
        // 從後往前檢查,找出要刪除的行
        for (var i = data.length - 1; i >= 1; i--) {
            var timestamp = new Date(data[i][0]);
            if (timestamp < cutoffDate) {
                rowsToDelete.push(i + 1); // +1 因為 sheet 行號從 1 開始
            }
        }
        
        // 批次刪除
        if (rowsToDelete.length > 0) {
            // 從後往前刪除,避免行號變化
            for (var j = 0; j < rowsToDelete.length; j++) {
                sheet.deleteRow(rowsToDelete[j]);
            }
        }
        
        Logger.log('Cleaned up ' + rowsToDelete.length + ' old activity logs');
        return { success: true, deleted: rowsToDelete.length };
    } catch (error) {
        console.error('Error cleaning up old logs:', error);
        return { success: false, error: error.message };
    }
}

/**
 * 設定自動清理觸發器 (每週執行一次)
 * 需要手動在 Google Apps Script 編輯器中執行一次此函數來建立觸發器
 */
function setupCleanupTrigger() {
    // 先刪除現有的觸發器
    var triggers = ScriptApp.getProjectTriggers();
    for (var i = 0; i < triggers.length; i++) {
        if (triggers[i].getHandlerFunction() === 'cleanupOldLogs') {
            ScriptApp.deleteTrigger(triggers[i]);
        }
    }
    
    // 建立新的每週觸發器 (每週日凌晨 2 點執行)
    ScriptApp.newTrigger('cleanupOldLogs')
        .timeBased()
        .onWeekDay(ScriptApp.WeekDay.SUNDAY)
        .atHour(2)
        .create();
    
    Logger.log('Cleanup trigger created successfully');
}
