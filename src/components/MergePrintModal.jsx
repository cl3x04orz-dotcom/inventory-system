import React from 'react';
import { ListOrdered, Printer, Clock, CreditCard, Package, X, Trash2, CheckCircle2 } from 'lucide-react';

export default function MergePrintModal({
    show,
    onClose,
    records,
    selectedIds,
    onToggleSelect,
    onMergePrint,
    isPrinting
}) {
    if (!show) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 transition-all duration-300">
            {/* Soft Backdrop */}
            <div
                className="absolute inset-0 bg-white/60 backdrop-blur-[12px] transition-opacity duration-300"
                onClick={onClose}
            />

            {/* Modal Container: Clean Light Design */}
            <div className="relative w-full max-w-5xl bg-white rounded-[2.5rem] shadow-[0_40px_100px_-20px_rgba(0,0,0,0.1)] border border-gray-100 overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in duration-500 ease-out">

                {/* Header Section: Clean Premium Light Design */}
                <div className="relative bg-white p-8 sm:p-10 text-gray-900 border-b border-gray-100 overflow-hidden">
                    {/* Subtle Decorative Orb */}
                    <div className="absolute top-0 right-0 -mr-20 -mt-20 w-80 h-80 bg-blue-50/50 rounded-full blur-[80px]" />

                    <div className="relative flex items-center justify-between">
                        <div className="flex items-center gap-5">
                            <div className="p-4 bg-gray-100 rounded-2xl border border-gray-200 shadow-sm">
                                <ListOrdered size={36} strokeWidth={2.5} className="text-blue-600 drop-shadow-sm" />
                            </div>
                            <div>
                                <h3 className="text-3xl sm:text-4xl font-black tracking-tight text-gray-800">合併列印</h3>
                                <p className="text-gray-500 text-sm sm:text-base mt-1.5 font-medium">
                                    選擇多筆單據以合併輸出
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-3 bg-gray-50 hover:bg-gray-100 rounded-full transition-all duration-300 active:scale-90 border border-gray-200 text-gray-400 hover:text-gray-600"
                        >
                            <X size={26} />
                        </button>
                    </div>
                </div>

                {/* Modal Body: Grid of Records */}
                <div className="p-8 sm:p-10 overflow-y-auto custom-scrollbar flex-1 bg-gray-50/30">
                    {records.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-32 text-center">
                            <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center mb-8 shadow-sm border border-gray-100">
                                <ListOrdered size={48} className="text-gray-200" />
                            </div>
                            <h4 className="text-2xl font-bold text-gray-800">今天尚無銷售紀錄</h4>
                            <p className="text-gray-400 mt-3 max-w-xs mx-auto">一旦完成銷售登錄，這裡將會列出單據</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {records.map(record => {
                                const isSelected = selectedIds.includes(record.saleId);
                                return (
                                    <div
                                        key={record.saleId}
                                        onClick={() => onToggleSelect(record.saleId)}
                                        className={`group relative p-6 rounded-[2rem] border transition-all duration-500 cursor-pointer overflow-hidden ${isSelected
                                            ? 'bg-blue-600 border-blue-600 shadow-xl shadow-blue-200 -translate-y-1'
                                            : 'bg-gray-100 border-gray-100 hover:border-blue-300 hover:bg-white hover:shadow-xl hover:shadow-gray-200/50 hover:-translate-y-1'
                                            }`}
                                    >
                                        {/* Selection Indicator Background */}
                                        <div className={`absolute top-0 right-0 p-8 transition-opacity duration-500 ${isSelected ? 'opacity-10 scale-150 rotate-12 text-white' : 'opacity-0'}`}>
                                            <CheckCircle2 size={120} />
                                        </div>

                                        <div className="relative z-10">
                                            <div className="flex items-start justify-between mb-5">
                                                <div className="flex items-center gap-4 min-w-0">
                                                    <div className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${isSelected ? 'bg-white border-white' : 'bg-transparent border-gray-200 group-hover:border-blue-400'
                                                        }`}>
                                                        {isSelected && <div className="w-2.5 h-2.5 bg-blue-600 rounded-full" />}
                                                    </div>
                                                    <h4 className={`text-xl font-black truncate transition-colors ${isSelected ? 'text-white' : 'text-gray-900'}`}>
                                                        {record.customer}
                                                    </h4>
                                                </div>
                                                <div className={`flex items-center gap-2 text-[11px] font-black px-3 py-1.5 rounded-xl whitespace-nowrap transition-colors ${isSelected ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-400'
                                                    }`}>
                                                    <Clock size={14} strokeWidth={2.5} />
                                                    {new Date(record.date).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-1 gap-3">
                                                <div className="flex items-center justify-between">
                                                    <div className={`flex items-center gap-2 text-xs font-bold ${isSelected ? 'text-blue-50' : 'text-gray-400'}`}>
                                                        <CreditCard size={14} />
                                                        <span>付款</span>
                                                    </div>
                                                    <div className={`text-sm font-black transition-colors ${isSelected ? 'text-white' : record.paymentMethod === 'CASH' ? 'text-emerald-500' : 'text-amber-500'
                                                        }`}>
                                                        {record.paymentMethod === 'CASH' ? '現金' : '賒銷'}
                                                    </div>
                                                </div>

                                                <div className="flex items-center justify-between">
                                                    <div className={`flex items-center gap-2 text-xs font-bold ${isSelected ? 'text-blue-50' : 'text-gray-400'}`}>
                                                        <Package size={14} />
                                                        <span>品項</span>
                                                    </div>
                                                    <div className={`text-sm font-black transition-colors ${isSelected ? 'text-white' : 'text-blue-600'}`}>
                                                        {record.salesData.length} 項
                                                    </div>
                                                </div>

                                                <div className={`mt-2 h-px w-full ${isSelected ? 'bg-white/10' : 'bg-gray-50'}`} />

                                                <div className="flex items-center justify-between pt-1">
                                                    <span className={`text-[10px] font-black uppercase tracking-widest ${isSelected ? 'text-blue-200' : 'text-gray-300'}`}>Amount</span>
                                                    <span className={`text-2xl font-black font-mono transition-colors ${isSelected ? 'text-white' : 'text-gray-900'}`}>
                                                        ${record.totalAmount.toLocaleString()}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Footer Section: Clean Floating Bar */}
                <div className="p-8 sm:p-10 bg-white border-t border-gray-100 flex flex-col sm:flex-row justify-between items-center gap-6">
                    <div className="flex items-center gap-4">
                        {selectedIds.length > 0 ? (
                            <div className="flex items-center gap-3 pl-2 pr-5 py-2 bg-blue-50 text-blue-600 rounded-2xl border border-blue-100 transition-all animate-in slide-in-from-left-4">
                                <div className="p-2 bg-blue-600 text-white rounded-xl shadow-md shadow-blue-200">
                                    <ListOrdered size={20} />
                                </div>
                                <span className="font-black text-sm tracking-tight">已選擇 {selectedIds.length} 筆</span>
                            </div>
                        ) : (
                            <div className="px-6 py-3 text-gray-400 font-bold text-sm tracking-tight italic">
                                請勾選並開始合併...
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-4 w-full sm:w-auto">
                        {selectedIds.length > 0 && (
                            <button
                                onClick={() => onToggleSelect(null)}
                                className="flex items-center justify-center gap-2 px-6 py-3 font-bold rounded-2xl transition-all duration-300 h-14 flex-1 sm:flex-none text-gray-400 hover:text-red-500 hover:bg-red-50 active:scale-95"
                            >
                                <Trash2 size={20} />
                                <span>清除</span>
                            </button>
                        )}

                        <button
                            onClick={onMergePrint}
                            disabled={isPrinting || selectedIds.length === 0}
                            className={`flex items-center justify-center gap-3 px-10 py-3 font-black rounded-2xl transition-all duration-500 h-14 flex-1 sm:flex-none active:scale-[0.98] shadow-2xl ${isPrinting || selectedIds.length === 0
                                ? 'bg-gray-100 text-gray-300 cursor-not-allowed shadow-none'
                                : 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-200'
                                }`}
                        >
                            {isPrinting ? (
                                <>
                                    <div className="w-5 h-5 border-[3px] border-white/30 border-t-white rounded-full animate-spin" />
                                    <span>產出中</span>
                                </>
                            ) : (
                                <>
                                    <Printer size={22} strokeWidth={2.5} />
                                    <span>執行合併列印</span>
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
