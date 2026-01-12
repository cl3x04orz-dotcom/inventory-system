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

    const filtered = records.filter(r =>
        String(r.productName || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    const totalRecords = filtered.length;
    const withDiff = filtered.filter(r => r.diff !== 0).length;
    const noDiff = filtered.filter(r => r.diff === 0).length;

    return (
        <div className="max-w-[90rem] mx-auto p-4">
            <div className="glass-panel p-6">
                {/* Header Section */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-6 border-b border-slate-200 pb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                            <ClipboardList className="text-blue-600" /> 盤點歷史查詢
                        </h1>
                        <p className="text-slate-500 text-sm mt-1">查看過去的盤點記錄，追蹤差異與原因</p>
                    </div>

                    {/* Stats Integrated */}
                    <div className="flex gap-4">
                        <div className="px-5 py-2 rounded-xl bg-blue-50 border border-blue-200">
                            <p className="text-xs text-slate-500 uppercase font-bold text-center">總記錄</p>
                            <p className="text-xl font-bold text-slate-800 text-center">{totalRecords}</p>
                        </div>
                        <div className="px-5 py-2 rounded-xl bg-rose-50 border border-rose-200">
                            <p className="text-xs text-slate-500 uppercase font-bold text-center">有差異</p>
                            <p className="text-xl font-bold text-rose-600 text-center">{withDiff}</p>
                        </div>
                        <div className="px-5 py-2 rounded-xl bg-emerald-50 border border-emerald-200">
                            <p className="text-xs text-slate-500 uppercase font-bold text-center">無差異</p>
                            <p className="text-xl font-bold text-emerald-600 text-center">{noDiff}</p>
                        </div>
                    </div>
                </div>

                {/* Filters */}
                <div className="mb-6 p-4 rounded-xl bg-slate-50 border border-slate-200">
                    <div className="flex flex-col md:flex-row gap-4 items-end">
                        <div className="flex-1 space-y-1.5 w-full">
                            <label className="text-[10px] text-slate-500 font-bold uppercase px-1">商品名稱</label>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                <input
                                    type="text"
                                    placeholder="搜尋商品名稱..."
                                    className="input-field pl-10 w-full"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="w-full md:w-32 space-y-1.5">
                            <label className="text-[10px] text-slate-500 font-bold uppercase px-1">開始日期</label>
                            <input
                                type="date"
                                className="input-field w-full text-sm"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                            />
                        </div>

                        <div className="w-full md:w-32 space-y-1.5">
                            <label className="text-[10px] text-slate-500 font-bold uppercase px-1">結束日期</label>
                            <input
                                type="date"
                                className="input-field w-full text-sm"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                            />
                        </div>

                        <div className="pb-1">
                            <label className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors select-none">
                                <input
                                    type="checkbox"
                                    checked={diffOnly}
                                    onChange={(e) => setDiffOnly(e.target.checked)}
                                    className="w-4 h-4 rounded border-slate-600 text-blue-500 focus:ring-blue-500"
                                />
                                <span className="text-sm text-slate-300">僅顯示有差異</span>
                            </label>
                        </div>

                        <button
                            onClick={fetchHistory}
                            disabled={loading}
                            className="btn-secondary h-[42px] flex items-center gap-2 whitespace-nowrap px-6"
                        >
                            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} /> 刷新
                        </button>
                    </div>
                </div>

                {/* Table */}
                <div className="rounded-xl border border-slate-200 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider sticky top-0">
                                <tr>
                                    <th className="p-4">盤點日期</th>
                                    <th className="p-4">商品名稱</th>
                                    <th className="p-4 text-right">帳面數量</th>
                                    <th className="p-4 text-right">實盤數量</th>
                                    <th className="p-4 text-center">差異</th>
                                    <th className="p-4">差異原因</th>
                                    <th className="p-4">責任歸屬</th>
                                    <th className="p-4">執行人</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 bg-white">
                                {loading ? (
                                    <tr>
                                        <td colSpan="8" className="p-20 text-center">
                                            <div className="flex flex-col items-center gap-3">
                                                <div className="w-8 h-8 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin"></div>
                                                <span className="text-slate-500">載入盤點記錄中...</span>
                                            </div>
                                        </td>
                                    </tr>
                                ) : filtered.length > 0 ? (
                                    filtered.map((record, idx) => (
                                        <tr key={idx} className={`hover:bg-slate-50 transition-colors ${record.diff !== 0 ? 'bg-amber-50' : ''}`}>
                                            <td className="p-4">
                                                <div className="flex items-center gap-2 text-slate-500">
                                                    <Calendar size={14} className="text-slate-400" />
                                                    {record.date}
                                                </div>
                                            </td>
                                            <td className="p-4 font-medium text-slate-900">{record.productName}</td>
                                            <td className="p-4 text-right font-mono text-slate-500">{record.bookQty}</td>
                                            <td className="p-4 text-right font-mono text-blue-600">{record.physicalQty}</td>
                                            <td className="p-4 text-center">
                                                {record.diff === 0 ? (
                                                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold">
                                                        <CheckCircle size={14} /> 0
                                                    </span>
                                                ) : (
                                                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold ${record.diff > 0
                                                        ? 'bg-blue-100 text-blue-700'
                                                        : 'bg-rose-100 text-rose-700'
                                                        }`}>
                                                        <AlertTriangle size={14} />
                                                        {record.diff > 0 ? `+${record.diff}` : record.diff}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="p-4 text-slate-600">{record.reason || '-'}</td>
                                            <td className="p-4 text-slate-600">{record.accountability || '-'}</td>
                                            <td className="p-4 text-slate-500">{record.operator || '-'}</td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan="8" className="p-20 text-center">
                                            <div className="flex flex-col items-center gap-4">
                                                <div className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center">
                                                    <Filter size={32} className="text-slate-300" />
                                                </div>
                                                <div>
                                                    <p className="text-slate-900 font-medium">沒有找到盤點記錄</p>
                                                    <p className="text-slate-400 text-sm mt-1">請調整篩選條件或日期區間</p>
                                                </div>
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
