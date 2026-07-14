import { safeLocalStorage, safeSessionStorage } from './utils/storage';
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
import LiffOrderPage from './pages/LiffOrderPage';
import PendingOrdersPage from './pages/PendingOrdersPage';
import ProductManagementPage from './pages/ProductManagementPage';
import GroupBuySettingsPage from './pages/GroupBuySettingsPage';
import MemberManagementPage from './pages/MemberManagementPage';
import ErrorBoundary from './components/ErrorBoundary';
import { ThemeProvider } from './contexts/ThemeContext';
import ThemeToggle from './components/ThemeToggle';
import SessionManager from './utils/SessionManager';
import { callGAS } from './utils/api';
import useActivityLogger from './hooks/useActivityLogger';
import logoImg from './assets/logo.png';
import {
    LayoutDashboard, ShoppingCart, Archive, LogOut, PackagePlus,
    FileText, ClipboardList, DollarSign, CheckSquare, Wallet, ChevronDown,
    TrendingUp, BarChart2, Users, Activity, PieChart, Shield, WifiOff, Menu,
    Edit2, Link
} from 'lucide-react';

// Google Apps Script (GAS) API Endpoint
const GAS_API_URL = window.GAS_API_URL || import.meta.env.VITE_GAS_API_URL;
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
                className={`
                    group relative px-4 py-3 flex items-center gap-2.5 rounded-xl text-base font-medium whitespace-nowrap
                    transition-all duration-200
                    ${active
                        ? 'text-[var(--text-primary)]'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] border border-transparent'
                    }
                `}
            >
                {/* active bottom line */}
                {active && (
                    <span
                        className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-full bg-slate-700 dark:bg-slate-400"
                        style={{ boxShadow: '0 0 6px 2px rgba(51,65,85,0.35)' }}
                    />
                )}
                <Icon size={19} strokeWidth={active ? 2.5 : 1.8} />
                <span className={`tracking-wide ${active ? 'font-semibold' : ''}`}>{label}</span>
                <ChevronDown
                    size={13}
                    strokeWidth={2}
                    className={`transition-transform duration-300 ${isOpen ? 'rotate-180 opacity-70' : 'opacity-30'}`}
                />
            </button>

            {isOpen && (
                <div
                    className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-44 bg-[var(--bg-secondary)] backdrop-blur-xl border border-[var(--border-primary)] rounded-xl shadow-2xl py-1.5 z-[100] animate-in fade-in slide-in-from-top-2 duration-200"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="flex flex-col gap-0.5 px-1">
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
        className={`w-full text-left px-2 py-2.5 rounded-lg text-sm transition-all flex items-center gap-1 ${active
            ? 'text-blue-600 bg-blue-50 dark:bg-blue-500/10 font-semibold'
            : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
            }`}
    >
        <div className="w-10 flex justify-center shrink-0">
            {Icon && <Icon size={16} strokeWidth={active ? 2.5 : 1.8} />}
        </div>
        <span>{label}</span>
    </button>
);

const MobileNavGroup = ({ label, icon: Icon, children }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    return (
        <div className="border-b border-slate-100 last:border-0 pl-5 transition-all group">
            <button
                onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded); }}
                className="w-full flex items-center justify-between p-3 text-slate-700 font-medium active:bg-slate-50"
            >
                <div className="flex items-center gap-1">
                    <div className="w-10 flex justify-center shrink-0">
                        {Icon && <Icon size={20} className="text-slate-400" />}
                    </div>
                    <span className="text-[15px] font-semibold">{label}</span>
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
    const [isInitializing, setIsInitializing] = useState(true);
    const [showSplash, setShowSplash] = useState(true);


    const [showHeader, setShowHeader] = useState(true);
    const [scrolled, setScrolled] = useState(false);
    const lastScrollY = React.useRef(0);

    // Auto-hide Header Logic (Mobile Focus)
    useEffect(() => {
        const threshold = 50; // 捲動門檻 (px)
        const handleScroll = () => {
            const currentScrollY = window.scrollY;

            // 更新陰影狀態
            setScrolled(currentScrollY > 10);

            // 偵測是否觸底
            const isBottom = window.innerHeight + currentScrollY >= document.documentElement.scrollHeight - 20;

            // 頂部或底部強制顯示
            if (currentScrollY < 10 || isBottom) {
                setShowHeader(true);
                lastScrollY.current = currentScrollY;
                return;
            }

            // 計算捲動位移 delta
            const delta = currentScrollY - lastScrollY.current;

            // 往下滑動且超過門檻：隱藏
            if (delta > threshold && currentScrollY > 76) {
                if (!mobileMenuOpen) setShowHeader(false);
                lastScrollY.current = currentScrollY;
            }
            // 往上滑動且超過門檻：顯示
            else if (delta < -threshold) {
                setShowHeader(true);
                lastScrollY.current = currentScrollY;
            }
        };

        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => window.removeEventListener('scroll', handleScroll);
    }, [mobileMenuOpen]);


    // Activity Logger
    const { logActivity, logLogin, logLogout, logPageView } = useActivityLogger({
        user,
        apiUrl: GAS_API_URL,
        enabled: false // 完全停用日誌記錄，減少背景請求與避免伺服器塞車時卡頓
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
                safeSessionStorage.removeItem('inventory_user');
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
                        safeSessionStorage.setItem('inventory_user', JSON.stringify(updatedUser));
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

    // 初始化與 LIFF 自動登入邏輯 (載入遮罩期間執行)
    useEffect(() => {
        const initializeApp = async () => {
            const startTime = Date.now();
            let currentUser = null;

            // 1. 檢查是否有儲存的 user session
            const savedUser = safeSessionStorage.getItem('inventory_user');
            if (savedUser) {
                try {
                    const parsed = JSON.parse(savedUser);
                    // [Fix] Old session data might not have permissions. Force logout if undefined.
                    if (parsed && typeof parsed.permissions === 'undefined') {
                        console.warn('Detected stale user data (no permissions). Clearing session.');
                        safeSessionStorage.removeItem('inventory_user');
                    } else {
                        currentUser = parsed;
                        setUser(parsed);
                    }
                } catch (e) {
                    console.error('Failed to parse saved user session:', e);
                    safeSessionStorage.removeItem('inventory_user');
                }
            }

            // 2. 判斷是否為 LIFF 頁面
            const params = new URLSearchParams(window.location.search);
            const isLiff = params.get('page') === 'liffOrder' ||
                params.has('building') ||
                params.has('grp') ||
                params.has('liff.state') ||
                window.location.pathname.includes('/order') ||
                (window.GAS_PARAMETERS && window.GAS_PARAMETERS.page === 'liffOrder');

            let isQuickLiff = false;
            if (isLiff) {
                if (!currentUser) {
                    if (window.GAS_GUEST_TOKEN) {
                        console.log('Using pre-injected guest token');
                        const res = {
                            success: true,
                            token: window.GAS_GUEST_TOKEN,
                            username: 'guest',
                            role: 'EMPLOYEE',
                            permissions: ['sales_liff']
                        };
                        handleLogin(res);
                        setPage('liffOrder');
                        isQuickLiff = true;
                    } else {
                        try {
                            console.log('Detecting LIFF order request, logging in guest...');
                            const res = await callGAS(GAS_API_URL, 'login', { username: 'guest', password: 'guest' });
                            if (res && res.success) {
                                handleLogin(res);
                                setPage('liffOrder');
                            } else {
                                console.error('Auto login guest failed:', res?.error);
                            }
                        } catch (err) {
                            console.error('Auto login guest error:', err);
                        }
                    }
                } else {
                    setPage('liffOrder');
                    isQuickLiff = true;
                }
            }

            // 3. 初始化結束，立刻淡出遮罩（不人工 delay）
            // 商品資料由 LiffOrderPage 自己用 skeleton loading 處理，不卡在這裡
            setShowSplash(false);
            setTimeout(() => {
                setIsInitializing(false);
            }, 400);
        };

        initializeApp();

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

    // 當使用者在 LIFF 頁面下主動登出 (user 變為 null) 時，再次自動登入 guest
    useEffect(() => {
        if (isInitializing) return;

        const params = new URLSearchParams(window.location.search);
        const isLiff = params.get('page') === 'liffOrder' ||
            params.has('building') ||
            params.has('grp') ||
            params.has('liff.state') ||
            window.location.pathname.includes('/order') ||
            (window.GAS_PARAMETERS && window.GAS_PARAMETERS.page === 'liffOrder');

        if (isLiff && !user) {
            const autoLogin = async () => {
                if (window.GAS_GUEST_TOKEN) {
                    console.log('Re-using pre-injected guest token...');
                    const res = {
                        success: true,
                        token: window.GAS_GUEST_TOKEN,
                        username: 'guest',
                        role: 'EMPLOYEE',
                        permissions: ['sales_liff']
                    };
                    handleLogin(res);
                    setPage('liffOrder');
                    return;
                }
                try {
                    console.log('Re-logging in guest for LIFF order page...');
                    const res = await callGAS(GAS_API_URL, 'login', { username: 'guest', password: 'guest' });
                    if (res && res.success) {
                        handleLogin(res);
                        setPage('liffOrder');
                    }
                } catch (err) {
                    console.error('Auto login guest error:', err);
                }
            };
            autoLogin();
        }
    }, [user, isInitializing]);

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
            case 'liffOrder':
                return user.username === 'guest' || user.role === 'BOSS' || perms.includes('sales_liff');
            case 'pendingOrders':
                return perms.includes('sales_pending') || user.role === 'BOSS';
            case 'groupBuySettings':
                return perms.includes('sales_pending') || user.role === 'BOSS';
            case 'memberManagement':
                return perms.includes('sales_pending') || user.role === 'BOSS';
            case 'products':
                return perms.includes('products') || user.role === 'BOSS';
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
        safeSessionStorage.setItem('inventory_user', JSON.stringify(userData));
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
        safeSessionStorage.removeItem('inventory_user');
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

    if (showSplash) {
        return (
            <div className="splash-screen">
                <div className="splash-content">
                    <img src={logoImg} className="breathe-logo" alt="Logo" />
                </div>
            </div>
        );
    }

    if (!user) {
        return (
            <>
                {isInitializing && (
                    <div className="splash-screen fade-out">
                        <div className="splash-content">
                            <img src={logoImg} className="breathe-logo" alt="Logo" />
                        </div>
                    </div>
                )}
                <LoginPage onLogin={handleLogin} apiUrl={GAS_API_URL} />
            </>
        );
    }

    // console.log('Current User:', user); 

    return (
        <div className="min-h-screen flex flex-col">
            {isInitializing && (
                <div className="splash-screen fade-out">
                    <div className="splash-content">
                        <img src={logoImg} className="breathe-logo" alt="Logo" />
                    </div>
                </div>
            )}

            {/* Offline Indicator */}
            {isOffline && (
                <div className="bg-yellow-500 text-white text-center py-2 text-sm font-medium flex items-center justify-center gap-2">
                    <WifiOff size={16} />
                    網路已離線,部分功能可能無法使用
                </div>
            )}

            {/* Version Update Banner 已移除：偵測到新版本直接自動強制重載 */}

            {/* Navbar（客戶點餐頁不顯示）*/}
            {page !== 'liffOrder' && <header className={`h-[76px] border-b border-[var(--border-primary)] bg-[var(--bg-secondary)]/85 backdrop-blur-xl flex justify-between items-center px-6 sticky top-0 z-[60] transition-[transform,box-shadow,background-color] duration-200 ease-[cubic-bezier(0.17,0.67,0.83,0.67)] ${showHeader ? 'translate-y-0' : '-translate-y-full'} ${scrolled ? 'shadow-lg border-transparent' : 'shadow-none'}`}>

                <div className="flex items-center gap-3">
                    <img src={logoImg} alt="Logo" className="h-11 w-auto object-contain brightness-0 dark:brightness-100 transition-transform hover:scale-105 cursor-pointer" onClick={() => handlePageChange('sales')} />
                </div>

                {/* Header Actions (Logout on far right, others spread) */}
                <div className="flex-1 flex items-center justify-between md:justify-end md:flex-initial md:gap-4 ml-8">
                    {/* Mobile Menu Trigger */}
                    <div className="md:hidden relative" onClick={(e) => e.stopPropagation()}>
                        <button
                            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                            className={`flex items-center justify-center gap-1.5 h-10 w-24 px-3 rounded-xl border transition-all duration-300 ${mobileMenuOpen
                                ? 'bg-blue-600 border-blue-600 text-white shadow-lg'
                                : 'bg-white border-slate-200 text-slate-700 hover:border-blue-400 shadow-sm active:scale-95'
                                }`}
                        >
                            <Menu size={16} className={mobileMenuOpen ? 'text-white' : 'text-blue-500'} />
                            <span className="font-black text-xs tracking-tight">功能</span>
                        </button>

                        {/* Mobile Dropdown Panel (Fixed Centering for Stability) */}
                        {mobileMenuOpen && (
                            <div className="fixed top-20 left-0 right-0 mx-auto w-[94%] max-w-md bg-[var(--bg-secondary)] backdrop-blur-xl border border-[var(--border-primary)] rounded-2xl shadow-2xl overflow-y-auto max-h-[80vh] animate-in fade-in slide-in-from-top-4 duration-200 z-[100]">
                                <div className="p-2.5 flex flex-col gap-1.5">
                                    {/* 銷售管理 Group */}
                                    {(user.role === 'BOSS' || checkPermission('sales') || checkPermission('report')) && (
                                        <MobileNavGroup label="銷售" icon={ShoppingCart}>
                                            {checkPermission('sales') && <NavItem label="商品銷售登錄" icon={ShoppingCart} onClick={() => handlePageChange('sales')} active={page === 'sales'} />}
                                            {checkPermission('report') && <NavItem label="銷售查詢報表" icon={FileText} onClick={() => handlePageChange('report')} active={page === 'report'} />}
                                        </MobileNavGroup>
                                    )}
                                    {/* 團購管理 Group */}
                                    {(user.role === 'BOSS' || checkPermission('pendingOrders') || checkPermission('products')) && (
                                        <MobileNavGroup label="團購" icon={Users}>
                                            {checkPermission('pendingOrders') && <NavItem label="訂單審核" icon={ClipboardList} onClick={() => handlePageChange('pendingOrders')} active={page === 'pendingOrders'} />}
                                            {checkPermission('groupBuySettings') && <NavItem label="開團管理" icon={Link} onClick={() => handlePageChange('groupBuySettings')} active={page === 'groupBuySettings'} />}
                                            {checkPermission('products') && <NavItem label="商品屬性" icon={Edit2} onClick={() => handlePageChange('products')} active={page === 'products'} />}
                                            {checkPermission('memberManagement') && <NavItem label="會員管理" icon={Wallet} onClick={() => handlePageChange('memberManagement')} active={page === 'memberManagement'} />}
                                        </MobileNavGroup>
                                    )}
                                    {(user.role === 'BOSS' || checkPermission('purchase') || checkPermission('purchaseHistory')) && (
                                        <MobileNavGroup label="進貨" icon={PackagePlus}>
                                            {checkPermission('purchase') && <NavItem label="商品進貨登錄" icon={PackagePlus} onClick={() => handlePageChange('purchase')} active={page === 'purchase'} />}
                                            {checkPermission('purchaseHistory') && <NavItem label="進貨查詢報表" icon={ClipboardList} onClick={() => handlePageChange('purchaseHistory')} active={page === 'purchaseHistory'} />}
                                        </MobileNavGroup>
                                    )}
                                    {(user.role === 'BOSS' || checkPermission('inventory') || checkPermission('stocktake') || checkPermission('valuation') || checkPermission('adjustHistory') || checkPermission('stocktakeHistory')) && (
                                        <MobileNavGroup label="庫存" icon={Archive}>
                                            {checkPermission('inventory') && <NavItem label="庫存檢視" icon={Archive} onClick={() => handlePageChange('inventory')} active={page === 'inventory'} />}
                                            {checkPermission('stocktake') && <NavItem label="庫存盤點" icon={CheckSquare} onClick={() => handlePageChange('stocktake')} active={page === 'stocktake'} />}
                                            {checkPermission('valuation') && <NavItem label="庫存估值" icon={DollarSign} onClick={() => handlePageChange('valuation')} active={page === 'valuation'} />}
                                            {checkPermission('adjustHistory') && <NavItem label="異動查詢" icon={FileText} onClick={() => handlePageChange('adjustHistory')} active={page === 'adjustHistory'} />}
                                            {checkPermission('stocktakeHistory') && <NavItem label="盤點歷史" icon={ClipboardList} onClick={() => handlePageChange('stocktakeHistory')} active={page === 'stocktakeHistory'} />}
                                        </MobileNavGroup>
                                    )}
                                    {(user.role === 'BOSS' || checkPermission('expenditureManagement')) && (
                                        <MobileNavGroup label="支出" icon={DollarSign}>
                                            <NavItem label="支出登錄" icon={DollarSign} onClick={() => handlePageChange('expenditureManagement')} active={page === 'expenditureManagement'} />
                                        </MobileNavGroup>
                                    )}
                                    {(user.role === 'BOSS' || checkPermission('receivable') || checkPermission('payable') || checkPermission('incomeStatement') || checkPermission('costCalculation') || checkPermission('payroll')) && (
                                        <MobileNavGroup label="帳務" icon={Wallet}>
                                            {checkPermission('receivable') && <NavItem label="應收帳款" icon={Wallet} onClick={() => handlePageChange('receivable')} active={page === 'receivable'} />}
                                            {checkPermission('payable') && <NavItem label="應付帳款" icon={Wallet} onClick={() => handlePageChange('payable')} active={page === 'payable'} />}
                                            {checkPermission('incomeStatement') && <NavItem label="損益表" icon={PieChart} onClick={() => handlePageChange('incomeStatement')} active={page === 'incomeStatement'} />}
                                            {checkPermission('costCalculation') && <NavItem label="成本計算分析" icon={DollarSign} onClick={() => handlePageChange('costCalculation')} active={page === 'costCalculation'} />}
                                            {checkPermission('payroll') && <NavItem label="薪資結算中心" icon={DollarSign} onClick={() => handlePageChange('payroll')} active={page === 'payroll'} />}
                                        </MobileNavGroup>
                                    )}
                                    {(user.role === 'BOSS' || checkPermission('salesRanking') || checkPermission('customerRanking') || checkPermission('profitAnalysis') || checkPermission('turnoverRate')) && (
                                        <MobileNavGroup label="分析" icon={TrendingUp}>
                                            {checkPermission('salesRanking') && <NavItem label="商品銷售排行" icon={BarChart2} onClick={() => handlePageChange('salesRanking')} active={page === 'salesRanking'} />}
                                            {checkPermission('customerRanking') && <NavItem label="客戶銷售排行" icon={Users} onClick={() => handlePageChange('customerRanking')} active={page === 'customerRanking'} />}
                                            {checkPermission('customerAnalytics') && <NavItem label="客戶深度分析" icon={Activity} onClick={() => handlePageChange('customerAnalytics')} active={page === 'customerAnalytics'} />}
                                            {checkPermission('profitAnalysis') && <NavItem label="毛利分析報表" icon={TrendingUp} onClick={() => handlePageChange('profitAnalysis')} active={page === 'profitAnalysis'} />}
                                            {checkPermission('turnoverRate') && <NavItem label="庫存周轉率" icon={Activity} onClick={() => handlePageChange('turnoverRate')} active={page === 'turnoverRate'} />}
                                        </MobileNavGroup>
                                    )}
                                    {(user.role === 'BOSS' || checkPermission('permissionControl') || checkPermission('activityLog')) && (
                                        <MobileNavGroup label="系統" icon={Shield}>
                                            {checkPermission('permissionControl') && <NavItem label="權限控管表" icon={Shield} onClick={() => handlePageChange('permissionControl')} active={page === 'permissionControl'} />}
                                            {checkPermission('activityLog') && <NavItem label="操作紀錄查詢" icon={Activity} onClick={() => handlePageChange('activityLog')} active={page === 'activityLog'} />}
                                        </MobileNavGroup>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Desktop Navigation (Fixed Grid - Consistent Positioning) */}
                    <nav className="hidden md:grid grid-cols-8 flex-1 items-center mx-12 lg:mx-20 max-w-6xl whitespace-nowrap">
                        {/* Column 1: 銷售 */}
                        <div className="flex justify-center">
                            {/* 銷售管理 Group */}
                            {(user.role === 'BOSS' || checkPermission('sales') || checkPermission('report')) && (
                                <NavDropdown
                                    id="sales"
                                    label="銷售"
                                    icon={ShoppingCart}
                                    openDropdown={openDropdown}
                                    setOpenDropdown={setOpenDropdown}
                                    active={['sales', 'report'].includes(page)}
                                >
                                    {checkPermission('sales') && <NavItem label="商品銷售登錄" icon={ShoppingCart} onClick={() => handlePageChange('sales')} active={page === 'sales'} />}
                                    {checkPermission('report') && <NavItem label="銷售查詢報表" icon={FileText} onClick={() => handlePageChange('report')} active={page === 'report'} />}
                                </NavDropdown>
                            )}
                        </div>

                        {/* Column 2: 團購 */}
                        <div className="flex justify-center">
                            {(user.role === 'BOSS' || checkPermission('pendingOrders') || checkPermission('products')) && (
                                <NavDropdown
                                     id="groupbuy"
                                     label="團購"
                                     icon={Users}
                                     openDropdown={openDropdown}
                                     setOpenDropdown={setOpenDropdown}
                                     active={['pendingOrders', 'groupBuySettings', 'products', 'memberManagement'].includes(page)}
                                 >
                                     {checkPermission('pendingOrders') && <NavItem label="訂單審核" icon={ClipboardList} onClick={() => handlePageChange('pendingOrders')} active={page === 'pendingOrders'} />}
                                     {checkPermission('groupBuySettings') && <NavItem label="開團管理" icon={Link} onClick={() => handlePageChange('groupBuySettings')} active={page === 'groupBuySettings'} />}
                                     {checkPermission('products') && <NavItem label="商品屬性" icon={Edit2} onClick={() => handlePageChange('products')} active={page === 'products'} />}
                                     {checkPermission('memberManagement') && <NavItem label="會員管理" icon={Wallet} onClick={() => handlePageChange('memberManagement')} active={page === 'memberManagement'} />}
                                 </NavDropdown>
                            )}
                        </div>

                        {/* Column 2: 進貨 */}
                        <div className="flex justify-center">
                            {(user.role === 'BOSS' || checkPermission('purchase') || checkPermission('purchaseHistory')) && (
                                <NavDropdown
                                    id="purchase"
                                    label="進貨"
                                    icon={PackagePlus}
                                    openDropdown={openDropdown}
                                    setOpenDropdown={setOpenDropdown}
                                    active={['purchase', 'purchaseHistory'].includes(page)}
                                >
                                    {checkPermission('purchase') && <NavItem label="商品進貨登錄" icon={PackagePlus} onClick={() => handlePageChange('purchase')} active={page === 'purchase'} />}
                                    {checkPermission('purchaseHistory') && <NavItem label="進貨查詢報表" icon={ClipboardList} onClick={() => handlePageChange('purchaseHistory')} active={page === 'purchaseHistory'} />}
                                </NavDropdown>
                            )}
                        </div>

                        {/* Column 3: 庫存 */}
                        <div className="flex justify-center">
                            {(user.role === 'BOSS' || checkPermission('inventory') || checkPermission('stocktake') || checkPermission('valuation') || checkPermission('adjustHistory') || checkPermission('stocktakeHistory')) && (
                                <NavDropdown
                                    id="inventory"
                                    label="庫存"
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
                        </div>

                        {/* Column 4: 支出 */}
                        <div className="flex justify-center">
                            {(user.role === 'BOSS' || checkPermission('expenditureManagement')) && (
                                <NavDropdown
                                    id="expenditure"
                                    label="支出"
                                    icon={DollarSign}
                                    openDropdown={openDropdown}
                                    setOpenDropdown={setOpenDropdown}
                                    active={page === 'expenditureManagement'}
                                >
                                    <NavItem label="支出登錄" icon={DollarSign} onClick={() => handlePageChange('expenditureManagement')} active={page === 'expenditureManagement'} />
                                </NavDropdown>
                            )}
                        </div>

                        {/* Column 5: 帳務 */}
                        <div className="flex justify-center">
                            {(user.role === 'BOSS' || checkPermission('receivable') || checkPermission('payable') || checkPermission('incomeStatement') || checkPermission('costCalculation') || checkPermission('payroll')) && (
                                <NavDropdown
                                    id="accounting"
                                    label="帳務"
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
                        </div>

                        {/* Column 6: 分析 */}
                        <div className="flex justify-center">
                            {(user.role === 'BOSS' || checkPermission('salesRanking') || checkPermission('customerRanking') || checkPermission('profitAnalysis') || checkPermission('turnoverRate')) && (
                                <NavDropdown
                                    id="analytics"
                                    label="分析"
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
                        </div>

                        {/* Column 7: 系統 */}
                        <div className="flex justify-center">
                            {(user.role === 'BOSS' || checkPermission('permissionControl') || checkPermission('activityLog')) && (
                                <NavDropdown
                                    id="system"
                                    label="系統"
                                    icon={Shield}
                                    openDropdown={openDropdown}
                                    setOpenDropdown={setOpenDropdown}
                                    active={['permissionControl', 'activityLog'].includes(page)}
                                >
                                    {checkPermission('permissionControl') && <NavItem label="權限控管表" icon={Shield} onClick={() => handlePageChange('permissionControl')} active={page === 'permissionControl'} />}
                                    {checkPermission('activityLog') && <NavItem label="操作紀錄查詢" icon={Activity} onClick={() => handlePageChange('activityLog')} active={page === 'activityLog'} />}
                                </NavDropdown>
                            )}
                        </div>
                    </nav>

                    {/* Mode (ThemeToggle) */}
                    <ThemeToggle />

                    {/* User Info (Ultra-Minimalist Horizontal Layout) */}
                    <div className="hidden md:flex items-center gap-3 pl-6 border-l border-slate-300 h-8 my-auto">
                        <span className="text-sm font-black text-black tracking-tight">{user.username}</span>
                        <div className="w-[1px] h-4 bg-slate-300 dark:bg-slate-700" />
                        <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">
                            {user.role}
                        </span>
                    </div>

                    {/* Logout */}
                    <button
                        onClick={handleLogout}
                        className="flex items-center justify-center p-2 text-slate-500 hover:text-red-600 transition-all duration-300 active:scale-95"
                        title="登出系統"
                    >
                        <LogOut size={20} />
                    </button>
                </div>
            </header>}


            {/* Main Content */}
            <main className={`flex-1 overflow-hidden ${page === 'liffOrder' ? '' : 'p-4 md:p-6'}`}>

                {checkPermission(page) ? (
                    <>
                        {page === 'sales' && (
                            <ErrorBoundary>
                                <SalesPage user={user} apiUrl={GAS_API_URL} logActivity={logActivity} />
                            </ErrorBoundary>
                        )}
                        {page === 'inventory' && <InventoryPage user={user} apiUrl={GAS_API_URL} logActivity={logActivity} />}
                        {page === 'purchase' && <PurchasePage user={user} apiUrl={GAS_API_URL} logActivity={logActivity} />}
                        {page === 'report' && (
                            <ErrorBoundary>
                                <ReportPage user={user} apiUrl={GAS_API_URL} logActivity={logActivity} setPage={handlePageChange} />
                            </ErrorBoundary>
                        )}
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
                        {page === 'liffOrder' && <LiffOrderPage user={user} apiUrl={GAS_API_URL} />}
                        {page === 'pendingOrders' && <PendingOrdersPage user={user} apiUrl={GAS_API_URL} />}
                        {page === 'groupBuySettings' && <GroupBuySettingsPage user={user} apiUrl={GAS_API_URL} />}
                        {page === 'products' && <ProductManagementPage user={user} apiUrl={GAS_API_URL} />}
                        {page === 'memberManagement' && <MemberManagementPage user={user} apiUrl={GAS_API_URL} />}
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
