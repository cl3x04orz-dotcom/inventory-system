import React, { useState, useEffect } from 'react';
import { ListOrdered, Printer, Clock, CreditCard, Package, X, Trash2, CheckCircle2, Sparkles, Sun, CloudRain, MapPin, Calendar } from 'lucide-react';
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
    const [isAiLoading, setIsAiLoading] = useState(false);
    const [aiMessage, setAiMessage] = useState(null);

    // [New] 自動推算當前日期的星期幾
    const getDOWString = (dateStr) => {
        if (!dateStr) return '';
        const days = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
        return days[new Date(dateStr).getDay()];
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
        if (selectedRecords.length === 0) {
            alert('請先在下方勾選今日的單據，以計算目前車上剩餘量');
            return;
        }

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
                // 執行合併列印，並傳入 AI 建議的提貨量作為覆蓋值
                onMergePrint(res.suggestions);
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

            <div className="relative w-full max-w-5xl bg-white rounded-[2.5rem] shadow-[0_40px_100px_-20px_rgba(0,0,0,0.1)] border border-gray-100 overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in duration-500">

                {/* Header Section */}
                <div className="relative bg-white p-6 sm:p-8 border-b border-gray-100 shrink-0">
                    <div className="absolute top-0 right-0 -mr-20 -mt-20 w-80 h-80 bg-blue-50/50 rounded-full blur-[80px]" />
                    <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6">
                        <div className="flex items-start md:items-center gap-5">
                            <div className="p-3 sm:p-4 bg-gray-100 rounded-2xl border border-gray-200">
                                <ListOrdered size={32} strokeWidth={2.5} className="text-blue-600" />
                            </div>
                            <div>
                                <h3 className="text-2xl sm:text-3xl font-black tracking-tight text-gray-800">合併列印與補貨</h3>
                                <div className="flex flex-wrap items-center gap-3 mt-3">
                                    <div className="flex items-center gap-2 bg-gray-50 p-1.5 rounded-xl border border-gray-200">
                                        <input type="date" value={startDate} onChange={(e) => onDateChange('start', e.target.value)} className="bg-transparent text-sm font-bold outline-none" />
                                        <span className="text-gray-400">~</span>
                                        <input type="date" value={endDate} onChange={(e) => onDateChange('end', e.target.value)} className="bg-transparent text-sm font-bold outline-none" />
                                        <button onClick={onSearch} className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-sm font-bold">查詢</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <button onClick={onClose} className="p-3 bg-gray-50 hover:bg-gray-100 rounded-full border border-gray-200 text-gray-400">
                            <X size={24} />
                        </button>
                    </div>
                </div>

                {/* AI Prediction Panel */}
                <div className="mx-6 sm:mx-8 mb-4 p-5 bg-gradient-to-br from-indigo-50 to-blue-50 border border-blue-100 rounded-3xl shadow-sm">
                    <div className="flex flex-col lg:flex-row items-center gap-6">
                        <div className="flex items-center gap-3 shrink-0">
                            <div className="p-2.5 bg-blue-600 text-white rounded-xl shadow-lg animate-pulse">
                                <Sparkles size={24} />
                            </div>
                            <div>
                                <h4 className="font-black text-blue-900 leading-tight">AI 智慧補貨預測</h4>
                                <p className="text-[10px] font-bold text-blue-400 uppercase tracking-tighter">Smart Inventory Engine</p>
                            </div>
                        </div>

                        <div className="h-10 w-px bg-blue-200 hidden lg:block" />

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 flex-1 w-full">
                            {/* Target Selection */}
                            <div className="flex flex-col gap-1.5">
                                <label className="text-[10px] font-black text-blue-400 uppercase tracking-widest flex items-center gap-1">
                                    <MapPin size={10} /> 預測地點
                                </label>
                                <select
                                    className="bg-white border-2 border-blue-100 rounded-xl px-3 py-2 text-sm font-bold text-blue-900 outline-none focus:border-blue-300"
                                    value={aiCustomer}
                                    onChange={(e) => setAiCustomer(e.target.value)}
                                >
                                    <option value="">請選擇地點...</option>
                                    {systemCustomers.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>

                            {/* Weather Forecast */}
                            <div className="flex flex-col gap-1.5">
                                <label className="text-[10px] font-black text-blue-400 uppercase tracking-widest flex items-center gap-1">
                                    <CloudRain size={10} /> 預估明日天氣
                                </label>
                                <div className="flex bg-white/50 p-1 rounded-xl border border-blue-100">
                                    <button
                                        onClick={() => setAiWeather('SUNNY')}
                                        className={`flex-1 flex items-center justify-center gap-2 py-1.5 rounded-lg text-xs font-black transition-all ${aiWeather === 'SUNNY' ? 'bg-amber-500 text-white shadow-md' : 'text-blue-300 hover:text-blue-500'}`}
                                    >
                                        <Sun size={14} /> 晴天
                                    </button>
                                    <button
                                        onClick={() => setAiWeather('RAINY')}
                                        className={`flex-1 flex items-center justify-center gap-2 py-1.5 rounded-lg text-xs font-black transition-all ${aiWeather === 'RAINY' ? 'bg-indigo-600 text-white shadow-md' : 'text-blue-300 hover:text-blue-500'}`}
                                    >
                                        <CloudRain size={14} /> 雨天
                                    </button>
                                </div>
                            </div>

                            {/* DOW Selection */}
                            <div className="flex flex-col gap-1.5">
                                <label className="text-[10px] font-black text-blue-400 uppercase tracking-widest flex items-center gap-1">
                                    <Calendar size={10} /> 預測基準星期
                                </label>
                                <div className="grid grid-cols-7 gap-1 bg-white/50 p-1 rounded-xl border border-blue-100">
                                    {['日', '一', '二', '三', '四', '五', '六'].map((day, idx) => (
                                        <button
                                            key={idx}
                                            onClick={() => setAiDayOfWeek(idx)}
                                            className={`w-full py-1.5 rounded-lg text-xs font-black transition-all ${aiDayOfWeek === idx ? 'bg-blue-600 text-white shadow-md' : 'text-blue-300 hover:text-blue-500 hover:bg-white/50'}`}
                                        >
                                            {day}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <button
                            onClick={handleAIReplenish}
                            disabled={isAiLoading || !aiCustomer || selectedIds.length === 0}
                            className={`w-full lg:w-auto flex items-center justify-center gap-3 px-8 py-4 rounded-2xl font-black transition-all duration-300 shadow-xl active:scale-95 ${isAiLoading || !aiCustomer || selectedIds.length === 0 ? 'bg-gray-200 text-gray-400 cursor-not-allowed shadow-none' : 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:brightness-110 shadow-blue-200'}`}
                        >
                            {isAiLoading ? (
                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                                <Sparkles size={18} />
                            )}
                            <span>✨ AI 補貨生成</span>
                        </button>
                    </div>
                    {aiMessage && (
                        <div className="mt-3 text-center py-1.5 bg-white/40 rounded-lg text-[10px] font-bold text-blue-600 animate-in slide-in-from-top-1 border border-blue-50">
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
                            onClick={() => onMergePrint()}
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
