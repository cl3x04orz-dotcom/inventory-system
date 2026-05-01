/**
 * Unified API Caller for Google Apps Script (GAS)
 */
export const callGAS = async (apiUrl, action, payload, token = null) => {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout

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
        
        // 檢查 Token 是否過期
        if (data.error && (data.error === 'TokenExpired' || data.error.includes('Unauthorized'))) {
            // 如果當前動作不是 renewToken，則嘗試自動續約並重試
            if (action !== 'renewToken' && token) {
                console.warn(`[API] Token 過期，嘗試自動續約: ${action}`);
                try {
                    const renewRes = await callGAS(apiUrl, 'renewToken', {}, token);
                    if (renewRes && renewRes.success && renewRes.token) {
                        console.log('[API] 自動續約成功，重試原始請求');
                        
                        // 更新本地存儲的 token (給下次其他請求用)
                        const savedUser = sessionStorage.getItem('inventory_user');
                        if (savedUser) {
                            const userData = JSON.parse(savedUser);
                            userData.token = renewRes.token;
                            sessionStorage.setItem('inventory_user', JSON.stringify(userData));
                            
                            // 這裡我們發出一個事件，讓 App.jsx 知道要更新 state 中的 user
                            window.dispatchEvent(new CustomEvent('token_renewed', { detail: userData }));
                        }

                        // 使用新 Token 重試原始請求
                        return await callGAS(apiUrl, action, payload, renewRes.token);
                    }
                } catch (renewError) {
                    console.error('[API] 自動續約失敗:', renewError);
                }
            }
            
            // 如果續約失敗或沒提供 token，才丟出事件讓 App.jsx 跳出登入頁
            window.dispatchEvent(new CustomEvent('auth_expired'));
            throw new Error(data.error);
        }

        if (data.error) {
            throw new Error(data.error);
        }
        
        return data;
    } catch (error) {
        // ... (保持原有錯誤處理)
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
