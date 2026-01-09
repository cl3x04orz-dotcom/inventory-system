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
import {
    LayoutDashboard, ShoppingCart, Archive, LogOut, PackagePlus,
    FileText, ClipboardList, DollarSign, CheckSquare, Wallet, ChevronDown,
    TrendingUp, BarChart2, Users, Activity, PieChart, Shield
} from 'lucide-react';

// Google Apps Script (GAS) API Endpoint
const GAS_API_URL = 'https://script.google.com/macros/s/AKfycbzGXlZuoGPhdwDrpFkpQV43-TNLNTlB2EQtsTBWhLY7a9H8m8hTQqf9FlFIVFMjStex/exec';

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
                    ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30 shadow-[0_0_15px_rgba(37,99,235,0.1)]'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                    }`}
            >
                <Icon size={18} />
                <span className="font-medium">{label}</span>
                <ChevronDown size={14} className={`transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
                <div
                    className="absolute top-full left-0 mt-2 w-48 bg-slate-900/90 backdrop-blur-xl border border-slate-700/50 rounded-xl shadow-2xl py-2 z-[100] animate-in fade-in slide-in-from-top-2 duration-200"
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
            ? 'text-blue-400 bg-blue-600/10 font-bold'
            : 'text-slate-400 hover:text-white hover:bg-white/5'
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
            setUser(JSON.parse(savedUser));
        }

        const handleGlobalClick = () => setOpenDropdown(null);
        window.addEventListener('click', handleGlobalClick);
        return () => window.removeEventListener('click', handleGlobalClick);
    }, []);

    const checkPermission = (targetPage) => {
        // 強制開啟所有權限 (User Request)
        return true;

        /* 原有邏輯暫時保留
        if (!user) return false;
        if (user.role === 'BOSS') return true;

        let permissions = user.permissions || [];
        if (typeof permissions === 'string') {
            try {
                permissions = JSON.parse(permissions);
            } catch (e) {
                permissions = [];
            }
        }
        if (!Array.isArray(permissions)) permissions = [];

        switch (targetPage) {
            case 'sales':
            case 'report':
                return permissions.includes('sales');
            case 'purchase':
            case 'purchaseHistory':
                return permissions.includes('purchase');
            case 'inventory':
            case 'stocktake':
            case 'valuation':
            case 'adjustHistory':
            case 'stocktakeHistory':
                return permissions.includes('inventory');
            case 'expenditureManagement':
            case 'receivable':
            case 'payable':
            case 'incomeStatement':
                return permissions.includes('finance');
            case 'salesRanking':
            case 'customerRanking':
            case 'profitAnalysis':
            case 'turnoverRate':
            case 'costCalculation':
                return permissions.includes('analytics');
            case 'permissionControl':
                return permissions.includes('system');
            default:
                return true; 
        }
        */
    };

    const handlePageChange = (newPage) => {
        if (checkPermission(newPage)) {
            setPage(newPage);
            setOpenDropdown(null);
        } else {
            alert('您沒有權限訪問此頁面');
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

    console.log('Current User:', user); // DEBUG: Check permissions here

    return (
        <div className="min-h-screen flex flex-col">
            {/* Navbar */}
            <header className="h-16 border-b border-slate-800 bg-slate-900/50 backdrop-blur-md flex justify-between items-center px-6 sticky top-0 z-[60]">
                <div className="font-bold text-xl tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400">
                    INVENTORY <span className="font-light text-slate-400 uppercase tracking-widest text-xs">System</span>
                </div>

                <nav className="flex gap-1">
                    {/* 銷售管理 Group */}
                    {/* 銷售管理 Group */}
                    {(user.role === 'BOSS' || (user.permissions && user.permissions.includes('sales'))) && (
                        <NavDropdown
                            id="sales"
                            label="銷售管理"
                            icon={ShoppingCart}
                            openDropdown={openDropdown}
                            setOpenDropdown={setOpenDropdown}
                            active={['sales', 'report'].includes(page)}
                        >
                            <NavItem label="商品銷售登錄" icon={ShoppingCart} onClick={() => handlePageChange('sales')} active={page === 'sales'} />
                            <NavItem label="銷售查詢報表" icon={FileText} onClick={() => handlePageChange('report')} active={page === 'report'} />
                        </NavDropdown>
                    )}

                    {/* 進貨管理 Group */}
                    {(user.role === 'BOSS' || (user.permissions && user.permissions.includes('purchase'))) && (
                        <NavDropdown
                            id="purchase"
                            label="進貨管理"
                            icon={PackagePlus}
                            openDropdown={openDropdown}
                            setOpenDropdown={setOpenDropdown}
                            active={['purchase', 'purchaseHistory'].includes(page)}
                        >
                            <NavItem label="商品進貨登錄" icon={PackagePlus} onClick={() => handlePageChange('purchase')} active={page === 'purchase'} />
                            <NavItem label="進貨查詢" icon={ClipboardList} onClick={() => handlePageChange('purchaseHistory')} active={page === 'purchaseHistory'} />
                        </NavDropdown>
                    )}

                    {/* 庫存管理 Group */}
                    {(user.role === 'BOSS' || (user.permissions && user.permissions.includes('inventory'))) && (
                        <NavDropdown
                            id="inventory"
                            label="庫存管理"
                            icon={Archive}
                            openDropdown={openDropdown}
                            setOpenDropdown={setOpenDropdown}
                            active={['inventory', 'stocktake', 'valuation', 'adjustHistory', 'stocktakeHistory'].includes(page)}
                        >
                            <NavItem label="庫存檢視" icon={Archive} onClick={() => handlePageChange('inventory')} active={page === 'inventory'} />
                            <NavItem label="庫存盤點" icon={CheckSquare} onClick={() => handlePageChange('stocktake')} active={page === 'stocktake'} />
                            <NavItem label="庫存估值" icon={DollarSign} onClick={() => handlePageChange('valuation')} active={page === 'valuation'} />
                            <div className="my-1 border-t border-slate-700/50" />
                            <NavItem label="異動查詢" icon={FileText} onClick={() => handlePageChange('adjustHistory')} active={page === 'adjustHistory'} />
                            <NavItem label="盤點歷史" icon={ClipboardList} onClick={() => handlePageChange('stocktakeHistory')} active={page === 'stocktakeHistory'} />
                        </NavDropdown>
                    )}

                    {/* 支出管理 Group */}
                    {(user.role === 'BOSS' || (user.permissions && user.permissions.includes('finance'))) && (
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
                    {(user.role === 'BOSS' || (user.permissions && user.permissions.includes('finance'))) && (
                        <NavDropdown
                            id="accounting"
                            label="財務帳務"
                            icon={Wallet}
                            openDropdown={openDropdown}
                            setOpenDropdown={setOpenDropdown}
                            active={['receivable', 'payable', 'incomeStatement', 'payroll'].includes(page)}
                        >
                            <NavItem label="應收帳款" icon={Wallet} onClick={() => handlePageChange('receivable')} active={page === 'receivable'} />
                            <NavItem label="應付帳款" icon={Wallet} onClick={() => handlePageChange('payable')} active={page === 'payable'} />
                            <NavItem label="損益表" icon={PieChart} onClick={() => handlePageChange('incomeStatement')} active={page === 'incomeStatement'} />
                        </NavDropdown>
                    )}

                    {/* 數據分析 Group */}
                    {(user.role === 'BOSS' || (user.permissions && user.permissions.includes('analytics'))) && (
                        <NavDropdown
                            id="analytics"
                            label="數據分析"
                            icon={TrendingUp}
                            openDropdown={openDropdown}
                            setOpenDropdown={setOpenDropdown}
                            active={['salesRanking', 'customerRanking', 'profitAnalysis', 'turnoverRate', 'costCalculation'].includes(page)}
                        >
                            <NavItem label="商品銷售排行" icon={BarChart2} onClick={() => handlePageChange('salesRanking')} active={page === 'salesRanking'} />
                            <NavItem label="客戶銷售排行" icon={Users} onClick={() => handlePageChange('customerRanking')} active={page === 'customerRanking'} />
                            <NavItem label="毛利分析報表" icon={TrendingUp} onClick={() => handlePageChange('profitAnalysis')} active={page === 'profitAnalysis'} />
                            <NavItem label="成本計算分析" icon={DollarSign} onClick={() => handlePageChange('costCalculation')} active={page === 'costCalculation'} />
                            <NavItem label="庫存周轉率" icon={Activity} onClick={() => handlePageChange('turnoverRate')} active={page === 'turnoverRate'} />
                        </NavDropdown>
                    )}

                    {/* 系統管理 Group */}
                    {(user.role === 'BOSS' || (user.permissions && user.permissions.includes('system'))) && (
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
                        <span className="text-xs font-bold text-blue-400 leading-none">{user.username}</span>
                        <span className="text-[10px] text-slate-500 uppercase font-bold tracking-tighter">{user.role}</span>
                    </div>
                    <button
                        onClick={handleLogout}
                        className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-400 hover:text-red-400 hover:bg-red-400/10 transition-all border border-transparent hover:border-red-400/20"
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
                    </>
                ) : (
                    <div className="flex flex-col items-center justify-center h-full text-slate-500">
                        <Shield size={64} className="mb-4 text-slate-700" />
                        <h2 className="text-xl font-bold">權限不足</h2>
                        <p>您無法存取此頁面，請聯繫管理員。</p>

                        {/* DEBUG INFO - REMOVE LATER */}
                        <div className="mt-8 p-4 bg-slate-800 rounded-lg text-xs text-left font-mono text-slate-400">
                            <p className="mb-2 text-yellow-400">--- DEBUG INFO ---</p>
                            <p>Role: {user.role}</p>
                            <p>Permissions: {JSON.stringify(user.permissions)}</p>
                            <p>Page: {page}</p>
                            <p className="mt-2 text-blue-300">
                                若 Permissions 為空，請嘗試
                                <button onClick={handleLogout} className="mx-1 underline text-red-400 hover:text-red-300">
                                    登出
                                </button>
                                並重新登入以更新權限資料。
                            </p>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
