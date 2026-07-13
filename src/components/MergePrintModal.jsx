import { safeLocalStorage, safeSessionStorage } from '../utils/storage';
import React, { useState, useEffect } from 'react';
import { ListOrdered, Printer, Clock, CreditCard, Package, X, Trash2, CheckCircle2, Sparkles, Sun, CloudRain, MapPin, Calendar, ChevronDown } from 'lucide-react';
import { callGAS } from '../utils/api';

const apiUrl = window.GAS_API_URL || import.meta.env.VITE_GAS_API_URL;

export default function MergePrintModal({
    show,
    onClose,
    records,
    selectedIds,
    onToggleSelect,
    onMergePrint,
    isPrinting,
    startDate,
    endDate,
    onDateChange,
    onSearch,
    isSearchLoading, // [New] 查詢載入狀態
    systemCustomers = [], // [New] 全系統客戶名單
    onUpdateCustomerSettings // [New] 更新客戶設定
}) {
    const userString = safeSessionStorage.getItem('inventory_user');
    const user = userString ? JSON.parse(userString) : null;

    const [aiCustomer, setAiCustomer] = useState('');
    const [aiWeather, setAiWeather] = useState('SUNNY');
    const [aiDayOfWeek, setAiDayOfWeek] = useState(new Date(endDate).getDay());
    const [printDate, setPrintDate] = useState(new Date().toISOString().split('T')[0]);
    const [isAiLoading, setIsAiLoading] = useState(false);
    const [aiMessage, setAiMessage] = useState(null);
    const [showAllLocations, setShowAllLocations] = useState(false); // [New] 是否顯示全部地點
    const [showScheduleMgr, setShowScheduleMgr] = useState(false); // 控制排程後台子視窗
    const [searchCustQuery, setSearchCustQuery] = useState(''); // 排程後台搜尋框
    const [editingCustomers, setEditingCustomers] = useState({}); // 暫存正在編輯的客戶設定
    const [showProductRuleMgr, setShowProductRuleMgr] = useState(false); // 控制商品規格後台子視窗
    const [searchProductQuery, setSearchProductQuery] = useState(''); // 商品規格搜尋框
    const [mgrProducts, setMgrProducts] = useState([]); // 商品規格管理名單
    const [loadingProducts, setLoadingProducts] = useState(false);
    const [savingProductId, setSavingProductId] = useState(null); // 正在儲存的商品 ID
    const [isSavingAll, setIsSavingAll] = useState(false); // [New] 一鍵存檔狀態
    const [saveAllProgress, setSaveAllProgress] = useState(''); // [New] 一鍵存檔進度文字

    // 防禦：確保 records 一定是 array，避免 API 失敗時 crash (宣告在 hooks 前讓 useEffect 也能使用)
    const safeRecords = Array.isArray(records) ? records : [];

    // [New] 自動推算當前日期的星期幾
    const getDOWString = (dateStr) => {
        if (!dateStr) return '';
        const days = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
        return days[new Date(dateStr).getDay()];
    };

    const setQuickPrintDate = (offset) => {
        const d = new Date();
        d.setDate(d.getDate() + offset);
        const dateStr = d.toISOString().split('T')[0];
        setPrintDate(dateStr);
        // [智慧連動] 點擊快選日期時同步更新 AI 參考星期
        setAiDayOfWeek(d.getDay());
    };

    // [New] 當點選歷史星期時，自動推算同週對應日期
    const handleDOWClick = (idx) => {
        setAiDayOfWeek(idx);
        if (printDate) {
            const d = new Date(printDate);
            const currentDOW = d.getDay();
            const diff = idx - currentDOW;
            d.setDate(d.getDate() + diff);
            setPrintDate(d.toISOString().split('T')[0]);
        }
    };

    // [New] 當手動調整日期時，同步更新 AI 參考星期
    const handlePrintDateChange = (newDate) => {
        setPrintDate(newDate);
        if (newDate) {
            const d = new Date(newDate);
            if (!isNaN(d.getTime())) {
                setAiDayOfWeek(d.getDay());
            }
        }
    };

    const targetDOW = getDOWString(endDate);

    // [New] 自動從選中的單據中抓取客戶名稱作為預設
    useEffect(() => {
        if (show && selectedIds.length > 0 && !aiCustomer) {
            const firstRecord = safeRecords.find(r => r.saleId === selectedIds[0]);
            if (firstRecord) setAiCustomer(firstRecord.customer);
        }
    }, [show, selectedIds, records, aiCustomer]);

    // [New] 當結束日期改變時，同步更新 AI 預測的星期 (除非使用者手動改過，這邊簡化處理為直接同步)
    useEffect(() => {
        if (endDate) {
            setAiDayOfWeek(new Date(endDate).getDay());
        }
    }, [endDate]);

    // ==========================================
    // 地點排程管理後台相關輔助函式
    // ==========================================
    const getCustSetting = (custName) => {
        if (editingCustomers[custName]) {
            return editingCustomers[custName];
        }
        const orig = systemCustomers.find(c => (typeof c === 'string' ? c : c.name) === custName);
        let origSchedule = [0,1,2,3,4,5,6];
        let origAiEnabled = true;
        let origCategory = '市場';
        if (orig && typeof orig === 'object') {
            origSchedule = orig.schedule || [0,1,2,3,4,5,6];
            origAiEnabled = orig.isAiEnabled !== false;
            origCategory = orig.category || '市場';
        }
        return {
            customerName: custName,
            isAiEnabled: origAiEnabled,
            schedule: origSchedule,
            category: origCategory,
            isSaving: false
        };
    };

    const handleEditCust = (custName, field, value) => {
        const current = getCustSetting(custName);
        const next = { ...current, [field]: value };
        setEditingCustomers(prev => ({
            ...prev,
            [custName]: next
        }));
    };

    const handleSaveCust = async (custName) => {
        const setting = getCustSetting(custName);
        setEditingCustomers(prev => ({
            ...prev,
            [custName]: { ...setting, isSaving: true }
        }));
        if (onUpdateCustomerSettings) {
            const success = await onUpdateCustomerSettings({
                customerName: setting.customerName,
                isAiEnabled: setting.isAiEnabled,
                schedule: setting.schedule,
                category: setting.category
            });
            if (success) {
                setEditingCustomers(prev => {
                    const copy = { ...prev };
                    delete copy[custName];
                    return copy;
                });
            } else {
                setEditingCustomers(prev => ({
                    ...prev,
                    [custName]: { ...setting, isSaving: false }
                }));
            }
        }
    };

    // 載入商品規格清單
    useEffect(() => {
        const loadProducts = async () => {
            setLoadingProducts(true);
            try {
                const data = await callGAS(apiUrl, 'getProducts', {}, user?.token);
                if (Array.isArray(data)) {
                    setMgrProducts(data);
                }
            } catch (e) {
                console.error("Failed to load products for rule manager", e);
            } finally {
                setLoadingProducts(false);
            }
        };
        if (showProductRuleMgr && user?.token) {
            loadProducts();
        }
    }, [showProductRuleMgr, user?.token]);

    const handleEditProductField = (productId, field, value) => {
        setMgrProducts(prev => prev.map(p => {
            if (p.id === productId) {
                return { ...p, [field]: value, _dirty: true };
            }
            return p;
        }));
    };

    const handleSaveProductRule = async (product) => {
        setSavingProductId(product.id);
        try {
            // 解析發貨階梯
            let parsedSteps = [];
            if (typeof product.dispatchSteps === 'string') {
                parsedSteps = product.dispatchSteps.split(/[,，]/).map(s => Number(s.trim())).filter(n => !isNaN(n));
            } else if (Array.isArray(product.dispatchSteps)) {
                parsedSteps = product.dispatchSteps.map(Number);
            }

            const res = await callGAS(apiUrl, 'updateProductDetails', {
                productId: product.id,
                packSize: Number(product.packSize || 1),
                dispatchSteps: parsedSteps,
                roundThreshold: Number(product.roundThreshold !== undefined ? product.roundThreshold : 99),
                autoSuppress: Boolean(product.autoSuppress),
                maxSuggestion: Number(product.maxSuggestion || 0)
            }, user?.token);

            if (res && res.error) {
                throw new Error(res.error);
            }

            setMgrProducts(prev => prev.map(p => {
                if (p.id === product.id) {
                    return { ...p, dispatchSteps: parsedSteps, _dirty: false };
                }
                return p;
            }));
            alert(`${product.name} 規格儲存成功！`);
        } catch (e) {
            alert('儲存商品規格失敗: ' + e.message);
        } finally {
            setSavingProductId(null);
        }
    };

    const handleSaveAllProductRules = async () => {
        const dirtyProducts = mgrProducts.filter(p => p._dirty);
        if (dirtyProducts.length === 0) return;

        setIsSavingAll(true);
        let successCount = 0;
        let failCount = 0;

        for (let i = 0; i < dirtyProducts.length; i++) {
            const product = dirtyProducts[i];
            setSaveAllProgress(`儲存中 (${i + 1}/${dirtyProducts.length}): ${product.name}`);
            try {
                // 解析發貨階梯
                let parsedSteps = [];
                if (typeof product.dispatchSteps === 'string') {
                    parsedSteps = product.dispatchSteps.split(/[,，]/).map(s => Number(s.trim())).filter(n => !isNaN(n));
                } else if (Array.isArray(product.dispatchSteps)) {
                    parsedSteps = product.dispatchSteps.map(Number);
                }

                const res = await callGAS(apiUrl, 'updateProductDetails', {
                    productId: product.id,
                    packSize: Number(product.packSize || 1),
                    dispatchSteps: parsedSteps,
                    roundThreshold: Number(product.roundThreshold !== undefined ? product.roundThreshold : 99),
                    autoSuppress: Boolean(product.autoSuppress),
                    maxSuggestion: Number(product.maxSuggestion || 0)
                }, user?.token);

                if (res && res.error) {
                    throw new Error(res.error);
                }

                setMgrProducts(prev => prev.map(p => {
                    if (p.id === product.id) {
                        return { ...p, dispatchSteps: parsedSteps, _dirty: false };
                    }
                    return p;
                }));
                successCount++;
            } catch (e) {
                console.error(`Failed to save rules for ${product.name}`, e);
                failCount++;
            }
        }

        setIsSavingAll(false);
        setSaveAllProgress('');
        alert(`一鍵儲存完成！\n成功儲存：${successCount} 項` + (failCount > 0 ? `\n失敗：${failCount} 項` : ''));
    };

    if (!show) return null;

    // Group records by date
    const groupedRecords = safeRecords.reduce((groups, record) => {
        const dateKey = new Date(record.date).toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' });
        if (!groups[dateKey]) groups[dateKey] = [];
        groups[dateKey].push(record);
        return groups;
    }, {});

    const sortedDates = Object.keys(groupedRecords).sort((a, b) => new Date(b) - new Date(a));

    // [New] 執行 AI 補貨建議
    const handleAIReplenish = async () => {
        if (!aiCustomer) {
            alert('請選擇預估的地點');
            return;
        }

        const selectedRecords = safeRecords.filter(r => selectedIds.includes(r.saleId));
        // 如果沒選單據，currentOriginals 就會是空物件，表示車上目前沒貨量

        // 1. 統計目前選中單據中的 原貨+退貨 (即目前車上有的貨)
        const currentOriginals = {};
        selectedRecords.forEach(record => {
            (record.salesData || []).forEach(item => {
                const qtyOnTruck = Number(item.returns) || 0;
                currentOriginals[item.productId] = (currentOriginals[item.productId] || 0) + qtyOnTruck;
            });
        });

        setIsAiLoading(true);
        setAiMessage(null);

        try {
            if (!user) throw new Error('連線逾時或尚未登入，請重新整理頁面');

            const res = await callGAS(apiUrl, 'getSmartPickSuggestion', {
                customer: aiCustomer,
                dayOfWeek: aiDayOfWeek,
                weather: aiWeather,
                currentOriginals: currentOriginals
            }, user.token);

            if (res.success) {
                setAiMessage({ type: 'success', text: res.message });
                // 執行合併列印，並傳入 AI 建議的提貨量作為覆蓋值，以及預測地點、自訂單據日期
                // 加入 await 確保流程完整，並提示可能的彈跳視窗阻擋
                await onMergePrint(res.suggestions, aiCustomer, printDate);
            } else {
                alert(res.error || 'AI 預測失敗');
            }
        } catch (e) {
            console.error(e);
            alert(e.message || '系統連線異常');
        } finally {
            setIsAiLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 transition-all duration-300">
            <div className="absolute inset-0 bg-white/60 backdrop-blur-[12px]" onClick={onClose} />

            <div className="relative w-full max-w-6xl bg-white rounded-[2.5rem] shadow-[0_40px_100px_-20px_rgba(0,0,0,0.1)] border border-gray-100 overflow-hidden flex flex-col h-[92vh] animate-in fade-in zoom-in duration-500">

                {/* 1. Header Section: Clean & Focused */}
                <div className="relative bg-white p-4 sm:p-6 border-b border-gray-100 shrink-0">
                    <div className="absolute top-0 right-0 -mr-20 -mt-20 w-80 h-80 bg-blue-50/50 rounded-full blur-[80px] pointer-events-none" />
                    <div className="relative flex flex-col gap-4 w-full">
                        <div className="flex items-center gap-3 w-full">
                            <div className="p-2 sm:p-3 bg-gray-900 text-white rounded-xl shadow-lg shrink-0">
                                <ListOrdered size={20} strokeWidth={2.5} />
                            </div>
                            <h3 className="text-lg sm:text-xl font-black tracking-tight text-gray-900 flex-1">合併列印與補貨</h3>
                            <button onClick={onClose} className="p-2 bg-gray-50 hover:bg-gray-100 rounded-full border border-gray-200 text-gray-400 transition-all shadow-sm shrink-0">
                                <X size={20} />
                            </button>
                        </div>
                        {/* Date Search Bar */}
                        <div className="flex items-center w-full bg-gray-50/80 p-1.5 rounded-lg border border-gray-200">
                            <input type="date" value={startDate} onChange={(e) => onDateChange('start', e.target.value)} className="bg-transparent px-2 w-full min-w-0 text-[10px] sm:text-xs font-bold text-gray-700 outline-none" />
                            <span className="text-gray-300 font-bold px-1 shrink-0">~</span>
                            <input type="date" value={endDate} onChange={(e) => onDateChange('end', e.target.value)} className="bg-transparent px-2 w-full min-w-0 text-[10px] sm:text-xs font-bold text-gray-700 outline-none" />
                            <button 
                                onClick={onSearch} 
                                disabled={isSearchLoading}
                                className={`px-3 py-1.5 rounded text-xs font-black transition-all shadow-md shrink-0 ml-1 flex items-center justify-center gap-1 ${isSearchLoading ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 text-white active:scale-95'}`}
                            >
                                {isSearchLoading ? (
                                    <>
                                        <div className="w-3 h-3 border-2 border-gray-500/30 border-t-gray-500 rounded-full animate-spin" />
                                        查詢中...
                                    </>
                                ) : '查詢'}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Scrollable Content Container */}
                <div className="overflow-y-auto flex-1 bg-gray-50/30 flex flex-col relative">
                    {/* 2. AI Prediction Panel: Premium Dashboard Layout */}
                    <div className="px-4 sm:px-10 mt-4 sm:mt-6 shrink-0">
                        <div className="p-5 sm:p-8 bg-gradient-to-br from-indigo-50/40 via-white to-blue-50/40 border border-blue-100 rounded-3xl shadow-sm relative overflow-hidden">
                        <div className="relative flex flex-col xl:flex-row items-stretch gap-6 sm:gap-10">
                            
                            {/* LEFT: Branding Side-anchor */}
                            <div className="flex flex-row xl:flex-col items-center justify-center gap-4 shrink-0 xl:w-48 border-b xl:border-b-0 xl:border-r border-blue-100 pb-5 xl:pb-0 xl:pr-10">
                                <div className="p-3 sm:p-4 bg-blue-600 text-white rounded-2xl shadow-xl shadow-blue-200/60 shrink-0">
                                    <Sparkles size={24} className="animate-pulse" />
                                </div>
                                <div className="text-left xl:text-center">
                                    <h4 className="font-black text-blue-900 text-sm sm:text-base leading-tight">AI 補貨預測</h4>
                                    <p className="text-[9px] sm:text-[10px] font-bold text-blue-400 uppercase tracking-[0.2em] mt-1">Smart Engine v2</p>
                                </div>
                            </div>

                            {/* RIGHT: Main Workspace */}
                            <div className="flex-1 flex flex-col gap-6">
                                {/* ROW 1: Logic Grid */}
                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                                    <div className="flex flex-col gap-2">
                                        <div className="flex items-center justify-between px-1">
                                            <label className="text-[10px] font-black text-blue-400 uppercase tracking-widest flex items-center gap-2">
                                                <MapPin size={12} className="text-blue-500 shrink-0" /> 特定地點預測目標
                                            </label>
                                            <div className="flex items-center gap-1.5 sm:gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => setShowScheduleMgr(true)}
                                                    className="text-[10px] text-blue-500 hover:text-blue-600 font-black flex items-center gap-0.5"
                                                >
                                                    ⚙️ 管理排程
                                                </button>
                                                <span className="text-gray-300 text-[10px]">|</span>
                                                <button
                                                    type="button"
                                                    onClick={() => setShowProductRuleMgr(true)}
                                                    className="text-[10px] text-blue-500 hover:text-blue-600 font-black flex items-center gap-0.5"
                                                >
                                                    ⚙️ 設定箱數規格
                                                </button>
                                            </div>
                                        </div>
                                        <div className="relative bg-gray-50/50 p-1 rounded-xl border-2 border-blue-100 flex items-center h-12">
                                            <select
                                                className="w-full bg-transparent appearance-none rounded-lg px-3 text-xs sm:text-sm font-black text-blue-900 outline-none cursor-pointer"
                                                value={aiCustomer}
                                                onChange={(e) => setAiCustomer(e.target.value)}
                                            >
                                                <option value="">請點擊選取地點...</option>
                                                {systemCustomers
                                                    .filter(c => {
                                                        if (typeof c === 'object' && c.isAiEnabled === false) return false;
                                                        if (showAllLocations) return true;
                                                        if (typeof c === 'string') return true;
                                                        return c.schedule && c.schedule.includes(aiDayOfWeek);
                                                    })
                                                    .map(c => {
                                                        const name = typeof c === 'string' ? c : c.name;
                                                        return <option key={name} value={name}>{name}</option>;
                                                    })
                                                }
                                            </select>
                                            <div className="absolute right-3 pointer-events-none text-blue-300">
                                                <ChevronDown size={16} />
                                            </div>
                                        </div>
                                        <button 
                                            onClick={() => setShowAllLocations(!showAllLocations)}
                                            className={`text-[9px] sm:text-[10px] font-bold mt-1 px-2 py-1 rounded-md self-end transition-all ${showAllLocations ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-400'}`}
                                        >
                                            {showAllLocations ? '預覽當日排程' : '顯示全部地點'}
                                        </button>
                                    </div>

                                    <div className="flex flex-col gap-2">
                                        <label className="text-[10px] font-black text-blue-400 uppercase tracking-widest flex items-center gap-2 px-1">
                                            <CloudRain size={12} className="text-blue-500 shrink-0" /> 明日預計天氣
                                        </label>
                                        <div className="flex bg-gray-50/50 p-1 rounded-xl border-2 border-blue-100 h-12 gap-1">
                                            <button onClick={() => setAiWeather('SUNNY')} className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg text-xs font-black transition-all ${aiWeather === 'SUNNY' ? 'bg-amber-500 text-white shadow-md' : 'text-blue-300 hover:text-blue-400'}`}>
                                                <Sun size={14} /> 晴天
                                            </button>
                                            <button onClick={() => setAiWeather('RAINY')} className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg text-xs font-black transition-all ${aiWeather === 'RAINY' ? 'bg-indigo-600 text-white shadow-md' : 'text-blue-300 hover:text-blue-400'}`}>
                                                <CloudRain size={14} /> 雨天
                                            </button>
                                        </div>
                                    </div>

                                    <div className="flex flex-col gap-2">
                                        <label className="text-[10px] font-black text-blue-400 uppercase tracking-widest flex items-center gap-2 px-1">
                                            <Calendar size={12} className="text-blue-500 shrink-0" /> 歷史參考星期
                                        </label>
                                        <div className="grid grid-cols-7 gap-1 bg-gray-50/50 p-1 rounded-xl border-2 border-blue-100 h-12">
                                            {['日', '一', '二', '三', '四', '五', '六'].map((day, idx) => (
                                                <button key={idx} onClick={() => handleDOWClick(idx)} className={`w-full flex items-center justify-center rounded-lg text-[10px] sm:text-[11px] font-black transition-all ${aiDayOfWeek === idx ? 'bg-blue-600 text-white shadow-md' : 'text-blue-300 hover:bg-white/50 hover:text-blue-500'}`}>
                                                    {day}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                {/* ROW 2: PDF Logic & Primary Action */}
                                <div className="flex flex-col lg:flex-row items-center gap-4 sm:gap-6 pt-4 sm:pt-6 border-t border-blue-50">
                                    {/* Left: PDF date — takes all remaining space */}
                                    <div className="flex flex-1 flex-col sm:flex-row items-start sm:items-center gap-3 w-full">
                                        {/* Label */}
                                        <div className="flex items-center gap-2 shrink-0">
                                            <div className="p-2 lg:p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
                                                <Clock size={16} className="lg:w-5 lg:h-5" />
                                            </div>
                                            <h4 className="font-black text-gray-800 text-xs sm:text-sm lg:text-lg tracking-tight whitespace-nowrap">PDF 單據顯示日期</h4>
                                        </div>
                                        {/* Quick buttons + date picker */}
                                        <div className="flex items-center gap-2 lg:gap-3 flex-1 w-full sm:w-auto">
                                            <div className="flex bg-white p-1 lg:p-1.5 rounded-lg border border-blue-100 shadow-sm shrink-0">
                                                <button onClick={() => setQuickPrintDate(-1)} className="px-2 py-1.5 lg:px-4 lg:py-2 rounded-md text-[10px] sm:text-xs lg:text-sm font-black text-blue-500 hover:bg-gray-50 transition-all">◀昨</button>
                                                <button onClick={() => setQuickPrintDate(0)}  className="px-2 py-1.5 lg:px-4 lg:py-2 rounded-md text-[10px] sm:text-xs lg:text-sm font-black text-blue-500 hover:bg-gray-50 transition-all">今</button>
                                                <button onClick={() => setQuickPrintDate(1)}  className="px-2 py-1.5 lg:px-4 lg:py-2 rounded-md text-[10px] sm:text-xs lg:text-sm font-black text-blue-500 hover:bg-gray-50 transition-all">明▶</button>
                                            </div>
                                            <input
                                                type="date"
                                                value={printDate}
                                                onChange={(e) => handlePrintDateChange(e.target.value)}
                                                className="flex-1 min-w-0 bg-white border-2 border-blue-100 rounded-lg px-2 py-1.5 lg:px-4 lg:py-2 text-[10px] sm:text-sm lg:text-lg font-black text-blue-900 outline-none focus:border-blue-400 shadow-sm transition-all"
                                            />
                                        </div>
                                    </div>

                                    {/* Right: AI Button */}
                                    <button
                                        onClick={handleAIReplenish}
                                        disabled={isAiLoading || !aiCustomer}
                                        className={`w-full lg:w-auto shrink-0 group relative flex items-center justify-center gap-3 px-6 py-3 sm:py-4 rounded-xl sm:rounded-[2rem] font-black transition-all duration-300 shadow-lg active:scale-95 ${isAiLoading || !aiCustomer ? 'bg-gray-100 text-gray-400 cursor-not-allowed shadow-none' : 'bg-gradient-to-r from-blue-600 to-indigo-700 text-white hover:brightness-110 shadow-blue-200/50 text-sm sm:text-xl'}`}
                                    >
                                        {isAiLoading ? (
                                            <div className="w-5 h-5 border-3 border-white/30 border-t-white rounded-full animate-spin" />
                                        ) : (
                                            <div className="flex items-center gap-3 whitespace-nowrap">
                                                <div className="p-1 bg-white/20 rounded-md shadow-inner group-hover:rotate-12 transition-transform">
                                                    <Sparkles size={18} />
                                                </div>
                                                <span>生成 AI 補貨</span>
                                            </div>
                                        )}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                    {aiMessage && (
                        <div className="mt-4 flex items-start gap-3 px-5 py-4 bg-blue-50/50 border border-blue-100 rounded-2xl animate-in slide-in-from-top-2">
                            <span className="text-lg shrink-0 mt-0.5">💡</span>
                            <p className="text-xs sm:text-sm font-black text-blue-600 leading-relaxed">
                                {aiMessage.text}
                            </p>
                        </div>
                    )}
                </div>

                {/* Modal Body */}
                <div className="py-4 sm:py-6 flex-1">
                    {safeRecords.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-10 text-center opacity-50 mx-[15px]">
                            <ListOrdered size={32} className="mb-4" />
                            <h4 className="font-bold text-sm">請先點擊查詢載入資料</h4>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {sortedDates.map(dateKey => (
                                <div key={dateKey} className="space-y-3">
                                    <div className="flex items-center gap-2 py-1 px-3 bg-gray-100 rounded-full w-fit mx-[15px]">
                                        <div className="w-1.5 h-1.5 bg-blue-500 rounded-full shrink-0" />
                                        <span className="text-[10px] sm:text-xs font-black text-gray-600 uppercase tracking-widest">{dateKey} (星期{['日', '一', '二', '三', '四', '五', '六'][new Date(dateKey).getDay()]})</span>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mx-[15px]">
                                        {groupedRecords[dateKey].map(record => {
                                            const isSelected = selectedIds.includes(record.saleId);
                                            return (
                                                <div
                                                    key={record.saleId}
                                                    onClick={() => onToggleSelect(record.saleId)}
                                                    className={`group relative p-3 sm:p-4 rounded-xl sm:rounded-2xl border transition-all cursor-pointer ${isSelected ? 'bg-blue-600 border-blue-600 shadow-lg text-white scale-[1.02]' : 'bg-white border-gray-100 hover:border-blue-200 shadow-sm'}`}
                                                >
                                                    <div className="flex justify-between items-start mb-2">
                                                        <h4 className="font-black truncate text-sm sm:text-base max-w-[150px]">{record.customer}</h4>
                                                        <div className={`px-1.5 py-0.5 rounded text-[9px] font-black ${isSelected ? 'bg-white/20' : 'bg-gray-100 text-gray-400'}`}>
                                                            {new Date(record.date).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-3 text-[9px] sm:text-[10px] opacity-80 font-bold">
                                                        <span className="flex items-center gap-1"><CreditCard size={10} /> {record.paymentMethod === 'CASH' ? '現金' : '賒銷'}</span>
                                                        <span className="flex items-center gap-1"><Package size={10} /> {record.salesData.length} 品項</span>
                                                    </div>
                                                    <div className="mt-2 sm:mt-3 pt-2 border-t border-current/10 flex justify-between items-baseline">
                                                        <span className="text-[9px] sm:text-[10px] uppercase tracking-widest opacity-60">Total</span>
                                                        <span className="text-base sm:text-lg font-black font-mono">${(record.totalAmount ?? 0).toLocaleString()}</span>
                                                    </div>
                                                    {isSelected && <CheckCircle2 className="absolute top-2 right-2 opacity-20" size={32} />}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

                {/* Footer Section */}
                <div className="p-4 sm:p-6 bg-white border-t border-gray-100 flex flex-col sm:flex-row justify-between items-center gap-3 shrink-0">
                    <div className="flex items-center gap-3">
                        {selectedIds.length > 0 && (
                            <div className="px-3 py-1.5 sm:px-4 sm:py-2 bg-blue-50 text-blue-600 rounded-lg sm:rounded-xl border border-blue-100 font-black text-[10px] sm:text-xs">
                                已選 {selectedIds.length} 筆單據
                            </div>
                        )}
                    </div>

                    <div className="flex items-center justify-between w-full sm:w-auto gap-3">
                        {selectedIds.length > 0 && (
                            <button onClick={() => onToggleSelect(null)} className="p-2 sm:p-3 bg-gray-50 rounded-lg text-gray-400 hover:text-red-500 transition-colors shrink-0">
                                <Trash2 size={16} />
                            </button>
                        )}
                        <button
                            onClick={() => onMergePrint(null, aiCustomer, printDate)}
                            disabled={isPrinting || selectedIds.length === 0}
                            className={`w-full sm:w-auto px-4 sm:px-8 h-10 sm:h-12 rounded-lg sm:rounded-xl font-black text-xs sm:text-sm flex items-center justify-center gap-2 transition-all ${isPrinting || selectedIds.length === 0 ? 'bg-gray-100 text-gray-300' : 'bg-gray-900 text-white hover:bg-black shadow-lg shadow-gray-200'}`}
                        >
                            {isPrinting ? <span className="animate-spin">🌀</span> : <Printer size={16} />}
                            <span>普通合併列印</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* 2. Customer Schedule Settings Sub-Modal */}
            {showScheduleMgr && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl h-[80vh] flex flex-col border border-gray-100 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                        {/* Header */}
                        <div className="p-6 bg-gray-50 border-b border-gray-100 flex items-center justify-between shrink-0">
                            <div>
                                <h3 className="text-lg font-black text-gray-900">地點送貨排程管理後台</h3>
                                <p className="text-xs text-gray-400 mt-1">手動設定每個地點是否啟用 AI 智慧預測，以及星期幾送貨的排程規則。</p>
                            </div>
                            <button
                                onClick={() => {
                                    setShowScheduleMgr(false);
                                    setSearchCustQuery('');
                                    setEditingCustomers({});
                                }}
                                className="p-2 hover:bg-gray-200 rounded-full text-gray-400 hover:text-gray-600 transition-colors"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Search & Filter bar */}
                        <div className="p-4 border-b border-gray-100 flex gap-4 shrink-0">
                            <input
                                type="text"
                                placeholder="🔍 輸入關鍵字搜尋地點名稱..."
                                value={searchCustQuery}
                                onChange={(e) => setSearchCustQuery(e.target.value)}
                                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-bold text-gray-700 placeholder-gray-400 outline-none focus:border-blue-400 focus:bg-white transition-all"
                            />
                        </div>

                        {/* Table / List area */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-3">
                            <div className="grid grid-cols-12 gap-3 text-[10px] font-black text-gray-400 uppercase tracking-widest px-4 mb-2">
                                <div className="col-span-4">地點名稱</div>
                                <div className="col-span-2 text-center">AI 預測開關</div>
                                <div className="col-span-4 text-center">星期送貨排程</div>
                                <div className="col-span-2 text-center">操作</div>
                            </div>

                            {systemCustomers
                                .filter(c => {
                                    const name = typeof c === 'string' ? c : c.name;
                                    return name.toLowerCase().includes(searchCustQuery.toLowerCase());
                                })
                                .map(c => {
                                    const name = typeof c === 'string' ? c : c.name;
                                    const setting = getCustSetting(name);
                                    
                                    const orig = systemCustomers.find(sc => (typeof sc === 'string' ? sc : sc.name) === name) || {};
                                    const origSchedule = orig.schedule || [0,1,2,3,4,5,6];
                                    const origAiEnabled = orig.isAiEnabled !== false;
                                    
                                    const isModified = 
                                        setting.isAiEnabled !== origAiEnabled ||
                                        JSON.stringify(setting.schedule.slice().sort()) !== JSON.stringify(origSchedule.slice().sort());

                                    return (
                                        <div key={name} className={`grid grid-cols-12 gap-3 items-center p-3 rounded-2xl border transition-all ${isModified ? 'bg-blue-50/20 border-blue-200 shadow-sm' : 'bg-white border-gray-100 hover:border-gray-200'}`}>
                                            {/* Location Name */}
                                            <div className="col-span-4 font-black text-sm text-gray-800 truncate" title={name}>
                                                {name}
                                            </div>

                                            {/* AI Switch */}
                                            <div className="col-span-2 flex justify-center">
                                                <button
                                                    type="button"
                                                    onClick={() => handleEditCust(name, 'isAiEnabled', !setting.isAiEnabled)}
                                                    className={`px-3 py-1.5 rounded-xl font-black text-xs transition-all ${setting.isAiEnabled ? 'bg-emerald-500 text-white shadow-sm' : 'bg-gray-100 text-gray-400'}`}
                                                >
                                                    {setting.isAiEnabled ? 'ON 啟用' : 'OFF 關閉'}
                                                </button>
                                            </div>

                                            {/* Weekly Schedule */}
                                            <div className="col-span-4 flex justify-center gap-1">
                                                {['日', '一', '二', '三', '四', '五', '六'].map((day, idx) => {
                                                    const isChecked = setting.schedule.includes(idx);
                                                    return (
                                                        <button
                                                            key={idx}
                                                            type="button"
                                                            onClick={() => {
                                                                const newSchedule = isChecked
                                                                    ? setting.schedule.filter(d => d !== idx)
                                                                    : [...setting.schedule, idx];
                                                                handleEditCust(name, 'schedule', newSchedule);
                                                            }}
                                                            className={`w-7 h-7 rounded-lg font-black text-xs transition-all ${isChecked ? 'bg-blue-600 text-white shadow-sm' : 'bg-gray-50 text-gray-300 hover:text-gray-500'}`}
                                                        >
                                                            {day}
                                                        </button>
                                                    );
                                                })}
                                            </div>

                                            {/* Save Button */}
                                            <div className="col-span-2 flex justify-center">
                                                <button
                                                    type="button"
                                                    disabled={!isModified || setting.isSaving}
                                                    onClick={() => handleSaveCust(name)}
                                                    className={`w-full py-2 rounded-xl font-black text-xs flex items-center justify-center gap-1 transition-all ${setting.isSaving ? 'bg-gray-100 text-gray-300' : isModified ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-md shadow-blue-100 active:scale-95' : 'bg-gray-50 text-gray-300 pointer-events-none'}`}
                                                >
                                                    {setting.isSaving ? (
                                                        <span className="w-3.5 h-3.5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                                                    ) : (
                                                        <span>儲存設定</span>
                                                    )}
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                        </div>
                    </div>
                </div>
            )}

            {/* 3. Product Rules Settings Sub-Modal */}
            {showProductRuleMgr && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl h-[80vh] flex flex-col border border-gray-100 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                        {/* Header */}
                        <div className="p-6 bg-gray-50 border-b border-gray-100 flex items-center justify-between shrink-0">
                            <div>
                                <h3 className="text-lg font-black text-gray-900">商品預估與箱數規格管理後台</h3>
                                <p className="text-xs text-gray-400 mt-1">手動設定每個商品的包裝箱數、發貨階梯規格、智慧抑制門檻，用來微調 AI 生成補貨時的進位標準。</p>
                            </div>
                            <button
                                onClick={() => {
                                    setShowProductRuleMgr(false);
                                    setSearchProductQuery('');
                                    setMgrProducts([]);
                                }}
                                className="p-2 hover:bg-gray-200 rounded-full text-gray-400 hover:text-gray-600 transition-colors"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Search & Filter bar */}
                        <div className="p-4 border-b border-gray-100 flex items-center justify-between gap-4 shrink-0">
                            <input
                                type="text"
                                placeholder="🔍 輸入商品名稱搜尋..."
                                value={searchProductQuery}
                                onChange={(e) => setSearchProductQuery(e.target.value)}
                                className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-bold text-gray-700 placeholder-gray-400 outline-none focus:border-blue-400 focus:bg-white transition-all"
                            />
                            {mgrProducts.some(p => p._dirty) && (
                                <button
                                    onClick={handleSaveAllProductRules}
                                    disabled={isSavingAll}
                                    className={`shrink-0 px-6 py-2.5 rounded-xl font-black text-xs sm:text-sm flex items-center gap-2 shadow-lg transition-all active:scale-95 ${isSavingAll ? 'bg-gray-100 text-gray-400 cursor-not-allowed shadow-none' : 'bg-gradient-to-r from-blue-600 to-indigo-700 text-white hover:brightness-110 shadow-blue-100'}`}
                                >
                                    {isSavingAll ? (
                                        <>
                                            <span className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                                            <span>{saveAllProgress}</span>
                                        </>
                                    ) : (
                                        <>
                                            <span>💾 一鍵儲存所有修改 ({mgrProducts.filter(p => p._dirty).length})</span>
                                        </>
                                    )}
                                </button>
                            )}
                        </div>

                        {/* Table / List area */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-4">
                            {loadingProducts ? (
                                <div className="flex flex-col items-center justify-center py-20 gap-3 text-gray-400">
                                    <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
                                    <span>商品載入中...</span>
                                </div>
                            ) : mgrProducts.length === 0 ? (
                                <div className="text-center py-20 text-gray-400">無符合的商品資料</div>
                            ) : (
                                mgrProducts
                                    .filter(p => p.name.toLowerCase().includes(searchProductQuery.toLowerCase()))
                                    .map(product => {
                                        const stepsVal = Array.isArray(product.dispatchSteps)
                                            ? product.dispatchSteps.join(', ')
                                            : product.dispatchSteps || '';

                                        return (
                                            <div key={product.id} className={`p-4 rounded-2xl border transition-all ${product._dirty ? 'bg-blue-50/20 border-blue-200 shadow-sm' : 'bg-white border-gray-100 hover:border-gray-200'}`}>
                                                {/* Grid Layout */}
                                                <div className="grid grid-cols-12 gap-4 items-center">
                                                    {/* Product Name */}
                                                    <div className="col-span-3">
                                                        <div className="font-black text-sm text-gray-800 truncate" title={product.name}>
                                                            {product.name}
                                                        </div>
                                                        <div className="text-[10px] text-gray-400 font-mono mt-0.5">ID: {product.id}</div>
                                                    </div>

                                                    {/* Pack Size & Steps */}
                                                    <div className="col-span-4 grid grid-cols-2 gap-2 text-xs">
                                                        <div className="flex flex-col gap-1">
                                                            <span className="text-[9px] text-gray-400 font-black">整箱規格</span>
                                                            <input
                                                                type="number"
                                                                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 font-bold outline-none focus:border-blue-400 focus:bg-white"
                                                                value={product.packSize || 1}
                                                                onChange={(e) => handleEditProductField(product.id, 'packSize', e.target.value !== '' ? Number(e.target.value) : 1)}
                                                            />
                                                        </div>
                                                        <div className="flex flex-col gap-1">
                                                            <span className="text-[9px] text-gray-400 font-black">發貨階梯 (以逗號分隔)</span>
                                                            <input
                                                                type="text"
                                                                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 font-bold outline-none focus:border-blue-400 focus:bg-white"
                                                                placeholder="例: 24, 48"
                                                                value={stepsVal}
                                                                onChange={(e) => handleEditProductField(product.id, 'dispatchSteps', e.target.value)}
                                                            />
                                                        </div>
                                                    </div>

                                                    {/* Threshold & Max Limit */}
                                                    <div className="col-span-3 grid grid-cols-2 gap-2 text-xs">
                                                        <div className="flex flex-col gap-1">
                                                            <span className="text-[9px] text-gray-400 font-black">進位門檻 (尾數多於此)</span>
                                                            <input
                                                                type="number"
                                                                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 font-bold outline-none focus:border-blue-400 focus:bg-white"
                                                                value={product.roundThreshold !== undefined ? product.roundThreshold : 99}
                                                                onChange={(e) => handleEditProductField(product.id, 'roundThreshold', e.target.value !== '' ? Number(e.target.value) : 99)}
                                                            />
                                                        </div>
                                                        <div className="flex flex-col gap-1">
                                                            <span className="text-[9px] text-gray-400 font-black">智慧抑制</span>
                                                            <div className="h-[34px] flex items-center justify-center bg-gray-50 border border-gray-200 rounded-lg">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={!!product.autoSuppress}
                                                                    onChange={(e) => handleEditProductField(product.id, 'autoSuppress', e.target.checked)}
                                                                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                                                />
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Save Button */}
                                                    <div className="col-span-2">
                                                        <button
                                                            type="button"
                                                            disabled={!product._dirty || savingProductId === product.id}
                                                            onClick={() => handleSaveProductRule(product)}
                                                            className={`w-full py-2.5 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 transition-all ${product._dirty ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-md shadow-blue-100 active:scale-95' : 'bg-gray-50 text-gray-300 pointer-events-none'}`}
                                                        >
                                                            {savingProductId === product.id ? (
                                                                <span className="w-3.5 h-3.5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                                                            ) : (
                                                                <span>儲存規則</span>
                                                            )}
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
