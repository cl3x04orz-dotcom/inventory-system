/**
 * Utils_ApiResponse.gs
 * Phase 2 標準 API 回傳格式封裝
 */

const ApiResponse = {
    /**
     * 成功回傳
     * @param {Object} data 回傳資料
     * @param {string} message 成功訊息
     * @returns {Object} 標準化成功格式
     */
    success(data = {}, message = "SUCCESS") {
        return {
            success: true,
            code: "SUCCESS",
            data: data,
            message: message,
            version: "v2",
            timestamp: new Date().toISOString(),
            requestId: _generateRequestId()
        };
    },

    /**
     * 失敗回傳
     * @param {string} code 錯誤代碼 (e.g., CAMPAIGN_CLOSED)
     * @param {string} message 錯誤訊息
     * @returns {Object} 標準化錯誤格式
     */
    error(code, message) {
        return {
            success: false,
            code: code,
            data: {},
            message: message,
            version: "v2",
            timestamp: new Date().toISOString(),
            requestId: _generateRequestId()
        };
    }
};

/**
 * 產生請求的唯一 Request ID
 */
function _generateRequestId() {
    const now = new Date();
    const dateStr = Utilities.formatDate(now, "GMT+8", "yyyyMMdd");
    const randomStr = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `REQ${dateStr}${randomStr}`;
}
