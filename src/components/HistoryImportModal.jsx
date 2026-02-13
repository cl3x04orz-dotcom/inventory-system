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
                <div className="relative bg-white p-6 sm:p-8 text-gray-900 border-b border-gray-100 overflow-hidden shrink-0">
                    {/* Decorative Orb */}
                    <div className="absolute top-0 right-0 -mr-20 -mt-20 w-80 h-80 bg-emerald-50/50 rounded-full blur-[80px]" />

                    <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6">
                        <div className="flex items-start md:items-center gap-5">
                            <div className="p-3 sm:p-4 bg-gray-100 rounded-2xl border border-gray-200 shadow-sm shrink-0">
                                <RotateCcw size={32} strokeWidth={2.5} className="text-emerald-600 drop-shadow-sm" />
                            </div>
                            <div className="flex-1">
                                <h3 className="text-2xl sm:text-3xl font-black tracking-tight text-gray-800">導入前期退貨</h3>
                                <div className="flex flex-wrap items-center gap-3 mt-3">
                                    <p className="text-gray-500 text-sm font-medium whitespace-nowrap hidden sm:block">
                                        搜尋區間：
                                    </p>
                                    <div className="flex flex-wrap items-center gap-2 bg-gray-50 p-1.5 rounded-xl border border-gray-200">
                                        <div className="flex items-center gap-2 px-2">
                                            <Calendar size={16} className="text-gray-400" />
                                            <input
                                                type="date"
                                                value={startDate}
                                                onChange={(e) => onDateChange('start', e.target.value)}
                                                className="bg-transparent text-sm font-bold text-gray-700 outline-none w-32"
                                            />
                                        </div>
                                        <span className="text-gray-300 font-bold">~</span>
                                        <div className="flex items-center gap-2 px-2">
                                            <input
                                                type="date"
                                                value={endDate}
                                                onChange={(e) => onDateChange('end', e.target.value)}
                                                className="bg-transparent text-sm font-bold text-gray-700 outline-none w-32"
                                            />
                                        </div>
                                        <button
                                            onClick={onSearch}
                                            className="bg-emerald-600 text-white px-4 py-1.5 rounded-lg text-sm font-bold hover:bg-emerald-700 active:scale-95 transition-all shadow-sm shadow-emerald-200 whitespace-nowrap ml-2"
                                        >
                                            查詢
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="absolute top-0 right-0 md:static p-3 bg-gray-50 hover:bg-gray-100 rounded-full transition-all duration-300 active:scale-90 border border-gray-200 text-gray-400 hover:text-gray-600 shrink-0"
                        >
                            <X size={24} />
                        </button>
                    </div>
                </div>

                {/* Modal Body: List of Records */}
                <div className="p-6 sm:p-8 overflow-y-auto custom-scrollbar flex-1 bg-gray-50/30">
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center py-20 text-center">
                            <div className="w-10 h-10 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin mb-4" />
                            <p className="text-gray-400 font-bold">載入中...</p>
                        </div>
                    ) : records.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-center">
                            <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center mb-6 shadow-sm border border-gray-100">
                                <RotateCcw size={40} className="text-gray-200" />
                            </div>
                            <h4 className="text-xl font-bold text-gray-800">查無紀錄</h4>
                            <p className="text-gray-400 mt-2 max-w-xs mx-auto text-sm">請調整日期區間並重新查詢</p>
                        </div>
                    ) : (
                        <div className="space-y-8">
                            {sortedDates.map(dateKey => (
                                <div key={dateKey}>
                                    {/* Date Header */}
                                    <div className="flex items-center gap-3 mb-4 sticky top-0 bg-gray-50/95 backdrop-blur-sm z-20 py-2">
                                        <div className="h-8 w-1 bg-emerald-500 rounded-full"></div>
                                        <h4 className="text-lg font-black text-gray-700">{dateKey}</h4>
                                        <span className="text-xs font-bold bg-emerald-100 text-emerald-600 px-2 py-1 rounded-full">
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
                                                    className={`group relative p-5 rounded-[1.5rem] border transition-all duration-300 cursor-pointer overflow-hidden ${isSelected
                                                        ? 'bg-emerald-600 border-emerald-600 shadow-lg shadow-emerald-200 scale-[1.02]'
                                                        : 'bg-white border-gray-100 hover:border-emerald-300 hover:shadow-lg hover:shadow-gray-200/50 hover:-translate-y-1'
                                                        }`}
                                                >
                                                    {/* Selection Indicator */}
                                                    <div className={`absolute top-4 right-4 transition-all duration-300 ${isSelected ? 'scale-100 opacity-100' : 'scale-0 opacity-0'}`}>
                                                        <div className="bg-white text-emerald-600 rounded-full p-1 shadow-sm">
                                                            <CheckCircle2 size={20} className="fill-white stroke-emerald-600" />
                                                        </div>
                                                    </div>

                                                    <div className="relative z-10">
                                                        <div className="flex items-start justify-between mb-4">
                                                            <div className="flex items-center gap-3 min-w-0">
                                                                <div className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${isSelected ? 'bg-white border-white' : 'bg-transparent border-gray-200 group-hover:border-emerald-400'
                                                                    }`}>
                                                                    {isSelected && <div className="w-2 h-2 bg-emerald-600 rounded-full" />}
                                                                </div>
                                                                <h4 className={`text-lg font-black truncate transition-colors ${isSelected ? 'text-white' : 'text-gray-900'}`}>
                                                                    {record.customer}
                                                                </h4>
                                                            </div>
                                                            <div className={`flex items-center gap-1.5 text-[10px] font-black px-2 py-1 rounded-lg whitespace-nowrap transition-colors ${isSelected ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-400'
                                                                }`}>
                                                                <Clock size={12} strokeWidth={2.5} />
                                                                {new Date(record.date).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}
                                                            </div>
                                                        </div>

                                                        <div className="grid grid-cols-2 gap-2">
                                                            <div className={`p-2 rounded-xl border ${isSelected ? 'bg-white/10 border-white/20' : 'bg-gray-50 border-gray-100'}`}>
                                                                <div className={`text-xs font-bold mb-1 ${isSelected ? 'text-emerald-100' : 'text-gray-400'}`}>總退貨數</div>
                                                                <div className={`text-lg font-black ${isSelected ? 'text-white' : 'text-emerald-600'}`}>
                                                                    {totalReturns}
                                                                </div>
                                                            </div>
                                                            <div className={`p-2 rounded-xl border ${isSelected ? 'bg-white/10 border-white/20' : 'bg-gray-50 border-gray-100'}`}>
                                                                <div className={`text-xs font-bold mb-1 ${isSelected ? 'text-emerald-100' : 'text-gray-400'}`}>交易方式</div>
                                                                <div className={`text-lg font-black ${isSelected ? 'text-white' : record.paymentMethod === 'CASH' ? 'text-gray-700' : 'text-amber-500'}`}>
                                                                    {record.paymentMethod === 'CASH' ? '現金' : '賒銷'}
                                                                </div>
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
                <div className="p-8 sm:p-10 bg-white border-t border-gray-100 flex flex-col sm:flex-row justify-between items-center gap-6">
                    <div className="text-gray-400 text-sm font-bold italic">
                        {selectedIds.length > 0 ? `已選擇 ${selectedIds.length} 筆紀錄` : '請勾選紀錄以導入退貨量'}
                    </div>

                    <button
                        onClick={onImport}
                        disabled={selectedIds.length === 0}
                        className={`flex items-center justify-center gap-3 px-10 py-3 font-black rounded-2xl transition-all duration-500 h-14 flex-1 sm:flex-none active:scale-[0.98] shadow-2xl ${selectedIds.length === 0
                            ? 'bg-gray-100 text-gray-300 cursor-not-allowed shadow-none'
                            : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-200'
                            }`}
                    >
                        <Download size={22} strokeWidth={2.5} />
                        <span>確認導入</span>
                    </button>
                </div>
            </div>
        </div>
    );
}
