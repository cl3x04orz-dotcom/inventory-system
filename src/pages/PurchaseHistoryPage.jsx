import React, { useState, useEffect } from 'react';
import { Search, Calendar, Filter, RefreshCw, ClipboardList, DollarSign, User, Truck } from 'lucide-react';
import { callGAS } from '../utils/api';
import { getLocalDateString } from '../utils/constants';

export default function PurchaseHistoryPage({ user, apiUrl }) {
    const [records, setRecords] = useState([]);
    const [loading, setLoading] = useState(false);
    const [productSearch, setProductSearch] = useState('');
    const [vendorSearch, setVendorSearch] = useState('');
    const [startDate, setStartDate] = useState(getLocalDateString());
    const [endDate, setEndDate] = useState(getLocalDateString());

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

    const filtered = records.filter(r => {
        const pName = String(r.productName || '').toLowerCase();
        const vName = String(r.vendorName || r.vendor || '').toLowerCase();
        const pSearch = productSearch.toLowerCase();
        const vSearch = vendorSearch.toLowerCase();

        return pName.includes(pSearch) && vName.includes(vSearch);
    });

    const totalAmount = filtered.reduce((sum, r) => sum + (Number(r.totalPrice) || 0), 0);

    return (
        <div className="max-w-[90rem] mx-auto p-4">
            <div className="glass-panel p-6">
                {/* Header & Stats */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-6">
                    <div>
                        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                            <Truck className="text-blue-400" /> 進貨查詢
                        </h1>
                        <p className="text-slate-400 text-sm mt-1">查看完整的採購與入庫記錄</p>
                    </div>
                    <div className="px-5 py-3 rounded-xl border border-green-500/20 bg-green-500/10 flex items-center gap-3">
                        <div className="p-2 rounded-full bg-green-500/20 text-green-400">
                            <DollarSign size={20} />
                        </div>
                        <div>
                            <p className="text-xs text-slate-400 uppercase font-bold">總進貨金額</p>
                            <p className="text-xl font-bold text-green-400">
                                ${totalAmount.toLocaleString()}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Filters */}
                <div className="mb-6 p-4 rounded-xl bg-slate-800/50 border border-slate-700/50">
                    <div className="flex flex-col md:flex-row gap-4 items-end">
                        <div className="flex-1 space-y-1.5 w-full">
                            <label className="text-[10px] text-slate-500 font-bold uppercase px-1">產品名稱</label>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
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
                            <label className="text-[10px] text-slate-500 font-bold uppercase px-1">廠商名稱</label>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
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

                {/* Table */}
                <div className="rounded-xl border border-slate-700/50 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-800/80 text-slate-400 text-xs uppercase tracking-wider sticky top-0 backdrop-blur-sm">
                                <tr>
                                    <th className="p-4">進貨日期</th>
                                    <th className="p-4">廠商</th>
                                    <th className="p-4">商品名稱</th>
                                    <th className="p-4 text-right">數量</th>
                                    <th className="p-4 text-right">單價</th>
                                    <th className="p-4 text-right">總價</th>
                                    <th className="p-4">效期</th>
                                    <th className="p-4">執行人</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5 bg-slate-900/30">
                                {loading ? (
                                    <tr><td colSpan="8" className="p-20 text-center text-slate-500">載入中...</td></tr>
                                ) : filtered.length > 0 ? (
                                    filtered.map((record, idx) => (
                                        <tr key={idx} className="hover:bg-white/5 transition-colors group">
                                            <td className="p-4">
                                                <div className="flex items-center gap-2 text-slate-300">
                                                    <Calendar size={14} className="text-slate-500 group-hover:text-blue-400 transition-colors" />
                                                    <div className="flex flex-col">
                                                        <span className="font-medium">{record.date ? new Date(record.date).toLocaleDateString('zh-TW') : '-'}</span>
                                                        <span className="text-xs text-slate-500">
                                                            {record.date ? new Date(record.date).toLocaleTimeString('zh-TW', { hour12: false, hour: '2-digit', minute: '2-digit' }) : ''}
                                                        </span>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="p-4 text-slate-300">{record.vendorName || record.vendor || '-'}</td>
                                            <td className="p-4 font-medium text-white">{record.productName}</td>
                                            <td className="p-4 text-right font-mono text-blue-400">{record.quantity}</td>
                                            <td className="p-4 text-right font-mono text-slate-400">
                                                ${(Number(record.unitPrice) || 0).toLocaleString()}
                                            </td>
                                            <td className="p-4 text-right font-mono font-bold text-emerald-400">
                                                ${(Number(record.totalPrice) || 0).toLocaleString()}
                                            </td>
                                            <td className="p-4 text-slate-400 text-xs">{record.expiry ? new Date(record.expiry).toLocaleDateString('zh-TW') : '-'}</td>
                                            <td className="p-4 text-slate-400">
                                                <div className="flex items-center gap-1">
                                                    <User size={12} /> {record.operator || '-'}
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan="8" className="p-20 text-center">
                                            <div className="flex flex-col items-center gap-4">
                                                <Filter size={32} className="text-slate-600" />
                                                <p className="text-slate-500">沒有找到進貨記錄</p>
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
