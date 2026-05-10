import React from 'react';
import { ListOrdered, Download, Clock, CreditCard, Package, X, RotateCcw, CheckCircle2, Calendar } from 'lucide-react';

export default function HistoryImportModal({
    show,
    onClose,
    records,
    selectedIds = [],
    onToggleSelect,
    onImport,
    startDate,
    endDate,
    onDateChange,
    onSearch,
    isLoading
}) {
    if (!show) return null;

    // Group records by date
    const groupedRecords = records.reduce((groups, record) => {
        const dateParams = new Date(record.date);
        const dateKey = dateParams.toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' });
        if (!groups[dateKey]) groups[dateKey] = [];
        groups[dateKey].push(record);
        return groups;
    }, {});

    const sortedDates = Object.keys(groupedRecords).sort((a, b) => new Date(b) - new Date(a));

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 transition-all duration-300">
            {/* Soft Backdrop */}
            <div
                className="absolute inset-0 bg-white/60 backdrop-blur-[12px] transition-opacity duration-300"
                onClick={onClose}
            />

            {/* Modal Container */}
            <div className="relative w-full max-w-5xl bg-white rounded-[2.5rem] shadow-[0_40px_100px_-20px_rgba(0,0,0,0.1)] border border-gray-100 overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in duration-500 ease-out">

                {/* Header Section */}
                <div className="relative bg-white p-4 sm:p-5 text-gray-900 border-b border-gray-100 overflow-hidden shrink-0">
                    <div className="relative flex flex-col w-full">
                        <div className="flex items-center gap-3 w-full">
                            <div className="p-1.5 bg-gray-100 rounded-lg border border-gray-200 shadow-sm shrink-0">
                                <RotateCcw size={18} strokeWidth={2.5} className="text-emerald-600" />
                            </div>
                            <h3 className="text-lg sm:text-xl font-black tracking-tight text-gray-800 flex-1">導入前期退貨</h3>
                            <button
                                onClick={onClose}
                                className="p-1.5 bg-gray-50 hover:bg-gray-100 rounded-full transition-all duration-300 active:scale-90 border border-gray-200 text-gray-400 hover:text-gray-600 shrink-0"
                            >
                                <X size={18} />
                            </button>
                        </div>
                        {/* Search Bar */}
                        <div className="flex flex-nowrap items-center w-full bg-gray-50 p-1 rounded-lg border border-gray-200 mt-3">
                            <div className="flex items-center justify-center pl-2 pr-1 shrink-0">
                                <Calendar size={14} className="text-gray-400" />
                            </div>
                            <input
                                type="date"
                                value={startDate}
                                onChange={(e) => onDateChange('start', e.target.value)}
                                className="bg-transparent text-xs font-bold text-gray-700 outline-none w-full min-w-0"
                            />
                            <span className="text-gray-300 font-bold px-1 text-xs shrink-0">~</span>
                            <input
                                type="date"
                                value={endDate}
                                onChange={(e) => onDateChange('end', e.target.value)}
                                className="bg-transparent text-xs font-bold text-gray-700 outline-none w-full min-w-0"
                            />
                            <button
                                onClick={onSearch}
                                className="bg-emerald-600 text-white px-3 py-1.5 rounded text-xs font-bold hover:bg-emerald-700 active:scale-95 transition-all whitespace-nowrap shrink-0 ml-1"
                            >
                                查詢
                            </button>
                        </div>
                    </div>
                </div>

                {/* Modal Body: List of Records */}
                <div className="p-4 sm:p-5 overflow-y-auto custom-scrollbar flex-1 bg-gray-50/30">
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center py-10 text-center">
                            <div className="w-8 h-8 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin mb-3" />
                            <p className="text-gray-400 font-bold text-sm">載入中...</p>
                        </div>
                    ) : records.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-10 text-center">
                            <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mb-4 shadow-sm border border-gray-100">
                                <RotateCcw size={32} className="text-gray-200" />
                            </div>
                            <h4 className="text-lg font-bold text-gray-800">查無紀錄</h4>
                            <p className="text-gray-400 mt-1 max-w-xs mx-auto text-xs">請調整日期區間並重新查詢</p>
                        </div>
                    ) : (
                        <div className="space-y-8">
                            {sortedDates.map(dateKey => (
                                <div key={dateKey}>
                                    {/* Date Header */}
                                    <div className="flex items-center gap-2 mb-3 sticky top-0 bg-gray-50/95 backdrop-blur-sm z-20 py-1.5 border-b border-gray-100">
                                        <div className="h-5 w-1 bg-emerald-500 rounded-full"></div>
                                        <h4 className="text-sm font-black text-gray-700">{dateKey}</h4>
                                        <span className="text-[10px] font-bold bg-emerald-100 text-emerald-600 px-1.5 py-0.5 rounded-full">
                                            {groupedRecords[dateKey].length} 筆
                                        </span>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                        {groupedRecords[dateKey].map(record => {
                                            const isSelected = selectedIds.includes(record.saleId);
                                            // Calculate total returns for this record
                                            const totalReturns = record.salesData.reduce((sum, item) => sum + (Number(item.returns) || 0), 0);

                                            return (
                                                <div
                                                    key={record.saleId}
                                                    onClick={() => onToggleSelect(record.saleId)}
                                                    className={`group relative p-3 rounded-xl border transition-all duration-300 cursor-pointer overflow-hidden ${isSelected
                                                        ? 'bg-emerald-600 border-emerald-600 shadow-md shadow-emerald-200 scale-[1.02]'
                                                        : 'bg-white border-gray-100 hover:border-emerald-300 hover:shadow-md hover:shadow-gray-200/50 hover:-translate-y-0.5'
                                                        }`}
                                                >
                                                    {/* Selection Indicator */}
                                                    <div className={`absolute top-2 right-2 transition-all duration-300 ${isSelected ? 'scale-100 opacity-100' : 'scale-0 opacity-0'}`}>
                                                        <div className="bg-white text-emerald-600 rounded-full p-0.5 shadow-sm">
                                                            <CheckCircle2 size={16} className="fill-white stroke-emerald-600" />
                                                        </div>
                                                    </div>

                                                    <div className="relative z-10 flex flex-col gap-2">
                                                        <div className="flex items-center gap-2 min-w-0 pr-6">
                                                            <div className={`flex-shrink-0 w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all ${isSelected ? 'bg-white border-white' : 'bg-transparent border-gray-200 group-hover:border-emerald-400'}`}>
                                                                {isSelected && <div className="w-1.5 h-1.5 bg-emerald-600 rounded-full" />}
                                                            </div>
                                                            <h4 className={`text-sm font-black truncate transition-colors ${isSelected ? 'text-white' : 'text-gray-900'}`}>
                                                                {record.customer}
                                                            </h4>
                                                            <div className={`flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded ml-auto transition-colors ${isSelected ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'}`}>
                                                                <Clock size={10} strokeWidth={2.5} />
                                                                {new Date(record.date).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}
                                                            </div>
                                                        </div>

                                                        <div className="flex items-center gap-2">
                                                            <div className={`flex items-center justify-between flex-1 px-2 py-1.5 rounded-lg border ${isSelected ? 'bg-white/10 border-white/20' : 'bg-gray-50 border-gray-100'}`}>
                                                                <span className={`text-[10px] font-bold ${isSelected ? 'text-emerald-100' : 'text-gray-400'}`}>總退貨數</span>
                                                                <span className={`text-sm font-black ${isSelected ? 'text-white' : 'text-emerald-600'}`}>
                                                                    {totalReturns}
                                                                </span>
                                                            </div>
                                                            <div className={`flex items-center justify-between flex-1 px-2 py-1.5 rounded-lg border ${isSelected ? 'bg-white/10 border-white/20' : 'bg-gray-50 border-gray-100'}`}>
                                                                <span className={`text-[10px] font-bold ${isSelected ? 'text-emerald-100' : 'text-gray-400'}`}>交易方式</span>
                                                                <span className={`text-sm font-black ${isSelected ? 'text-white' : record.paymentMethod === 'CASH' ? 'text-gray-700' : 'text-amber-500'}`}>
                                                                    {record.paymentMethod === 'CASH' ? '現金' : '賒銷'}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
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
                <div className="p-4 sm:p-5 bg-white border-t border-gray-100 flex justify-between items-center gap-4 shrink-0">
                    <div className="text-gray-400 text-xs font-bold italic truncate flex-1">
                        {selectedIds.length > 0 ? `已選 ${selectedIds.length} 筆` : '請勾選紀錄'}
                    </div>

                    <button
                        onClick={onImport}
                        disabled={selectedIds.length === 0}
                        className={`flex items-center justify-center gap-2 px-6 py-2 text-sm font-black rounded-xl transition-all duration-300 active:scale-95 shadow-lg shrink-0 ${selectedIds.length === 0
                            ? 'bg-gray-100 text-gray-300 cursor-not-allowed shadow-none'
                            : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-200'
                            }`}
                    >
                        <Download size={16} strokeWidth={2.5} />
                        <span>確認導入</span>
                    </button>
                </div>
            </div>
        </div>
    );
}
