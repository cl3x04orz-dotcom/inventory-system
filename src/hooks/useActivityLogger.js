import { useEffect, useRef } from 'react';
import { callGAS } from '../utils/api';

/**
 * useActivityLogger - 自動記錄使用者活動的 Custom Hook
 * @param {Object} options - 配置選項
 * @param {Object} options.user - 使用者物件
 * @param {string} options.apiUrl - API URL
 * @param {boolean} options.enabled - 是否啟用記錄 (預設 true)
 */
const useActivityLogger = ({ user, apiUrl, enabled = true }) => {
    const logQueue = useRef([]);
    const flushTimer = useRef(null);

    // 記錄活動 (支援兩種傳遞方式: 1. logActivity('TYPE', {details}) 2. logActivity({actionType: 'TYPE', ...details}))
    const logActivity = async (actionTypeOrObj, details = {}) => {
        if (!enabled || !user?.token) return;

        let actionType = actionTypeOrObj;
        let finalDetails = details;

        // 如果第一個參數是物件，則解析它
        if (typeof actionTypeOrObj === 'object' && actionTypeOrObj !== null) {
            actionType = actionTypeOrObj.actionType;
            finalDetails = { ...actionTypeOrObj };
            // 如果物件裡面已經有 details 字串（為了相容之前的寫法），則不重複 JSON.stringify
            if (typeof finalDetails.details === 'string') {
                try {
                    const parsedDetails = JSON.parse(finalDetails.details);
                    Object.assign(finalDetails, parsedDetails);
                    delete finalDetails.details;
                } catch (e) {
                    // 如果不是 JSON 格式，就保留原樣
                }
            }
        }

        const logEntry = {
            username: user.username,
            actionType: actionType || 'UNKNOWN',
            page: finalDetails.page || window.location.pathname,
            details: JSON.stringify(finalDetails),
            timestamp: new Date().toISOString(),
            userAgent: navigator.userAgent,
            screenResolution: `${window.screen.width}x${window.screen.height}`
        };

        // 加入佇列
        logQueue.current.push(logEntry);

        // 批次發送 (每 5 秒或累積 10 筆)
        if (logQueue.current.length >= 10) {
            flushLogs();
        } else {
            scheduleFlush();
        }
    };

    // 排程發送
    const scheduleFlush = () => {
        if (flushTimer.current) return;

        flushTimer.current = setTimeout(() => {
            flushLogs();
        }, 5000);
    };

    // 發送記錄到後端
    const flushLogs = async () => {
        if (logQueue.current.length === 0) return;

        const logsToSend = [...logQueue.current];
        logQueue.current = [];

        if (flushTimer.current) {
            clearTimeout(flushTimer.current);
            flushTimer.current = null;
        }

        try {
            await callGAS(apiUrl, 'logActivity', { logs: logsToSend }, user.token);
        } catch (error) {
            console.error('Failed to log activity:', error);
            // 失敗時放回佇列
            logQueue.current = [...logsToSend, ...logQueue.current];
        }
    };

    // 頁面卸載時發送剩餘記錄
    useEffect(() => {
        const handleBeforeUnload = () => {
            if (logQueue.current.length > 0) {
                // 使用 sendBeacon 確保在頁面關閉時也能發送
                const data = JSON.stringify({
                    action: 'logActivity',
                    payload: { logs: logQueue.current },
                    token: user?.token
                });
                navigator.sendBeacon(apiUrl, data);
            }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
            flushLogs();
        };
    }, [user?.token, apiUrl]);

    return {
        logActivity,
        flushLogs,

        // 便捷方法
        logLogin: () => logActivity('LOGIN', { timestamp: new Date().toISOString() }),
        logLogout: (reason) => logActivity('LOGOUT', { reason }),
        logPageView: (page) => logActivity('PAGE_VIEW', { page }),
        logDataEdit: (action, data) => logActivity('DATA_EDIT', { action, data }),
        logError: (error) => logActivity('ERROR', { error: error.message, stack: error.stack }),
    };
};

export default useActivityLogger;
