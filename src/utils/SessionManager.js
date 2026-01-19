/**
 * SessionManager - 管理使用者 session 狀態
 * 功能: 逾時登出、離線登出、關閉分頁登出
 */

class SessionManager {
    constructor(options = {}) {
        this.idleTimeout = options.idleTimeout || 30 * 60 * 1000; // 預設 30 分鐘
        this.onLogout = options.onLogout || (() => { });
        this.onIdle = options.onIdle || (() => { });
        this.onOnline = options.onOnline || (() => { });
        this.onOffline = options.onOffline || (() => { });

        this.idleTimer = null;
        this.lastActivity = Date.now();
        this.isOnline = navigator.onLine;

        this.init();
    }

    init() {
        // 監聽使用者活動
        this.setupActivityListeners();

        // 監聽網路狀態
        this.setupNetworkListeners();

        // 監聽分頁關閉 (可選)
        // this.setupBeforeUnloadListener();

        // 開始計時器
        this.resetIdleTimer();
    }

    setupActivityListeners() {
        const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];

        events.forEach(event => {
            document.addEventListener(event, () => this.handleActivity(), true);
        });
    }

    handleActivity() {
        this.lastActivity = Date.now();
        this.resetIdleTimer();
    }

    resetIdleTimer() {
        if (this.idleTimer) {
            clearTimeout(this.idleTimer);
        }

        this.idleTimer = setTimeout(() => {
            this.handleIdle();
        }, this.idleTimeout);
    }

    handleIdle() {
        console.log('使用者閒置超過', this.idleTimeout / 1000 / 60, '分鐘');
        this.onIdle();
        this.logout('IDLE_TIMEOUT');
    }

    setupNetworkListeners() {
        window.addEventListener('online', () => {
            console.log('網路已連線');
            this.isOnline = true;
            this.onOnline();
        });

        window.addEventListener('offline', () => {
            console.log('網路已離線');
            this.isOnline = false;
            this.onOffline();
        });
    }

    setupBeforeUnloadListener() {
        window.addEventListener('beforeunload', (e) => {
            // 可選: 關閉分頁時登出
            // this.logout('TAB_CLOSED');

            // 如果有未儲存的資料,可以提示使用者
            // e.preventDefault();
            // e.returnValue = '';
        });
    }

    logout(reason = 'MANUAL') {
        console.log('登出原因:', reason);
        this.cleanup();
        this.onLogout(reason);
    }

    cleanup() {
        if (this.idleTimer) {
            clearTimeout(this.idleTimer);
        }
    }

    destroy() {
        this.cleanup();
        // 移除所有事件監聽器
        // (實際使用時可能需要保存引用以便移除)
    }

    // 檢查是否在線
    checkOnlineStatus() {
        return this.isOnline;
    }

    // 獲取閒置時間
    getIdleTime() {
        return Date.now() - this.lastActivity;
    }

    // 手動重置計時器
    keepAlive() {
        this.handleActivity();
    }
}

export default SessionManager;
