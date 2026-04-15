import React, { useState, useEffect } from 'react';
import { ListOrdered, Printer, Clock, CreditCard, Package, X, Trash2, CheckCircle2, Sparkles, Sun, CloudRain, MapPin, Calendar, ChevronDown } from 'lucide-react';
import { callGAS } from '../utils/api';

const apiUrl = import.meta.env.VITE_GAS_API_URL;

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
    systemCustomers = [] // [New] 全系統客戶名單
}) {
    const [aiCustomer, setAiCustomer] = useState('');
    const [aiWeather, setAiWeather] = useState('SUNNY');
    const [aiDayOfWeek, setAiDayOfWeek] = useState(new Date(endDate).getDay());
    const [printDate, setPrintDate] = useState(new Date().toISOString().split('T')[0]);
    const [isAiLoading, setIsAiLoading] = useState(false);
    const [aiMessage, setAiMessage] = useState(null);

    // [New] 自動推算當前日期的星期幾
    const getDOWString = (dateStr) => {
        if (!dateStr) return '';
        const days = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
        return days[new Date(dateStr).getDay()];
    };

    const setQuickPrintDate = (offset) => {
        const d = new Date();
        d.setDate(d.getDate() + offset);
        setPrintDate(d.toISOString().split('T')[0]);
        // [智慧連動] 如果設為明天，通常預估星期也會想看明天
        if (offset === 1) setAiDayOfWeek(d.getDay());
        // 如果設為今天，預估星期通常是看今天
        if (offset === 0) setAiDayOfWeek(d.getDay());
    };

    const targetDOW = getDOWString(endDate);

    // [New] 自動從選中的單據中抓取客戶名稱作為預設
    useEffect(() => {
        if (show && selectedIds.length > 0 && !aiCustomer) {
            const firstRecord = records.find(r => r.saleId === selectedIds[0]);
            if (firstRecord) setAiCustomer(firstRecord.customer);
        }
    }, [show, selectedIds, records, aiCustomer]);

    // [New] 當結束日期改變時，同步更新 AI 預測的星期 (除非使用者手動改過，這邊簡化處理為直接同步)
    useEffect(() => {
        if (endDate) {
            setAiDayOfWeek(new Date(endDate).getDay());
        }
    }, [endDate]);

    if (!show) return null;

    // Group records by date
    const groupedRecords = records.reduce((groups, record) => {
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

        const selectedRecords = records.filter(r => selectedIds.includes(r.saleId));
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
            const userString = sessionStorage.getItem('inventory_user');
            const user = userString ? JSON.parse(userString) : null;
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
                onMergePrint(res.suggestions, aiCustomer, printDate);
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
                <div className="relative bg-white pt-6 pb-5 px-10 border-b border-gray-100 shrink-0">
                    <div className="absolute top-0 right-0 -mr-20 -mt-20 w-80 h-80 bg-blue-50/50 rounded-full blur-[80px] pointer-events-none" />
                    <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6">
                        <div className="flex items-center gap-5">
                            <div className="p-3.5 bg-gray-900 text-white rounded-2xl shadow-xl">
                                <ListOrdered size={24} strokeWidth={2.5} />
                            </div>
                            <div>
                                <h3 className="text-xl font-black tracking-tight text-gray-900">合併列印與補貨中心</h3>
                                <div className="flex items-center gap-3 mt-1.5">
                                    <div className="flex items-center gap-2 bg-gray-50/80 p-1 rounded-xl border border-gray-200 shadow-inner">
                                        <input type="date" value={startDate} onChange={(e) => onDateChange('start', e.target.value)} className="bg-transparent px-3 text-xs font-bold text-gray-700 outline-none" />
                                        <span className="text-gray-300 font-bold">~</span>
                                        <input type="date" value={endDate} onChange={(e) => onDateChange('end', e.target.value)} className="bg-transparent px-3 text-xs font-bold text-gray-700 outline-none" />
                                        <button onClick={onSearch} className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-1.5 rounded-lg text-xs font-black transition-all shadow-md active:scale-95">查詢訂單</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <button onClick={onClose} className="p-3 bg-gray-50 hover:bg-white hover:text-red-500 rounded-2xl border border-gray-200 text-gray-400 transition-all shadow-sm">
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* 2. AI Prediction Panel: Premium Dashboard Layout */}
                <div className="px-10 mt-6 shrink-0">
                    <div className="p-8 bg-gradient-to-br from-indigo-50/40 via-white to-blue-50/40 border border-blue-100 rounded-[2.5rem] shadow-sm relative overflow-hidden">
                        <div className="relative flex flex-col xl:flex-row items-stretch gap-10">
                            
                            {/* LEFT: Branding Side-anchor */}
                            <div className="flex flex-row xl:flex-col items-center justify-center gap-4 shrink-0 xl:w-48 border-b xl:border-b-0 xl:border-r border-blue-100 pb-8 xl:pb-0 xl:pr-10">
                                <div className="p-4 bg-blue-600 text-white rounded-[1.5rem] shadow-2xl shadow-blue-200/60">
                                    <Sparkles size={32} className="animate-pulse" />
                                </div>
                                <div className="text-center">
                                    <h4 className="font-black text-blue-900 text-base leading-tight">AI 補貨預測</h4>
                                    <p className="text-[10px] font-bold text-blue-400 uppercase tracking-[0.2em] mt-1.5">Smart Engine v2</p>
                                </div>
                            </div>

                            {/* RIGHT: Main Workspace */}
                            <div className="flex-1 flex flex-col gap-8">
                                {/* ROW 1: Logic Grid */}
                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                                    <div className="flex flex-col gap-3">
                                        <label className="text-[10px] font-black text-blue-400 uppercase tracking-widest flex items-center gap-2 px-1">
                                            <MapPin size={12} className="text-blue-500" /> 特定地點預測目標
                                        </label>
                                        <div className="relative bg-gray-50/50 p-1 rounded-2xl border-2 border-blue-100 flex items-center h-14">
                                            <select
                                                className="w-full bg-transparent appearance-none rounded-xl px-4 text-sm font-black text-blue-900 outline-none cursor-pointer"
                                                value={aiCustomer}
                                                onChange={(e) => setAiCustomer(e.target.value)}
                                            >
                                                <option value="">請點擊選取地點...</option>
                                                {systemCustomers.map(c => <option key={c} value={c}>{c}</option>)}
                                            </select>
                                            <div className="absolute right-5 pointer-events-none text-blue-300">
                                                <ChevronDown size={18} />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex flex-col gap-3">
                                        <label className="text-[10px] font-black text-blue-400 uppercase tracking-widest flex items-center gap-2 px-1">
                                            <CloudRain size={12} className="text-blue-500" /> 明日預計天氣
                                        </label>
                                        <div className="flex bg-gray-50/50 p-1 rounded-2xl border-2 border-blue-100 h-14">
                                            <button onClick={() => setAiWeather('SUNNY')} className={`flex-1 flex items-center justify-center gap-2 rounded-xl text-xs font-black transition-all ${aiWeather === 'SUNNY' ? 'bg-amber-500 text-white shadow-lg' : 'text-blue-300 hover:text-blue-400'}`}>
                                                <Sun size={18} /> 晴天
                                            </button>
                                            <button onClick={() => setAiWeather('RAINY')} className={`flex-1 flex items-center justify-center gap-2 rounded-xl text-xs font-black transition-all ${aiWeather === 'RAINY' ? 'bg-indigo-600 text-white shadow-lg' : 'text-blue-300 hover:text-blue-400'}`}>
                                                <CloudRain size={18} /> 雨天
                                            </button>
                                        </div>
                                    </div>

                                    <div className="flex flex-col gap-3">
                                        <label className="text-[10px] font-black text-blue-400 uppercase tracking-widest flex items-center gap-2 px-1">
                                            <Calendar size={12} className="text-blue-500" /> 歷史參考星期
                                        </label>
                                        <div className="grid grid-cols-7 gap-1 bg-gray-50/50 p-1 rounded-2xl border-2 border-blue-100 h-14">
                                            {['日', '一', '二', '三', '四', '五', '六'].map((day, idx) => (
                                                <button key={idx} onClick={() => setAiDayOfWeek(idx)} className={`w-full flex items-center justify-center rounded-lg text-[11px] font-black transition-all ${aiDayOfWeek === idx ? 'bg-blue-600 text-white shadow-md' : 'text-blue-300 hover:bg-white/50 hover:text-blue-500'}`}>
                                                    {day}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                {/* ROW 2: PDF Logic & Primary Action */}
                                <div className="flex flex-col lg:flex-row items-center justify-between gap-8 pt-8 border-t border-blue-50">
                                    <div className="flex flex-wrap items-center gap-6">
                                        <div className="flex items-center gap-3 shrink-0 mr-4">
                                            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl">
                                                <Clock size={20} />
                                            </div>
                                            <div>
                                                <h4 className="font-black text-gray-800 text-sm tracking-tight">PDF 單據顯示日期</h4>
                                                <p className="text-[9px] font-bold text-gray-400 uppercase mt-0.5 tracking-tighter">Document Date Setup</p>
                                            </div>
                                        </div>
                                        <div className="flex bg-white p-1 rounded-2xl border border-blue-100 shadow-sm">
                                            <button onClick={() => setQuickPrintDate(-1)} className="px-5 py-2 rounded-xl text-xs font-black text-blue-500 hover:bg-gray-50 transition-all">◀ 昨天</button>
                                            <button onClick={() => setQuickPrintDate(0)} className="px-5 py-2 rounded-xl text-xs font-black text-blue-500 hover:bg-gray-50 transition-all">今天</button>
                                            <button onClick={() => setQuickPrintDate(1)} className="px-5 py-2 rounded-xl text-xs font-black text-blue-500 hover:bg-gray-50 transition-all">明天 ▶</button>
                                        </div>
                                        <div className="relative">
                                            <input type="date" value={printDate} onChange={(e) => setPrintDate(e.target.value)} className="bg-white border-2 border-blue-100 rounded-2xl px-5 py-3 text-sm font-black text-blue-900 outline-none focus:border-blue-400 shadow-sm transition-all" />
                                        </div>
                                        <div className="px-5 py-3 bg-indigo-50 text-indigo-700 rounded-2xl text-[11px] font-black border border-indigo-100 flex items-center gap-2 shadow-sm">
                                            <Sparkles size={14} className="animate-pulse" /> {getDOWString(printDate)}
                                        </div>
                                    </div>

                                    <button
                                        onClick={handleAIReplenish}
                                        disabled={isAiLoading || !aiCustomer}
                                        className={`group relative flex items-center gap-5 px-10 py-5 rounded-[2rem] font-black transition-all duration-300 shadow-2xl active:scale-95 ${isAiLoading || !aiCustomer ? 'bg-gray-100 text-gray-400 cursor-not-allowed shadow-none' : 'bg-gradient-to-r from-blue-600 to-indigo-700 text-white hover:brightness-110 shadow-blue-200/50 text-lg sm:text-xl'}`}
                                    >
                                        {isAiLoading ? (
                                            <div className="w-6 h-6 border-3 border-white/30 border-t-white rounded-full animate-spin" />
                                        ) : (
                                            <div className="flex items-center gap-4 whitespace-nowrap">
                                                <div className="p-1.5 bg-white/20 rounded-lg shadow-inner group-hover:rotate-12 transition-transform">
                                                    <Sparkles size={22} />
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
                        <div className="mt-4 text-center py-2.5 bg-blue-50/50 border border-blue-100 rounded-2xl text-[11px] font-black text-blue-600 animate-in slide-in-from-top-2">
                            💡 {aiMessage.text}
                        </div>
                    )}
                </div>

                {/* Modal Body */}
                <div className="p-6 sm:p-8 overflow-y-auto flex-1 bg-gray-50/30">
                    {records.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-10 text-center opacity-50">
                            <ListOrdered size={40} className="mb-4" />
                            <h4 className="font-bold">請先點擊查詢載入資料</h4>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {sortedDates.map(dateKey => (
                                <div key={dateKey} className="space-y-3">
                                    <div className="flex items-center gap-2 py-1 px-4 bg-gray-100 rounded-full w-fit">
                                        <div className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
                                        <span className="text-xs font-black text-gray-600 uppercase tracking-widest">{dateKey} (星期{['日', '一', '二', '三', '四', '五', '六'][new Date(dateKey).getDay()]})</span>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                        {groupedRecords[dateKey].map(record => {
                                            const isSelected = selectedIds.includes(record.saleId);
                                            return (
                                                <div
                                                    key={record.saleId}
                                                    onClick={() => onToggleSelect(record.saleId)}
                                                    className={`group relative p-4 rounded-2xl border transition-all cursor-pointer ${isSelected ? 'bg-blue-600 border-blue-600 shadow-lg text-white scale-[1.02]' : 'bg-white border-gray-100 hover:border-blue-200 shadow-sm'}`}
                                                >
                                                    <div className="flex justify-between items-start mb-2">
                                                        <h4 className="font-black truncate max-w-[150px]">{record.customer}</h4>
                                                        <div className={`px-2 py-0.5 rounded text-[9px] font-black ${isSelected ? 'bg-white/20' : 'bg-gray-100 text-gray-400'}`}>
                                                            {new Date(record.date).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-3 text-[10px] opacity-80 font-bold">
                                                        <span className="flex items-center gap-1"><CreditCard size={12} /> {record.paymentMethod === 'CASH' ? '現金' : '賒銷'}</span>
                                                        <span className="flex items-center gap-1"><Package size={12} /> {record.salesData.length} 品項</span>
                                                    </div>
                                                    <div className="mt-3 pt-2 border-t border-current/10 flex justify-between items-baseline">
                                                        <span className="text-[10px] uppercase tracking-widest opacity-60">Total</span>
                                                        <span className="text-lg font-black font-mono">${record.totalAmount.toLocaleString()}</span>
                                                    </div>
                                                    {isSelected && <CheckCircle2 className="absolute top-2 right-2 opacity-20" size={40} />}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer Section */}
                <div className="p-6 bg-white border-t border-gray-100 flex flex-col sm:flex-row justify-between items-center gap-4 shrink-0">
                    <div className="flex items-center gap-3">
                        {selectedIds.length > 0 && (
                            <div className="px-4 py-2 bg-blue-50 text-blue-600 rounded-xl border border-blue-100 font-black text-xs">
                                已選 {selectedIds.length} 筆單據 (計算基礎)
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-3 w-full sm:w-auto">
                        {selectedIds.length > 0 && (
                            <button onClick={() => onToggleSelect(null)} className="p-3 text-gray-400 hover:text-red-500 transition-colors">
                                <Trash2 size={20} />
                            </button>
                        )}
                        <button
                            onClick={() => onMergePrint(null, null, printDate)}
                            disabled={isPrinting || selectedIds.length === 0}
                            className={`px-8 h-12 rounded-xl font-black text-sm flex items-center gap-2 transition-all ${isPrinting || selectedIds.length === 0 ? 'bg-gray-100 text-gray-300' : 'bg-gray-900 text-white hover:bg-black shadow-lg shadow-gray-200'}`}
                        >
                            {isPrinting ? <span className="animate-spin">🌀</span> : <Printer size={18} />}
                            <span>普通合併列印 (依現狀)</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
