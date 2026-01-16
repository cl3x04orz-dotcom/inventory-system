import React, { useState } from 'react';
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
import ProfitAnalysisPage from './pages/ProfitAnalysisPage';
import TurnoverRatePage from './pages/TurnoverRatePage';
import CostCalculationPage from './pages/CostCalculationPage';
import IncomeStatementPage from './pages/IncomeStatementPage';
import ExpenditureManagementPage from './pages/ExpenditureManagementPage';
import PermissionControlPage from './pages/PermissionControlPage';
import PayrollPage from './pages/PayrollPage';
import {
    LayoutDashboard, ShoppingCart, Archive, LogOut, PackagePlus,
    FileText, ClipboardList, DollarSign, CheckSquare, Wallet, ChevronDown,
    TrendingUp, BarChart2, Users, Activity, PieChart, Shield
} from 'lucide-react';

// Google Apps Script (GAS) API Endpoint
const GAS_API_URL = import.meta.env.VITE_GAS_API_URL;

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
                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
                    }`}
            >
                <Icon size={18} />
                <span className="font-medium">{label}</span>
                <ChevronDown size={14} className={`transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
                <div
                    className="absolute top-full left-0 mt-2 w-48 bg-white/95 backdrop-blur-xl border border-slate-200 rounded-xl shadow-2xl py-2 z-[100] animate-in fade-in slide-in-from-top-2 duration-200"
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

export default function App() {
    const [user, setUser] = useState(null); // { token, role, name, ... }
    const [page, setPage] = useState('sales');
    const [openDropdown, setOpenDropdown] = useState(null);

    // Check for saved user session on component mount
    React.useEffect(() => {
        const savedUser = localStorage.getItem('inventory_user');
        if (savedUser) {
            const parsed = JSON.parse(savedUser);
            // [Fix] Old session data might not have permissions. Force logout if undefined.
            if (parsed && typeof parsed.permissions === 'undefined') {
                console.warn('Detected stale user data (no permissions). Clearing session.');
                localStorage.removeItem('inventory_user');
                setUser(null);
            } else {
                setUser(parsed);
            }
        }

        const handleGlobalClick = () => setOpenDropdown(null);
        window.addEventListener('click', handleGlobalClick);
        return () => window.removeEventListener('click', handleGlobalClick);
    }, []);

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
                return perms.includes('inventory_adjust') || perms.includes('inventory');
            case 'stocktake':
                return perms.includes('inventory_stocktake') || perms.includes('inventory');
            case 'valuation':
                return perms.includes('inventory_valuation') || perms.includes('inventory');
            case 'adjustHistory':
            case 'stocktakeHistory':
                return perms.includes('inventory_history') || perms.includes('inventory');
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
            case 'profitAnalysis':
                return perms.includes('analytics_profit') || perms.includes('analytics');
            case 'turnoverRate':
                return perms.includes('analytics_turnover') || perms.includes('analytics');
            case 'permissionControl':
                return perms.includes('system_config') || perms.includes('system');
            default:
                return true;
        }
    };

    // [New] Direct check for API URL suffix to help user verify deployment

    const handlePageChange = (newPage) => {
        if (checkPermission(newPage)) {
            setPage(newPage);
            setOpenDropdown(null);
        } else {
            console.warn(`Access denied for page: ${newPage}`);
        }
    };

    const handleLogin = (userData) => {
        setUser(userData);
        localStorage.setItem('inventory_user', JSON.stringify(userData));
    };

    const handleLogout = () => {
        setUser(null);
        localStorage.removeItem('inventory_user');
    };

    if (!user) {
        return <LoginPage onLogin={handleLogin} apiUrl={GAS_API_URL} />;
    }

    // console.log('Current User:', user); 

    return (
        <div className="min-h-screen flex flex-col">
            {/* Navbar */}
            <header className="h-16 border-b border-slate-200 bg-white/80 backdrop-blur-md flex justify-between items-center px-6 sticky top-0 z-[60]">
                {/* ... Navbar content ... */}
                <div className="flex items-center gap-2">
                    <img src={`${import.meta.env.BASE_URL}logo.png`} alt="Logo" className="h-10 w-auto object-contain" />
                </div>

                <nav className="flex gap-1">
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
                            {checkPermission('purchaseHistory') && <NavItem label="進貨查詢" icon={ClipboardList} onClick={() => handlePageChange('purchaseHistory')} active={page === 'purchaseHistory'} />}
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
                    {(user.role === 'BOSS' || checkPermission('receivable') || checkPermission('payable') || checkPermission('incomeStatement') || checkPermission('costCalculation')) && (
                        <NavDropdown
                            id="accounting"
                            label="財務帳務"
                            icon={Wallet}
                            openDropdown={openDropdown}
                            setOpenDropdown={setOpenDropdown}
                            active={['receivable', 'payable', 'incomeStatement', 'costCalculation'].includes(page)}
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
                            active={['salesRanking', 'customerRanking', 'profitAnalysis', 'turnoverRate'].includes(page)}
                        >
                            {checkPermission('salesRanking') && <NavItem label="商品銷售排行" icon={BarChart2} onClick={() => handlePageChange('salesRanking')} active={page === 'salesRanking'} />}
                            {checkPermission('customerRanking') && <NavItem label="客戶銷售排行" icon={Users} onClick={() => handlePageChange('customerRanking')} active={page === 'customerRanking'} />}
                            {checkPermission('profitAnalysis') && <NavItem label="毛利分析報表" icon={TrendingUp} onClick={() => handlePageChange('profitAnalysis')} active={page === 'profitAnalysis'} />}
                            {checkPermission('turnoverRate') && <NavItem label="庫存周轉率" icon={Activity} onClick={() => handlePageChange('turnoverRate')} active={page === 'turnoverRate'} />}
                        </NavDropdown>
                    )}

                    {/* 系統管理 Group */}
                    {(user.role === 'BOSS' || checkPermission('permissionControl')) && (
                        <NavDropdown
                            id="system"
                            label="系統管理"
                            icon={Shield}
                            openDropdown={openDropdown}
                            setOpenDropdown={setOpenDropdown}
                            active={page === 'permissionControl'}
                        >
                            <NavItem label="權限控管表" icon={Shield} onClick={() => handlePageChange('permissionControl')} active={page === 'permissionControl'} />
                        </NavDropdown>
                    )}
                </nav>

                <div className="flex items-center gap-4">
                    <div className="hidden md:flex flex-col items-end">
                        <span className="text-xs font-bold text-blue-600 leading-none">{user.username}</span>
                        <span className="text-[10px] text-slate-400 uppercase font-bold tracking-tighter">{user.role}</span>
                    </div>
                    <button
                        onClick={handleLogout}
                        className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all border border-transparent hover:border-red-100"
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
                        {page === 'sales' && <SalesPage user={user} apiUrl={GAS_API_URL} />}
                        {page === 'inventory' && <InventoryPage user={user} apiUrl={GAS_API_URL} />}
                        {page === 'purchase' && <PurchasePage user={user} apiUrl={GAS_API_URL} />}
                        {page === 'report' && <ReportPage user={user} apiUrl={GAS_API_URL} />}
                        {page === 'purchaseHistory' && <PurchaseHistoryPage user={user} apiUrl={GAS_API_URL} />}
                        {page === 'adjustHistory' && <AdjustmentHistoryPage user={user} apiUrl={GAS_API_URL} />}
                        {page === 'valuation' && <InventoryValuationPage user={user} apiUrl={GAS_API_URL} />}
                        {page === 'stocktake' && <StocktakePage user={user} apiUrl={GAS_API_URL} />}
                        {page === 'stocktakeHistory' && <StocktakeHistoryPage user={user} apiUrl={GAS_API_URL} />}
                        {page === 'receivable' && <ReceivablePage user={user} apiUrl={GAS_API_URL} />}
                        {page === 'payable' && <PayablePage user={user} apiUrl={GAS_API_URL} />}
                        {page === 'salesRanking' && <SalesRankingPage user={user} apiUrl={GAS_API_URL} />}
                        {page === 'customerRanking' && <CustomerRankingPage user={user} apiUrl={GAS_API_URL} />}
                        {page === 'profitAnalysis' && <ProfitAnalysisPage user={user} apiUrl={GAS_API_URL} />}
                        {page === 'turnoverRate' && <TurnoverRatePage user={user} apiUrl={GAS_API_URL} />}
                        {page === 'costCalculation' && <CostCalculationPage user={user} apiUrl={GAS_API_URL} />}
                        {page === 'expenditureManagement' && <ExpenditureManagementPage user={user} apiUrl={GAS_API_URL} />}
                        {page === 'incomeStatement' && <IncomeStatementPage user={user} apiUrl={GAS_API_URL} />}
                        {page === 'permissionControl' && <PermissionControlPage user={user} apiUrl={GAS_API_URL} />}
                        {page === 'payroll' && <PayrollPage user={user} apiUrl={GAS_API_URL} />}
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
