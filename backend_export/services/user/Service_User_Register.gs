/**
 * Service_User_Register.gs
 * [API] 使用者註冊 (含首位 BOSS 邏輯)
 */
function register({ username, password }) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Users');
    const users = sheet.getDataRange().getValues();
    const cleanUsername = String(username).trim();
    
    if (users.some(u => String(u[1]).trim() === cleanUsername)) {
        throw new Error('此帳號已存在 (Username exists)');
    }
    
    const userId = Utilities.getUuid(); 
    const passHash = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, password));
    const isFirst = users.length <= 1;
    const role = isFirst ? 'BOSS' : 'EMPLOYEE';
    const status = isFirst ? 'ACTIVE' : 'PENDING';
    
    sheet.appendRow([userId, cleanUsername, passHash, role, status, new Date(), "[]"]);
    
    if (isFirst) {
        return { success: true, message: '註冊成功！您是第一位使用者，已自動升級為 BOSS 並開通。' };
    } else {
        return { success: true, message: '註冊成功！帳號狀態為「審核中 (PENDING)」，請等待老闆開通。' };
    }
}
