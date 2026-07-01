import { safeLocalStorage, safeSessionStorage } from '../utils/storage';
import React, { useState, useCallback } from 'react';
import { Search, Calendar, MapPin, User, FileText, TrendingUp, Package, DollarSign, RotateCcw, ChevronDown, ChevronRight } from 'lucide-react';
import { callGAS } from '../utils/api';
import { getLocalDateString, getFirstDayOfMonthString } from '../utils/constants';

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
    const [activeQuickDate, setActiveQuickDate] = useState('TODAY'); // 預設選中今天
    const [category, setCategory] = useState('全部'); // [New] 類別過濾 (市場 / 批發)

    // 1. Fetch Data from Server (Only on Date Change)
    const fetchData = useCallback(async () => {
        if (!startDate || !endDate) return;
        setLoading(true);

        try {
            const payload = { startDate, endDate, category };
            const promises = [
                callGAS(apiUrl, 'getSalesHistory', payload, user.token),
                callGAS(apiUrl, 'getExpenditures', payload, user.token)
            ];
            const results = await Promise.all(promises);
            
            const salesRes = results[0];
            if (salesRes && salesRes.benchmark) {
                console.log('[Sales Report Benchmark]', JSON.stringify(salesRes.benchmark, null, 2));
            }
            
            setRawSales(Array.isArray(salesRes) ? salesRes : (salesRes.data || []));
            setRawExpenses(Array.isArray(results[1]) ? results[1] : (results[1].data || []));
        } catch (error) {
            console.error(error);
            alert('查詢失敗: ' + error.message);
        } finally {
            setLoading(false);
        }
    }, [startDate, endDate, category, user.token, apiUrl]);

    // 2. Perform Local Filtering (Instant Response)
    React.useEffect(() => {
        const locTerm = location.trim().toLowerCase();
        const repTerm = salesRep.trim().toLowerCase();
        const prodTerm = productTerm.trim().toLowerCase();

        // Filter Sales
        let filteredSales = rawSales.filter(item => item != null);
        if (locTerm) filteredSales = filteredSales.filter(item => String(item.location || '').toLowerCase().includes(locTerm));
        if (repTerm) filteredSales = filteredSales.filter(item => String(item.salesRep || '').toLowerCase().includes(repTerm));
        if (prodTerm) filteredSales = filteredSales.filter(item => String(item.productName || '').toLowerCase().includes(prodTerm));
        setReportData(filteredSales);

        // Filter Expenses
        let filteredExpenses = rawExpenses.filter(item => item != null).map(item => ({
            ...item,
            linePayAmount: Number(item.linePay || 0),
            rowTotal: Number(item.stall || 0) + Number(item.cleaning || 0) + Number(item.electricity || 0) +
                Number(item.gas || 0) + Number(item.parking || 0) + Number(item.goods || 0) +
                Number(item.bags || 0) + Number(item.others || 0) + Number(item.vehicleMaintenance || 0) +
                Number(item.salary || 0) + Number(item.serviceFee || 0) + Number(item.reserve || 0),
            salaryAmount: Number(item.salary || 0),
            normCustomer: String(item.customer || item['對象/備註'] || item['對象'] || ''),
            normSalesRep: String(item.salesRep || item['業務'] || ''),
            normNote: String(item.note || item['備註'] || ''),
            displayFinalTotal: Number(item[Object.keys(item || {}).find(k => ['finaltotal', '結算', '结算', '總支出金額', '总支出金额'].some(term => String(k).toLowerCase().includes(term)))] || item.finalTotal || 0)
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
                safeSessionStorage.setItem('clonedSale', JSON.stringify(fetchRes.cloneData));
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
        const m = String(method || '').trim().toUpperCase();
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
        if (item?.isCollectionReportMode && !isNonCashMethod(item?.paymentMethod)) {
            return acc + (Number(item?.totalAmount) || 0);
        }
        return acc;
    }, 0) || 0;

    // [Fix] 計算「有支出分錄的非現金銷售額」 (用於扣除結算總額)
    // 只有「賒帳 (CREDIT)」會在錄入時產生對沖需求。
    const totalNonCashWithExpenseEntry = reportData?.reduce((acc, item) => {
        const m = String(item?.paymentMethod || '').trim().toUpperCase();
        const isCredit = ['CREDIT', '賒帳', '賒銷'].includes(m);

        if (isCredit && !item?.isCollectionReportMode) {
            return acc + (Number(item?.totalAmount) || 0);
        }
        return acc;
    }, 0) || 0;

    // [Fix] 計算最終「應繳現金基數」：
    // (今日總銷售 - 今日非現金銷售) + 今日補收現金
    const totalCashSales = (totalSales - totalNonCashSales) + totalCollectionCash;

    // [Fix] 總支出計算：cashFlowOnly 的項目不計入支出總額顯示（避免重複）
    const totalExpenses = expenseData?.reduce((acc, item) => {
        if (item?.cashFlowOnly) return acc;
        return acc + (item?.rowTotal || 0);
    }, 0) || 0;

    // [Fix] 計算現金支出：排除 TRANSFER、並依 paymentDate 判斷現金流時間
    const totalCashExpenses = expenseData?.reduce((acc, item) => {
        // 匯款轉帳一律不算現金
        if (item?.paymentMethod === 'TRANSFER') return acc;

        // cashFlowOnly = 記帳月份在別月，但付款日期在本期 (ex: 4月薪資，5/5付款，查5/5時)
        if (item?.cashFlowOnly) return acc + (Number(item?.salary) || 0);

        // 有設定付款日期的 CASH 薪資：以 paymentDate 判斷是否在本查詢期間
        if (Number(item?.salary) > 0 && item?.paymentDate && item?.excludeFromCashFlow) {
            return acc; // 付款日不在本期，不列入現金扣除
        }

        return acc + (item?.rowTotal || 0);
    }, 0) || 0;

    // [Fix] 計算匯款支出：統計所有在今天付出的 TRANSFER 項目 (包含跨月補發)
    const totalTransferExpenses = expenseData?.reduce((acc, item) => {
        if (item?.paymentMethod === 'TRANSFER') {
            // 如果是跨月補發 (cashFlowOnly)，取 salary 欄位；否則取 rowTotal
            if (item?.cashFlowOnly) return acc + (Number(item?.salary) || 0);
            return acc + (item?.rowTotal || 0);
        }
        return acc;
    }, 0) || 0;

    // 計算總 Line Pay 金額 (用於應繳回扣除)
    const totalLinePay = expenseData?.reduce((acc, item) => acc + (item?.linePayAmount || 0), 0) || 0;

    // 原始結算金額 (從支出表讀取的前端輸入值)
    const rawFinalTotal = expenseData?.reduce((acc, item) => acc + (Number(item?.displayFinalTotal) || 0), 0) || 0;

    // [Adjustment] 結算金額補正：需扣除「有支出分錄的非現金銷售額」
    const totalFinalTotal = rawFinalTotal - totalNonCashWithExpenseEntry;

    // 應繳回 = 現金銷售 - 現金支出(扣除匯款) - Line Pay(非現金收入/已入帳) + 結算(找零/補錢 - 賒帳已扣除)
    const totalReturnAmount = totalCashSales - totalCashExpenses - totalLinePay + totalFinalTotal;

    // Group by Product for summary table
    const productSummary = reportData?.reduce((acc, item) => {
        // [Fix] 排除「補收款」模式，避免重複計入商品銷量與金額 (已在原單計入)
        if (item.isCollectionReportMode) return acc;

        const id = item.productName || '未知商品'; // Use name as key for simplicity in display
        if (!acc[id]) {
            acc[id] = { name: item.productName || '未知商品', qty: 0, amount: 0 };
        }
        acc[id].qty += (Number(item.soldQty) || 0);
        acc[id].amount += (Number(item.totalAmount) || 0);
        return acc;
    }, {});

    const summaryList = productSummary ? Object.values(productSummary).sort((a, b) => b.qty - a.qty) : [];

    // [New] Group Sales by Transaction (Date + Location + SalesRep)
    const groupedSales = (reportData || []).reduce((acc, item) => {
        const d = new Date(item.date);
        const dateStr = isNaN(d.getTime()) ? '未知時間' : d.toLocaleString('zh-TW', {
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', hour12: false
        });
        // Unique key for grouping: Transaction ID + Collection Note (to separate regular sale vs collection)
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
                collectionNote: item.collectionNote,
                workHours: item.workHours,
                weather: item.weather
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
                const m = String(item.paymentMethod || '').trim().toUpperCase();
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
        const d = new Date(item.date);
        const dateStr = isNaN(d.getTime()) ? '未知時間' : d.toLocaleString('zh-TW', {
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
        // Helper to parse complex remarks from S column
        const parseComplexNote = (note, label) => {
            if (!note) return "";
            const regex = new RegExp(`${label}:\\s*([^,\\]]+)`);
            const match = String(note).match(regex);
            return match ? match[1].trim() : "";
        };

        const categories = [
            { id: "stall", label: "攤位" },
            { id: "cleaning", label: "清潔" },
            { id: "electricity", label: "電費" },
            { id: "gas", label: "加油", remark: "加油" },
            { id: "parking", label: "停車", remark: "停車" },
            { id: "goods", label: "貨款", remark: "貨款廠商" },
            { id: "bags", label: "塑膠袋" },
            { id: "others", label: "其他", remark: "其他" },
            { id: "salary", label: "薪資發放", remark: "薪資" },
            { id: "reserve", label: "公積金", remark: "公積金" },
            { id: "vehicleMaintenance", label: "車輛保養", remark: "保養" },
            { id: "linePay", label: "Line Pay" },
            { id: "serviceFee", label: "服務費" }
        ];

        categories.forEach(cat => {
            const val = Number(item[cat.id]) || 0;
            if (val > 0) {
                let displayLabel = cat.label;
                // [Adjustment] 支付方式標記邏輯：現金不顯示，匯款顯示標記
                const methodSuffix = item.paymentMethod === 'TRANSFER' ? '|TRANSFER' : '|CASH';

                if (item.normNote) {
                    const remarkVal = parseComplexNote(item.normNote, cat.remark);
                    if (remarkVal) {
                        displayLabel = `${cat.label} (${remarkVal})`;
                    } else if (item.normNote && !item.normNote.includes(':') && !item.normNote.includes('[')) {
                        // Support plain text remarks from Expenditure Management Page
                        displayLabel = `${cat.label} (${item.normNote})`;
                    }
                }

                // 使用分隔符號儲存標籤與方式，供後續 JSX 渲染使用
                const finalKey = displayLabel + methodSuffix;
                groupedSales[key].expenseDetails[finalKey] = (groupedSales[key].expenseDetails[finalKey] || 0) + val;
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

    const totalCount = Object.keys(groupedSales).length;

    // [新增] 快速日期切換
    const handleQuickDate = (type) => {
        const today = new Date();
        setActiveQuickDate(type);
        if (type === 'TODAY') {
            const d = getLocalDateString();
            setStartDate(d);
            setEndDate(d);
        } else if (type === 'YESTERDAY') {
            const yesterday = new Date(today);
            yesterday.setDate(today.getDate() - 1);
            const d = getLocalDateString(yesterday);
            setStartDate(d);
            setEndDate(d);
        } else if (type === 'THIS_MONTH') {
            setStartDate(getFirstDayOfMonthString());
            setEndDate(getLocalDateString());
        } else if (type === 'LAST_MONTH') {
            const firstOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
            const lastOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
            setStartDate(getLocalDateString(firstOfLastMonth));
            setEndDate(getLocalDateString(lastOfLastMonth));
        }
    };

    // [新增] 提取當前資料中的所有業務員
    const availableReps = React.useMemo(() => {
        const reps = rawSales.map(s => s.salesRep).filter(Boolean);
        return Array.from(new Set(reps)).sort((a, b) => a.localeCompare(b, 'zh-Hant'));
    }, [rawSales]);

    const toggleGroup = (key) => {
        setExpandedGroups(prev => ({
            ...prev,
            [key]: !prev[key]
        }));
    };

    // [新增] 權限與時間檢查：員工只能修改 2 天內的單據
    const canEdit = (group) => {
        if (user.role === 'BOSS' || user.role === 'ADMIN') return true;
        if (!group.items || group.items.length === 0) return false;

        const recordDate = new Date(group.items[0].date);
        if (isNaN(recordDate.getTime())) return false;

        const now = new Date();
        const diffMs = now.getTime() - recordDate.getTime();
        const diffDays = diffMs / (1000 * 60 * 60 * 24);

        return diffDays <= 2;
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
                    </div>

                    {/* Summary Stats (Two-Row Layout) */}
                    {reportData && (
                        <div className="flex flex-col gap-3 w-full md:w-[650px]">
                            {/* Row 1: Core Financials */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
                                <div className="px-2 md:px-4 py-3 rounded-2xl bg-slate-50/50 border border-slate-200 shadow-sm transition-all hover:shadow-md">
                                    <p className="text-[10px] md:text-xs text-slate-400 uppercase font-bold text-center tracking-wider">應繳回</p>
                                    <p className="text-lg md:text-xl font-black text-emerald-600 text-center whitespace-nowrap mt-1">${Math.round(totalReturnAmount).toLocaleString()}</p>
                                </div>
                                <div className="px-2 md:px-4 py-3 rounded-2xl bg-slate-50/50 border border-slate-200 shadow-sm transition-all hover:shadow-md">
                                    <p className="text-[10px] md:text-xs text-slate-400 uppercase font-bold text-center tracking-wider">總銷售</p>
                                    <p className="text-lg md:text-xl font-black text-emerald-600 text-center whitespace-nowrap mt-1">${Math.round(totalSales).toLocaleString()}</p>
                                </div>
                                <div className="px-2 md:px-4 py-3 rounded-2xl bg-slate-50/50 border border-slate-200 shadow-sm transition-all hover:shadow-md">
                                    <p className="text-[10px] md:text-xs text-slate-400 uppercase font-bold text-center tracking-wider">總支出</p>
                                    <p className="text-lg md:text-xl font-black text-slate-700 text-center whitespace-nowrap mt-1">${Math.round(totalExpenses).toLocaleString()}</p>
                                </div>
                                <div className="px-2 md:px-4 py-3 rounded-2xl bg-slate-50/50 border border-slate-200 shadow-sm transition-all hover:shadow-md">
                                    <p className="text-[10px] md:text-xs text-slate-400 uppercase font-bold text-center tracking-wider">匯款支出</p>
                                    <p className="text-lg md:text-xl font-black text-slate-700 text-center whitespace-nowrap mt-1">${Math.round(totalTransferExpenses).toLocaleString()}</p>
                                </div>
                            </div>

                            {/* Row 2: Secondary Stats */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
                                <div className="px-2 md:px-4 py-3 rounded-2xl bg-slate-50/50 border border-slate-200 shadow-sm transition-all hover:shadow-md">
                                    <p className="text-[10px] md:text-xs text-slate-400 uppercase font-bold text-center tracking-wider">LINE PAY</p>
                                    <p className="text-lg md:text-xl font-black text-slate-700 text-center whitespace-nowrap mt-1">${Math.round(totalLinePay).toLocaleString()}</p>
                                </div>
                                <div className="px-2 md:px-4 py-3 rounded-2xl bg-slate-50/50 border border-slate-200 shadow-sm transition-all hover:shadow-md">
                                    <p className="text-[10px] md:text-xs text-slate-400 uppercase font-bold text-center tracking-wider">結算</p>
                                    <p className={`text-lg md:text-xl font-black text-center whitespace-nowrap mt-1 ${totalFinalTotal < 0 ? 'text-red-600' : 'text-emerald-600'}`}>${Math.round(totalFinalTotal).toLocaleString()}</p>
                                </div>
                                <div className="px-2 md:px-4 py-3 rounded-2xl bg-slate-50/50 border border-slate-200 shadow-sm transition-all hover:shadow-md">
                                    <p className="text-[10px] md:text-xs text-slate-400 uppercase font-bold text-center tracking-wider">總數量</p>
                                    <p className="text-lg md:text-xl font-black text-slate-700 text-center whitespace-nowrap mt-1">{totalQty.toLocaleString()}</p>
                                </div>
                                <div className="px-2 md:px-4 py-3 rounded-2xl bg-slate-50/50 border border-slate-200 shadow-sm transition-all hover:shadow-md">
                                    <p className="text-[10px] md:text-xs text-slate-400 uppercase font-bold text-center tracking-wider">總筆數</p>
                                    <p className="text-lg md:text-xl font-black text-slate-700 text-center whitespace-nowrap mt-1">{totalCount.toLocaleString()}</p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* [New] Quick Control Center (Unified Filters) */}
                <div className="bg-slate-50/80 backdrop-blur-sm p-4 rounded-2xl border border-slate-200 mb-6 space-y-4 shadow-sm">
                    {/* Row 1: Category (BOSS only) */}
                    {user.role === 'BOSS' && (
                        <div className="flex items-center gap-3">
                            <span className="text-sm font-bold text-slate-400 w-12 uppercase tracking-tight">類別:</span>
                            <div className="flex-1 flex bg-white p-1 rounded-xl border border-slate-100 shadow-inner max-w-sm">
                                {['全部', '市場', '批發'].map((cat) => (
                                    <button
                                        key={cat}
                                        onClick={() => setCategory(cat)}
                                        className={`flex-1 px-4 py-1.5 rounded-lg text-sm font-bold transition-all duration-200 ${category === cat
                                            ? 'bg-blue-600 text-white shadow-md'
                                            : 'text-slate-500 hover:text-slate-900'
                                            }`}
                                    >
                                        {cat}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Row 2: Quick Dates */}
                    <div className="flex items-center gap-3">
                        <span className="text-sm font-bold text-slate-400 w-12 uppercase tracking-tight">時間:</span>
                        <div className="flex-1 flex bg-white p-1 rounded-xl border border-slate-100 shadow-inner max-w-sm">
                            {[
                                { label: '今天', type: 'TODAY' },
                                { label: '昨天', type: 'YESTERDAY' },
                                { label: '本月', type: 'THIS_MONTH' },
                                { label: '上月', type: 'LAST_MONTH' }
                            ].map((btn) => (
                                <button
                                    key={btn.type}
                                    onClick={() => handleQuickDate(btn.type)}
                                    className={`flex-1 px-4 py-1.5 rounded-lg text-sm font-bold transition-all duration-200 ${activeQuickDate === btn.type
                                        ? 'bg-blue-600 text-white shadow-md'
                                        : 'text-slate-500 hover:text-slate-900'
                                        }`}
                                >
                                    {btn.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Row 3: Personnel Quick Filter */}
                    {availableReps.length > 0 && (
                        <div className="flex items-center gap-3 pt-2 border-t border-dashed border-slate-200">
                            <span className="text-sm font-bold text-slate-400 w-12 uppercase tracking-tight">人員:</span>
                            <div className="flex-1 flex bg-white p-1 rounded-xl border border-slate-100 shadow-inner overflow-x-auto no-scrollbar">
                                <button
                                    onClick={() => setSalesRep('')}
                                    className={`px-5 py-1.5 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${!salesRep ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-900'}`}
                                >
                                    全部
                                </button>
                                {availableReps.map(name => (
                                    <button
                                        key={name}
                                        onClick={() => setSalesRep(name)}
                                        className={`px-5 py-1.5 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${salesRep === name ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-900'}`}
                                    >
                                        {name}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Filters - Mobile View (Search Inputs) */}
                <div className="md:hidden mb-8 space-y-5 bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                    <div className="space-y-4 pt-2">
                        <div className="flex items-center gap-3">
                            <label className="text-sm font-black text-slate-500 whitespace-nowrap w-[75px]">開始日期:</label>
                            <input
                                type="date"
                                required
                                className="input-field flex-1 py-2.5 px-4 bg-slate-50/50 border-2 border-slate-100 rounded-xl text-sm font-bold text-blue-900 outline-none focus:border-blue-400 focus:bg-white transition-all text-right"
                                value={startDate}
                                onChange={e => {
                                    setStartDate(e.target.value);
                                    setActiveQuickDate('');
                                }}
                            />
                        </div>
                        <div className="flex items-center gap-3">
                            <label className="text-sm font-black text-slate-500 whitespace-nowrap w-[75px]">結束日期:</label>
                            <input
                                type="date"
                                required
                                className="input-field flex-1 py-2.5 px-4 bg-slate-50/50 border-2 border-slate-100 rounded-xl text-sm font-bold text-blue-900 outline-none focus:border-blue-400 focus:bg-white transition-all text-right"
                                value={endDate}
                                onChange={e => {
                                    setEndDate(e.target.value);
                                    setActiveQuickDate('');
                                }}
                            />
                        </div>
                        <div className="flex items-center gap-3">
                            <label className="text-sm font-black text-slate-500 whitespace-nowrap w-[75px]">銷售對象:</label>
                            <input
                                type="text"
                                placeholder="輸入銷售對象..."
                                className="input-field flex-1 py-2.5 px-4 bg-slate-50/50 border-2 border-slate-100 rounded-xl text-sm font-bold text-blue-900 outline-none focus:border-blue-400 focus:bg-white transition-all placeholder:text-slate-400 text-right"
                                value={location}
                                onChange={e => setLocation(e.target.value)}
                            />
                        </div>
                        <div className="flex items-center gap-3">
                            <label className="text-sm font-black text-slate-500 whitespace-nowrap w-[75px]">產品名稱:</label>
                            <input
                                type="text"
                                placeholder="輸入產品名稱..."
                                className="input-field flex-1 py-2.5 px-4 bg-slate-50/50 border-2 border-slate-100 rounded-xl text-sm font-bold text-blue-900 outline-none focus:border-blue-400 focus:bg-white transition-all placeholder:text-slate-400 text-right"
                                value={productTerm}
                                onChange={e => setProductTerm(e.target.value)}
                            />
                        </div>
                        <div className="flex items-center gap-3">
                            <label className="text-sm font-black text-slate-500 whitespace-nowrap w-[75px]">業務員:</label>
                            <div className="flex flex-1 gap-2">
                                <input
                                    type="text"
                                    placeholder="姓名..."
                                    className="input-field flex-1 py-2.5 px-4 bg-slate-50/50 border-2 border-slate-100 rounded-xl text-sm font-bold text-blue-900 outline-none focus:border-blue-400 focus:bg-white transition-all placeholder:text-slate-400 text-right"
                                    value={salesRep}
                                    onChange={e => setSalesRep(e.target.value)}
                                />
                                <button
                                    type="button"
                                    disabled={loading}
                                    className="btn-primary w-14 flex items-center justify-center rounded-xl shadow-md active:scale-95 transition-transform"
                                    onClick={fetchData}
                                >
                                    <Search size={20} />
                                </button>
                            </div>
                        </div>
                    </div>


                </div>

                {/* Filters - Desktop View (Search Inputs) */}
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
                                    onChange={e => {
                                        setStartDate(e.target.value);
                                        setActiveQuickDate('');
                                    }}
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-[var(--text-secondary)] uppercase px-1">結束日期</label>
                                <input
                                    type="date"
                                    required
                                    className="input-field w-full"
                                    value={endDate}
                                    onChange={e => {
                                        setEndDate(e.target.value);
                                        setActiveQuickDate('');
                                    }}
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
                            <button
                                type="button"
                                disabled={loading}
                                className="btn-primary px-4 py-1.5 h-[42px] mt-5 flex items-center justify-center rounded-xl shadow-md active:scale-95 transition-transform"
                                onClick={fetchData}
                            >
                                <Search size={20} />
                            </button>
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
                                <div className="font-bold flex items-center gap-2 pb-2 border-b-2 text-blue-600 border-blue-600">
                                    <TrendingUp size={16} /> 銷售明細 ({reportData.length})
                                </div>
                            </div>

                            <div className="overflow-auto flex-1">
                                {/* Mobile Card View (SALES) - Grouped */}
                                <div className="md:hidden divide-y divide-[var(--border-primary)]">
                                    {sortedGroups.map((group) => {
                                        const isExpanded = expandedGroups[group.key];
                                        return (
                                            <div key={group.key} className={`bg-[var(--bg-secondary)] transition-colors ${isExpanded ? 'bg-blue-50/20' : ''}`}>
                                                <div
                                                    className="p-3 md:p-4 space-y-3 cursor-pointer overflow-hidden"
                                                    onClick={() => toggleGroup(group.key)}
                                                >
                                                    {/* Top Header Row: Date & Controls */}
                                                    <div className="flex justify-between items-start gap-2">
                                                        <div className="flex flex-col gap-2 min-w-0 flex-1">
                                                            {/* Date & Weather */}
                                                            <div className="text-[10px] md:text-xs font-mono text-[var(--text-tertiary)] flex items-center gap-1.5 flex-wrap">
                                                                {isExpanded ? <ChevronDown size={14} className="shrink-0" /> : <ChevronRight size={14} className="shrink-0" />}
                                                                <span className="leading-none whitespace-nowrap">{group.dateDisplay}</span>
                                                                <span className={`px-1.5 py-0.5 rounded text-[9px] font-black shrink-0 ${group.weather === 'SUNNY' ? 'bg-amber-100 text-amber-600' : 'bg-indigo-100 text-indigo-600'}`}>
                                                                    {group.weather === 'SUNNY' ? '☀️ 晴' : '☔ 雨'}
                                                                </span>
                                                            </div>

                                                            {/* Tags (Location, Rep, Operator, Hours) - 靠左對齊，置於日期下方 */}
                                                            <div className="flex flex-wrap gap-1.5 items-center pl-5">
                                                                <div className="flex items-center gap-1 bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0">
                                                                    <MapPin size={10} /> <span>{group.location}</span>
                                                                </div>
                                                                <div className="flex items-center gap-1 bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0">
                                                                    <User size={10} /> <span>{group.salesRep}</span>
                                                                    {group.operator && group.operator !== group.salesRep && (
                                                                        <span className="text-amber-600 ml-0.5">(改:{group.operator})</span>
                                                                    )}
                                                                    {group.workHours && Number(group.workHours) > 0 && (
                                                                        <span className="ml-1 text-amber-700 bg-amber-100 px-1 rounded-sm">{group.workHours}h</span>
                                                                    )}
                                                                </div>
                                                                {group.collectionNote && (
                                                                    <div className="text-[10px] text-amber-600 font-bold w-full mt-0.5">{group.collectionNote}</div>
                                                                )}
                                                            </div>
                                                        </div>

                                                        {/* Right Controls */}
                                                        <div className="flex flex-col items-end shrink-0">
                                                            {canEdit(group) && (
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); handleCorrection(group.saleId); }}
                                                                    className="flex items-center gap-1 px-2 py-1 rounded bg-amber-50 text-amber-600 border border-amber-200 hover:bg-amber-100 transition-colors text-[10px] font-bold shadow-sm"
                                                                >
                                                                    <RotateCcw size={10} /> 修正
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* Financial Summary Box (Vertical Stacking) */}
                                                    <div className="bg-[var(--bg-tertiary)]/50 p-2.5 rounded-lg space-y-2 ml-0 md:ml-5 border border-slate-100">
                                                        <div className="text-[10px] text-[var(--text-tertiary)]">
                                                            共 {group.items.length} 項商品 / 總數: {group.totalQty}
                                                        </div>

                                                        {Object.keys(group.expenseDetails).length > 0 && (
                                                            <div className="flex flex-col gap-2 border-t border-[var(--border-primary)]/50 pt-3 pb-1">
                                                                {Object.entries(group.expenseDetails).map(([label, amount], idx) => {
                                                                    const isCash = label.includes('|CASH');
                                                                    const isTransfer = label.includes('|TRANSFER');
                                                                    const methodText = isCash ? '(CASH)' : (isTransfer ? '(轉帳)' : '');

                                                                    let baseLabel = label.replace(/\|CASH|\|TRANSFER/g, '').trim();
                                                                    let categoryText = baseLabel;
                                                                    let remarkText = '';

                                                                    const firstParenIndex = baseLabel.indexOf('(');
                                                                    if (firstParenIndex !== -1) {
                                                                        categoryText = baseLabel.substring(0, firstParenIndex).trim();
                                                                        remarkText = baseLabel.substring(firstParenIndex).trim();
                                                                    }

                                                                    return (
                                                                        <div key={idx} className="flex justify-between items-start text-rose-600 gap-2">
                                                                            <div className="flex flex-col flex-1 pr-2 min-w-0">
                                                                                <div className="flex flex-wrap items-baseline gap-1.5">
                                                                                    <span className="text-xs md:text-sm font-bold leading-tight">{categoryText}</span>
                                                                                    <span className="text-[10px] font-bold text-rose-500/70 shrink-0">{methodText}</span>
                                                                                </div>
                                                                                {remarkText && (
                                                                                    <span className="text-[10px] text-rose-400/90 leading-snug mt-0.5 break-words">{remarkText}</span>
                                                                                )}
                                                                            </div>
                                                                            <span className="font-mono text-sm md:text-base font-bold pr-1 shrink-0 text-right min-w-[70px]">-${amount.toLocaleString()}</span>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        )}

                                                        <div className="flex flex-col gap-2 border-t border-[var(--border-primary)]/50 pt-3">
                                                            <div className="flex justify-between items-center gap-2">
                                                                <span className="text-[10px] text-[var(--text-secondary)] font-bold shrink-0">銷售總額:</span>
                                                                <span className="text-emerald-600 font-bold font-mono text-lg pr-1 shrink-0 text-right min-w-[80px]">${(Math.round(group.totalAmount) || 0).toLocaleString()}</span>
                                                            </div>
                                                            <div className="flex justify-between items-center gap-2">
                                                                <span className="text-[10px] text-[var(--text-secondary)] font-bold shrink-0">結算金額:</span>
                                                                <span className="text-slate-500 font-bold font-mono text-sm pr-1 shrink-0 text-right min-w-[80px]">${(Math.round(group.balance) || 0).toLocaleString()}</span>
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
                                                                        <div className="text-[var(--text-tertiary)] text-base">單價: ${(Number(it.totalAmount) / Number(it.soldQty) || 0).toLocaleString()}</div>
                                                                    </div>
                                                                    <div className="text-right">
                                                                        <div className="font-bold text-blue-600 text-base">x {it.soldQty}</div>
                                                                        <div className="font-mono text-[var(--text-secondary)] text-sm">${(Number(it.totalAmount) || 0).toLocaleString()}</div>
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
                                                            <div className="flex items-center gap-2">
                                                                {group.dateDisplay}
                                                                <span title={group.weather === 'SUNNY' ? '晴天' : '雨天'} className="text-base cursor-help">
                                                                    {group.weather === 'SUNNY' ? '☀️' : '☔'}
                                                                </span>
                                                            </div>
                                                        </td>
                                                        <td className="p-3">
                                                            <div className="font-bold text-[var(--text-primary)] text-base leading-tight">{group.location}</div>
                                                            {group.collectionNote && (
                                                                <div className="text-[11px] text-amber-600 font-medium mt-0.5">{group.collectionNote}</div>
                                                            )}
                                                        </td>
                                                        <td className="p-3 text-[var(--text-secondary)] text-sm">
                                                            <div className="flex items-center gap-1.5 whitespace-nowrap">
                                                                <span className="font-bold">{group.salesRep}</span>
                                                                {group.workHours && Number(group.workHours) > 0 && (
                                                                    <span className="px-1 py-0.5 bg-amber-50 text-amber-700 text-[9px] font-black rounded border border-amber-200 leading-none">
                                                                        {group.workHours}h
                                                                    </span>
                                                                )}
                                                            </div>
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
                                                                    {Object.entries(group.expenseDetails).map(([key, amount], idx) => {
                                                                        const [label, method] = key.split('|');
                                                                        return (
                                                                            <div key={idx} className="flex items-center gap-2 whitespace-nowrap bg-rose-50 px-2 py-0.5 rounded border border-rose-100">
                                                                                <span className="text-[10px] font-bold opacity-80">
                                                                                    {label}
                                                                                    {method === 'TRANSFER' && <span className="ml-1 text-blue-600 font-black">(匯)</span>}
                                                                                </span>
                                                                                <span className="font-bold text-sm font-mono">${amount.toLocaleString()}</span>
                                                                            </div>
                                                                        );
                                                                    })}
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
                                                            {canEdit(group) ? (
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); handleCorrection(group.saleId); }}
                                                                    className="p-2 rounded-lg bg-amber-50 text-amber-600 hover:bg-amber-100 transition-colors shadow-sm"
                                                                    title="作廢並修正全單"
                                                                >
                                                                    <RotateCcw size={16} />
                                                                </button>
                                                            ) : (
                                                                <div className="p-2 text-slate-300 cursor-not-allowed" title="超過 2 天，無法修改">
                                                                    <RotateCcw size={16} className="opacity-50" />
                                                                </div>
                                                            )}
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
                                                                                        <td className="px-4 py-3 text-right text-[var(--text-secondary)] text-lg">${(Number(it.totalAmount) / Number(it.soldQty) || 0).toLocaleString()}</td>
                                                                                        <td className="px-4 py-3 text-right font-mono font-bold text-emerald-800 text-lg">${(Number(it.totalAmount) || 0).toLocaleString()}</td>
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
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

