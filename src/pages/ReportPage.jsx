import React, { useState, useCallback } from 'react';
import { Search, Calendar, MapPin, User, FileText, TrendingUp, Package, DollarSign, RotateCcw, ChevronDown, ChevronRight } from 'lucide-react';
import { callGAS } from '../utils/api';
import { getLocalDateString } from '../utils/constants';

// 格式化數字：四捨五入到小數點第 1 位
const formatNumberWithDecimal = (num) => {
    // 處理 -0 並確保顯示為 0
    let val = Number(num) || 0;
    if (Object.is(val, -0) || (val < 0 && val > -0.01)) val = 0;
    return val.toFixed(1).replace(/\.0$/, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};

// 根據數字長度動態調整字體大小
const getDynamicFontSize = (num) => {
    const str = formatNumberWithDecimal(num);
    const len = str.length;
    if (len <= 6) return 'text-xs md:text-xl';      // 短數字：正常大小
    if (len <= 9) return 'text-[10px] md:text-lg';  // 中等數字：稍小
    return 'text-[8px] md:text-base';               // 長數字：很小
};

export default function ReportPage({ user, apiUrl, setPage }) {
    const [startDate, setStartDate] = useState(getLocalDateString());
    const [endDate, setEndDate] = useState(getLocalDateString());
    const [location, setLocation] = useState('');
    const [salesRep, setSalesRep] = useState('');
    const [productTerm, setProductTerm] = useState('');
    const [rawSales, setRawSales] = useState([]);
    const [rawExpenses, setRawExpenses] = useState([]);
    const [loading, setLoading] = useState(false);
    const [reportData, setReportData] = useState([]);
    const [expenseData, setExpenseData] = useState([]);
    const [viewMode, setViewMode] = useState('SALES'); // 'SALES' or 'EXPENSES'
    const [isVoiding, setIsVoiding] = useState(false); // [New] Loading state for voiding
    const [expandedGroups, setExpandedGroups] = useState({}); // [New] Track expanded transactions

    // 1. Fetch Data from Server (Only on Date Change)
    const fetchData = useCallback(async () => {
        if (!startDate || !endDate) return;
        setLoading(true);

        try {
            const payload = { startDate, endDate };
            const hasFinancePerm = user.role === 'BOSS' ||
                (user.permissions && user.permissions.some(p => p === 'finance' || p.startsWith('finance_')));

            const promises = [callGAS(apiUrl, 'getSalesHistory', payload, user.token)];
            if (hasFinancePerm) promises.push(callGAS(apiUrl, 'getExpenditures', payload, user.token));

            const results = await Promise.all(promises);
            setRawSales(Array.isArray(results[0]) ? results[0] : []);
            setRawExpenses(hasFinancePerm ? (Array.isArray(results[1]) ? results[1] : []) : []);
        } catch (error) {
            console.error(error);
            alert('查詢失敗: ' + error.message);
        } finally {
            setLoading(false);
        }
    }, [startDate, endDate, user.token, apiUrl]);

    // 2. Perform Local Filtering (Instant Response)
    React.useEffect(() => {
        const locTerm = location.trim().toLowerCase();
        const repTerm = salesRep.trim().toLowerCase();
        const prodTerm = productTerm.trim().toLowerCase();

        // Filter Sales
        let filteredSales = [...rawSales];
        if (locTerm) filteredSales = filteredSales.filter(item => String(item.location || '').toLowerCase().includes(locTerm));
        if (repTerm) filteredSales = filteredSales.filter(item => String(item.salesRep || '').toLowerCase().includes(repTerm));
        if (prodTerm) filteredSales = filteredSales.filter(item => String(item.productName || '').toLowerCase().includes(prodTerm));
        setReportData(filteredSales);

        // Filter Expenses
        let filteredExpenses = rawExpenses.map(item => ({
            ...item,
            linePayAmount: Number(item.linePay || 0),
            rowTotal: Number(item.stall || 0) + Number(item.cleaning || 0) + Number(item.electricity || 0) +
                Number(item.gas || 0) + Number(item.parking || 0) + Number(item.goods || 0) +
                Number(item.bags || 0) + Number(item.others || 0) + Number(item.vehicleMaintenance || 0) +
                Number(item.salary || 0) + Number(item.serviceFee || 0) + Number(item.reserve || 0),
            salaryAmount: Number(item.salary || 0),
            normCustomer: item.customer || item['對象/備註'] || item['對象'] || '',
            normSalesRep: item.salesRep || item['業務'] || '',
            normNote: item.note || item['備註'] || '',
            displayFinalTotal: Number(item[Object.keys(item).find(k => ['finaltotal', '結算', '结算', '總支出金額', '总支出金额'].some(term => k.toLowerCase().includes(term)))] || item.finalTotal || 0)
        }));

        if (locTerm) {
            filteredExpenses = filteredExpenses.filter(item =>
                String(item.normCustomer).toLowerCase().includes(locTerm) ||
                String(item.normNote).toLowerCase().includes(locTerm)
            );
        }
        if (repTerm) {
            filteredExpenses = filteredExpenses.filter(item => String(item.normSalesRep).toLowerCase().includes(repTerm));
        }
        setExpenseData(filteredExpenses);

    }, [rawSales, rawExpenses, location, salesRep, productTerm]);

    // Trigger Fetching
    React.useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleCorrection = async (saleId) => {
        if (!window.confirm('確定要「作廢並修正」此筆紀錄嗎？\n系統將會：\n1. 作廢舊單並回補庫存\n2. 自動跳轉到錄入頁面填入舊資料\n3. 讓您修改後重新存檔')) return;

        setIsVoiding(true);
        try {
            // [優化] 第一步：先抓取資料（純讀取，極快），即便後續作廢超時，資料也已經在快取裡了
            const fetchRes = await callGAS(apiUrl, 'getSaleToClone', { saleId }, user.token);
            if (fetchRes.success && fetchRes.cloneData) {
                sessionStorage.setItem('clonedSale', JSON.stringify(fetchRes.cloneData));
            } else {
                throw new Error(fetchRes.error || '無法獲取原始資料');
            }

            // 第二步：執行作廢（涉及多表寫入，較慢）
            try {
                const voidRes = await callGAS(apiUrl, 'voidAndFetchSale', { saleId }, user.token);
                if (voidRes.success) {
                    setPage('sales'); // Correct for Sales report
                } else {
                    throw new Error(voidRes.error || '作廢失敗');
                }
            } catch (voidError) {
                // 如果是超時，但我們已經拿到 cloneData 了，依然可以讓使用者去修正
                if (voidError.message.includes('超時')) {
                    console.warn('作廢操作超時，但資料已快取，嘗試繼續導向...');
                    alert('系統回應較慢，但舊單已進入作廢流程中。正在為您開啟修正頁面...');
                    setPage('sales');
                } else {
                    throw voidError;
                }
            }
        } catch (error) {
            console.error(error);
            alert('修正功能執行失敗: ' + error.message);
            setIsVoiding(false);
        }
    };

    // Calculate summaries
    // [Fix] 業績統計 (總銷售、總銷量)：排除「補收款」模式，避免同一筆單重複計入業績
    const totalSales = reportData?.reduce((acc, item) => {
        if (!item.isCollectionReportMode) return acc + (Number(item.totalAmount) || 0);
        return acc;
    }, 0) || 0;

    const totalQty = reportData?.reduce((acc, item) => {
        if (!item.isCollectionReportMode) return acc + (Number(item.soldQty) || 0);
        return acc;
    }, 0) || 0;

    // 定義非現金付款方式判斷
    const isNonCashMethod = (method) => {
        const m = (method || '').trim().toUpperCase();
        return ['CREDIT', 'TRANSFER', '賒帳', '賒銷', '匯款'].includes(m);
    };

    // [Fix] 計算「今日原始銷售中的非現金部分」
    const totalNonCashSales = reportData?.reduce((acc, item) => {
        if (!item.isCollectionReportMode && isNonCashMethod(item.paymentMethod)) {
            return acc + (Number(item.totalAmount) || 0);
        }
        return acc;
    }, 0) || 0;

    // [Fix] 計算「今日補收到的現金」 (排除匯款補收)
    const totalCollectionCash = reportData?.reduce((acc, item) => {
        if (item.isCollectionReportMode && !isNonCashMethod(item.paymentMethod)) {
            return acc + (Number(item.totalAmount) || 0);
        }
        return acc;
    }, 0) || 0;

    // [Fix] 計算「有支出分錄的非現金銷售額」 (用於扣除結算總額)
    // 只有「賒帳 (CREDIT)」會在錄入時產生對沖需求。
    const totalNonCashWithExpenseEntry = reportData?.reduce((acc, item) => {
        const m = (item.paymentMethod || '').trim().toUpperCase();
        const isCredit = ['CREDIT', '賒帳', '賒銷'].includes(m);

        if (isCredit && !item.isCollectionReportMode) {
            return acc + (Number(item.totalAmount) || 0);
        }
        return acc;
    }, 0) || 0;

    // [Fix] 計算最終「應繳現金基數」：
    // (今日總銷售 - 今日非現金銷售) + 今日補收現金
    const totalCashSales = (totalSales - totalNonCashSales) + totalCollectionCash;

    // [Fix] 總支出計算邏輯更新：薪資（應叫金）統一視為現金支出（需扣除）
    const totalExpenses = expenseData?.reduce((acc, item) => {
        let expense = item.rowTotal || 0;
        return acc + expense;
    }, 0) || 0;

    // 計算總 Line Pay 金額 (用於應繳回扣除)
    const totalLinePay = expenseData?.reduce((acc, item) => acc + (item.linePayAmount || 0), 0) || 0;

    // 原始結算金額 (從支出表讀取的前端輸入值)
    const rawFinalTotal = expenseData?.reduce((acc, item) => acc + (Number(item.displayFinalTotal) || 0), 0) || 0;

    // [Adjustment] 結算金額補正：需扣除「有支出分錄的非現金銷售額」
    const totalFinalTotal = rawFinalTotal - totalNonCashWithExpenseEntry;

    // 應繳回 = 現金銷售 - 現金支出 - Line Pay(非現金收入/已入帳) + 結算(找零/補錢 - 賒帳已扣除)
    const totalReturnAmount = totalCashSales - totalExpenses - totalLinePay + totalFinalTotal;

    // Group by Product for summary table
    const productSummary = reportData?.reduce((acc, item) => {
        // [Fix] 排除「補收款」模式，避免重複計入商品銷量與金額 (已在原單計入)
        if (item.isCollectionReportMode) return acc;

        const id = item.productName; // Use name as key for simplicity in display
        if (!acc[id]) {
            acc[id] = { name: item.productName, qty: 0, amount: 0 };
        }
        acc[id].qty += item.soldQty;
        acc[id].amount += item.totalAmount;
        return acc;
    }, {});

    const summaryList = productSummary ? Object.values(productSummary).sort((a, b) => b.qty - a.qty) : [];

    // [New] Group Sales by Transaction (Date + Location + SalesRep)
    const groupedSales = (reportData || []).reduce((acc, item) => {
        const dateStr = new Date(item.date).toLocaleString('zh-TW', {
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', hour12: false
        });
        const key = `${dateStr}_${item.location}_${item.salesRep}`;
        if (!acc[key]) {
            acc[key] = {
                key,
                dateDisplay: dateStr,
                location: item.location,
                salesRep: item.salesRep,
                operator: item.operator,
                saleId: item.saleId,
                items: [],
                totalAmount: 0,
                totalQty: 0,
                totalExpense: 0,
                expenseDetails: {},
                // For Balance calculation
                totalNonCashSales: 0,
                totalCollectionCash: 0,
                totalNonCashWithExpenseEntry: 0,
                rawFinalTotal: 0,
                totalLinePay: 0,
                collectionNote: item.collectionNote
            };
        }
        acc[key].items.push(item);
        const amount = Number(item.totalAmount) || 0;
        acc[key].totalAmount += amount;
        acc[key].totalQty += (Number(item.soldQty) || 0);

        // Track sub-totals for balance logic
        const isNonCash = isNonCashMethod(item.paymentMethod);
        if (!item.isCollectionReportMode) {
            if (isNonCash) {
                acc[key].totalNonCashSales += amount;
                const m = (item.paymentMethod || '').trim().toUpperCase();
                if (['CREDIT', '賒帳', '賒銷'].includes(m)) {
                    acc[key].totalNonCashWithExpenseEntry += amount;
                }
            }
        } else {
            // Collection mode
            if (!isNonCash) {
                acc[key].totalCollectionCash += amount;
            }
        }

        return acc;
    }, {});

    // [New] Add Expenses to the same groups
    (expenseData || []).forEach(item => {
        const dateStr = new Date(item.date).toLocaleString('zh-TW', {
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', hour12: false
        });
        const key = `${dateStr}_${item.normCustomer || '-'}_${item.normSalesRep}`;
        if (!groupedSales[key]) {
            groupedSales[key] = {
                key,
                dateDisplay: dateStr,
                location: item.normCustomer || '-',
                salesRep: item.normSalesRep,
                operator: item.operator,
                saleId: item.saleId,
                items: [],
                totalAmount: 0,
                totalQty: 0,
                totalExpense: 0,
                expenseDetails: {},
                totalNonCashSales: 0,
                totalCollectionCash: 0,
                totalNonCashWithExpenseEntry: 0,
                rawFinalTotal: 0,
                totalLinePay: 0
            };
        }
        groupedSales[key].totalExpense += (Number(item.rowTotal) || 0);
        groupedSales[key].rawFinalTotal += (Number(item.displayFinalTotal) || 0);
        groupedSales[key].totalLinePay += (Number(item.linePayAmount) || 0);

        // Collect expense details
        const cats = {
            "攤位": item.stall,
            "清潔": item.cleaning,
            "電費": item.electricity,
            "加油": item.gas,
            "停車": item.parking,
            "貨款": item.goods,
            "塑膠袋": item.bags,
            "其他": item.others,
            "LinePay": item.linePay,
            "服務費": item.serviceFee,
            "公積金": item.reserve,
            "保修": item.vehicleMaintenance,
            "薪資": item.salary
        };

        Object.entries(cats).forEach(([label, amount]) => {
            const val = Number(amount) || 0;
            if (val > 0) {
                groupedSales[key].expenseDetails[label] = (groupedSales[key].expenseDetails[label] || 0) + val;
            }
        });
    });

    // Use database Column L (rawFinalTotal) as balance (Settlement)
    const sortedGroups = Object.values(groupedSales).sort((a, b) => b.key.localeCompare(a.key)); // Newest first
    sortedGroups.forEach(g => {
        let val = Number(g.rawFinalTotal) || 0;

        // Handle -0 and tiny negative numbers
        if (Object.is(val, -0) || (val < 0 && val > -0.001)) val = 0;

        // Force 0 for Credit/Non-cash transactions as per user request
        const isActuallyNonCash = g.items.length > 0 && g.items.every(item => isNonCashMethod(item.paymentMethod));
        if (isActuallyNonCash) {
            val = 0;
        }

        g.balance = val;
    });

    const toggleGroup = (key) => {
        setExpandedGroups(prev => ({
            ...prev,
            [key]: !prev[key]
        }));
    };

    return (
        <div className="max-w-[90rem] mx-auto p-4 relative">
            {/* Frosted Loading Overlay */}
            {isVoiding && (
                <div className="fixed inset-0 bg-white/30 backdrop-blur-md z-50 flex flex-col items-center justify-center animate-in fade-in duration-300">
                    <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4 shadow-lg"></div>
                    <p className="text-xl font-bold text-blue-900 drop-shadow-sm">舊單作廢處理中，請稍候...</p>
                </div>
            )}

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
                        <div className="grid grid-cols-3 md:grid-cols-7 gap-2 md:gap-3 w-full md:w-auto">
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
                            <div className="px-2 md:px-4 py-2 rounded-xl bg-indigo-500/10 border border-indigo-200/20 shadow-sm">
                                <p className="text-[10px] md:text-xs text-[var(--text-secondary)] uppercase font-bold text-center">Line Pay</p>
                                <p className={`${getDynamicFontSize(totalLinePay)} font-bold text-indigo-700 text-center whitespace-nowrap`}>${formatNumberWithDecimal(totalLinePay)}</p>
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
                <div className="md:hidden mb-6 space-y-3">
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
                        <label className="text-sm font-bold text-[var(--text-secondary)] whitespace-nowrap w-[70px]">產品名稱:</label>
                        <input
                            type="text"
                            placeholder="輸入產品名稱..."
                            className="input-field flex-1 py-1.5 px-3"
                            value={productTerm}
                            onChange={e => setProductTerm(e.target.value)}
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
                                type="button"
                                disabled={loading}
                                className="btn-primary px-4 py-1.5 flex items-center justify-center rounded-lg shadow-sm active:scale-95 transition-transform"
                                onClick={fetchData}
                            >
                                <Search size={18} />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Filters - Desktop View (Original Grid) */}
                <div className="hidden md:block mb-6 p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-primary)] shadow-sm">
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
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
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-[var(--text-secondary)] uppercase px-1">產品名稱</label>
                            <input
                                type="text"
                                placeholder="關鍵字..."
                                className="input-field w-full"
                                value={productTerm}
                                onChange={e => setProductTerm(e.target.value)}
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
                        </div>
                    </div>
                </div>

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
                                </button>
                            </div>

                            <div className="overflow-auto flex-1">
                                {viewMode === 'SALES' ? (
                                    <>
                                        {/* Mobile Card View (SALES) - Grouped */}
                                        <div className="md:hidden divide-y divide-[var(--border-primary)]">
                                            {sortedGroups.map((group) => {
                                                const isExpanded = expandedGroups[group.key];
                                                return (
                                                    <div key={group.key} className={`bg-[var(--bg-secondary)] transition-colors ${isExpanded ? 'bg-blue-50/20' : ''}`}>
                                                        <div
                                                            className="p-4 space-y-3 cursor-pointer"
                                                            onClick={() => toggleGroup(group.key)}
                                                        >
                                                            <div className="flex justify-between items-start">
                                                                <div className="text-xs font-mono text-[var(--text-tertiary)] flex items-center gap-2">
                                                                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                                                    {group.dateDisplay}
                                                                </div>
                                                                <div className="flex flex-col items-end gap-2">
                                                                    <div className="text-emerald-600 font-bold font-mono text-lg">${(Math.round(group.totalAmount) || 0).toLocaleString()}</div>
                                                                    <button
                                                                        onClick={(e) => { e.stopPropagation(); handleCorrection(group.saleId); }}
                                                                        className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-amber-500/10 text-amber-600 border border-amber-200 hover:bg-amber-100 transition-colors text-xs font-bold shadow-sm"
                                                                        title="作廢並修正全單"
                                                                    >
                                                                        <RotateCcw size={12} /> 修正
                                                                    </button>
                                                                    <div className="text-[10px] text-[var(--text-tertiary)] font-bold mt-1">結算: ${(Math.round(group.balance) || 0).toLocaleString()}</div>
                                                                </div>
                                                            </div>
                                                            <div className="flex flex-wrap gap-2 text-sm">
                                                                <div className="flex flex-col bg-blue-500/10 text-blue-700 px-2 py-0.5 rounded-md">
                                                                    <div className="flex items-center gap-1">
                                                                        <MapPin size={12} /> <span className="font-bold">{group.location}</span>
                                                                    </div>
                                                                    {group.collectionNote && (
                                                                        <div className="text-[10px] text-amber-600 font-medium ml-4">{group.collectionNote}</div>
                                                                    )}
                                                                </div>
                                                                <div className="flex items-center gap-1 bg-[var(--bg-tertiary)] text-[var(--text-secondary)] px-2 py-0.5 rounded-md">
                                                                    <User size={12} /> <span>{group.salesRep}</span>
                                                                    {group.operator && group.operator !== group.salesRep && (
                                                                        <span className="text-[10px] text-amber-600 ml-1">(修正：{group.operator})</span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            <div className="bg-[var(--bg-tertiary)]/50 p-3 rounded-md space-y-2">
                                                                <div className="text-base text-[var(--text-tertiary)] flex justify-between items-center">
                                                                    <span>共 {group.items.length} 項商品 / 總數: {group.totalQty}</span>
                                                                    <div className="flex gap-4">
                                                                        {Object.keys(group.expenseDetails).length > 0 && (
                                                                            <div className="flex flex-col items-end gap-1">
                                                                                {Object.entries(group.expenseDetails).map(([label, amount], idx) => (
                                                                                    <div key={idx} className="flex items-center gap-1.5 text-rose-600 font-bold">
                                                                                        <span className="text-sm">{label}:</span>
                                                                                        <span className="font-mono text-base">${amount.toLocaleString()}</span>
                                                                                    </div>
                                                                                ))}
                                                                            </div>
                                                                        )}
                                                                        <div className="text-right">
                                                                            <div className="text-[var(--text-tertiary)] text-[10px] mb-0.5">銷售總額</div>
                                                                            <span className="text-emerald-700 font-bold font-mono text-xl">${(Math.round(group.totalAmount) || 0).toLocaleString()}</span>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {isExpanded && (
                                                            <div className="px-4 pb-4 animate-in slide-in-from-top-2 duration-200">
                                                                <div className="bg-[var(--bg-tertiary)] rounded-lg p-3 space-y-2 border border-[var(--border-primary)]/50">
                                                                    {group.items.map((it, i) => (
                                                                        <div key={i} className="flex justify-between items-center text-sm pb-2 border-b border-[var(--border-primary)]/30 last:border-0 last:pb-0">
                                                                            <div>
                                                                                <div className="font-bold text-[var(--text-primary)] text-base">{it.productName}</div>
                                                                                <div className="text-[var(--text-tertiary)] text-base">單價: ${(it.totalAmount / it.soldQty).toLocaleString()}</div>
                                                                            </div>
                                                                            <div className="text-right">
                                                                                <div className="font-bold text-blue-600 text-base">x {it.soldQty}</div>
                                                                                <div className="font-mono text-[var(--text-secondary)] text-sm">${it.totalAmount.toLocaleString()}</div>
                                                                            </div>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                        {/* Desktop Table View (SALES) - Grouped */}
                                        <table className="hidden md:table w-full text-left text-sm border-separate border-spacing-0">
                                            <thead className="bg-[var(--bg-tertiary)] text-[var(--text-secondary)] sticky top-0 z-10 shadow-sm">
                                                <tr className="text-xs uppercase font-bold">
                                                    <th className="p-3 w-10"></th>
                                                    <th className="p-3 w-48">日期</th>
                                                    <th className="p-3 w-32">銷售對象</th>
                                                    <th className="p-3 w-28">業務</th>
                                                    <th className="p-3">摘要</th>
                                                    <th className="p-3 text-right w-40">支出</th>
                                                    <th className="p-3 text-right w-28 text-emerald-600">總金額</th>
                                                    <th className="p-3 text-right w-28 text-amber-600">結算</th>
                                                    <th className="p-3 text-center w-24">操作</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-[var(--border-primary)] bg-[var(--bg-secondary)]">
                                                {sortedGroups.map((group) => {
                                                    const isExpanded = expandedGroups[group.key];
                                                    return (
                                                        <React.Fragment key={group.key}>
                                                            <tr
                                                                className={`hover:bg-[var(--bg-hover)] transition-colors cursor-pointer group ${isExpanded ? 'bg-blue-50/30' : ''}`}
                                                                onClick={() => toggleGroup(group.key)}
                                                            >
                                                                <td className="p-3 text-center">
                                                                    {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                                                </td>
                                                                <td className="p-3 text-[var(--text-tertiary)] font-mono text-xs">
                                                                    {group.dateDisplay}
                                                                </td>
                                                                <td className="p-3">
                                                                    <div className="font-bold text-[var(--text-primary)] text-base leading-tight">{group.location}</div>
                                                                    {group.collectionNote && (
                                                                        <div className="text-[11px] text-amber-600 font-medium mt-0.5">{group.collectionNote}</div>
                                                                    )}
                                                                </td>
                                                                <td className="p-3 text-[var(--text-secondary)] text-sm">
                                                                    <div className="font-bold">{group.salesRep}</div>
                                                                    {group.operator && group.operator !== group.salesRep && (
                                                                        <div className="text-[10px] text-amber-600 font-normal mt-0.5">修正：{group.operator}</div>
                                                                    )}
                                                                </td>
                                                                <td className="p-3 text-xs text-[var(--text-tertiary)]">
                                                                    <div>{group.items.length} 項商品</div>
                                                                </td>
                                                                <td className="p-3 text-right font-mono text-rose-600">
                                                                    {Object.keys(group.expenseDetails).length > 0 ? (
                                                                        <div className="flex flex-col items-end gap-1">
                                                                            {Object.entries(group.expenseDetails).map(([label, amount], idx) => (
                                                                                <div key={idx} className="flex items-center gap-2 whitespace-nowrap bg-rose-50 px-2 py-0.5 rounded border border-rose-100">
                                                                                    <span className="text-[10px] font-bold opacity-80">{label}</span>
                                                                                    <span className="font-bold text-sm font-mono">${amount.toLocaleString()}</span>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    ) : '-'}
                                                                </td>
                                                                <td className="p-3 text-right font-bold text-emerald-600 font-mono text-lg">
                                                                    ${(Math.round(group.totalAmount) || 0).toLocaleString()}
                                                                </td>
                                                                <td className="p-3 text-right font-bold text-amber-600 font-mono text-lg">
                                                                    ${(Math.round(group.balance) || 0).toLocaleString()}
                                                                </td>
                                                                <td className="p-3 text-center">
                                                                    <button
                                                                        onClick={(e) => { e.stopPropagation(); handleCorrection(group.saleId); }}
                                                                        className="p-2 rounded-lg bg-amber-50 text-amber-600 hover:bg-amber-100 transition-colors shadow-sm"
                                                                        title="作廢並修正全單"
                                                                    >
                                                                        <RotateCcw size={16} />
                                                                    </button>
                                                                </td>
                                                            </tr>
                                                            {isExpanded && (
                                                                <tr>
                                                                    <td colSpan="9" className="p-0 bg-[var(--bg-tertiary)] hover:bg-transparent">
                                                                        <div className="px-4 md:px-12 py-4">
                                                                            <div className="max-w-4xl mx-auto">
                                                                                <table className="w-full text-sm border-l-4 border-blue-200">
                                                                                    <thead>
                                                                                        <tr className="text-[var(--text-tertiary)] font-bold uppercase tracking-wider text-xs border-b border-[var(--border-primary)]/30">
                                                                                            <th className="px-4 py-3 text-left">品項</th>
                                                                                            <th className="px-4 py-3 text-right">數量</th>
                                                                                            <th className="px-4 py-3 text-right">單價</th>
                                                                                            <th className="px-4 py-3 text-right">小計</th>
                                                                                        </tr>
                                                                                    </thead>
                                                                                    <tbody className="divide-y divide-[var(--border-primary)]/70">
                                                                                        {group.items.map((it, i) => (
                                                                                            <tr key={i} className="hover:bg-white/70 transition-colors">
                                                                                                <td className="px-4 py-3 text-[var(--text-primary)] font-bold text-base">{it.productName}</td>
                                                                                                <td className="px-4 py-3 text-right font-bold text-blue-600 text-lg">{it.soldQty}</td>
                                                                                                <td className="px-4 py-3 text-right text-[var(--text-secondary)] text-lg">${(it.totalAmount / it.soldQty).toLocaleString()}</td>
                                                                                                <td className="px-4 py-3 text-right font-mono font-bold text-emerald-800 text-lg">${it.totalAmount.toLocaleString()}</td>
                                                                                            </tr>
                                                                                        ))}
                                                                                    </tbody>
                                                                                </table>
                                                                            </div>
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                            )}
                                                        </React.Fragment>
                                                    );
                                                })}
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
                                                            <div className="flex flex-col gap-0.5 bg-amber-500/10 text-amber-700 px-2 py-0.5 rounded-md">
                                                                <div className="flex items-center gap-1">
                                                                    <MapPin size={10} />
                                                                    <span className="font-bold text-xs">{item.normCustomer || '-'}</span>
                                                                </div>
                                                                {item.normNote && <div className="text-[10px] opacity-70 ml-3.5 italic">{item.normNote}</div>}
                                                            </div>
                                                            <div className="flex items-center gap-1 bg-[var(--bg-tertiary)] text-[var(--text-secondary)] px-2 py-0.5 rounded-md border border-[var(--border-primary)]">
                                                                <User size={10} /> <span className="text-xs font-bold">{item.normSalesRep}</span>
                                                                {item.operator && item.operator !== item.normSalesRep && (
                                                                    <span className="text-[10px] text-amber-600 ml-1">(修: {item.operator})</span>
                                                                )}
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
                                                    <th className="p-3 font-medium w-32">對象/備註</th>
                                                    <th className="p-3 font-medium w-32">業務</th>
                                                    <th className="p-3 font-medium">支出細項</th>
                                                    <th className="p-3 font-medium text-right w-28">總支出</th>
                                                    <th className="p-3 font-medium text-right w-28 text-emerald-600">結算金額</th>
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
                                                                <div className="font-bold text-[var(--text-primary)]">{item.normCustomer || '-'}</div>
                                                                {item.normNote && <div className="text-[10px] text-[var(--text-tertiary)] italic">{item.normNote}</div>}
                                                            </td>
                                                            <td className="p-3 text-[var(--text-secondary)] font-bold">
                                                                {item.normSalesRep}
                                                                {item.operator && item.operator !== item.normSalesRep && (
                                                                    <div className="text-[10px] text-amber-600 font-normal">修: {item.operator}</div>
                                                                )}
                                                            </td>
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
