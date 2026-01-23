/**
 * Service_GetUsers.gs
 * [Service] 獲取使用者列表
 */
function getUsersService() {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Users");
    if (!sheet) return [];
  
    var data = sheet.getDataRange().getDisplayValues();
    var users = [];
    
    for (var i = 1; i < data.length; i++) {
        if(!data[i][1]) continue; 
        
        var perms = [];
        try {
            var rowPerms = data[i][6]; 
            if (rowPerms) {
                var permStr = String(rowPerms).trim();
                permStr = permStr.replace(/[“”]/g, '"').replace(/[’‘]/g, "'");
                if (permStr.startsWith('[')) {
                    perms = JSON.parse(permStr);
                } else if (permStr) {
                    perms = [permStr];
                }
            }
        } catch(e) { perms = []; }
        
        users.push({
            userid: data[i][0],
            username: data[i][1],
            role: data[i][3],
            status: data[i][4],
            permissions: Array.isArray(perms) ? perms : []
        });
    }
    return users;
}
