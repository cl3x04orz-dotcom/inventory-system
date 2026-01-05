/**
 * Unified API Caller for Google Apps Script (GAS)
 */
export const callGAS = async (apiUrl, action, payload, token = null) => {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

        const response = await fetch(apiUrl, {
            method: 'POST',
            redirect: 'follow', // GAS requirement
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({
                action,
                payload,
                token
            }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        if (data.error) {
            throw new Error(data.error);
        }
        return data;
    } catch (error) {
        console.error(`API Error [${action}]:`, error);
        
        if (error.name === 'AbortError') {
            throw new Error('請求超時，請檢查網路連線或 GAS 伺服器狀態。');
        }
        
        if (error.message.includes('Load failed') || error.message.includes('Failed to fetch')) {
            throw new Error('連線失敗。請確認 GAS 已部署為「Anyone」且網址正確，並檢查瀏覽器是否阻擋了 CORS 請求。');
        }
        
        throw error;
    }
};
