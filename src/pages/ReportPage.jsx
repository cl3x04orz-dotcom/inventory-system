import React, { useState, useCallback } from 'react';
import { Search, Calendar, MapPin, User, FileText, TrendingUp, Package, DollarSign } from 'lucide-react';
import { callGAS } from '../utils/api';
import { getLocalDateString } from '../utils/constants';

// 格式化數字：四捨五入到小數點第 1 位
const formatNumberWithDecimal = (num) => {
    return num.toFixed(1).replace(/\.0$/, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};

// 根據數字長度動態調整字體大小
const getDynamicFontSize = (num) => {
    const str = formatNumberWithDecimal(num);
    const len = str.length;
    if (len <= 6) return 'text-xs md:text-xl';      // 短數字：正常大小
    if (len <= 9) return 'text-[10px] md:text-lg';  // 中等數字：稍小
    return 'text-[8px] md:text-base';               // 長數字：很小
};

export default function ReportPage({ user, apiUrl }) {
    const [startDate, setStartDate] = useState(getLocalDateString());
    const [endDate, setEndDate] = useState(getLocalDateString());
    const [location, setLocation] = useState('');
    const [salesRep, setSalesRep] = useState('');
    const [loading, setLoading] = useState(false);
    const [reportData, setReportData] = useState([]);
    const [expenseData, setExpenseData] = useState([]);
    const [viewMode, setViewMode] = useState('SALES'); // 'SALES' or 'EXPENSES'

    const fetchData = useCallback(async () => {
        if (!startDate || !endDate) return;
        setLoading(true);

        try {
            const payload = { startDate, endDate }; // Basic payload for date range

            // RBAC Check: Only fetch expenditures if user has finance permission
            const hasFinancePerm = user.role === 'BOSS' || (user.permissions && user.permissions.includes('finance'));

            const promises = [
                callGAS(apiUrl, 'getSalesHistory', payload, user.token)
            ];

            if (hasFinancePerm) {
                promises.push(callGAS(apiUrl, 'getExpenditures', payload, user.token));
            }

            const results = await Promise.all(promises);
            const salesRes = results[0];
            const expenseRes = hasFinancePerm ? results[1] : [];

            // 1. Process Sales Data
            let filteredSales = Array.isArray(salesRes) ? salesRes : [];
            const locTerm = location.trim().toLowerCase();
            const repTerm = salesRep.trim().toLowerCase();

            if (locTerm) {
                filteredSales = filteredSales.filter(item =>
                    String(item.location || '').toLowerCase().includes(locTerm)
                );
            }
            if (repTerm) {
                filteredSales = filteredSales.filter(item =>
                    String(item.salesRep || '').toLowerCase().includes(repTerm)
                );
            }
            setReportData(filteredSales);

            // 2. Process Expenditure Data
            let filteredExpenses = Array.isArray(expenseRes) ? expenseRes : [];
            if (locTerm) {
                filteredExpenses = filteredExpenses.filter(item =>
                    String(item.customer || '').toLowerCase().includes(locTerm) ||
                    String(item.note || '').toLowerCase().includes(locTerm)
                );
            }
            if (repTerm) {
                filteredExpenses = filteredExpenses.filter(item =>
                    String(item.salesRep || '').toLowerCase().includes(repTerm)
                );
            }

            // Calculate row totals for expenses
            filteredExpenses.forEach(item => {
                const rowTotal =
                    Number(item.stall || 0) + Number(item.cleaning || 0) + Number(item.electricity || 0) +
                    Number(item.gas || 0) + Number(item.parking || 0) + Number(item.goods || 0) +
                    Number(item.bags || 0) + Number(item.others || 0) + Number(item.vehicleMaintenance || 0) +
                    Number(item.salary || 0) + Number(item.linePay || 0) + Number(item.serviceFee || 0) +
                    Number(item.reserve || 0);
                item.rowTotal = rowTotal;
                // [Fix] 標記薪資金額 (匯款)，不計入「應繳回金額」的現金支出扣除
                item.salaryAmount = Number(item.salary || 0);

                // 模糊匹配結算金額欄位 (Expenditures L 欄)
                const finalTotalKey = Object.keys(item).find(k => {
                    const lowK = k.toLowerCase().trim();
                    return lowK === 'finaltotal' ||
                        lowK.includes('結算') ||
                        lowK.includes('结算') ||
                        lowK.includes('總支出金額') ||
                        lowK.includes('总支出金额');
                });

                // 讀取值並確保是數字，如果找不到或為 0，則給予 fallback
                const extractedValue = finalTotalKey ? Number(item[finalTotalKey]) : Number(item.finalTotal || 0);
                item.displayFinalTotal = extractedValue;
            });

            setExpenseData(filteredExpenses);

        } catch (error) {
            console.error(error);
            alert('查詢失敗: ' + error.message);
        } finally {
            setLoading(false);
        }
    }, [startDate, endDate, location, salesRep, user.token, apiUrl]);

    // Initial fetch and fetch on dependency change
    React.useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleSearch = (e) => {
        e.preventDefault();
        fetchData();
    };

    // Calculate summaries
    // Calculate summaries
    const totalSales = reportData?.reduce((acc, item) => acc + (Number(item.totalAmount) || 0), 0) || 0;
    const totalQty = reportData?.reduce((acc, item) => acc + (Number(item.soldQty) || 0), 0) || 0;
    // [Fix] 總支出扣除薪資 (因為薪資是匯款，不從現金帳扣除)
    const totalExpenses = expenseData?.reduce((acc, item) => acc + (item.rowTotal || 0) - (item.salaryAmount || 0), 0) || 0;
    const totalFinalTotal = expenseData?.reduce((acc, item) => acc + (Number(item.displayFinalTotal) || 0), 0) || 0;
    const totalReturnAmount = totalSales - totalExpenses + totalFinalTotal;

    // Group by Product for summary table
    const productSummary = reportData?.reduce((acc, item) => {
        const id = item.productName; // Use name as key for simplicity in display
        if (!acc[id]) {
            acc[id] = { name: item.productName, qty: 0, amount: 0 };
        }
        acc[id].qty += item.soldQty;
        acc[id].amount += item.totalAmount;
        return acc;
    }, {});

    const summaryList = productSummary ? Object.values(productSummary).sort((a, b) => b.qty - a.qty) : [];

    return (
        <div className="max-w-[90rem] mx-auto p-4">
            <div className="glass-panel p-6">
                {/* Header Section */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-6 border-b border-[var(--border-primary)] pb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-[var(--text-primary)] flex items-center gap-2">
                            <FileText className="text-blue-600" /> 銷售查詢報表
                        </h1>
                        <p className="text-[var(--text-secondary)] text-sm mt-1">查詢特定日期、銷售對象或業務的銷售紀錄</p>
                    </div>

                    {/* Summary Stats (Integrated in Header) */}
                    {reportData && (
                        <div className="grid grid-cols-3 md:grid-cols-6 gap-2 md:gap-3 w-full md:w-auto">
                            <div className="px-2 md:px-4 py-2 rounded-xl bg-amber-500/10 border border-amber-200/20 shadow-sm">
                                <p className="text-[10px] md:text-xs text-[var(--text-secondary)] uppercase font-bold text-center">應繳回</p>
                                <p className={`${getDynamicFontSize(totalReturnAmount)} font-bold text-amber-700 text-center whitespace-nowrap`}>${formatNumberWithDecimal(totalReturnAmount)}</p>
                            </div>
                            <div className="px-2 md:px-4 py-2 rounded-xl bg-emerald-500/10 border border-emerald-200/20 shadow-sm">
                                <p className="text-[10px] md:text-xs text-[var(--text-secondary)] uppercase font-bold text-center">總銷售</p>
                                <p className={`${getDynamicFontSize(totalSales)} font-bold text-emerald-700 text-center whitespace-nowrap`}>${formatNumberWithDecimal(totalSales)}</p>
                            </div>
                            <div className="px-2 md:px-4 py-2 rounded-xl bg-rose-500/10 border border-rose-200/20 shadow-sm">
                                <p className="text-[10px] md:text-xs text-[var(--text-secondary)] uppercase font-bold text-center">總支出</p>
                                <p className={`${getDynamicFontSize(totalExpenses)} font-bold text-rose-700 text-center whitespace-nowrap`}>${formatNumberWithDecimal(totalExpenses)}</p>
                            </div>
                            <div className="px-2 md:px-4 py-2 rounded-xl bg-cyan-500/10 border border-cyan-200/20 shadow-sm">
                                <p className="text-[10px] md:text-xs text-[var(--text-secondary)] uppercase font-bold text-center">結算</p>
                                <p className={`${getDynamicFontSize(totalFinalTotal)} font-bold text-cyan-700 text-center whitespace-nowrap`}>${formatNumberWithDecimal(totalFinalTotal)}</p>
                            </div>
                            <div className="px-2 md:px-4 py-2 rounded-xl bg-blue-500/10 border border-blue-200/20 shadow-sm">
                                <p className="text-[10px] md:text-xs text-[var(--text-secondary)] uppercase font-bold text-center">總數量</p>
                                <p className={`${getDynamicFontSize(totalQty)} font-bold text-blue-700 text-center whitespace-nowrap`}>{formatNumberWithDecimal(totalQty)}</p>
                            </div>
                            <div className="px-2 md:px-4 py-2 rounded-xl bg-purple-500/10 border border-purple-200/20 shadow-sm">
                                <p className="text-[10px] md:text-xs text-[var(--text-secondary)] uppercase font-bold text-center">總筆數</p>
                                <p className="text-xs md:text-xl font-bold text-purple-700 text-center whitespace-nowrap">{reportData.length}</p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Filters - Mobile View (Horizontal, No Border, mimics SalesPage) */}
                <form onSubmit={handleSearch} className="md:hidden mb-6 space-y-3">
                    <div className="flex items-center gap-3">
                        <label className="text-sm font-bold text-[var(--text-secondary)] whitespace-nowrap w-[70px]">開始日期:</label>
                        <input
                            type="date"
                            required
                            className="input-field flex-1 py-1.5 px-3"
                            value={startDate}
                            onChange={e => setStartDate(e.target.value)}
                        />
                    </div>
                    <div className="flex items-center gap-3">
                        <label className="text-sm font-bold text-[var(--text-secondary)] whitespace-nowrap w-[70px]">結束日期:</label>
                        <input
                            type="date"
                            required
                            className="input-field flex-1 py-1.5 px-3"
                            value={endDate}
                            onChange={e => setEndDate(e.target.value)}
                        />
                    </div>
                    <div className="flex items-center gap-3">
                        <label className="text-sm font-bold text-[var(--text-secondary)] whitespace-nowrap w-[70px]">銷售對象:</label>
                        <input
                            type="text"
                            placeholder="輸入銷售對象..."
                            className="input-field flex-1 py-1.5 px-3"
                            value={location}
                            onChange={e => setLocation(e.target.value)}
                        />
                    </div>
                    <div className="flex items-center gap-3">
                        <label className="text-sm font-bold text-[var(--text-secondary)] whitespace-nowrap w-[70px]">業務員:</label>
                        <div className="flex flex-1 gap-2">
                            <input
                                type="text"
                                placeholder="姓名..."
                                className="input-field flex-1 py-1.5 px-3"
                                value={salesRep}
                                onChange={e => setSalesRep(e.target.value)}
                            />
                            <button
                                type="submit"
                                disabled={loading}
                                className="btn-primary px-4 py-1.5 flex items-center justify-center rounded-lg shadow-sm active:scale-95 transition-transform"
                            >
                                <Search size={18} />
                            </button>
                        </div>
                    </div>
                </form>

                {/* Filters - Desktop View (Original Grid) */}
                <form onSubmit={handleSearch} className="hidden md:block mb-6 p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-primary)] shadow-sm">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="grid grid-cols-2 gap-4 md:contents">
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-[var(--text-secondary)] uppercase px-1">開始日期</label>
                                <input
                                    type="date"
                                    required
                                    className="input-field w-full"
                                    value={startDate}
                                    onChange={e => setStartDate(e.target.value)}
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-[var(--text-secondary)] uppercase px-1">結束日期</label>
                                <input
                                    type="date"
                                    required
                                    className="input-field w-full"
                                    value={endDate}
                                    onChange={e => setEndDate(e.target.value)}
                                />
                            </div>
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-[var(--text-secondary)] uppercase px-1">銷售對象</label>
                            <input
                                type="text"
                                placeholder="關鍵字..."
                                className="input-field w-full"
                                value={location}
                                onChange={e => setLocation(e.target.value)}
                            />
                        </div>
                        <div className="flex gap-2">
                            <div className="space-y-1 flex-1">
                                <label className="text-xs font-bold text-[var(--text-secondary)] uppercase px-1">業務員</label>
                                <input
                                    type="text"
                                    placeholder="姓名..."
                                    className="input-field w-full"
                                    value={salesRep}
                                    onChange={e => setSalesRep(e.target.value)}
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={loading}
                                className="btn-primary py-2 px-6 flex items-center justify-center gap-2 self-end h-[42px] min-w-[100px]"
                            >
                                {loading ? '...' : <Search size={18} />} 查詢
                            </button>
                        </div>
                    </div>
                </form>

                {/* Content Logic */}
                {reportData && (
                    <div className="space-y-6">
                        {/* 1. Summary Table */}
                        <div className="rounded-xl border border-[var(--border-primary)] overflow-hidden">
                            <div className="px-4 py-3 bg-[var(--bg-tertiary)] border-b border-[var(--border-primary)]">
                                <h3 className="font-bold text-[var(--text-primary)] flex items-center gap-2">
                                    <Package size={16} className="text-blue-600" /> 商品銷售統計
                                </h3>
                            </div>
                            <div className="overflow-x-auto max-h-60">
                                <table className="w-full text-left">
                                    <thead className="bg-[var(--bg-tertiary)] text-[var(--text-secondary)] text-xs uppercase font-bold border-b border-[var(--border-primary)]">
                                        <tr>
                                            <th className="p-4">商品名稱</th>
                                            <th className="p-4 text-right">銷售數量</th>
                                            <th className="p-4 text-right">銷售金額</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[var(--border-primary)] bg-[var(--bg-secondary)]">
                                        {summaryList.length > 0 ? (
                                            summaryList.map((item, idx) => (
                                                <tr key={idx} className="hover:bg-[var(--bg-hover)] transition-colors">
                                                    <td className="p-4 text-[var(--text-primary)]">{item.name}</td>
                                                    <td className="p-4 text-right text-[var(--text-tertiary)]">{item.qty}</td>
                                                    <td className="p-4 text-right text-emerald-600">${item.amount.toLocaleString()}</td>
                                                </tr>
                                            ))
                                        ) : (
                                            <tr>
                                                <td colSpan="3" className="p-8 text-center text-[var(--text-secondary)]">查無資料</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* 2. Detailed Lists with Tabs */}
                        <div className="rounded-xl border border-[var(--border-primary)] overflow-hidden flex flex-col h-[600px]">
                            <div className="px-4 py-3 bg-[var(--bg-tertiary)] border-b border-[var(--border-primary)] flex gap-4">
                                <button
                                    onClick={() => setViewMode('SALES')}
                                    className={`font-bold flex items-center gap-2 pb-2 border-b-2 transition-colors ${viewMode === 'SALES' ? 'text-blue-600 border-blue-600' : 'text-[var(--text-secondary)] border-transparent hover:text-[var(--text-primary)]'}`}
                                >
                                    <TrendingUp size={16} /> 銷售明細 ({reportData.length})
                                </button>
                                <button
                                    onClick={() => setViewMode('EXPENSES')}
                                    className={`font-bold flex items-center gap-2 pb-2 border-b-2 transition-colors ${viewMode === 'EXPENSES' ? 'text-rose-600 border-rose-600' : 'text-[var(--text-secondary)] border-transparent hover:text-[var(--text-primary)]'}`}
                                >
                                    <DollarSign size={16} /> 支出明細 ({expenseData.length})
                                </button>
                            </div>

                            <div className="overflow-auto flex-1">
                                {viewMode === 'SALES' ? (
                                    <>
                                        {/* Mobile Card View (SALES) */}
                                        <div className="md:hidden divide-y divide-[var(--border-primary)]">
                                            {reportData.map((item, idx) => (
                                                <div key={idx} className="p-4 space-y-3 bg-[var(--bg-secondary)] hover:bg-[var(--bg-hover)] transition-colors">
                                                    <div className="flex justify-between items-start">
                                                        <div className="text-xs font-mono text-[var(--text-tertiary)]">
                                                            {new Date(item.date).toLocaleString('zh-TW', {
                                                                year: 'numeric', month: '2-digit', day: '2-digit',
                                                                hour: '2-digit', minute: '2-digit', hour12: false
                                                            })}
                                                        </div>
                                                        <div className="text-emerald-600 font-bold font-mono text-lg">${item.totalAmount}</div>
                                                    </div>
                                                    <div className="flex flex-wrap gap-2 text-sm">
                                                        <div className="flex items-center gap-1 bg-blue-500/10 text-blue-700 px-2 py-0.5 rounded-md">
                                                            <MapPin size={12} /> <span className="font-medium">{item.location}</span>
                                                        </div>
                                                        <div className="flex items-center gap-1 bg-[var(--bg-tertiary)] text-[var(--text-secondary)] px-2 py-0.5 rounded-md">
                                                            <User size={12} /> <span>{item.salesRep}</span>
                                                        </div>
                                                    </div>
                                                    <div className="flex justify-between items-center pt-1 border-t border-[var(--border-primary)]">
                                                        <div className="font-bold text-[var(--text-primary)]">{item.productName}</div>
                                                        <div className="text-[var(--text-secondary)]">數量: <span className="font-bold text-[var(--text-primary)]">{item.soldQty}</span></div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>

                                        {/* Desktop Table View (SALES) */}
                                        <table className="hidden md:table w-full text-left text-sm">
                                            <thead className="bg-[var(--bg-tertiary)] text-[var(--text-secondary)] sticky top-0 z-10">
                                                <tr>
                                                    <th className="p-3 font-medium w-48">日期</th>
                                                    <th className="p-3 font-medium w-32">銷售對象</th>
                                                    <th className="p-3 font-medium w-32">業務</th>
                                                    <th className="p-3 font-medium">商品</th>
                                                    <th className="p-3 font-medium text-right w-24">數量</th>
                                                    <th className="p-3 font-medium text-right w-32">金額</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-[var(--border-primary)] text-[var(--text-secondary)] bg-[var(--bg-secondary)]">
                                                {reportData.map((item, idx) => (
                                                    <tr key={idx} className="hover:bg-[var(--bg-hover)] transition-colors">
                                                        <td className="p-3 text-[var(--text-tertiary)]">
                                                            {new Date(item.date).toLocaleString('zh-TW', {
                                                                year: 'numeric', month: '2-digit', day: '2-digit',
                                                                hour: '2-digit', minute: '2-digit', hour12: false
                                                            })}
                                                        </td>
                                                        <td className="p-3">{item.location}</td>
                                                        <td className="p-3">{item.salesRep}</td>
                                                        <td className="p-3 text-[var(--text-primary)]">{item.productName}</td>
                                                        <td className="p-3 text-right">{item.soldQty}</td>
                                                        <td className="p-3 text-right">${item.totalAmount}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </>
                                ) : (
                                    <>
                                        {/* Mobile Card View (EXPENSES) */}
                                        <div className="md:hidden divide-y divide-[var(--border-primary)]">
                                            {expenseData.map((item, idx) => {
                                                const cats = [];
                                                if (item.stall) cats.push(`攤位 $${item.stall}`);
                                                if (item.cleaning) cats.push(`清潔 $${item.cleaning}`);
                                                if (item.electricity) cats.push(`電費 $${item.electricity}`);
                                                if (item.gas) cats.push(`加油 $${item.gas}`);
                                                if (item.parking) cats.push(`停車 $${item.parking}`);
                                                if (item.goods) cats.push(`貨款 $${item.goods}`);
                                                if (item.bags) cats.push(`塑膠袋 $${item.bags}`);
                                                if (item.others) cats.push(`其他 $${item.others}`);
                                                if (item.linePay) cats.push(`Line Pay $${item.linePay}`);
                                                if (item.serviceFee) cats.push(`服務費 $${item.serviceFee}`);
                                                if (item.reserve) cats.push(`公積金 $${item.reserve}`);
                                                if (item.vehicleMaintenance) cats.push(`車輛保養 $${item.vehicleMaintenance}`);
                                                if (item.salary) cats.push(`薪資 $${item.salary}`);

                                                return (
                                                    <div key={idx} className="p-4 space-y-3 bg-[var(--bg-secondary)] hover:bg-[var(--bg-hover)] transition-colors">
                                                        <div className="flex justify-between items-start">
                                                            <div className="text-xs font-mono text-[var(--text-tertiary)]">
                                                                {new Date(item.date).toLocaleString('zh-TW', {
                                                                    year: 'numeric', month: '2-digit', day: '2-digit',
                                                                    hour: '2-digit', minute: '2-digit', hour12: false
                                                                })}
                                                            </div>
                                                            <div className="flex flex-col items-end">
                                                                <div className="text-emerald-600 font-bold font-mono text-lg">${Number(item.displayFinalTotal).toLocaleString()}</div>
                                                                <div className="text-[10px] text-[var(--text-tertiary)] font-mono">支出: ${Number(item.rowTotal).toLocaleString()}</div>
                                                            </div>
                                                        </div>
                                                        <div className="flex flex-wrap gap-2 text-sm">
                                                            <div className="flex flex-col gap-1">
                                                                <div className="flex items-center gap-1 bg-amber-500/10 text-amber-700 px-2 py-0.5 rounded-md">
                                                                    <MapPin size={12} /> <span className="font-medium text-xs">{item.customer || ''}</span>
                                                                </div>
                                                                {item.note && (
                                                                    <div className="text-[10px] text-[var(--text-tertiary)] bg-gray-50 px-2 py-0.5 rounded border border-gray-100">
                                                                        {item.note}
                                                                    </div>
                                                                )}
                                                                {(!item.customer && !item.note) && '-'}
                                                            </div>
                                                            <div className="flex items-center gap-1 bg-[var(--bg-tertiary)] text-[var(--text-secondary)] px-2 py-0.5 rounded-md">
                                                                <User size={12} /> <span className="text-xs">{item.salesRep}</span>
                                                            </div>
                                                        </div>
                                                        <div className="pt-2 border-t border-[var(--border-primary)]">
                                                            <p className="text-[10px] uppercase font-bold text-[var(--text-tertiary)] mb-1">支出細項</p>
                                                            <div className="flex flex-wrap gap-1">
                                                                {cats.map((c, i) => (
                                                                    <span key={i} className="text-[10px] bg-[var(--bg-tertiary)] text-[var(--text-secondary)] px-1.5 py-0.5 rounded border border-[var(--border-primary)]">{c}</span>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>

                                        {/* Desktop Table View (EXPENSES) */}
                                        <table className="hidden md:table w-full text-left text-sm">
                                            <thead className="bg-[var(--bg-tertiary)] text-[var(--text-secondary)] sticky top-0 z-10">
                                                <tr>
                                                    <th className="p-3 font-medium w-48">日期</th>
                                                    <th className="p-3 font-medium w-48">對象/備註</th>
                                                    <th className="p-3 font-medium w-32">業務</th>
                                                    <th className="p-3 font-medium">支出細項</th>
                                                    <th className="p-3 font-medium text-right w-24">總支出</th>
                                                    <th className="p-3 font-medium text-right w-24 text-emerald-600">結算金額</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-[var(--border-primary)] text-[var(--text-secondary)] bg-[var(--bg-secondary)]">
                                                {expenseData.map((item, idx) => {
                                                    const cats = [];
                                                    if (item.stall) cats.push(`攤位 $${item.stall}`);
                                                    if (item.cleaning) cats.push(`清潔 $${item.cleaning}`);
                                                    if (item.electricity) cats.push(`電費 $${item.electricity}`);
                                                    if (item.gas) cats.push(`加油 $${item.gas}`);
                                                    if (item.parking) cats.push(`停車 $${item.parking}`);
                                                    if (item.goods) cats.push(`貨款 $${item.goods}`);
                                                    if (item.bags) cats.push(`塑膠袋 $${item.bags}`);
                                                    if (item.others) cats.push(`其他 $${item.others}`);
                                                    if (item.linePay) cats.push(`Line Pay $${item.linePay}`);
                                                    if (item.serviceFee) cats.push(`服務費 $${item.serviceFee}`);
                                                    if (item.reserve) cats.push(`公積金 $${item.reserve}`);
                                                    if (item.vehicleMaintenance) cats.push(`車輛保養 $${item.vehicleMaintenance}`);
                                                    if (item.salary) cats.push(`薪資 $${item.salary}`);

                                                    return (
                                                        <tr key={idx} className="hover:bg-[var(--bg-hover)] transition-colors">
                                                            <td className="p-3 text-[var(--text-tertiary)]">
                                                                {new Date(item.date).toLocaleString('zh-TW', {
                                                                    year: 'numeric', month: '2-digit', day: '2-digit',
                                                                    hour: '2-digit', minute: '2-digit', hour12: false
                                                                })}
                                                            </td>
                                                            <td className="p-3">
                                                                <div className="font-bold text-[var(--text-primary)]">{item.customer || ''}</div>
                                                                {item.note && <div className="text-[10px] text-[var(--text-tertiary)] font-normal">{item.note}</div>}
                                                                {(!item.customer && !item.note) && '-'}
                                                            </td>
                                                            <td className="p-3 text-[var(--text-secondary)]">{item.salesRep}</td>
                                                            <td className="p-3 text-xs text-[var(--text-tertiary)]">{cats.join(', ')}</td>
                                                            <td className="p-3 text-right font-mono text-rose-600">
                                                                ${(item.rowTotal || 0).toLocaleString()}
                                                            </td>
                                                            <td className="p-3 text-right font-mono font-bold text-emerald-600">
                                                                ${(Number(item.displayFinalTotal) || 0).toLocaleString()}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
