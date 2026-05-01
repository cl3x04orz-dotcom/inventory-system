import React, { useState, useEffect } from 'react';
import LoginPage from './pages/LoginPage';
import SalesPage from './pages/SalesPage';
import InventoryPage from './pages/InventoryPage';
import PurchasePage from './pages/PurchasePage';
import ReportPage from './pages/ReportPage';
import PurchaseHistoryPage from './pages/PurchaseHistoryPage';
import AdjustmentHistoryPage from './pages/AdjustmentHistoryPage';
import InventoryValuationPage from './pages/InventoryValuationPage';
import StocktakePage from './pages/StocktakePage';
import StocktakeHistoryPage from './pages/StocktakeHistoryPage';
import ReceivablePage from './pages/ReceivablePage';
import PayablePage from './pages/PayablePage';
import SalesRankingPage from './pages/SalesRankingPage';
import CustomerRankingPage from './pages/CustomerRankingPage';
import CustomerAnalyticsPage from './pages/CustomerAnalyticsPage';
import ProfitAnalysisPage from './pages/ProfitAnalysisPage';
import TurnoverRatePage from './pages/TurnoverRatePage';
import CostCalculationPage from './pages/CostCalculationPage';
import IncomeStatementPage from './pages/IncomeStatementPage';
import ExpenditureManagementPage from './pages/ExpenditureManagementPage';
import PermissionControlPage from './pages/PermissionControlPage';
import PayrollPage from './pages/PayrollPage';
import ActivityLogPage from './pages/ActivityLogPage';
import { ThemeProvider } from './contexts/ThemeContext';
import ThemeToggle from './components/ThemeToggle';
import SessionManager from './utils/SessionManager';
import useActivityLogger from './hooks/useActivityLogger';
import {
    LayoutDashboard, ShoppingCart, Archive, LogOut, PackagePlus,
    FileText, ClipboardList, DollarSign, CheckSquare, Wallet, ChevronDown,
    TrendingUp, BarChart2, Users, Activity, PieChart, Shield, WifiOff
} from 'lucide-react';

// Google Apps Script (GAS) API Endpoint
const GAS_API_URL = import.meta.env.VITE_GAS_API_URL;
const LOCAL_VERSION = typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : '2026.03.17.B7';

console.log('--- 系統偵錯資訊 ---');
console.log('Base URL:', import.meta.env.BASE_URL);
if (!GAS_API_URL || GAS_API_URL.includes('YOUR_SCRIPT_ID')) {
    console.error('❌ 錯誤：找不到 VITE_GAS_API_URL 環境變數。');
    console.log('請確認 GitHub Settings -> Secrets 中已新增該變數。');
} else {
    console.log('✅ API URL 已載入:', GAS_API_URL);
}
console.log('------------------');

const NavDropdown = ({ label, icon: Icon, active, children, id, openDropdown, setOpenDropdown }) => {
    const isOpen = openDropdown === id;

    return (
        <div className="relative">
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    setOpenDropdown(isOpen ? null : id);
                }}
                className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-all duration-200 ${active
                    ? 'bg-blue-50 text-blue-600 border border-blue-200 shadow-sm'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
                    }`}
            >
                <Icon size={18} />
                <span className="font-medium">{label}</span>
                <ChevronDown size={14} className={`transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
                <div
                    className="absolute top-full left-0 mt-2 w-48 bg-[var(--bg-secondary)] backdrop-blur-xl border border-[var(--border-primary)] rounded-xl shadow-2xl py-2 z-[100] animate-in fade-in slide-in-from-top-2 duration-200"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="flex flex-col gap-1 px-1">
                        {children}
                    </div>
                </div>
            )}
        </div>
    );
};

const NavItem = ({ label, onClick, active, icon: Icon }) => (
    <button
        onClick={onClick}
        className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all flex items-center gap-2 ${active
            ? 'text-blue-600 bg-blue-50 font-bold'
            : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
            }`}
    >
        {Icon && <Icon size={14} />}
        {label}
    </button>
);

const MobileNavGroup = ({ label, icon: Icon, children }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    return (
        <div className="border-b border-slate-100 last:border-0 border-l-4 border-l-transparent hover:border-l-blue-200 transition-all">
            <button
                onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded); }}
                className="w-full flex items-center justify-between p-3 text-slate-700 font-medium active:bg-slate-50"
            >
                <div className="flex items-center gap-3">
                    {Icon && <Icon size={18} className="text-slate-400" />}
                    <span>{label}</span>
                </div>
                <ChevronDown size={16} className={`text-slate-400 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
            </button>
            <div className={`grid transition-all duration-300 ease-in-out ${isExpanded ? 'grid-rows-[1fr] opacity-100 pb-2' : 'grid-rows-[0fr] opacity-0'}`}>
                <div className="overflow-hidden bg-slate-50/50 rounded-lg mx-2 border border-slate-100/50">
                    {children}
                </div>
            </div>
        </div>
    );
};

function AppContent() {
    const [user, setUser] = useState(null); // { token, role, name, ... }
    const [page, setPage] = useState('sales');
    const [openDropdown, setOpenDropdown] = useState(null);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [isOffline, setIsOffline] = useState(false);
    const [sessionManager, setSessionManager] = useState(null);
    const [hasUpdate, setHasUpdate] = useState(null); // { local, server }

    // 檢查版本更新 (透過 apiHandler: getVersion)
    const checkCountRef = React.useRef(0);
    const lastCheckTimeRef = React.useRef(0);
    const [lastCheckTime, setLastCheckTime] = useState(null);

    useEffect(() => {
        const checkUpdate = async () => {
            const now = Date.now();
            if (now - lastCheckTimeRef.current < 5000) return; // 防抖 5 秒內不重複檢查
            lastCheckTimeRef.current = now;

            checkCountRef.current += 1;
            const count = checkCountRef.current;
            setLastCheckTime(new Date().toLocaleTimeString());

            try {
                console.log(`[VersionCheck #${count}] 開始檢查... 本地:${LOCAL_VERSION}`);
                // cache-busting: 加 _t 參數避免 GAS response 被快取
                const response = await fetch(`${GAS_API_URL}?t=${Date.now()}`, {
                    method: 'POST',
                    redirect: 'follow',
                    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                    body: JSON.stringify({ action: 'getVersion', _t: Date.now() })
                });
                const res = await response.json();
                console.log(`[VersionCheck #${count}] 伺服器回應:`, res.version);

                if (res && res.version && String(res.version) !== String(LOCAL_VERSION)) {
                    const serverVer = Number(res.version);
                    const localVer = Number(LOCAL_VERSION);
                    
                    if (!isNaN(serverVer) && !isNaN(localVer)) {
                        if (serverVer > localVer) {
                            console.warn(`[VersionCheck] 偵測到新版本! (${LOCAL_VERSION} -> ${res.version})`);
                            setHasUpdate({ local: LOCAL_VERSION, server: res.version });
                        } else {
                            console.log(`[VersionCheck] 本地版本較新或相同，無需更新 (${LOCAL_VERSION} >= ${res.version})`);
                        }
                    } else {
                        console.warn(`[VersionCheck] 偵測到版本字串不符! (${LOCAL_VERSION} != ${res.version})`);
                        setHasUpdate({ local: LOCAL_VERSION, server: res.version });
                    }
                }
            } catch (e) {
                console.warn(`[VersionCheck #${count}] 檢查失敗:`, e);
            }
        };

        // 初次檢查
        const timer = setTimeout(checkUpdate, 2000);

        // 定期檢查機制
        let interval;
        const startPolling = () => {
            if (!interval) interval = setInterval(checkUpdate, 5 * 60 * 1000);
        };
        const stopPolling = () => {
            if (interval) {
                clearInterval(interval);
                interval = null;
            }
        };

        startPolling();

        // 智慧型輪詢：根據視窗可見度切換
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                checkUpdate(); // 切回畫面時立刻檢查一次
                startPolling(); // 恢復輪詢
            } else {
                stopPolling(); // 隱藏時暫停，節省 API 額度
            }
        };

        const handleFocus = () => {
            if (document.visibilityState === 'visible') {
                checkUpdate();
                startPolling();
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('focus', handleFocus);
        window.addEventListener('pageshow', handleFocus);

        return () => {
            clearTimeout(timer);
            stopPolling();
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('focus', handleFocus);
            window.removeEventListener('pageshow', handleFocus);
        };
    }, []);

    // Activity Logger
    const { logActivity, logLogin, logLogout, logPageView } = useActivityLogger({
        user,
        apiUrl: GAS_API_URL,
        enabled: !!user
    });

    // Initialize SessionManager
    useEffect(() => {
        if (user) {
            const sm = new SessionManager({
                idleTimeout: 30 * 60 * 1000, // 30 分鐘
                onLogout: (reason) => {
                    console.log('Session timeout:', reason);
                    logLogout(reason);
                    handleLogout();
                    if (reason === 'IDLE_TIMEOUT') {
                        alert('閒置時間過長,已自動登出');
                    }
                },
                onOffline: () => {
                    setIsOffline(true);
                },
                onOnline: () => {
                    setIsOffline(false);
                }
            });
            setSessionManager(sm);

            return () => sm.destroy();
        }
    }, [user]);

    // Global Auth Expiration Listener
    useEffect(() => {
        const handleAuthExpired = () => {
            if (user) {
                sessionStorage.removeItem('inventory_user');
                setUser(null);
                alert('登入憑證已過期，請重新登入！');
            }
        };
        window.addEventListener('auth_expired', handleAuthExpired);
        
        // [New] Token 續約監聽：當 api.js 自動續約成功時，同步更新 React State
        const handleTokenRenewed = (e) => {
            if (e.detail) {
                setUser(e.detail);
                console.log('[App] State synchronized with renewed token');
            }
        };
        window.addEventListener('token_renewed', handleTokenRenewed);

        return () => {
            window.removeEventListener('auth_expired', handleAuthExpired);
            window.removeEventListener('token_renewed', handleTokenRenewed);
        };
    }, [user]);

    // 伺服器端 Token 展延心跳
    useEffect(() => {
        if (!user || !sessionManager) return;

        const heartbeatInterval = setInterval(async () => {
            // [Relaxed] 只要有連線且沒閒置太誇張 (Idle < 25分)，就嘗試續約
            if (sessionManager.checkOnlineStatus() && sessionManager.getIdleTime() < 25 * 60 * 1000) {
                try {
                    const res = await callGAS(GAS_API_URL, 'renewToken', {}, user.token);
                    if (res && res.success && res.token) {
                        const updatedUser = { ...user, token: res.token };
                        sessionStorage.setItem('inventory_user', JSON.stringify(updatedUser));
                        setUser(updatedUser);
                        console.log('[Heartbeat] Token successfully renewed');
                    }
                } catch (e) {
                    console.warn('[Heartbeat] Renew token failed', e);
                }
            }
        }, 10 * 60 * 1000); // 每 10 分鐘檢查一次即可 (因為 Token 現在有 12 小時)

        return () => clearInterval(heartbeatInterval);
    }, [user, sessionManager]);

    // Check for saved user session on component mount
    useEffect(() => {
        const savedUser = sessionStorage.getItem('inventory_user');
        if (savedUser) {
            const parsed = JSON.parse(savedUser);
            // [Fix] Old session data might not have permissions. Force logout if undefined.
            if (parsed && typeof parsed.permissions === 'undefined') {
                console.warn('Detected stale user data (no permissions). Clearing session.');
                sessionStorage.removeItem('inventory_user');
                setUser(null);
            } else {
                setUser(parsed);
            }
        }

        const handleGlobalClick = () => {
            setOpenDropdown(null);
            setMobileMenuOpen(false);
        };
        window.addEventListener('click', handleGlobalClick);
        return () => window.removeEventListener('click', handleGlobalClick);
    }, []);

    // Log page changes
    useEffect(() => {
        if (user && page) {
            logPageView(page);
        }
    }, [page, user]);

    const checkPermission = (targetPage) => {
        if (!user) return false;

        // BOSS has god mode
        if (user.role === 'BOSS') return true;

        // Ensure permissions is an array, handle undefined/string cases
        let perms = user.permissions;
        if (typeof perms === 'undefined' || perms === null) {
            perms = [];
        } else if (typeof perms === 'string') {
            try {
                perms = JSON.parse(perms);
            } catch (e) {
                console.error('Failed to parse permissions string:', e);
                perms = [];
            }
        }

        if (!Array.isArray(perms)) perms = [];

        switch (targetPage) {
            case 'sales':
                return perms.includes('sales_entry') || perms.includes('sales');
            case 'report':
                return perms.includes('sales_report') || perms.includes('sales');
            case 'purchase':
                return perms.includes('purchase_entry') || perms.includes('purchase');
            case 'purchaseHistory':
                return perms.includes('purchase_history') || perms.includes('purchase');
            case 'inventory':
                return perms.includes('inventory_adjust');
            case 'stocktake':
                return perms.includes('inventory_stocktake');
            case 'valuation':
                return perms.includes('inventory_valuation');
            case 'adjustHistory':
                return perms.includes('inventory_adjust_history') || perms.includes('inventory_history');
            case 'stocktakeHistory':
                return perms.includes('inventory_stocktake_history') || perms.includes('inventory_history');
            case 'expenditureManagement':
                return perms.includes('finance_expenditure') || perms.includes('finance');
            case 'receivable':
                return perms.includes('finance_receivable') || perms.includes('finance');
            case 'payable':
                return perms.includes('finance_payable') || perms.includes('finance');
            case 'incomeStatement':
                return perms.includes('finance_income') || perms.includes('finance');
            case 'costCalculation':
                return perms.includes('finance_cost') || perms.includes('finance');
            case 'payroll':
                return perms.includes('finance_payroll') || perms.includes('finance');
            case 'salesRanking':
                return perms.includes('analytics_sales') || perms.includes('analytics');
            case 'customerRanking':
                return perms.includes('analytics_customer') || perms.includes('analytics');
            case 'customerAnalytics':
                return perms.includes('analytics_customer') || perms.includes('analytics');
            case 'profitAnalysis':
                return perms.includes('analytics_profit') || perms.includes('analytics');
            case 'turnoverRate':
                return perms.includes('analytics_turnover') || perms.includes('analytics');
            case 'permissionControl':
                return perms.includes('system_config') || perms.includes('system');
            case 'activityLog':
                return perms.includes('system_activity_logs') || perms.includes('system') || user.role === 'BOSS' || user.role === 'ADMIN';
            default:
                return true;
        }
    };

    // [New] Direct check for API URL suffix to help user verify deployment

    const handlePageChange = (newPage) => {
        if (checkPermission(newPage)) {
            setPage(newPage);
            setOpenDropdown(null);
            setMobileMenuOpen(false);
        } else {
            console.warn(`Access denied for page: ${newPage}`);
        }
    };

    const handleLogin = (userData) => {
        setUser(userData);
        sessionStorage.setItem('inventory_user', JSON.stringify(userData));
    };

    // 監聽登入動作：當使用者從 null 變為有值時，紀錄登入活動
    const prevUserRef = React.useRef(user);
    useEffect(() => {
        if (!prevUserRef.current && user) {
            // 使用 setTimeout 確保 hook 內部的 state 已更新
            setTimeout(() => {
                if (logLogin) logLogin();
            }, 500);
        }
        prevUserRef.current = user;
    }, [user, logLogin]);

    const handleLogout = () => {
        if (logLogout) logLogout('MANUAL');
        setUser(null);
        sessionStorage.removeItem('inventory_user');
        if (sessionManager) {
            sessionManager.destroy();
        }
    };

    if (!GAS_API_URL || GAS_API_URL.includes('YOUR_SCRIPT_ID')) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-red-50 text-red-900">
                <Shield size={64} className="mb-4 text-red-500" />
                <h1 className="text-2xl font-bold mb-2">環境變數未設定</h1>
                <p className="text-center max-w-md mb-6">
                    偵測到 `VITE_GAS_API_URL` 缺失或尚未設定。請在 GitHub Secrets 中設定該變數，並重新執行 Actions 部署。
                </p>
                <div className="bg-white p-4 rounded-lg border border-red-200 font-mono text-xs w-full max-w-lg">
                    <p className="font-bold mb-2">偵錯資訊：</p>
                    <p>GAS_API_URL: {String(GAS_API_URL)}</p>
                    <p>Base URL: {import.meta.env.BASE_URL}</p>
                </div>
            </div>
        );
    }

    if (!user) {
        return <LoginPage onLogin={handleLogin} apiUrl={GAS_API_URL} />;
    }

    // console.log('Current User:', user); 

    return (
        <div className="min-h-screen flex flex-col">
            {/* Offline Indicator */}
            {isOffline && (
                <div className="bg-yellow-500 text-white text-center py-2 text-sm font-medium flex items-center justify-center gap-2">
                    <WifiOff size={16} />
                    網路已離線,部分功能可能無法使用
                </div>
            )}

            {/* 版本更新通知 */}
            {hasUpdate && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] w-[90%] max-w-sm animate-in fade-in slide-in-from-bottom-4 duration-300">
                    <div className="bg-blue-600 text-white p-4 rounded-2xl shadow-2xl flex items-center justify-between gap-4 border border-blue-400">
                        <div className="flex items-center gap-3">
                            <Activity size={20} className="animate-pulse" />
                            <div>
                                <p className="font-bold text-sm">系統版本有更新</p>
                                <p className="text-[9px] opacity-70 font-mono">
                                    {hasUpdate.local} → {hasUpdate.server}
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={() => {
                                // 強制帶參數刷新，破除手機瀏覽器快取
                                window.location.href = window.location.href.split('?')[0] + '?v=' + Date.now();
                            }}
                            className="bg-white text-blue-600 px-4 py-1.5 rounded-xl font-bold text-xs hover:bg-blue-50 transition-colors shadow-sm whitespace-nowrap"
                        >
                            立即刷新
                        </button>
                    </div>
                </div>
            )}

            {/* Navbar */}
            <header className="h-16 border-b border-[var(--border-primary)] bg-[var(--bg-secondary)] backdrop-blur-md flex justify-between items-center px-6 sticky top-0 z-[60]">
                {/* ... Navbar content ... */}
                <div className="flex items-center gap-2">
                    <img src={`${import.meta.env.BASE_URL}logo.png`} alt="Logo" className="h-10 w-auto object-contain brightness-0 dark:brightness-100" />
                </div>

                {/* Mobile Menu Trigger & Dropdown */}
                <div className="md:hidden relative" onClick={(e) => e.stopPropagation()}>
                    <button
                        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all ${mobileMenuOpen
                            ? 'bg-blue-50 border-blue-200 text-blue-600 ring-2 ring-blue-100'
                            : 'bg-[var(--bg-secondary)] border-[var(--border-primary)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                            }`}
                    >
                        <span className="font-bold text-sm">功能選單</span>
                        <ChevronDown size={16} className={`transition-transform duration-300 ${mobileMenuOpen ? 'rotate-180' : ''}`} />
                    </button>

                    {/* Mobile Dropdown Panel */}
                    {mobileMenuOpen && (
                        <div className="fixed top-16 left-0 right-0 mx-auto mt-2 w-[90%] max-w-md bg-[var(--bg-secondary)] backdrop-blur-xl border border-[var(--border-primary)] rounded-2xl shadow-2xl overflow-y-auto max-h-[80vh] animate-in fade-in slide-in-from-top-4 duration-200 z-[100]">
                            <div className="p-2 flex flex-col">
                                {/* 銷售管理 Group */}
                                {(user.role === 'BOSS' || checkPermission('sales') || checkPermission('report')) && (
                                    <MobileNavGroup label="銷售管理" icon={ShoppingCart}>
                                        {checkPermission('sales') && <NavItem label="商品銷售登錄" icon={ShoppingCart} onClick={() => handlePageChange('sales')} active={page === 'sales'} />}
                                        {checkPermission('report') && <NavItem label="銷售查詢報表" icon={FileText} onClick={() => handlePageChange('report')} active={page === 'report'} />}
                                    </MobileNavGroup>
                                )}

                                {/* 進貨管理 Group */}
                                {(user.role === 'BOSS' || checkPermission('purchase') || checkPermission('purchaseHistory')) && (
                                    <MobileNavGroup label="進貨管理" icon={PackagePlus}>
                                        {checkPermission('purchase') && <NavItem label="商品進貨登錄" icon={PackagePlus} onClick={() => handlePageChange('purchase')} active={page === 'purchase'} />}
                                        {checkPermission('purchaseHistory') && <NavItem label="進貨查詢報表" icon={ClipboardList} onClick={() => handlePageChange('purchaseHistory')} active={page === 'purchaseHistory'} />}
                                    </MobileNavGroup>
                                )}

                                {/* 庫存管理 Group */}
                                {(user.role === 'BOSS' || checkPermission('inventory') || checkPermission('stocktake') || checkPermission('valuation') || checkPermission('adjustHistory') || checkPermission('stocktakeHistory')) && (
                                    <MobileNavGroup label="庫存管理" icon={Archive}>
                                        {checkPermission('inventory') && <NavItem label="庫存檢視" icon={Archive} onClick={() => handlePageChange('inventory')} active={page === 'inventory'} />}
                                        {checkPermission('stocktake') && <NavItem label="庫存盤點" icon={CheckSquare} onClick={() => handlePageChange('stocktake')} active={page === 'stocktake'} />}
                                        {checkPermission('valuation') && <NavItem label="庫存估值" icon={DollarSign} onClick={() => handlePageChange('valuation')} active={page === 'valuation'} />}
                                        {checkPermission('adjustHistory') && <NavItem label="異動查詢" icon={FileText} onClick={() => handlePageChange('adjustHistory')} active={page === 'adjustHistory'} />}
                                        {checkPermission('stocktakeHistory') && <NavItem label="盤點歷史" icon={ClipboardList} onClick={() => handlePageChange('stocktakeHistory')} active={page === 'stocktakeHistory'} />}
                                    </MobileNavGroup>
                                )}

                                {/* 支出管理 Group */}
                                {(user.role === 'BOSS' || checkPermission('expenditureManagement')) && (
                                    <MobileNavGroup label="支出管理" icon={DollarSign}>
                                        <NavItem label="支出登錄" icon={DollarSign} onClick={() => handlePageChange('expenditureManagement')} active={page === 'expenditureManagement'} />
                                    </MobileNavGroup>
                                )}

                                {/* 財務管理 Group */}
                                {(user.role === 'BOSS' || checkPermission('receivable') || checkPermission('payable') || checkPermission('incomeStatement') || checkPermission('costCalculation') || checkPermission('payroll')) && (
                                    <MobileNavGroup label="財務帳務" icon={Wallet}>
                                        {checkPermission('receivable') && <NavItem label="應收帳款" icon={Wallet} onClick={() => handlePageChange('receivable')} active={page === 'receivable'} />}
                                        {checkPermission('payable') && <NavItem label="應付帳款" icon={Wallet} onClick={() => handlePageChange('payable')} active={page === 'payable'} />}
                                        {checkPermission('incomeStatement') && <NavItem label="損益表" icon={PieChart} onClick={() => handlePageChange('incomeStatement')} active={page === 'incomeStatement'} />}
                                        {checkPermission('costCalculation') && <NavItem label="成本計算分析" icon={DollarSign} onClick={() => handlePageChange('costCalculation')} active={page === 'costCalculation'} />}
                                        {checkPermission('payroll') && <NavItem label="薪資結算中心" icon={DollarSign} onClick={() => handlePageChange('payroll')} active={page === 'payroll'} />}
                                    </MobileNavGroup>
                                )}

                                {/* 數據分析 Group */}
                                {(user.role === 'BOSS' || checkPermission('salesRanking') || checkPermission('customerRanking') || checkPermission('profitAnalysis') || checkPermission('turnoverRate')) && (
                                    <MobileNavGroup label="數據分析" icon={TrendingUp}>
                                        {checkPermission('salesRanking') && <NavItem label="商品銷售排行" icon={BarChart2} onClick={() => handlePageChange('salesRanking')} active={page === 'salesRanking'} />}
                                        {checkPermission('customerRanking') && <NavItem label="客戶銷售排行" icon={Users} onClick={() => handlePageChange('customerRanking')} active={page === 'customerRanking'} />}
                                        {checkPermission('customerAnalytics') && <NavItem label="客戶深度分析" icon={Activity} onClick={() => handlePageChange('customerAnalytics')} active={page === 'customerAnalytics'} />}
                                        {checkPermission('profitAnalysis') && <NavItem label="毛利分析報表" icon={TrendingUp} onClick={() => handlePageChange('profitAnalysis')} active={page === 'profitAnalysis'} />}
                                        {checkPermission('turnoverRate') && <NavItem label="庫存周轉率" icon={Activity} onClick={() => handlePageChange('turnoverRate')} active={page === 'turnoverRate'} />}
                                    </MobileNavGroup>
                                )}

                                {/* 系統管理 Group */}
                                {(user.role === 'BOSS' || checkPermission('permissionControl') || checkPermission('activityLog')) && (
                                    <MobileNavGroup label="系統管理" icon={Shield}>
                                        {checkPermission('permissionControl') && <NavItem label="權限控管表" icon={Shield} onClick={() => handlePageChange('permissionControl')} active={page === 'permissionControl'} />}
                                        {checkPermission('activityLog') && <NavItem label="操作紀錄查詢" icon={Activity} onClick={() => handlePageChange('activityLog')} active={page === 'activityLog'} />}
                                    </MobileNavGroup>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Desktop Navigation (Hidden on Mobile) */}
                <nav className="hidden md:flex gap-1">
                    {/* 銷售管理 Group */}
                    {(user.role === 'BOSS' || checkPermission('sales') || checkPermission('report')) && (
                        <NavDropdown
                            id="sales"
                            label="銷售管理"
                            icon={ShoppingCart}
                            openDropdown={openDropdown}
                            setOpenDropdown={setOpenDropdown}
                            active={['sales', 'report'].includes(page)}
                        >
                            {checkPermission('sales') && <NavItem label="商品銷售登錄" icon={ShoppingCart} onClick={() => handlePageChange('sales')} active={page === 'sales'} />}
                            {checkPermission('report') && <NavItem label="銷售查詢報表" icon={FileText} onClick={() => handlePageChange('report')} active={page === 'report'} />}
                        </NavDropdown>
                    )}

                    {/* 進貨管理 Group */}
                    {(user.role === 'BOSS' || checkPermission('purchase') || checkPermission('purchaseHistory')) && (
                        <NavDropdown
                            id="purchase"
                            label="進貨管理"
                            icon={PackagePlus}
                            openDropdown={openDropdown}
                            setOpenDropdown={setOpenDropdown}
                            active={['purchase', 'purchaseHistory'].includes(page)}
                        >
                            {checkPermission('purchase') && <NavItem label="商品進貨登錄" icon={PackagePlus} onClick={() => handlePageChange('purchase')} active={page === 'purchase'} />}
                            {checkPermission('purchaseHistory') && <NavItem label="進貨查詢報表" icon={ClipboardList} onClick={() => handlePageChange('purchaseHistory')} active={page === 'purchaseHistory'} />}
                        </NavDropdown>
                    )}

                    {/* 庫存管理 Group */}
                    {(user.role === 'BOSS' || checkPermission('inventory') || checkPermission('stocktake') || checkPermission('valuation') || checkPermission('adjustHistory') || checkPermission('stocktakeHistory')) && (
                        <NavDropdown
                            id="inventory"
                            label="庫存管理"
                            icon={Archive}
                            openDropdown={openDropdown}
                            setOpenDropdown={setOpenDropdown}
                            active={['inventory', 'stocktake', 'valuation', 'adjustHistory', 'stocktakeHistory'].includes(page)}
                        >
                            {checkPermission('inventory') && <NavItem label="庫存檢視" icon={Archive} onClick={() => handlePageChange('inventory')} active={page === 'inventory'} />}
                            {checkPermission('stocktake') && <NavItem label="庫存盤點" icon={CheckSquare} onClick={() => handlePageChange('stocktake')} active={page === 'stocktake'} />}
                            {checkPermission('valuation') && <NavItem label="庫存估值" icon={DollarSign} onClick={() => handlePageChange('valuation')} active={page === 'valuation'} />}
                            <div className="my-1 border-t border-slate-100" />
                            {checkPermission('adjustHistory') && <NavItem label="異動查詢" icon={FileText} onClick={() => handlePageChange('adjustHistory')} active={page === 'adjustHistory'} />}
                            {checkPermission('stocktakeHistory') && <NavItem label="盤點歷史" icon={ClipboardList} onClick={() => handlePageChange('stocktakeHistory')} active={page === 'stocktakeHistory'} />}
                        </NavDropdown>
                    )}

                    {/* 支出管理 Group (Merged into Finance group conceptually but kept separate in UI if desired, or assume part of Finance) */}
                    {/* Assuming Expenditure is part of 'finance' category which Maps to finance_expenditure */}
                    {(user.role === 'BOSS' || checkPermission('expenditureManagement')) && (
                        <NavDropdown
                            id="expenditure"
                            label="支出管理"
                            icon={DollarSign}
                            openDropdown={openDropdown}
                            setOpenDropdown={setOpenDropdown}
                            active={page === 'expenditureManagement'}
                        >
                            <NavItem label="支出登錄" icon={DollarSign} onClick={() => handlePageChange('expenditureManagement')} active={page === 'expenditureManagement'} />
                        </NavDropdown>
                    )}

                    {/* 財務管理 Group */}
                    {/* 財務管理 Group */}
                    {(user.role === 'BOSS' || checkPermission('receivable') || checkPermission('payable') || checkPermission('incomeStatement') || checkPermission('costCalculation') || checkPermission('payroll')) && (
                        <NavDropdown
                            id="accounting"
                            label="財務帳務"
                            icon={Wallet}
                            openDropdown={openDropdown}
                            setOpenDropdown={setOpenDropdown}
                            active={['receivable', 'payable', 'incomeStatement', 'costCalculation', 'payroll'].includes(page)}
                        >
                            {checkPermission('receivable') && <NavItem label="應收帳款" icon={Wallet} onClick={() => handlePageChange('receivable')} active={page === 'receivable'} />}
                            {checkPermission('payable') && <NavItem label="應付帳款" icon={Wallet} onClick={() => handlePageChange('payable')} active={page === 'payable'} />}
                            {checkPermission('incomeStatement') && <NavItem label="損益表" icon={PieChart} onClick={() => handlePageChange('incomeStatement')} active={page === 'incomeStatement'} />}
                            <div className="my-1 border-t border-slate-100" />
                            {checkPermission('costCalculation') && <NavItem label="成本計算分析" icon={DollarSign} onClick={() => handlePageChange('costCalculation')} active={page === 'costCalculation'} />}
                            {checkPermission('payroll') && <NavItem label="薪資結算中心" icon={DollarSign} onClick={() => handlePageChange('payroll')} active={page === 'payroll'} />}
                        </NavDropdown>
                    )}

                    {/* 數據分析 Group */}
                    {(user.role === 'BOSS' || checkPermission('salesRanking') || checkPermission('customerRanking') || checkPermission('profitAnalysis') || checkPermission('turnoverRate')) && (
                        <NavDropdown
                            id="analytics"
                            label="數據分析"
                            icon={TrendingUp}
                            openDropdown={openDropdown}
                            setOpenDropdown={setOpenDropdown}
                            active={['salesRanking', 'customerRanking', 'customerAnalytics', 'profitAnalysis', 'turnoverRate'].includes(page)}
                        >
                            {checkPermission('salesRanking') && <NavItem label="商品銷售排行" icon={BarChart2} onClick={() => handlePageChange('salesRanking')} active={page === 'salesRanking'} />}
                            {checkPermission('customerRanking') && <NavItem label="客戶銷售排行" icon={Users} onClick={() => handlePageChange('customerRanking')} active={page === 'customerRanking'} />}
                            {checkPermission('customerAnalytics') && <NavItem label="客戶深度分析" icon={Activity} onClick={() => handlePageChange('customerAnalytics')} active={page === 'customerAnalytics'} />}
                            {checkPermission('profitAnalysis') && <NavItem label="毛利分析報表" icon={TrendingUp} onClick={() => handlePageChange('profitAnalysis')} active={page === 'profitAnalysis'} />}
                            {checkPermission('turnoverRate') && <NavItem label="庫存周轉率" icon={Activity} onClick={() => handlePageChange('turnoverRate')} active={page === 'turnoverRate'} />}
                        </NavDropdown>
                    )}

                    {/* 系統管理 Group */}
                    {(user.role === 'BOSS' || checkPermission('permissionControl') || checkPermission('activityLog')) && (
                        <NavDropdown
                            id="system"
                            label="系統管理"
                            icon={Shield}
                            openDropdown={openDropdown}
                            setOpenDropdown={setOpenDropdown}
                            active={['permissionControl', 'activityLog'].includes(page)}
                        >
                            {checkPermission('permissionControl') && <NavItem label="權限控管表" icon={Shield} onClick={() => handlePageChange('permissionControl')} active={page === 'permissionControl'} />}
                            {checkPermission('activityLog') && <NavItem label="操作紀錄查詢" icon={Activity} onClick={() => handlePageChange('activityLog')} active={page === 'activityLog'} />}
                        </NavDropdown>
                    )}
                </nav>

                <div className="flex items-center gap-3">
                    {/* Theme Toggle */}
                    <ThemeToggle />

                    <div className="hidden md:flex flex-col items-end">
                        <span className="text-xs font-bold text-blue-600 dark:text-blue-400 leading-none">{user.username}</span>
                        <span className="text-[10px] text-slate-400 dark:text-slate-500 uppercase font-bold tracking-tighter">{user.role}</span>
                    </div>
                    <button
                        onClick={handleLogout}
                        className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all border border-transparent hover:border-red-100 dark:hover:border-red-800"
                        title="登出系統"
                    >
                        <LogOut size={20} />
                    </button>
                </div>
            </header>

            {/* Main Content */}
            <main className="flex-1 p-4 md:p-6 overflow-hidden">
                {checkPermission(page) ? (
                    <>
                        {page === 'sales' && <SalesPage user={user} apiUrl={GAS_API_URL} logActivity={logActivity} />}
                        {page === 'inventory' && <InventoryPage user={user} apiUrl={GAS_API_URL} logActivity={logActivity} />}
                        {page === 'purchase' && <PurchasePage user={user} apiUrl={GAS_API_URL} logActivity={logActivity} />}
                        {page === 'report' && <ReportPage user={user} apiUrl={GAS_API_URL} logActivity={logActivity} setPage={handlePageChange} />}
                        {page === 'purchaseHistory' && <PurchaseHistoryPage user={user} apiUrl={GAS_API_URL} logActivity={logActivity} setPage={handlePageChange} />}
                        {page === 'adjustHistory' && <AdjustmentHistoryPage user={user} apiUrl={GAS_API_URL} logActivity={logActivity} />}
                        {page === 'valuation' && <InventoryValuationPage user={user} apiUrl={GAS_API_URL} logActivity={logActivity} />}
                        {page === 'stocktake' && <StocktakePage user={user} apiUrl={GAS_API_URL} logActivity={logActivity} />}
                        {page === 'stocktakeHistory' && <StocktakeHistoryPage user={user} apiUrl={GAS_API_URL} logActivity={logActivity} />}
                        {page === 'receivable' && <ReceivablePage user={user} apiUrl={GAS_API_URL} logActivity={logActivity} />}
                        {page === 'payable' && <PayablePage user={user} apiUrl={GAS_API_URL} logActivity={logActivity} />}
                        {page === 'salesRanking' && <SalesRankingPage user={user} apiUrl={GAS_API_URL} logActivity={logActivity} />}
                        {page === 'customerRanking' && <CustomerRankingPage user={user} apiUrl={GAS_API_URL} logActivity={logActivity} />}
                        {page === 'customerAnalytics' && <CustomerAnalyticsPage user={user} apiUrl={GAS_API_URL} logActivity={logActivity} />}
                        {page === 'profitAnalysis' && <ProfitAnalysisPage user={user} apiUrl={GAS_API_URL} logActivity={logActivity} />}
                        {page === 'turnoverRate' && <TurnoverRatePage user={user} apiUrl={GAS_API_URL} logActivity={logActivity} />}
                        {page === 'costCalculation' && <CostCalculationPage user={user} apiUrl={GAS_API_URL} logActivity={logActivity} />}
                        {page === 'expenditureManagement' && <ExpenditureManagementPage user={user} apiUrl={GAS_API_URL} logActivity={logActivity} />}
                        {page === 'incomeStatement' && <IncomeStatementPage user={user} apiUrl={GAS_API_URL} logActivity={logActivity} />}
                        {page === 'permissionControl' && <PermissionControlPage user={user} apiUrl={GAS_API_URL} logActivity={logActivity} />}
                        {page === 'payroll' && <PayrollPage user={user} apiUrl={GAS_API_URL} logActivity={logActivity} />}
                        {page === 'activityLog' && <ActivityLogPage user={user} apiUrl={GAS_API_URL} />}
                    </>
                ) : (
                    <div className="flex flex-col items-center justify-center h-full text-slate-400">
                        <Shield size={64} className="mb-4 text-slate-200" />
                        <h2 className="text-xl font-bold text-slate-800">權限不足</h2>
                        <p className="mt-2">您所在的帳號角色尚未獲得此頁面的訪問授權。</p>
                        <button
                            onClick={() => setPage('sales')}
                            className="mt-6 px-4 py-2 bg-white hover:bg-slate-50 text-blue-600 rounded-lg transition-colors border border-slate-200 shadow-sm"
                        >
                            返回首頁
                        </button>
                    </div>
                )}
            </main>

        </div>
    );
}

// Wrap with ThemeProvider
export default function App() {
    return (
        <ThemeProvider>
            <AppContent />
        </ThemeProvider>
    );
}
