import React, { useState, useEffect } from 'react';
import { Search, Calendar, Filter, RefreshCw, ClipboardList, ArrowRight } from 'lucide-react';
import { callGAS } from '../utils/api';

export default function AdjustmentHistoryPage({ user, apiUrl }) {
    const [records, setRecords] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
    const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);

    const fetchHistory = async () => {
        setLoading(true);
        try {
            const data = await callGAS(apiUrl, 'getAdjustmentHistory', {
                startDate,
                endDate,
                productName: searchTerm
            }, user.token);

            console.log('Adjustment History Data:', data); // Debug log

            if (Array.isArray(data)) {
                setRecords(data);
            }
        } catch (error) {
            console.error('Failed to fetch adjustment history:', error);
            alert('獲取異動歷史失敗: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (user?.token) fetchHistory();
    }, [user.token, apiUrl, startDate, endDate]);

    const filtered = records.filter(r =>
        String(r.productName || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                        <ClipboardList className="text-blue-400" /> 庫存異動
                    </h1>
                    <p className="text-slate-400 text-sm mt-1">查看庫存的手動調整記錄</p>
                </div>
            </div>

            <div className="glass-panel p-4 space-y-4">
                <div className="flex flex-col md:flex-row gap-4 items-end">
                    <div className="flex-1 space-y-1.5 w-full">
                        <label className="text-[10px] text-slate-500 font-bold uppercase px-1">商品名稱</label>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                            <input
                                type="text"
                                placeholder="搜尋商品名稱..."
                                className="input-field pl-10 w-full"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="w-full md:w-40 space-y-1.5">
                        <label className="text-[10px] text-slate-500 font-bold uppercase px-1">開始日期</label>
                        <input
                            type="date"
                            className="input-field w-full text-sm"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                        />
                    </div>

                    <div className="w-full md:w-40 space-y-1.5">
                        <label className="text-[10px] text-slate-500 font-bold uppercase px-1">結束日期</label>
                        <input
                            type="date"
                            className="input-field w-full text-sm"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                        />
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

            <div className="glass-panel p-0 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-800/50 text-slate-400 text-xs uppercase tracking-wider sticky top-0">
                            <tr>
                                <th className="p-4">日期</th>
                                <th className="p-4">商品名稱</th>
                                <th className="p-4">類型</th>
                                <th className="p-4 text-right">數量</th>
                                <th className="p-4">備註/原因</th>
                                <th className="p-4">執行人</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
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
                                        <tr key={idx} className="hover:bg-white/5 transition-colors">
                                            <td className="p-4">
                                                <div className="flex flex-col gap-0.5 text-slate-300">
                                                    <div className="flex items-center gap-2">
                                                        <Calendar size={14} className="text-slate-500" />
                                                        <span>{record.date ? new Date(record.date).toLocaleDateString('zh-TW') : '-'}</span>
                                                    </div>
                                                    <span className="text-xs text-slate-500 ml-6">
                                                        {record.date ? new Date(record.date).toLocaleTimeString('zh-TW', { hour12: false, hour: '2-digit', minute: '2-digit' }) : ''}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="p-4 font-medium text-white">{record.productName}</td>
                                            <td className="p-4">
                                                <span className={`px-2 py-1 rounded text-xs font-medium ${record.type === 'SCRAP' ? 'bg-red-500/20 text-red-400' :
                                                        record.type === 'RETURN' ? 'bg-blue-500/20 text-blue-400' :
                                                            record.type === 'LOSS' ? 'bg-orange-500/20 text-orange-400' :
                                                                'bg-slate-500/20 text-slate-400'
                                                    }`}>
                                                    {typeLabels[record.type] || record.type}
                                                </span>
                                            </td>
                                            <td className="p-4 text-right font-mono font-bold text-red-400">
                                                -{record.quantity}
                                            </td>
                                            <td className="p-4 text-slate-300 max-w-xs truncate" title={record.note}>
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
        </div>
    );
}
