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
import {
    LayoutDashboard, ShoppingCart, Archive, LogOut, PackagePlus,
    FileText, ClipboardList, DollarSign, CheckSquare, Wallet
} from 'lucide-react';

// Google Apps Script (GAS) API Endpoint
const GAS_API_URL = 'https://script.google.com/macros/s/AKfycbw0sN21nJXfjezYL446-wgwTbLOCUziFGOEN8qsXYg7cYHsN5R4Sgn2dSyzoGtH0Xb5/exec';

export default function App() {
    const [user, setUser] = useState(null); // { token, role, name, ... }
    const [page, setPage] = useState('sales');

    // Check for saved user session on component mount
    React.useEffect(() => {
        const savedUser = localStorage.getItem('inventory_user');
        if (savedUser) {
            setUser(JSON.parse(savedUser));
        }
    }, []);

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

    return (
        <div className="min-h-screen flex flex-col">
            {/* Navbar */}
            <header className="h-16 border-b border-slate-800 bg-slate-900/50 backdrop-blur flex justify-between items-center px-6 sticky top-0 z-50">
                <div className="font-bold text-xl tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400">
                    INVENTORY <span className="font-light text-slate-400">SYSTEM</span>
                </div>
                <nav className="flex gap-2">
                    <button
                        onClick={() => setPage('sales')}
                        className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-colors ${page === 'sales' ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30' : 'text-slate-400 hover:bg-slate-800'}`}
                    >
                        <ShoppingCart size={18} /> 銷售
                    </button>
                    <button
                        onClick={() => setPage('inventory')}
                        className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-colors ${page === 'inventory' ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30' : 'text-slate-400 hover:bg-slate-800'}`}
                    >
                        <Archive size={18} /> 庫存
                    </button>
                    <button
                        onClick={() => setPage('purchase')}
                        className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-colors ${page === 'purchase' ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30' : 'text-slate-400 hover:bg-slate-800'}`}
                    >
                        <PackagePlus size={18} /> 進貨
                    </button>
                    <button
                        onClick={() => setPage('report')}
                        className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-colors ${page === 'report' ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30' : 'text-slate-400 hover:bg-slate-800'}`}
                    >
                        <FileText size={18} /> 銷售查詢
                    </button>
                    <button
                        onClick={() => setPage('purchaseHistory')}
                        className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-colors ${page === 'purchaseHistory' ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30' : 'text-slate-400 hover:bg-slate-800'}`}
                    >
                        <ClipboardList size={18} /> 進貨查詢
                    </button>
                    <button
                        onClick={() => setPage('adjustHistory')}
                        className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-colors ${page === 'adjustHistory' ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30' : 'text-slate-400 hover:bg-slate-800'}`}
                    >
                        <ClipboardList size={18} /> 異動查詢
                    </button>
                    <button
                        onClick={() => setPage('valuation')}
                        className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-colors ${page === 'valuation' ? 'bg-yellow-600/20 text-yellow-400 border border-yellow-500/30' : 'text-slate-400 hover:bg-slate-800'}`}
                    >
                        <DollarSign size={18} /> 庫存估值
                    </button>
                    <button
                        onClick={() => setPage('stocktake')}
                        className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-colors ${page === 'stocktake' ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30' : 'text-slate-400 hover:bg-slate-800'}`}
                    >
                        <CheckSquare size={18} /> 盤點
                    </button>
                    <button
                        onClick={() => setPage('stocktakeHistory')}
                        className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-colors ${page === 'stocktakeHistory' ? 'bg-purple-600/20 text-purple-400 border border-purple-500/30' : 'text-slate-400 hover:bg-slate-800'}`}
                    >
                        <ClipboardList size={18} /> 盤點歷史
                    </button>
                    <button
                        onClick={() => setPage('receivable')}
                        className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-colors ${page === 'receivable' ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30' : 'text-slate-400 hover:bg-slate-800'}`}
                    >
                        <Wallet size={18} /> 應收帳款
                    </button>
                    <button
                        onClick={() => setPage('payable')}
                        className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-colors ${page === 'payable' ? 'bg-rose-600/20 text-rose-400 border border-rose-500/30' : 'text-slate-400 hover:bg-slate-800'}`}
                    >
                        <Wallet size={18} /> 應付帳款
                    </button>
                </nav>
                <div className="flex items-center gap-4">
                    <span className="text-sm text-slate-500 hidden md:inline">Hi, {user.username} ({user.role})</span>
                    <button
                        onClick={handleLogout}
                        className="p-2 text-slate-400 hover:text-red-400 transition-colors"
                        title="登出"
                    >
                        <LogOut size={20} />
                    </button>
                </div>
            </header>

            {/* Main Content */}
            <main className="flex-1 p-4 md:p-6 overflow-hidden">
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
            </main>
        </div>
    );
}
