import React, { useState, useEffect } from 'react';
import { Calendar, Clock, X, CheckCircle2, AlertCircle } from 'lucide-react';
import { callGAS } from '../utils/api';

export default function EditSaleDateModal({
    isOpen,
    onClose,
    sale,
    user,
    apiUrl,
    onSuccess
}) {
    const [dateStr, setDateStr] = useState('');
    const [timeStr, setTimeStr] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState(null);

    useEffect(() => {
        if (isOpen && sale?.date) {
            const dt = new Date(sale.date);
            if (!isNaN(dt.getTime())) {
                const yyyy = dt.getFullYear();
                const mm = String(dt.getMonth() + 1).padStart(2, '0');
                const dd = String(dt.getDate()).padStart(2, '0');
                setDateStr(`${yyyy}-${mm}-${dd}`);

                const hh = String(dt.getHours()).padStart(2, '0');
                const min = String(dt.getMinutes()).padStart(2, '0');
                setTimeStr(`${hh}:${min}`);
            }
            setErrorMsg(null);
        }
    }, [isOpen, sale]);

    if (!isOpen || !sale) return null;

    const handleSave = async (e) => {
        e.preventDefault();
        if (!dateStr || !timeStr) {
            setErrorMsg('請完整選擇日期與時間');
            return;
        }

        const newDateTimeIso = new Date(`${dateStr}T${timeStr}:00`).toISOString();
        setIsLoading(true);
        setErrorMsg(null);

        try {
            const res = await callGAS(apiUrl, 'updateSaleDate', {
                saleId: sale.saleId || sale.id,
                newDate: newDateTimeIso
            }, user?.token);

            if (res?.success) {
                alert(`✅ 成功將【${sale.customer || '銷貨單'}】日期修正為：${dateStr} ${timeStr}`);
                if (onSuccess) {
                    onSuccess({
                        ...sale,
                        date: newDateTimeIso
                    });
                }
                onClose();
            } else {
                setErrorMsg(res?.error || '修改失敗，請稍後再試');
            }
        } catch (err) {
            console.error('Failed to update sale date:', err);
            setErrorMsg(err.message || '連線錯誤');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md border border-gray-100 overflow-hidden animate-in zoom-in-95 duration-200">
                {/* Modal Header */}
                <div className="p-5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="p-2 bg-white/20 rounded-xl backdrop-blur-md">
                            <Calendar size={18} />
                        </div>
                        <div>
                            <h3 className="font-bold text-base">修正銷貨日期</h3>
                            <p className="text-[11px] opacity-80">{sale.customer ? `單據對象：${sale.customer}` : `單號：${sale.saleId}`}</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 hover:bg-white/20 rounded-full transition-colors text-white/80 hover:text-white"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Modal Form */}
                <form onSubmit={handleSave} className="p-6 space-y-4">
                    {errorMsg && (
                        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 text-xs font-bold flex items-center gap-2">
                            <AlertCircle size={16} className="shrink-0" />
                            <span>{errorMsg}</span>
                        </div>
                    )}

                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-gray-700 flex items-center gap-1.5">
                            <Calendar size={14} className="text-blue-500" /> 選擇新日期
                        </label>
                        <input
                            type="date"
                            value={dateStr}
                            onChange={(e) => setDateStr(e.target.value)}
                            required
                            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm font-bold text-gray-800 outline-none focus:border-blue-500 focus:bg-white transition-all shadow-inner"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-gray-700 flex items-center gap-1.5">
                            <Clock size={14} className="text-blue-500" /> 選擇時間
                        </label>
                        <input
                            type="time"
                            value={timeStr}
                            onChange={(e) => setTimeStr(e.target.value)}
                            required
                            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm font-bold text-gray-800 outline-none focus:border-blue-500 focus:bg-white transition-all shadow-inner"
                        />
                    </div>

                    <div className="pt-3 flex items-center gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-xs font-bold text-gray-600 hover:bg-gray-50 active:scale-95 transition-all"
                        >
                            取消
                        </button>
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-200 active:scale-95 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                        >
                            {isLoading ? (
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                                <>
                                    <CheckCircle2 size={14} />
                                    <span>確認儲存</span>
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
