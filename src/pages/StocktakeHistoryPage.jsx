import React, { useState, useEffect } from 'react';
import { Search, Calendar, AlertTriangle, CheckCircle, Filter, RefreshCw, ClipboardList } from 'lucide-react';
import { callGAS } from '../utils/api';
import { getLocalDateString } from '../utils/constants';

export default function StocktakeHistoryPage({ user, apiUrl }) {
    const [records, setRecords] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [diffOnly, setDiffOnly] = useState(true);

    // 預設當天
    const [startDate, setStartDate] = useState(getLocalDateString());
    const [endDate, setEndDate] = useState(getLocalDateString());

    const fetchHistory = React.useCallback(async () => {
        setLoading(true);
        try {
            const data = await callGAS(apiUrl, 'getStocktakeHistory', {
                startDate,
                endDate,
                productName: searchTerm,
                diffOnly
            }, user.token);

            if (Array.isArray(data)) {
                setRecords(data);
            }
        } catch (error) {
            console.error('Failed to fetch stocktake history:', error);
            // alert('獲取盤點歷史失敗: ' + error.message);
        } finally {
            setLoading(false);
        }
    }, [apiUrl, user.token, startDate, endDate, searchTerm, diffOnly]);

    useEffect(() => {
        fetchHistory();
    }, [fetchHistory]);

    // [Fix] 自動校正日期：當視窗回到焦點時，若日期仍停留在「昨天」且為單日查詢模式，自動更新為「今天」
    // 解決使用者過夜未關閉分頁，導致日期顯示舊資料的問題
    useEffect(() => {
        const checkAndFixDate = () => {
            if (document.hidden) return; // 只有在頁面可見時才執行

            const today = getLocalDateString();
            if (startDate === endDate && startDate !== today) {
                // 計算「昨天」的日期字串
                const d = new Date();
                d.setDate(d.getDate() - 1);
                const yesterday = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

                // 只有當日期剛好是「昨天」時才自動更新 (避免誤改使用者特意查詢的歷史日期)
                if (startDate === yesterday) {
                    console.log('Detected stale date (yesterday), auto-updating to today:', today);
                    setStartDate(today);
                    setEndDate(today);
                }
            }
        };

        window.addEventListener('focus', checkAndFixDate);
        document.addEventListener('visibilitychange', checkAndFixDate);

        return () => {
            window.removeEventListener('focus', checkAndFixDate);
            document.removeEventListener('visibilitychange', checkAndFixDate);
        };
    }, [startDate, endDate]);

    const filtered = records.filter(r =>
        String(r.productName || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    const totalRecords = filtered.length;
    const withDiff = filtered.filter(r => r.diff !== 0).length;
    const noDiff = filtered.filter(r => r.diff === 0).length;

    return (
        <div className="max-w-7xl mx-auto p-4 md:p-6 animate-in fade-in duration-500">
            <div className="glass-panel p-4 md:p-6 text-[var(--text-primary)]">
                {/* Header Section */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-6 border-b border-[var(--border-primary)] pb-6">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center shrink-0">
                            <ClipboardList className="text-blue-500" size={24} />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-[var(--text-primary)]">盤點歷史查詢</h1>
                            <p className="text-[var(--text-tertiary)] text-xs mt-0.5">查看過去的盤點記錄，追蹤差異與原因</p>
                        </div>
                    </div>

                    {/* Stats Integrated */}
                    <div className="grid grid-cols-3 gap-2 w-full md:w-auto md:flex md:gap-3">
                        <div className="px-3 py-2 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-primary)] flex flex-col items-center justify-center min-w-[80px]">
                            <p className="text-[10px] text-[var(--text-tertiary)] uppercase font-bold tracking-wider">總記錄</p>
                            <p className="text-lg font-bold text-[var(--text-primary)]">{totalRecords}</p>
                        </div>
                        <div className="px-3 py-2 rounded-xl bg-rose-50 border border-rose-100 flex flex-col items-center justify-center min-w-[80px]">
                            <p className="text-[10px] text-rose-500 uppercase font-bold tracking-wider">有差異</p>
                            <p className="text-lg font-bold text-rose-600">{withDiff}</p>
                        </div>
                        <div className="px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-100 flex flex-col items-center justify-center min-w-[80px]">
                            <p className="text-[10px] text-emerald-500 uppercase font-bold tracking-wider">無差異</p>
                            <p className="text-lg font-bold text-emerald-600">{noDiff}</p>
                        </div>
                    </div>
                </div>

                {/* Filters */}
                <div className="mb-6 p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-primary)]">
                    <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-12 gap-4 items-end">
                        <div className="md:col-span-2 lg:col-span-4 space-y-1.5 w-full">
                            <label className="text-[10px] text-[var(--text-tertiary)] font-bold uppercase px-1 tracking-wider">商品名稱</label>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" size={16} />
                                <input
                                    type="text"
                                    placeholder="搜尋商品..."
                                    className="input-field pl-10 w-full h-10"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="md:col-span-1 lg:col-span-2 space-y-1.5">
                            <label className="text-[10px] text-[var(--text-tertiary)] font-bold uppercase px-1 tracking-wider">開始日期</label>
                            <input
                                type="date"
                                className="input-field w-full h-10"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                            />
                        </div>

                        <div className="md:col-span-1 lg:col-span-2 space-y-1.5">
                            <label className="text-[10px] text-[var(--text-tertiary)] font-bold uppercase px-1 tracking-wider">結束日期</label>
                            <input
                                type="date"
                                className="input-field w-full h-10"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                            />
                        </div>

                        <div className="md:col-span-2 lg:col-span-3 flex items-center gap-2">
                            <label className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-primary)] cursor-pointer hover:bg-[var(--bg-hover)] transition-colors h-10">
                                <input
                                    type="checkbox"
                                    checked={diffOnly}
                                    onChange={(e) => setDiffOnly(e.target.checked)}
                                    className="w-4 h-4 rounded border-[var(--border-primary)] text-blue-500 focus:ring-blue-500"
                                />
                                <span className="text-[11px] text-[var(--text-secondary)] font-bold whitespace-nowrap">僅顯示差異</span>
                            </label>

                            <button
                                onClick={fetchHistory}
                                disabled={loading}
                                className="btn-secondary h-10 px-4 flex items-center gap-2 whitespace-nowrap"
                            >
                                <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> 刷新
                            </button>
                        </div>
                    </div>
                </div>

                {/* Table (Hidden on Mobile) */}
                <div className="hidden md:block rounded-xl border border-[var(--border-primary)] overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-[var(--bg-secondary)] text-[var(--text-tertiary)] text-[10px] uppercase tracking-wider sticky top-0 font-bold">
                                <tr>
                                    <th className="px-4 py-3">盤點日期</th>
                                    <th className="px-4 py-3">商品名稱</th>
                                    <th className="px-4 py-3 text-right">帳面/實盤</th>
                                    <th className="px-4 py-3 text-center">差異</th>
                                    <th className="px-4 py-3">差異原因/歸屬</th>
                                    <th className="px-4 py-3">執行人</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[var(--border-primary)] bg-[var(--bg-primary)]">
                                {loading ? (
                                    <tr>
                                        <td colSpan="6" className="p-20 text-center">
                                            <div className="flex flex-col items-center gap-2">
                                                <RefreshCw className="animate-spin text-blue-500" />
                                                <span className="text-[var(--text-tertiary)] text-sm">載入中...</span>
                                            </div>
                                        </td>
                                    </tr>
                                ) : filtered.length > 0 ? (
                                    filtered.map((record, idx) => (
                                        <tr key={idx} className={`hover:bg-[var(--bg-hover)] transition-colors group ${record.diff !== 0 ? 'bg-amber-50/30' : ''}`}>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-1.5 text-[var(--text-tertiary)] font-mono text-[11px]">
                                                    <Calendar size={10} />
                                                    {record.date}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 font-bold text-[var(--text-primary)]">{record.productName}</td>
                                            <td className="px-4 py-3 text-right">
                                                <div className="flex flex-col items-end gap-0.5">
                                                    <span className="text-[10px] text-[var(--text-tertiary)] font-mono">帳: {record.bookQty}</span>
                                                    <span className="text-sm text-blue-600 font-bold font-mono">實: {record.physicalQty}</span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                {record.diff === 0 ? (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 text-[10px] font-bold border border-emerald-100">
                                                        <CheckCircle size={10} /> 0
                                                    </span>
                                                ) : (
                                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${record.diff > 0
                                                        ? 'bg-blue-50 text-blue-600 border-blue-100'
                                                        : 'bg-rose-50 text-rose-600 border-rose-100'
                                                        }`}>
                                                        <AlertTriangle size={10} />
                                                        {record.diff > 0 ? `+${record.diff}` : record.diff}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex flex-col gap-0.5 max-w-[150px]">
                                                    <p className="text-[11px] text-[var(--text-secondary)] truncate" title={record.reason}>{record.reason || '-'}</p>
                                                    <p className="text-[10px] text-[var(--text-tertiary)] font-bold">{record.accountability || '-'}</p>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-[var(--text-tertiary)] text-xs font-medium">{record.operator || '-'}</td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan="6" className="p-20 text-center">
                                            <div className="flex flex-col items-center gap-3">
                                                <Filter size={32} className="text-[var(--text-tertiary)] opacity-30" />
                                                <p className="text-[var(--text-secondary)] font-medium">沒有找到盤點記錄</p>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Mobile Card View (Visible only on Mobile) */}
                <div className="md:hidden space-y-3">
                    {loading ? (
                        <div className="text-center py-10 text-[var(--text-tertiary)] bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-primary)]">載入中...</div>
                    ) : filtered.length > 0 ? (
                        filtered.map((record, idx) => (
                            <div key={idx} className={`bg-[var(--bg-primary)] rounded-xl border border-[var(--border-primary)] p-3 shadow-sm flex flex-col gap-2 ${record.diff !== 0 ? 'bg-amber-50/20' : ''}`}>
                                <div className="flex justify-between items-start border-b border-[var(--border-primary)] pb-2">
                                    <div className="flex flex-col gap-0.5">
                                        <div className="flex items-center gap-1 text-[10px] text-[var(--text-tertiary)] font-mono uppercase tracking-wider">
                                            <Calendar size={10} />
                                            {record.date}
                                        </div>
                                        <h3 className="font-bold text-[var(--text-primary)] text-base">{record.productName}</h3>
                                    </div>
                                    <div className="text-right">
                                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${record.diff === 0 ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                                            record.diff > 0 ? 'bg-blue-50 text-blue-600 border-blue-100' : 'bg-rose-50 text-rose-600 border-rose-100'
                                            }`}>
                                            {record.diff === 0 ? <CheckCircle size={10} /> : <AlertTriangle size={10} />}
                                            {record.diff > 0 ? `+${record.diff}` : record.diff}
                                        </span>
                                    </div>
                                </div>

                                <div className="grid grid-cols-3 gap-2 text-center bg-[var(--bg-secondary)] p-2 rounded-lg">
                                    <div>
                                        <div className="text-[9px] text-[var(--text-tertiary)] font-bold uppercase tracking-wider">帳面</div>
                                        <div className="font-mono font-medium text-[var(--text-secondary)]">{record.bookQty}</div>
                                    </div>
                                    <div>
                                        <div className="text-[9px] text-[var(--text-tertiary)] font-bold uppercase tracking-wider">實盤</div>
                                        <div className="font-mono font-bold text-blue-600 tracking-tighter">{record.physicalQty}</div>
                                    </div>
                                    <div>
                                        <div className="text-[9px] text-[var(--text-tertiary)] font-bold uppercase tracking-wider">差異</div>
                                        <div className={`font-mono font-bold ${record.diff === 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                            {record.diff}
                                        </div>
                                    </div>
                                </div>

                                {(record.reason || record.accountability) && (
                                    <div className="text-xs bg-[var(--bg-secondary)] p-2 rounded-lg text-[var(--text-secondary)] space-y-1 border border-[var(--border-primary)]">
                                        {record.reason && <div><span className="text-[var(--text-tertiary)] font-bold mr-2 uppercase text-[9px]">原因:</span>{record.reason}</div>}
                                        {record.accountability && <div><span className="text-[var(--text-tertiary)] font-bold mr-2 uppercase text-[9px]">歸屬:</span>{record.accountability}</div>}
                                    </div>
                                )}

                                <div className="flex justify-between items-center text-[10px] text-[var(--text-tertiary)] pt-1">
                                    <span className="flex items-center gap-1 font-medium">執行人: <span className="text-[var(--text-secondary)] font-bold">{record.operator || '-'}</span></span>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="text-center py-10 text-[var(--text-tertiary)] bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-primary)]">
                            <Filter size={24} className="mx-auto mb-2 opacity-30" />
                            <p className="text-sm font-medium">沒有找到盤點記錄</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
