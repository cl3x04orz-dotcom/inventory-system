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
    const [rawPurchases, setRawPurchases] = useState([]);
    const [purchaseData, setPurchaseData] = useState([]);
    const [rawInventory, setRawInventory] = useState([]);
    const [rawAdjustments, setRawAdjustments] = useState([]);
    const [adjustmentData, setAdjustmentData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [reportData, setReportData] = useState([]);
    const [expenseData, setExpenseData] = useState([]);
    const [viewMode, setViewMode] = useState('SALES'); // 'SALES' or 'EXPENSES'
    const [isVoiding, setIsVoiding] = useState(false); // [New] Loading state for voiding
    const [expandedGroups, setExpandedGroups] = useState({}); // [New] Track expanded transactions
    const [activeQuickDate, setActiveQuickDate] = useState('TODAY'); // 預設選中今天
    const [category, setCategory] = useState('全部'); // [New] 類別過濾 (市場 / 批發)
    const [pivotMetric, setPivotMetric] = useState('picked'); // 預設為追加領貨 (picked)
    const [isPivotExpanded, setIsPivotExpanded] = useState(false); // 預設折疊
    const [isSummaryExpanded, setIsSummaryExpanded] = useState(false); // 預設折疊
    const [hasLoadedPivot, setHasLoadedPivot] = useState(false); // [New] 是否已載入對照表資料
    const [loadingPivot, setLoadingPivot] = useState(false); // [New] 是否正在載入對照表資料
    const [visibleCount, setVisibleCount] = useState(50); // [New] 限制單次渲染筆數，避免 DOM 節點過多造成瀏覽器卡死

    // 1. Fetch Data from Server (Only on Date Change)
    const fetchData = useCallback(async (forceFetch = false) => {
        if (!startDate || !endDate) return;
        setLoading(true);

        try {
            const payload = {
                startDate,
                endDate,
                category,
                fetchPivotData: forceFetch || hasLoadedPivot
            };
            const res = await callGAS(apiUrl, 'getReportDataBatch', payload, user.token);
            
            if (res.sales && res.sales.benchmark) {
                console.log('[Sales Report Benchmark]', JSON.stringify(res.sales.benchmark, null, 2));
            }
            
            setRawSales(Array.isArray(res.sales) ? res.sales : (res.sales?.data || []));
            setRawExpenses(Array.isArray(res.expenditures) ? res.expenditures : (res.expenditures?.data || []));
            if (payload.fetchPivotData) {
                setRawPurchases(Array.isArray(res.purchases) ? res.purchases : (res.purchases?.data || []));
                if (res.inventory !== null) {
                    setRawInventory(Array.isArray(res.inventory) ? res.inventory : (res.inventory?.data || []));
                }
                setRawAdjustments(Array.isArray(res.adjustments) ? res.adjustments : (res.adjustments?.data || []));
                setHasLoadedPivot(true);
            }
        } catch (error) {
            console.error(error);
            alert('查詢失敗: ' + error.message);
        } finally {
            setLoading(false);
        }
    }, [startDate, endDate, category, user.token, apiUrl, hasLoadedPivot]);

    // [New] 懶載入出貨對照表與庫存數據
    const loadPivotData = useCallback(async () => {
        if (loadingPivot || hasLoadedPivot || !startDate || !endDate) return;
        setLoadingPivot(true);
        try {
            const payload = {
                startDate,
                endDate,
                category,
                fetchPivotData: true
            };
            const res = await callGAS(apiUrl, 'getReportDataBatch', payload, user.token);
            
            setRawPurchases(Array.isArray(res.purchases) ? res.purchases : (res.purchases?.data || []));
            if (res.inventory !== null) {
                setRawInventory(Array.isArray(res.inventory) ? res.inventory : (res.inventory?.data || []));
            }
            setRawAdjustments(Array.isArray(res.adjustments) ? res.adjustments : (res.adjustments?.data || []));
            setHasLoadedPivot(true);
        } catch (error) {
            console.error('載入對照表失敗:', error);
            alert('載入對照表失敗: ' + error.message);
        } finally {
            setLoadingPivot(false);
        }
    }, [startDate, endDate, category, apiUrl, user.token, loadingPivot, hasLoadedPivot]);

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
            displayFinalTotal: (!item.saleId || String(item.saleId).startsWith('exp_')) ? 0 : Number(item[Object.keys(item || {}).find(k => ['finaltotal', '結算', '结算', '總支出金額', '总支出金额'].some(term => String(k).toLowerCase().includes(term)))] || item.finalTotal || 0)
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

        // Filter Purchases
        let filteredPurchases = rawPurchases.filter(item => item != null && item.status !== 'VOID');
        if (prodTerm) filteredPurchases = filteredPurchases.filter(item => String(item.productName || '').toLowerCase().includes(prodTerm));
        setPurchaseData(filteredPurchases);

        // Filter Adjustments (報銷)
        let filteredAdjustments = rawAdjustments.filter(item => item != null);
        if (prodTerm) filteredAdjustments = filteredAdjustments.filter(item => String(item.productName || '').toLowerCase().includes(prodTerm));
        setAdjustmentData(filteredAdjustments);

    }, [rawSales, rawExpenses, rawPurchases, rawAdjustments, location, salesRep, productTerm]);

    // Trigger Fetching (with 300ms debounce to prevent multiple requests when changing dates rapidly)
    React.useEffect(() => {
        let active = true;
        
        // 切換日期時重設對照表載入狀態
        setHasLoadedPivot(false);
        setRawPurchases([]);
        setRawAdjustments([]);
        setVisibleCount(50); // [New] 切換日期時重設限制筆數

        const timer = setTimeout(async () => {
            if (!startDate || !endDate) return;
            setLoading(true);
            try {
                const payload = { 
                    startDate, 
                    endDate, 
                    category,
                    fetchPivotData: false // 預設初始與切換日期時不讀取龐大的對照表/庫存數據
                };
                const res = await callGAS(apiUrl, 'getReportDataBatch', payload, user.token);
                
                if (!active) return;
                
                setRawSales(Array.isArray(res.sales) ? res.sales : (res.sales?.data || []));
                setRawExpenses(Array.isArray(res.expenditures) ? res.expenditures : (res.expenditures?.data || []));
            } catch (error) {
                if (!active) return;
                console.error(error);
                alert('查詢失敗: ' + error.message);
            } finally {
                if (active) setLoading(false);
            }
        }, 300);

        return () => {
            active = false;
            clearTimeout(timer);
        };
    }, [startDate, endDate, category, user.token, apiUrl]);

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
        return ['CREDIT', 'TRANSFER', 'WALLET', '賒帳', '賒銷', '匯款', '奶包金', '奶包金扣抵'].includes(m);
    };

    const getPaymentMethodsBadges = (group) => {
        if (!group.items || group.items.length === 0) return null;
        const methods = [...new Set(group.items.map(item => String(item.paymentMethod || 'CASH').trim().toUpperCase()))];
        return (
            <div className="flex gap-1 mt-1 flex-wrap">
                {methods.map(m => {
                    if (['CREDIT', '賒帳', '賒銷'].includes(m)) {
                        return <span key={m} className="px-1.5 py-0.5 rounded text-[10px] font-black bg-rose-100 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/30">賒帳</span>;
                    }
                    if (['TRANSFER', '匯款'].includes(m)) {
                        return <span key={m} className="px-1.5 py-0.5 rounded text-[10px] font-black bg-blue-100 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900/30">匯款</span>;
                    }
                    if (['LINEPAY', 'LINE PAY'].includes(m)) {
                        return <span key={m} className="px-1.5 py-0.5 rounded text-[10px] font-black bg-emerald-100 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/30">LINE PAY</span>;
                    }
                    if (['WALLET', '奶包金', '奶包金扣抵'].includes(m)) {
                        return <span key={m} className="px-1.5 py-0.5 rounded text-[10px] font-black bg-amber-100 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-900/30">奶包金</span>;
                    }
                    return <span key={m} className="px-1.5 py-0.5 rounded text-[10px] font-black bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">現金</span>;
                })}
            </div>
        );
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
        const key = item.saleId 
            ? `${item.saleId}_${item.isCollectionReportMode ? 'col' : 'sale'}`
            : `manual_${dateStr}_${item.location}_${item.salesRep}`;
        if (!acc[key]) {
            acc[key] = {
                key,
                dateObj: d,
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
        const key = item.saleId 
            ? `${item.saleId}_sale` 
            : `manual_${dateStr}_${item.normCustomer || '-'}_${item.normSalesRep}`;
        if (!groupedSales[key]) {
            groupedSales[key] = {
                key,
                dateObj: d,
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
    const sortedGroups = Object.values(groupedSales).sort((a, b) => {
        const timeA = a.dateObj && !isNaN(a.dateObj.getTime()) ? a.dateObj.getTime() : 0;
        const timeB = b.dateObj && !isNaN(b.dateObj.getTime()) ? b.dateObj.getTime() : 0;
        return timeB - timeA;
    }); // Newest first
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
                        <div className="rounded-xl border border-[var(--border-primary)] overflow-hidden bg-[var(--bg-secondary)] shadow-sm">
                            <div 
                                onClick={() => setIsSummaryExpanded(!isSummaryExpanded)}
                                className="px-4 py-3 bg-[var(--bg-tertiary)] flex justify-between items-center cursor-pointer hover:bg-[var(--bg-hover)] transition-colors select-none"
                            >
                                <div className="flex items-center gap-2">
                                    {isSummaryExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                                    <h3 className="font-bold text-[var(--text-primary)] flex items-center gap-2">
                                        <Package size={16} className="text-blue-600 animate-pulse" /> 商品銷售統計
                                    </h3>
                                </div>
                            </div>
                            {isSummaryExpanded && (
                                <div className="overflow-auto border-t border-[var(--border-primary)] max-h-60 relative">
                                    <table className="w-full text-left">
                                        <thead className="text-[var(--text-secondary)] text-xs uppercase font-bold">
                                            <tr className="sticky top-0 z-10 bg-[var(--bg-tertiary)] shadow-[0_1px_0_0_var(--border-primary)]">
                                                <th className="p-4 bg-[var(--bg-tertiary)] sticky top-0">商品名稱</th>
                                                <th className="p-4 text-right bg-[var(--bg-tertiary)] sticky top-0">銷售數量</th>
                                                <th className="p-4 text-right bg-[var(--bg-tertiary)] sticky top-0">銷售金額</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-[var(--border-primary)] bg-[var(--bg-secondary)]">
                                            {summaryList.length > 0 ? (
                                                summaryList.map((item, idx) => (
                                                    <tr key={idx} className="hover:bg-[var(--bg-hover)] transition-colors">
                                                        <td className="p-4 text-[var(--text-primary)] font-bold">{item.name}</td>
                                                        <td className="p-4 text-right font-mono font-bold text-blue-600 text-lg">{item.qty}</td>
                                                        <td className="p-4 text-right font-mono font-bold text-emerald-600 text-lg">${item.amount.toLocaleString()}</td>
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
                            )}
                        </div>

                        {/* 1.5 業務代表領銷交叉表 (Pivot Table) */}
                        {(() => {
                            if (!hasLoadedPivot && !loadingPivot) {
                                return (
                                    <div className="rounded-xl border border-[var(--border-primary)] overflow-hidden bg-[var(--bg-secondary)] shadow-sm">
                                        <div 
                                            onClick={() => {
                                                setIsPivotExpanded(true);
                                                loadPivotData();
                                            }}
                                            className="px-4 py-3 bg-[var(--bg-tertiary)] flex justify-between items-center cursor-pointer hover:bg-[var(--bg-hover)] transition-colors select-none"
                                        >
                                            <div className="flex items-center gap-2">
                                                <ChevronRight size={18} />
                                                <h3 className="font-bold text-[var(--text-primary)] flex items-center gap-2">
                                                    <TrendingUp size={16} className="text-blue-600" /> 出貨對照表 (點擊載入庫存與對照表數據)
                                                </h3>
                                            </div>
                                        </div>
                                    </div>
                                );
                            }

                            if (loadingPivot) {
                                return (
                                    <div className="rounded-xl border border-[var(--border-primary)] overflow-hidden bg-[var(--bg-secondary)] shadow-sm">
                                        <div className="px-4 py-6 bg-[var(--bg-tertiary)] flex flex-col items-center justify-center gap-3 select-none">
                                            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                                            <span className="font-bold text-sm text-[var(--text-secondary)]">正在載入庫存與進出貨對照數據，請稍候...</span>
                                        </div>
                                    </div>
                                );
                            }

                            // 建立商品排序權重對照表
                            const productWeightMap = {};
                            rawInventory.forEach(item => {
                                if (item.productName && item.sortWeight !== undefined) {
                                    productWeightMap[item.productName] = Number(item.sortWeight);
                                }
                            });

                            // A. 抓出所有不重複的商品名稱 (排除運費，包含有銷售、有進貨與有報銷調整的商品)
                            const prodsInSales = reportData.map(item => item.productName).filter(Boolean);
                            const prodsInPurchases = purchaseData.map(item => item.productName).filter(Boolean);
                            const prodsInAdjustments = adjustmentData.map(item => item.productName).filter(Boolean);
                            const prods = Array.from(new Set([...prodsInSales, ...prodsInPurchases, ...prodsInAdjustments]))
                                .filter(p => !['運費', '系統運費', 'SHIPPING_FEE'].includes(p))
                                .sort((a, b) => {
                                    const wA = productWeightMap[a] !== undefined ? productWeightMap[a] : 999999;
                                    const wB = productWeightMap[b] !== undefined ? productWeightMap[b] : 999999;
                                    if (wA !== wB) return wA - wB;
                                    return a.localeCompare(b, 'zh-Hant');
                                });
                            
                            // B. 抓出所有不重複的業務代表
                            const reps = Array.from(new Set(reportData.map(item => item.salesRep).filter(Boolean)))
                                .sort((a, b) => a.localeCompare(b, 'zh-Hant'));

                            if (prods.length === 0) return null;

                            // C. 初始化二維矩陣
                            const matrix = {};
                            prods.forEach(prod => {
                                matrix[prod] = {};
                                reps.forEach(rep => {
                                    matrix[prod][rep] = { original: 0, picked: 0, sold: 0 };
                                });
                            });

                            // D. 統計數據
                            reportData.forEach(item => {
                                if (item.isCollectionReportMode) return;
                                const prod = item.productName;
                                const rep = item.salesRep;
                                if (matrix[prod] && matrix[prod][rep]) {
                                    matrix[prod][rep].original += (Number(item.originalQty) || 0);
                                    matrix[prod][rep].picked += (Number(item.pickedQty) || 0);
                                    matrix[prod][rep].sold += (Number(item.soldQty) || 0);
                                }
                            });

                            // E. 統計各商品實時庫存、進貨總量與報銷總量
                            const inventoryMap = {};
                            rawInventory.forEach(item => {
                                const pName = item.productName;
                                if (pName && (item.type === 'STOCK' || item.type === 'VOID_REFUND')) {
                                    inventoryMap[pName] = (inventoryMap[pName] || 0) + (Number(item.quantity) || 0);
                                }
                            });

                            const purchaseMap = {};
                            purchaseData.forEach(item => {
                                const pName = item.productName;
                                if (pName) {
                                    purchaseMap[pName] = (purchaseMap[pName] || 0) + (Number(item.quantity) || 0);
                                }
                            });

                            const adjustmentMap = {};
                            adjustmentData.forEach(item => {
                                const pName = item.productName;
                                if (pName) {
                                    adjustmentMap[pName] = (adjustmentMap[pName] || 0) + (Number(item.quantity) || 0);
                                }
                            });

                            const getProductTotal = (prod, metric) => {
                                return reps.reduce((sum, rep) => sum + (matrix[prod]?.[rep]?.[metric] || 0), 0);
                            };

                            const getRepTotal = (rep, metric) => {
                                return prods.reduce((sum, prod) => sum + (matrix[prod]?.[rep]?.[metric] || 0), 0);
                            };

                            const getGrandTotal = (metric) => {
                                return prods.reduce((sum, prod) => sum + getProductTotal(prod, metric), 0);
                            };

                            const totalInventory = prods.reduce((sum, p) => sum + (inventoryMap[p] || 0), 0);
                            const totalPurchased = prods.reduce((sum, p) => sum + (purchaseMap[p] || 0), 0);
                            const totalAdjusted = prods.reduce((sum, p) => sum + (adjustmentMap[p] || 0), 0);

                            return (
                                <div className="rounded-xl border border-[var(--border-primary)] overflow-hidden bg-[var(--bg-secondary)] shadow-sm">
                                    <div 
                                        onClick={() => setIsPivotExpanded(!isPivotExpanded)}
                                        className="px-4 py-3 bg-[var(--bg-tertiary)] flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 cursor-pointer hover:bg-[var(--bg-hover)] transition-colors select-none"
                                    >
                                        <div className="flex items-center gap-2">
                                            {isPivotExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                                            <h3 className="font-bold text-[var(--text-primary)] flex items-center gap-2">
                                                <TrendingUp size={16} className="text-blue-600 animate-pulse" /> 出貨對照表
                                            </h3>
                                        </div>
                                        {isPivotExpanded && (
                                            <div className="flex bg-[var(--bg-primary)] p-0.5 rounded-lg border border-[var(--border-primary)] text-xs font-bold shadow-inner shrink-0" onClick={(e) => e.stopPropagation()}>
                                                {[
                                                    { value: 'original', label: '原在車上 (Original)' },
                                                    { value: 'picked', label: '追加領貨 (Picked)' },
                                                    { value: 'sold', label: '實售數量 (Sold)' }
                                                ].map(item => (
                                                    <button
                                                        key={item.value}
                                                        type="button"
                                                        onClick={() => setPivotMetric(item.value)}
                                                        className={`px-3 py-1.5 rounded-md transition-all duration-200 ${pivotMetric === item.value 
                                                            ? 'bg-blue-600 text-white shadow-sm font-black' 
                                                            : 'text-slate-500 hover:text-slate-900'
                                                        }`}
                                                    >
                                                        {item.label}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    {isPivotExpanded && (
                                        <div className="overflow-auto border-t border-[var(--border-primary)] max-h-[450px] relative">
                                            <table className="w-full text-left text-sm whitespace-nowrap">
                                                <thead className="text-[var(--text-secondary)] text-xs uppercase font-bold">
                                                    <tr className="sticky top-0 z-10 bg-[var(--bg-tertiary)] shadow-[0_1px_0_0_var(--border-primary)]">
                                                        <th className="p-4 w-48 bg-[var(--bg-tertiary)] sticky top-0">商品名稱</th>
                                                        <th className="p-4 text-center bg-gray-50 dark:bg-gray-800 text-slate-700 dark:text-slate-300 font-extrabold sticky top-0">期初庫存</th>
                                                        <th className="p-4 text-center bg-emerald-50/50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 font-extrabold sticky top-0">進貨 (+)</th>
                                                        {reps.map(rep => (
                                                            <th key={rep} className="p-4 text-center bg-[var(--bg-tertiary)] sticky top-0">{rep}</th>
                                                        ))}
                                                        <th className="p-4 text-center bg-rose-50/50 dark:bg-rose-950/20 text-rose-700 dark:text-rose-400 font-extrabold sticky top-0">出貨合計 (-)</th>
                                                        <th className="p-4 text-center bg-amber-50/40 dark:bg-amber-950/10 text-amber-700 dark:text-amber-400 font-extrabold sticky top-0">報銷 (-)</th>
                                                        <th className="p-4 text-center bg-blue-50/50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-400 font-black sticky top-0">現有庫存 (=)</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-[var(--border-primary)] bg-[var(--bg-secondary)]">
                                                    {prods.map(prod => {
                                                        const rTotal = getProductTotal(prod, pivotMetric);
                                                        const invQty = inventoryMap[prod] || 0;
                                                        const purQty = purchaseMap[prod] || 0;
                                                        const adjQty = adjustmentMap[prod] || 0;
                                                        const startingQty = invQty - purQty + rTotal + adjQty;
                                                        return (
                                                            <tr key={prod} className="hover:bg-[var(--bg-hover)] transition-colors">
                                                                <td className="p-4 font-bold text-[var(--text-primary)]">{prod}</td>
                                                                <td className="p-4 text-center font-mono font-bold bg-gray-50/30 dark:bg-gray-800/10 text-slate-600">
                                                                    {startingQty > 0 ? startingQty.toLocaleString() : startingQty < 0 ? <span className="text-red-500 font-bold">{startingQty.toLocaleString()}</span> : <span className="opacity-30">-</span>}
                                                                </td>
                                                                <td className="p-4 text-center font-mono font-bold bg-emerald-50/20 dark:bg-emerald-950/5 text-emerald-600">
                                                                    {purQty > 0 ? `+ ${purQty.toLocaleString()}` : <span className="opacity-30">-</span>}
                                                                </td>
                                                                {reps.map(rep => {
                                                                    const val = matrix[prod]?.[rep]?.[pivotMetric] || 0;
                                                                    return (
                                                                        <td key={rep} className="p-4 text-center font-mono font-bold text-[var(--text-secondary)]">
                                                                            {val > 0 ? val.toLocaleString() : <span className="opacity-30">-</span>}
                                                                        </td>
                                                                    );
                                                                })}
                                                                <td className="p-4 text-center font-mono font-bold bg-rose-50/20 dark:bg-rose-950/5 text-rose-600">
                                                                    {rTotal > 0 ? `- ${rTotal.toLocaleString()}` : <span className="opacity-30">-</span>}
                                                                </td>
                                                                <td className="p-4 text-center font-mono font-bold bg-amber-50/20 dark:bg-amber-950/5 text-amber-600">
                                                                    {adjQty > 0 ? `- ${adjQty.toLocaleString()}` : <span className="opacity-30">-</span>}
                                                                </td>
                                                                <td className="p-4 text-center font-mono font-black bg-blue-50/25 dark:bg-blue-950/10 text-blue-600 text-base">
                                                                    = {invQty.toLocaleString()}
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                    {/* 總計列 */}
                                                    <tr className="bg-[var(--bg-tertiary)] font-black text-[var(--text-primary)] border-t border-[var(--border-primary)] shadow-sm">
                                                        <td className="p-4">📊 總計</td>
                                                        <td className="p-4 text-center font-mono bg-gray-50/30 dark:bg-gray-800/10 text-slate-700 text-base">
                                                            {(totalInventory - totalPurchased + getGrandTotal(pivotMetric) + totalAdjusted).toLocaleString()}
                                                        </td>
                                                        <td className="p-4 text-center font-mono bg-emerald-50/20 dark:bg-emerald-950/5 text-emerald-700 text-base">
                                                            {totalPurchased > 0 ? `+ ${totalPurchased.toLocaleString()}` : '-'}
                                                        </td>
                                                        {reps.map(rep => {
                                                            const repTotal = getRepTotal(rep, pivotMetric);
                                                            return (
                                                                <td key={rep} className="p-4 text-center font-mono text-[var(--text-primary)] text-base">
                                                                    {repTotal > 0 ? repTotal.toLocaleString() : '-'}
                                                                </td>
                                                            );
                                                        })}
                                                        <td className="p-4 text-center font-mono bg-rose-50/20 dark:bg-rose-950/5 text-rose-700 text-base">
                                                            {getGrandTotal(pivotMetric) > 0 ? `- ${getGrandTotal(pivotMetric).toLocaleString()}` : '-'}
                                                        </td>
                                                        <td className="p-4 text-center font-mono bg-amber-50/20 dark:bg-amber-950/5 text-amber-700 text-base">
                                                            {totalAdjusted > 0 ? `- ${totalAdjusted.toLocaleString()}` : '-'}
                                                        </td>
                                                        <td className="p-4 text-center font-mono bg-blue-50/25 dark:bg-blue-950/10 text-blue-700 text-lg">
                                                            = {totalInventory.toLocaleString()}
                                                        </td>
                                                    </tr>
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            );
                        })()}

                        {/* 2. Detailed Lists with Tabs */}
                        <div className="rounded-xl border border-[var(--border-primary)] overflow-hidden flex flex-col h-[600px]">
                            <div className="px-4 py-3 bg-[var(--bg-tertiary)] border-b border-[var(--border-primary)] flex gap-4">
                                <div className="font-bold flex items-center gap-2 pb-2 border-b-2 text-blue-600 border-blue-600">
                                    <TrendingUp size={16} /> 銷售明細 ({sortedGroups.length})
                                </div>
                            </div>

                            <div className="overflow-auto flex-1">
                                {/* Mobile Card View (SALES) - Grouped */}
                                <div className="md:hidden divide-y divide-[var(--border-primary)]">
                                    {sortedGroups.slice(0, visibleCount).map((group) => {
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
                                                                <div className="w-full mt-1">
                                                                    {getPaymentMethodsBadges(group)}
                                                                </div>
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
                                        {sortedGroups.slice(0, visibleCount).map((group) => {
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
                                                            {getPaymentMethodsBadges(group)}
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
                                                                                    <th className="px-4 py-3 text-left w-24">付款方式</th>
                                                                                    <th className="px-4 py-3 text-right">數量</th>
                                                                                    <th className="px-4 py-3 text-right">單價</th>
                                                                                    <th className="px-4 py-3 text-right">小計</th>
                                                                                </tr>
                                                                            </thead>
                                                                            <tbody className="divide-y divide-[var(--border-primary)]/70">
                                                                                {group.items.map((it, i) => (
                                                                                    <tr key={i} className="hover:bg-white/70 transition-colors">
                                                                                        <td className="px-4 py-3 text-[var(--text-primary)] font-bold text-base">{it.productName}</td>
                                                                                        <td className="px-4 py-3 text-left text-xs font-bold text-[var(--text-secondary)]">
                                                                                            {String(it.paymentMethod || 'CASH').toUpperCase() === 'CREDIT' ? (
                                                                                                <span className="px-2 py-0.5 bg-rose-100 text-rose-600 border border-rose-200 rounded shrink-0">賒帳</span>
                                                                                            ) : String(it.paymentMethod || 'CASH').toUpperCase() === 'TRANSFER' ? (
                                                                                                <span className="px-2 py-0.5 bg-blue-100 text-blue-600 border border-blue-200 rounded shrink-0">匯款</span>
                                                                                            ) : String(it.paymentMethod || 'CASH').toUpperCase() === 'LINEPAY' || String(it.paymentMethod || 'CASH').toUpperCase() === 'LINE PAY' ? (
                                                                                                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-600 border border-emerald-200 rounded shrink-0">LINE PAY</span>
                                                                                            ) : (
                                                                                                <span className="px-2 py-0.5 bg-slate-100 text-slate-600 border border-slate-200 rounded shrink-0">現金</span>
                                                                                            )}
                                                                                        </td>
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

                                {/* 載入更多按鈕 */}
                                {sortedGroups.length > visibleCount && (
                                    <div className="p-4 text-center border-t border-[var(--border-primary)] bg-[var(--bg-secondary)] sticky bottom-0 z-20">
                                        <button
                                            type="button"
                                            onClick={() => setVisibleCount(prev => prev + 50)}
                                            className="btn-primary px-8 py-2.5 rounded-xl text-sm font-bold shadow-md active:scale-95 transition-all"
                                        >
                                            顯示更多紀錄 (目前 {visibleCount} / 總共 {sortedGroups.length} 筆)
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

