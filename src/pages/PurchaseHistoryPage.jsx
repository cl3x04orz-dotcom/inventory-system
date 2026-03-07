import React, { useState, useEffect } from 'react';
import { Search, Calendar, Filter, RefreshCw, ClipboardList, DollarSign, User, Truck, RotateCcw } from 'lucide-react';
import { callGAS } from '../utils/api';
import { getLocalDateString } from '../utils/constants';

export default function PurchaseHistoryPage({ user, apiUrl, setPage }) {
    const [records, setRecords] = useState([]);
    const [loading, setLoading] = useState(false);
    const [productSearch, setProductSearch] = useState('');
    const [vendorSearch, setVendorSearch] = useState('');
    const [operatorSearch, setOperatorSearch] = useState('');
    const [showVoided, setShowVoided] = useState(true);
    const [startDate, setStartDate] = useState(getLocalDateString());
    const [endDate, setEndDate] = useState(getLocalDateString());
    const [isVoiding, setIsVoiding] = useState(false);

    const fetchHistory = React.useCallback(async () => {
        setLoading(true);
        try {
            const data = await callGAS(apiUrl, 'getPurchaseHistory', {
                startDate,
                endDate
            }, user.token);

            if (Array.isArray(data)) {
                // console.log('Purchase History Data:', data); // Debug log
                setRecords(data);
            }
        } catch (error) {
            console.error('Failed to fetch purchase history:', error);
            // alert('獲取進貨歷史失敗: ' + error.message);
        } finally {
            setLoading(false);
        }
    }, [apiUrl, user.token, startDate, endDate]);

    useEffect(() => {
        fetchHistory();
    }, [fetchHistory]);

    const handleCorrection = async (id) => {
        if (!window.confirm('確定要「作廢並修正」此筆進貨嗎？\n系統將會：\n1. 作廢舊單並回補庫存\n2. 自動跳轉到進貨頁面填入舊資料\n3. 讓您修改後重新存檔')) return;

        setIsVoiding(true);
        try {
            const res = await callGAS(apiUrl, 'voidAndFetchPurchase', { id }, user.token);
            if (res.success && res.originalRecord) {
                sessionStorage.setItem('clonedPurchase', JSON.stringify(res.originalRecord));
                if (typeof setPage === 'function') {
                    setPage('purchase');
                } else {
                    // Fallback if setPage isn't passed (unlikely given current architecture)
                    window.location.reload();
                }
            } else {
                throw new Error(res.error || '無法作廢單據');
            }
        } catch (error) {
            console.error(error);
            alert('修正功能失敗: ' + error.message);
            setIsVoiding(false);
        }
    };

    const filtered = records.filter(r => {
        const pName = String(r.productName || '').toLowerCase();
        const vName = String(r.vendorName || r.vendor || '').toLowerCase();
        const oName = String(r.operator || '').toLowerCase();
        const pSearch = (productSearch || '').toLowerCase();
        const vSearch = (vendorSearch || '').toLowerCase();
        const oSearch = (operatorSearch || '').toLowerCase();
        const matchVoid = showVoided ? true : r.status !== 'VOID';

        return pName.includes(pSearch) && vName.includes(vSearch) && oName.includes(oSearch) && matchVoid;
    });

    const totalAmount = filtered.reduce((sum, r) => {
        if (r.status === 'VOID') return sum;
        return sum + (Number(r.totalPrice) || 0);
    }, 0);

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
                {/* Header & Stats */}
                {/* Header & Stats */}
                <div className="flex flex-row justify-between items-center mb-6 gap-2 md:gap-6">
                    <div>
                        <h1 className="text-xl md:text-2xl font-bold text-[var(--text-primary)] flex items-center gap-2">
                            <Truck className="text-[var(--accent-blue)] w-6 h-6 md:w-auto md:h-auto" />
                            <span className="whitespace-nowrap">進貨查詢</span>
                        </h1>
                        <p className="text-[var(--text-secondary)] text-xs md:text-sm mt-1 hidden md:block">查看完整的採購與入庫記錄</p>
                    </div>
                    <div className="px-3 md:px-5 py-2 md:py-3 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] flex items-center gap-2 md:gap-3">
                        <div className="p-1.5 md:p-2 rounded-full bg-[var(--bg-tertiary)] text-emerald-500">
                            <DollarSign size={16} className="md:w-5 md:h-5" />
                        </div>
                        <div>
                            <p className="text-[10px] md:text-xs text-[var(--text-secondary)] uppercase font-bold whitespace-nowrap">總進貨金額</p>
                            <p className="text-base md:text-xl font-bold text-emerald-500">
                                ${totalAmount.toLocaleString()}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Filters - Mobile View (Horizontal, No Border, mimics SalesPage/ReportPage) */}
                {/* Filters - Mobile View (Horizontal, No Border) */}
                <div className="md:hidden mb-6 space-y-3">
                    <div className="flex items-center gap-3">
                        <label className="text-sm font-bold text-[var(--text-secondary)] whitespace-nowrap w-[70px]">開始日期:</label>
                        <input
                            type="date"
                            className="input-field flex-1 py-1.5 px-3"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                        />
                    </div>
                    <div className="flex items-center gap-3">
                        <label className="text-sm font-bold text-[var(--text-secondary)] whitespace-nowrap w-[70px]">結束日期:</label>
                        <input
                            type="date"
                            className="input-field flex-1 py-1.5 px-3"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                        />
                    </div>
                    <div className="flex items-center gap-3">
                        <label className="text-sm font-bold text-[var(--text-secondary)] whitespace-nowrap w-[70px]">廠商名稱:</label>
                        <div className="relative flex-1">
                            <input
                                type="text"
                                placeholder="搜尋廠商..."
                                className="input-field w-full py-1.5 px-3"
                                value={vendorSearch}
                                onChange={(e) => setVendorSearch(e.target.value)}
                            />
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <label className="text-sm font-bold text-[var(--text-secondary)] whitespace-nowrap w-[70px]">產品名稱:</label>
                        <div className="relative flex-1">
                            <input
                                type="text"
                                placeholder="搜尋產品..."
                                className="input-field w-full py-1.5 px-3"
                                value={productSearch}
                                onChange={(e) => setProductSearch(e.target.value)}
                            />
                        </div>
                    </div>
                    <button
                        onClick={fetchHistory}
                        disabled={loading}
                        className="btn-secondary w-full py-2 flex items-center justify-center gap-2 mt-2"
                    >
                        {loading ? <div className="animate-spin w-4 h-4 border-2 border-slate-500 border-t-transparent rounded-full"></div> : <RefreshCw size={18} />}
                        查詢記錄
                    </button>
                </div>

                {/* Filters - Desktop View (Original Grid) */}
                <div className="hidden md:block mb-6 p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-primary)]">
                    <div className="flex flex-col md:flex-row gap-4 items-end">
                        <div className="flex-1 space-y-1.5 w-full">
                            <label className="text-[10px] text-[var(--text-secondary)] font-bold uppercase px-1">產品名稱</label>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" size={18} />
                                <input
                                    type="text"
                                    placeholder="搜尋產品..."
                                    className="input-field pl-10 w-full"
                                    value={productSearch}
                                    onChange={(e) => setProductSearch(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="flex-1 space-y-1.5 w-full">
                            <label className="text-[10px] text-[var(--text-secondary)] font-bold uppercase px-1">廠商名稱</label>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" size={18} />
                                <input
                                    type="text"
                                    placeholder="搜尋廠商..."
                                    className="input-field pl-10 w-full"
                                    value={vendorSearch}
                                    onChange={(e) => setVendorSearch(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="w-full md:w-40 space-y-1.5">
                            <label className="text-[10px] text-[var(--text-secondary)] font-bold uppercase px-1">開始日期</label>
                            <input
                                type="date"
                                className="input-field w-full text-sm"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                            />
                        </div>

                        <div className="w-full md:w-40 space-y-1.5">
                            <label className="text-[10px] text-[var(--text-secondary)] font-bold uppercase px-1">結束日期</label>
                            <input
                                type="date"
                                className="input-field w-full text-sm"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                            />
                        </div>

                        {/* Refresh Button removed for auto-search consistency */}

                        <div className="flex items-center gap-2 ml-auto">
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    className="sr-only peer"
                                    checked={showVoided}
                                    onChange={(e) => setShowVoided(e.target.checked)}
                                />
                                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                                <span className="ml-2 text-xs font-bold text-[var(--text-secondary)] uppercase">顯示作廢資料</span>
                            </label>
                        </div>
                    </div>
                </div>

                {/* Mobile Card View (Vertical Layout) */}
                <div className="md:hidden space-y-4">
                    {loading ? (
                        <div className="text-center py-10 text-[var(--text-secondary)]">載入中...</div>
                    ) : filtered.length > 0 ? (
                        filtered.map((record, idx) => (
                            <div key={idx} className={`bg-[var(--bg-secondary)] rounded-xl p-4 border border-[var(--border-primary)] shadow-sm space-y-3 ${record.status === 'VOID' ? 'opacity-50 saturate-50' : ''}`}>
                                {/* Header: Date & Total Price */}
                                <div className="flex justify-between items-start border-b border-[var(--border-primary)] pb-2">
                                    <div className="flex items-center gap-2 text-[var(--text-secondary)]">
                                        <Calendar size={14} className="text-[var(--accent-blue)]" />
                                        <span className="font-medium text-[var(--text-primary)]">
                                            {record.date ? new Date(record.date).toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' }) : '-'}
                                        </span>
                                        <span className="text-xs text-[var(--text-tertiary)]">
                                            {record.date ? new Date(record.date).toLocaleTimeString('zh-TW', { hour12: false, hour: '2-digit', minute: '2-digit' }) : ''}
                                        </span>
                                    </div>
                                    <div className="flex flex-col items-end gap-2">
                                        <div className="text-lg font-bold text-emerald-600 font-mono">
                                            ${(Number(record.totalPrice) || 0).toLocaleString()}
                                        </div>
                                        {record.status !== 'VOID' && (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleCorrection(record.id); }}
                                                className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-amber-500/10 text-amber-600 border border-amber-200 hover:bg-amber-100 transition-colors text-xs font-bold"
                                            >
                                                <RotateCcw size={12} /> 修正
                                            </button>
                                        )}
                                        {record.status === 'VOID' && (
                                            <span className="text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded font-bold">已作廢</span>
                                        )}
                                    </div>
                                </div>

                                {/* Content Grid */}
                                <div className="grid grid-cols-2 gap-y-3 gap-x-2 text-sm">
                                    <div className="col-span-2">
                                        <span className="text-xs text-[var(--text-tertiary)] block mb-0.5">廠商</span>
                                        <span className="font-medium text-[var(--text-primary)]">{record.vendorName || record.vendor || '-'}</span>
                                    </div>
                                    <div className="col-span-2">
                                        <span className="text-xs text-[var(--text-tertiary)] block mb-0.5">產品名稱</span>
                                        <span className="font-bold text-[var(--text-primary)] text-base">{record.productName}</span>
                                    </div>
                                    <div>
                                        <span className="text-xs text-[var(--text-tertiary)] block mb-0.5">數量</span>
                                        <span className="font-mono text-blue-500 font-bold">{record.quantity}</span>
                                    </div>
                                    <div>
                                        <span className="text-xs text-[var(--text-tertiary)] block mb-0.5">單價</span>
                                        <span className="font-mono text-[var(--text-secondary)]">${(Number(record.unitPrice) || 0).toLocaleString()}</span>
                                    </div>
                                </div>

                                {/* Footer: Expiry & Operator */}
                                <div className="pt-2 border-t border-[var(--border-primary)] flex justify-between items-center text-xs">
                                    <div className="flex items-center gap-1 text-[var(--text-tertiary)] bg-[var(--bg-tertiary)] px-2 py-1 rounded">
                                        <span>效期:</span>
                                        <span className="font-mono text-[var(--text-secondary)]">
                                            {record.expiry ? new Date(record.expiry).toLocaleDateString('zh-TW') : '-'}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-1 text-[var(--text-tertiary)]">
                                        <User size={12} />
                                        <span>{record.operator || '-'}</span>
                                    </div>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="text-center py-10 text-[var(--text-secondary)] bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-primary)]">
                            沒有找到進貨記錄
                        </div>
                    )}
                </div>

                {/* Desktop Table View */}
                <div className="hidden md:block rounded-xl border border-[var(--border-primary)] overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-[var(--bg-secondary)] text-[var(--text-secondary)] text-xs uppercase tracking-wider sticky top-0">
                                <tr>
                                    <th className="p-4">進貨日期</th>
                                    <th className="p-4">廠商</th>
                                    <th className="p-4">商品名稱</th>
                                    <th className="p-4 text-right">數量</th>
                                    <th className="p-4 text-right">單價</th>
                                    <th className="p-4 text-right">總價</th>
                                    <th className="p-4">效期</th>
                                    <th className="p-4">執行人</th>
                                    <th className="p-4 text-center">操作</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[var(--border-primary)] bg-[var(--bg-primary)]">
                                {loading ? (
                                    <tr><td colSpan="9" className="p-20 text-center text-[var(--text-secondary)]">載入中...</td></tr>
                                ) : filtered.length > 0 ? (
                                    filtered.map((record, idx) => (
                                        <tr key={idx} className={`hover:bg-[var(--bg-hover)] transition-colors group ${record.status === 'VOID' ? 'opacity-40 saturate-0 grayscale select-none' : ''}`}>
                                            <td className="p-4">
                                                <div className="flex items-center gap-2 text-[var(--text-secondary)]">
                                                    <Calendar size={14} className="text-[var(--text-tertiary)] group-hover:text-[var(--accent-blue)] transition-colors" />
                                                    <div className="flex flex-col">
                                                        <span className="font-medium text-[var(--text-secondary)]">{record.date ? new Date(record.date).toLocaleDateString('zh-TW') : '-'}</span>
                                                        <span className="text-xs text-[var(--text-tertiary)]">
                                                            {record.date ? new Date(record.date).toLocaleTimeString('zh-TW', { hour12: false, hour: '2-digit', minute: '2-digit' }) : ''}
                                                        </span>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="p-4 text-[var(--text-secondary)]">{record.vendorName || record.vendor || '-'}</td>
                                            <td className="p-4 font-medium text-[var(--text-primary)]">{record.productName}</td>
                                            <td className="p-4 text-right font-mono text-blue-500">{record.quantity}</td>
                                            <td className="p-4 text-right font-mono text-[var(--text-secondary)]">
                                                ${(Number(record.unitPrice) || 0).toLocaleString()}
                                            </td>
                                            <td className="p-4 text-right font-mono font-bold text-emerald-500">
                                                ${(Number(record.totalPrice) || 0).toLocaleString()}
                                            </td>
                                            <td className="p-4 text-[var(--text-tertiary)] text-xs">{record.expiry ? new Date(record.expiry).toLocaleDateString('zh-TW') : '-'}</td>
                                            <td className="p-4 text-[var(--text-tertiary)]">
                                                <div className="flex items-center gap-1">
                                                    <User size={12} /> {record.operator || '-'}
                                                </div>
                                            </td>
                                            <td className="p-4 text-center">
                                                {record.status !== 'VOID' ? (
                                                    <button
                                                        onClick={() => handleCorrection(record.id)}
                                                        className="p-2 rounded-lg bg-amber-50 text-amber-600 hover:bg-amber-100 transition-colors"
                                                        title="修正此單"
                                                    >
                                                        <RotateCcw size={16} />
                                                    </button>
                                                ) : (
                                                    <span className="text-[10px] bg-red-100 text-red-600 px-2 py-1 rounded font-bold uppercase">Void</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan="8" className="p-20 text-center">
                                            <div className="flex flex-col items-center gap-4">
                                                <Filter size={32} className="text-[var(--text-secondary)]" />
                                                <p className="text-[var(--text-secondary)]">沒有找到進貨記錄</p>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}
