/**
 * Service_User_Management.gs
 * [Service] 使用者新增、刪除與狀態更新
 */

function addUserService(payload) {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Users");
    if (!sheet) {
        sheet = SpreadsheetApp.getActiveSpreadsheet().insertSheet("Users");
        sheet.appendRow(["UserID", "Username", "PasswordHash", "Role", "Status", "CreatedAt", "Permissions"]);
    }
    
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
        if (data[i][1] == payload.username) {
            return { error: "此帳號(姓名)已存在" };
        }
    }
    
    var newID = Utilities.getUuid(); 
    var timestamp = Utilities.formatDate(new Date(), "Asia/Taipei", "yyyy/MM/dd HH:mm:ss");

    var passwordHash = payload.password;
    if (payload.password) {
        var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, payload.password);
        passwordHash = Utilities.base64Encode(digest);
    }

    sheet.appendRow([
        newID,
        payload.username,
        passwordHash, 
        payload.role || "EMPLOYEE",
        "ACTIVE",
        timestamp,
        "[]"
    ]);
    
    return { success: true };
}

function deleteUserService(payload) {
    var targetUser = payload.username;
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Users");
    if (!sheet) return { error: "找不到 Users 資料表" };
    
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
        if (data[i][1] == targetUser) {
            sheet.deleteRow(i + 1);
            return { success: true };
        }
    }
    return { error: "找不到該使用者" };
}

function updateUserStatusService(payload) {
    if (!payload.username || !payload.status) return { error: "Missing parameters" };
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Users");
    if (!sheet) return { error: "No Users sheet" };
    
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
        if (data[i][1] == payload.username) {
            sheet.getRange(i + 1, 5).setValue(payload.status);
            return { success: true };
        }
    }
    return { error: "User not found" };
}
