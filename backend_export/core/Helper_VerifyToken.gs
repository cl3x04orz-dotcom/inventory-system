/**
 * Helper_VerifyToken.gs
 * [Helper] 驗證 Token (確保回傳 permissions)
 */
function verifyToken(token) {
    try {
        var json = Utilities.newBlob(Utilities.base64Decode(token)).getDataAsString();
        var user = JSON.parse(json);
        if (!user.permissions) user.permissions = [];
        return user;
    } catch (e) {
        return null;
    }
}
