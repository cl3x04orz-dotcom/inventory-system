import React, { useState, useEffect } from 'react';
import { Search, Calendar, Filter, RefreshCw, ClipboardList, ArrowRight } from 'lucide-react';
import { callGAS } from '../utils/api';
import { getLocalDateString } from '../utils/constants';

export default function AdjustmentHistoryPage({ user, apiUrl }) {
    const [records, setRecords] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    const [type, setType] = useState('ALL');
    const [startDate, setStartDate] = useState(getLocalDateString());
    const [endDate, setEndDate] = useState(getLocalDateString());

    const fetchHistory = React.useCallback(async () => {
        setLoading(true);
        try {
            const data = await callGAS(apiUrl, 'getAdjustmentHistory', {
                startDate,
                endDate,
                productName: searchTerm
            }, user.token);

            // console.log('Adjustment History Data:', data);

            if (Array.isArray(data)) {
                setRecords(data);
            }
        } catch (error) {
            console.error('Failed to fetch adjustment history:', error);
            // alert('獲取異動歷史失敗: ' + error.message);
        } finally {
            setLoading(false);
        }
    }, [apiUrl, user.token, startDate, endDate, searchTerm]);

    useEffect(() => {
        fetchHistory();
    }, [fetchHistory]);

    const filtered = records.filter(r => {
        const matchesTerm = String(r.productName || '').toLowerCase().includes(searchTerm.toLowerCase());
        const matchesType = type === 'ALL' || r.type === type;
        return matchesTerm && matchesType;
    });

    return (
        <div className="max-w-[90rem] mx-auto p-4">
            <div className="glass-panel p-6">
                {/* Header & Stats */}
                {/* Header & Stats */}
                <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-200">
                    <div className="flex items-center gap-3 overflow-hidden flex-1">
                        <ClipboardList className="text-blue-600 shrink-0" size={24} />
                        <h1 className="text-2xl md:text-3xl font-bold text-slate-800 truncate">庫存異動</h1>
                        <div className="bg-blue-50 px-2 py-0.5 rounded border border-blue-100 shrink-0 flex items-center ml-auto mr-2">
                            <span className="text-[10px] md:text-xs text-slate-500 font-bold uppercase mr-1">總記錄數</span>
                            <span className="text-sm md:text-xl font-bold text-blue-600">{filtered.length}</span>
                        </div>
                    </div>

                    <button
                        onClick={fetchHistory}
                        disabled={loading}
                        className="btn-secondary h-9 md:h-[42px] px-3 md:px-6 flex items-center justify-center gap-2 whitespace-nowrap text-sm shrink-0"
                    >
                        <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                        <span className="hidden md:inline">刷新</span>
                    </button>
                </div>

                {/* Filter */}
                <div className="mb-6 p-4 rounded-xl bg-slate-50 border border-slate-200">
                    <div className="flex flex-col md:flex-row gap-4">
                        {/* Mobile: Date Range in separate rows, horizontal alignment */}
                        <div className="w-full md:hidden flex flex-col gap-3">
                            <div className="flex items-center justify-between gap-2">
                                <label className="text-sm text-slate-500 font-bold uppercase whitespace-nowrap">開始日期</label>
                                <input
                                    type="date"
                                    className="input-field flex-1 text-sm px-2 py-2 min-w-0 bg-white"
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                />
                            </div>
                            <div className="flex items-center justify-between gap-2">
                                <label className="text-sm text-slate-500 font-bold uppercase whitespace-nowrap">結束日期</label>
                                <input
                                    type="date"
                                    className="input-field flex-1 text-sm px-2 py-2 min-w-0 bg-white"
                                    value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                />
                            </div>
                        </div>

                        {/* Row 2 on Mobile: Product Name (now swap with Type) */}
                        <div className="flex-1 space-y-1.5 w-full md:order-none">
                            <label className="text-[10px] text-slate-500 font-bold uppercase px-1">商品名稱</label>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                <input
                                    type="text"
                                    placeholder="搜尋商品名稱..."
                                    className="input-field pl-9 w-full text-sm h-9 md:h-10"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                        </div>

                        {/* Row 3 on Mobile: Type */}
                        <div className="w-full md:w-32 space-y-1.5 md:order-none">
                            <label className="text-[10px] text-slate-500 font-bold uppercase px-1">類型</label>
                            <select
                                value={type}
                                onChange={(e) => setType(e.target.value)}
                                className="input-field w-full text-sm appearance-none bg-white font-medium h-9 md:h-10"
                            >
                                <option value="ALL">全部類型</option>
                                <option value="SCRAP">報廢</option>
                                <option value="RETURN">退貨</option>
                                <option value="LOSS">損耗</option>
                                <option value="OTHER">其他</option>
                            </select>
                        </div>

                        {/* Desktop: Separate Date Inputs (Hidden on Mobile) */}
                        <div className="hidden md:block w-36 space-y-1.5">
                            <label className="text-[10px] text-slate-500 font-bold uppercase px-1">開始日期</label>
                            <input
                                type="date"
                                className="input-field w-full text-sm h-10"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                            />
                        </div>

                        <div className="hidden md:block w-36 space-y-1.5">
                            <label className="text-[10px] text-slate-500 font-bold uppercase px-1">結束日期</label>
                            <input
                                type="date"
                                className="input-field w-full text-sm h-10"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                            />
                        </div>

                        {/* Desktop Only Refresh (Mobile uses Header Refresh) */}
                        <button
                            onClick={fetchHistory}
                            disabled={loading}
                            className="hidden md:flex btn-secondary h-10 items-center justify-center gap-2 whitespace-nowrap px-6"
                        >
                            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} /> 刷新
                        </button>
                    </div>
                </div>

                {/* Table */}
                <div className="hidden md:block rounded-xl border border-slate-200 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider sticky top-0">
                                <tr>
                                    <th className="p-4">日期</th>
                                    <th className="p-4">商品名稱</th>
                                    <th className="p-4">類型</th>
                                    <th className="p-4 text-right">數量</th>
                                    <th className="p-4">備註/原因</th>
                                    <th className="p-4">執行人</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 bg-white">
                                {loading ? (
                                    <tr><td colSpan="6" className="p-20 text-center text-slate-500">載入中...</td></tr>
                                ) : filtered.length > 0 ? (
                                    filtered.map((record, idx) => {
                                        const typeLabels = {
                                            'SCRAP': '報廢',
                                            'RETURN': '退貨',
                                            'LOSS': '損耗',
                                            'OTHER': '其他'
                                        };

                                        return (
                                            <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                                <td className="p-4">
                                                    <div className="flex flex-col gap-0.5 text-slate-500">
                                                        <div className="flex items-center gap-2">
                                                            <Calendar size={14} className="text-slate-400" />
                                                            <span>{record.date ? new Date(record.date).toLocaleDateString('zh-TW') : '-'}</span>
                                                        </div>
                                                        <span className="text-xs text-slate-400 ml-6">
                                                            {record.date ? new Date(record.date).toLocaleTimeString('zh-TW', { hour12: false, hour: '2-digit', minute: '2-digit' }) : ''}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="p-4 font-medium text-slate-900">{record.productName}</td>
                                                <td className="p-4">
                                                    <span className={`px-2 py-1 rounded text-xs font-medium ${record.type === 'SCRAP' ? 'bg-rose-100 text-rose-700' :
                                                        record.type === 'RETURN' ? 'bg-blue-100 text-blue-700' :
                                                            record.type === 'LOSS' ? 'bg-amber-100 text-amber-700' :
                                                                'bg-slate-100 text-slate-700'
                                                        }`}>
                                                        {typeLabels[record.type] || record.type}
                                                    </span>
                                                </td>
                                                <td className="p-4 text-right font-mono font-bold text-rose-600">
                                                    -{record.quantity}
                                                </td>
                                                <td className="p-4 text-slate-600 max-w-xs truncate" title={record.note}>
                                                    {record.note || '-'}
                                                </td>
                                                <td className="p-4 text-slate-400">{record.operator || '-'}</td>
                                            </tr>
                                        );
                                    })
                                ) : (
                                    <tr>
                                        <td colSpan="6" className="p-20 text-center">
                                            <div className="flex flex-col items-center gap-4">
                                                <Filter size={32} className="text-slate-600" />
                                                <p className="text-slate-500">沒有找到異動記錄</p>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Mobile Card View */}
                <div className="md:hidden space-y-4">
                    {loading ? (
                        <div className="text-center py-8 text-slate-500">載入中...</div>
                    ) : filtered.length > 0 ? (
                        filtered.map((record, idx) => {
                            const typeLabels = {
                                'SCRAP': '報廢',
                                'RETURN': '退貨',
                                'LOSS': '損耗',
                                'OTHER': '其他'
                            };

                            return (
                                <div key={idx} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex flex-col gap-3">
                                    <div className="flex justify-between items-start border-b border-slate-100 pb-2">
                                        <div className="flex flex-col gap-1">
                                            <span className="text-slate-400 text-xs flex items-center gap-1">
                                                <Calendar size={12} />
                                                {record.date ? new Date(record.date).toLocaleDateString('zh-TW') : '-'}
                                                <span className="ml-1">
                                                    {record.date ? new Date(record.date).toLocaleTimeString('zh-TW', { hour12: false, hour: '2-digit', minute: '2-digit' }) : ''}
                                                </span>
                                            </span>
                                            <span className={`self-start px-2 py-0.5 rounded text-xs font-medium ${record.type === 'SCRAP' ? 'bg-rose-100 text-rose-700' :
                                                record.type === 'RETURN' ? 'bg-blue-100 text-blue-700' :
                                                    record.type === 'LOSS' ? 'bg-amber-100 text-amber-700' :
                                                        'bg-slate-100 text-slate-700'
                                                }`}>
                                                {typeLabels[record.type] || record.type}
                                            </span>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-xs text-slate-400 mb-0.5">數量</div>
                                            <div className="font-mono font-bold text-rose-600 text-lg">-{record.quantity}</div>
                                        </div>
                                    </div>

                                    <div>
                                        <h3 className="font-bold text-slate-800 mb-1">{record.productName}</h3>
                                        <div className="flex justify-between items-start gap-4">
                                            <p className="text-sm text-slate-500 bg-slate-50 p-2 rounded flex-1">
                                                <span className="text-xs text-slate-400 block mb-0.5">原因/備註</span>
                                                {record.note || '-'}
                                            </p>
                                            <div className="text-right shrink-0">
                                                <span className="text-xs text-slate-400 block mb-0.5">執行人</span>
                                                <span className="text-sm font-medium text-slate-700">{record.operator || '-'}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    ) : (
                        <div className="text-center py-8 text-slate-500 bg-white rounded-xl border border-slate-200">
                            <Filter size={24} className="mx-auto mb-2 text-slate-400" />
                            <p>沒有找到異動記錄</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
