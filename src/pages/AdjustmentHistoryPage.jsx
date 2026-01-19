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
        <div className="max-w-7xl mx-auto p-4 md:p-6 animate-in fade-in duration-500">
            <div className="glass-panel p-4 md:p-6">
                {/* Header & Stats */}
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-6 pb-6 border-b border-[var(--border-primary)] gap-4">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center shrink-0">
                            <ClipboardList className="text-blue-500" size={24} />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-[var(--text-primary)]">庫存異動</h1>
                            <p className="text-[var(--text-tertiary)] text-xs mt-0.5">追蹤商品出入庫與異動紀錄</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 w-full md:w-auto">
                        <div className="flex-1 md:flex-none glass-panel px-4 py-2 bg-[var(--bg-secondary)] border-[var(--border-primary)] flex flex-col items-center justify-center">
                            <p className="text-[10px] text-[var(--text-tertiary)] uppercase font-bold tracking-wider">總記錄數</p>
                            <p className="text-xl font-bold text-blue-500">{filtered.length}</p>
                        </div>
                        <button
                            onClick={fetchHistory}
                            disabled={loading}
                            className="btn-secondary h-[46px] px-6 flex items-center justify-center gap-2 whitespace-nowrap"
                        >
                            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                            <span>刷新</span>
                        </button>
                    </div>
                </div>

                {/* Filter */}
                <div className="mb-6 p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-primary)]">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                        <div className="space-y-1.5">
                            <label className="text-[10px] text-[var(--text-tertiary)] font-bold uppercase px-1 tracking-wider">商品名稱</label>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" size={16} />
                                <input
                                    type="text"
                                    placeholder="搜尋商品..."
                                    className="input-field pl-9 w-full h-10"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[10px] text-[var(--text-tertiary)] font-bold uppercase px-1 tracking-wider">類型</label>
                            <select
                                value={type}
                                onChange={(e) => setType(e.target.value)}
                                className="input-field w-full h-10 px-2"
                            >
                                <option value="ALL">全部類型</option>
                                <option value="SCRAP">報廢</option>
                                <option value="RETURN">退貨</option>
                                <option value="LOSS">損耗</option>
                                <option value="OTHER">其他</option>
                            </select>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[10px] text-[var(--text-tertiary)] font-bold uppercase px-1 tracking-wider">開始日期</label>
                            <input
                                type="date"
                                className="input-field w-full h-10"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[10px] text-[var(--text-tertiary)] font-bold uppercase px-1 tracking-wider">結束日期</label>
                            <input
                                type="date"
                                className="input-field w-full h-10"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                            />
                        </div>
                    </div>
                </div>

                {/* Table */}
                <div className="hidden md:block rounded-xl border border-[var(--border-primary)] overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-[var(--bg-secondary)] text-[var(--text-tertiary)] text-[10px] uppercase tracking-wider sticky top-0 font-bold">
                                <tr>
                                    <th className="px-4 py-3">日期/時間</th>
                                    <th className="px-4 py-3">商品名稱</th>
                                    <th className="px-4 py-3">類型</th>
                                    <th className="px-4 py-3 text-right">數量</th>
                                    <th className="px-4 py-3">備註/原因</th>
                                    <th className="px-4 py-3">執行人</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[var(--border-primary)] bg-[var(--bg-primary)]">
                                {loading ? (
                                    <tr><td colSpan="6" className="p-20 text-center text-[var(--text-tertiary)]">載入中...</td></tr>
                                ) : filtered.length > 0 ? (
                                    filtered.map((record, idx) => {
                                        const typeLabels = {
                                            'SCRAP': '報廢',
                                            'RETURN': '退貨',
                                            'LOSS': '損耗',
                                            'OTHER': '其他'
                                        };

                                        return (
                                            <tr key={idx} className="hover:bg-[var(--bg-hover)] transition-colors group">
                                                <td className="px-4 py-3">
                                                    <div className="flex flex-col gap-0.5">
                                                        <div className="flex items-center gap-1.5 text-[var(--text-secondary)] font-medium">
                                                            <Calendar size={12} className="text-[var(--text-tertiary)]" />
                                                            <span>{record.date ? new Date(record.date).toLocaleDateString('zh-TW') : '-'}</span>
                                                        </div>
                                                        <span className="text-[11px] text-[var(--text-tertiary)] font-mono ml-4.5">
                                                            {record.date ? new Date(record.date).toLocaleTimeString('zh-TW', { hour12: false, hour: '2-digit', minute: '2-digit' }) : ''}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 font-bold text-[var(--text-primary)]">{record.productName}</td>
                                                <td className="px-4 py-3">
                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${record.type === 'SCRAP' ? 'bg-rose-50 text-rose-600 border border-rose-100' :
                                                        record.type === 'RETURN' ? 'bg-blue-50 text-blue-600 border border-blue-100' :
                                                            record.type === 'LOSS' ? 'bg-amber-50 text-amber-600 border border-amber-100' :
                                                                'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border border-[var(--border-primary)]'
                                                        }`}>
                                                        {typeLabels[record.type] || record.type}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-right font-mono font-bold text-rose-500">
                                                    -{record.quantity}
                                                </td>
                                                <td className="px-4 py-3 text-[var(--text-secondary)] text-xs max-w-xs truncate" title={record.note}>
                                                    {record.note || '-'}
                                                </td>
                                                <td className="px-4 py-3 text-[var(--text-tertiary)] text-xs font-medium">{record.operator || '-'}</td>
                                            </tr>
                                        );
                                    })
                                ) : (
                                    <tr>
                                        <td colSpan="6" className="p-20 text-center">
                                            <div className="flex flex-col items-center gap-3">
                                                <Filter size={32} className="text-[var(--text-tertiary)] opacity-30" />
                                                <p className="text-[var(--text-secondary)] font-medium">沒有找到異動記錄</p>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Mobile Card View */}
                <div className="md:hidden space-y-3">
                    {loading ? (
                        <div className="text-center py-10 text-[var(--text-tertiary)] bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-primary)]">載入中...</div>
                    ) : filtered.length > 0 ? (
                        filtered.map((record, idx) => {
                            const typeLabels = {
                                'SCRAP': '報廢',
                                'RETURN': '退貨',
                                'LOSS': '損耗',
                                'OTHER': '其他'
                            };

                            return (
                                <div key={idx} className="bg-[var(--bg-primary)] rounded-xl border border-[var(--border-primary)] p-3 shadow-sm flex flex-col gap-2">
                                    <div className="flex justify-between items-start border-b border-[var(--border-primary)] pb-2">
                                        <div className="flex flex-col gap-0.5">
                                            <span className="text-[var(--text-tertiary)] text-[10px] font-mono flex items-center gap-1">
                                                <Calendar size={10} />
                                                {record.date ? new Date(record.date).toLocaleDateString('zh-TW') : '-'}
                                                <span className="ml-1">
                                                    {record.date ? new Date(record.date).toLocaleTimeString('zh-TW', { hour12: false, hour: '2-digit', minute: '2-digit' }) : ''}
                                                </span>
                                            </span>
                                            <span className={`self-start px-2 py-0.5 rounded text-[10px] font-bold mt-1 ${record.type === 'SCRAP' ? 'bg-rose-50 text-rose-600 border border-rose-100' :
                                                record.type === 'RETURN' ? 'bg-blue-50 text-blue-600 border border-blue-100' :
                                                    record.type === 'LOSS' ? 'bg-amber-50 text-amber-600 border border-amber-100' :
                                                        'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border border-[var(--border-primary)]'
                                                }`}>
                                                {typeLabels[record.type] || record.type}
                                            </span>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-[10px] text-[var(--text-tertiary)] font-bold uppercase tracking-tighter">數量</div>
                                            <div className="font-mono font-bold text-rose-500 text-base">-{record.quantity}</div>
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <h3 className="font-bold text-[var(--text-primary)]">{record.productName}</h3>
                                        <div className="flex justify-between items-end gap-3">
                                            <div className="bg-[var(--bg-secondary)] p-2 rounded-lg flex-1 min-w-0">
                                                <span className="text-[9px] text-[var(--text-tertiary)] font-bold uppercase block mb-0.5 tracking-wider">原因/備註</span>
                                                <p className="text-xs text-[var(--text-secondary)] truncate">{record.note || '-'}</p>
                                            </div>
                                            <div className="text-right shrink-0">
                                                <span className="text-[9px] text-[var(--text-tertiary)] font-bold uppercase block mb-0.5 tracking-wider">執行人</span>
                                                <span className="text-xs font-bold text-[var(--text-secondary)]">{record.operator || '-'}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    ) : (
                        <div className="text-center py-10 text-[var(--text-tertiary)] bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-primary)]">
                            <Filter size={24} className="mx-auto mb-2 opacity-30" />
                            <p className="text-sm font-medium">沒有找到異動記錄</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
