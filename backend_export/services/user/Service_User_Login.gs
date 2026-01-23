/**
 * Service_User_Login.gs
 * [API] 使用者登入
 */
function login(payload) {
    if (!payload.username || !payload.password) return { error: "請輸入帳號和密碼" };

    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Users");
    if (!sheet) return { error: "使用者資料庫不存在" };

    var data = sheet.getDataRange().getDisplayValues();
    
    for (var i = 1; i < data.length; i++) {
        var rowUser = data[i][1]; 
        var rowPass = data[i][2]; 
        var rowRole = data[i][3]; 
        var rowStatus = data[i][4]; 
        var rowPerms = data[i][6]; 

        if (String(rowUser).trim() === String(payload.username).trim()) {
            if (rowStatus !== 'ACTIVE') return { error: "此帳號已被停用" };

            var isValidPass = false;
            if (payload.password === rowPass) {
                isValidPass = true;
            } else {
                var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, payload.password);
                var computedHash = Utilities.base64Encode(digest);
                if (computedHash === rowPass) isValidPass = true;
            }

            if (isValidPass) {
                var permissions = [];
                try {
                    if (rowPerms && String(rowPerms).trim() !== "") {
                        var permStr = String(rowPerms).trim();
                        permStr = permStr.replace(/[“”]/g, '"').replace(/[’‘]/g, "'");
                        if (permStr.startsWith('[') && permStr.endsWith(']')) {
                            permissions = JSON.parse(permStr);
                        } else {
                            permissions = [permStr];
                        }
                    }
                } catch(e) { permissions = []; }
                
                var tokenPayload = {
                    username: rowUser,
                    role: rowRole,
                    timestamp: new Date().getTime(),
                    permissions: permissions 
                };
                
                var token = Utilities.base64Encode(Utilities.newBlob(JSON.stringify(tokenPayload)).getBytes());
                
                return { 
                    success: true, 
                    token: token,
                    username: rowUser, 
                    role: rowRole,
                    permissions: permissions 
                };
            } else {
                return { error: "密碼錯誤" };
            }
        }
    }
    return { error: "找不到此帳號" };
}
