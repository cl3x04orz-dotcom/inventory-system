/**
 * Service_UpdateUserPermissions.gs
 * [Service] 更新使用者權限
 */
function updateUserPermissionsService(payload) {
    if (!payload.username) return { error: "Missing username" };

    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Users");
    if (!sheet) return { error: "No Users sheet" };
    
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
        if (data[i][1] == payload.username) {
            var permString = JSON.stringify(payload.permissions || []);
            sheet.getRange(i + 1, 7).setValue(permString); 
            return { success: true };
        }
    }
    return { error: "User not found" };
}
