import React, { useState, useCallback } from 'react';
import { Search, Calendar, MapPin, User, FileText, TrendingUp, Package } from 'lucide-react';
import { callGAS } from '../utils/api';
import { getLocalDateString } from '../utils/constants';

export default function ReportPage({ user, apiUrl }) {
    const [startDate, setStartDate] = useState(getLocalDateString());
    const [endDate, setEndDate] = useState(getLocalDateString());
    const [location, setLocation] = useState('');
    const [salesRep, setSalesRep] = useState('');
    const [loading, setLoading] = useState(false);
    const [reportData, setReportData] = useState([]);

    const fetchData = useCallback(async () => {
        if (!startDate || !endDate) return;
        setLoading(true);

        try {
            const payload = {
                startDate,
                endDate,
                // We still send these to backend, but we will also filter in frontend to be safe
                location,
                salesRep
            };
            const result = await callGAS(apiUrl, 'getSalesHistory', payload, user.token);

            // FRONTEND FILTERING: Ensure exact/partial match as requested by user
            let filteredData = result;
            if (Array.isArray(result)) {
                if (location.trim()) {
                    const term = location.trim().toLowerCase();
                    filteredData = filteredData.filter(item =>
                        String(item.location || '').toLowerCase().includes(term)
                    );
                }
                if (salesRep.trim()) {
                    const term = salesRep.trim().toLowerCase();
                    filteredData = filteredData.filter(item =>
                        String(item.salesRep || '').toLowerCase().includes(term)
                    );
                }
            } else {
                filteredData = [];
            }

            if (location.trim() && filteredData.length === 0 && Array.isArray(result) && result.length > 0) {
                // Should we optionaly warn user that backend returned data but it was filtered out?
                // No, user wants "specified content only", empty result is better than wrong result.
            }

            setReportData(filteredData);
        } catch (error) {
            alert('查詢失敗: ' + error.message);
        } finally {
            setLoading(false);
        }
    }, [startDate, endDate, location, salesRep, user.token, apiUrl]);

    // Initial fetch and fetch on dependency change
    React.useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleSearch = (e) => {
        e.preventDefault();
        fetchData();
    };

    // Calculate summaries
    const totalSales = reportData?.reduce((acc, item) => acc + (item.totalAmount || 0), 0) || 0;
    const totalQty = reportData?.reduce((acc, item) => acc + (item.soldQty || 0), 0) || 0;

    // Group by Product for summary table
    const productSummary = reportData?.reduce((acc, item) => {
        const id = item.productName; // Use name as key for simplicity in display
        if (!acc[id]) {
            acc[id] = { name: item.productName, qty: 0, amount: 0 };
        }
        acc[id].qty += item.soldQty;
        acc[id].amount += item.totalAmount;
        return acc;
    }, {});

    const summaryList = productSummary ? Object.values(productSummary).sort((a, b) => b.qty - a.qty) : [];

    return (
        <div className="max-w-[90rem] mx-auto p-4">
            <div className="glass-panel p-6">
                {/* Header Section */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-6 border-b border-slate-700/50 pb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                            <FileText className="text-blue-400" /> 銷售查詢報表
                        </h1>
                        <p className="text-slate-400 text-sm mt-1">查詢特定日期、銷售對象或業務的銷售紀錄</p>
                    </div>

                    {/* Summary Stats (Integrated in Header) */}
                    {reportData && (
                        <div className="flex gap-4">
                            <div className="px-4 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                                <p className="text-xs text-slate-400 uppercase font-bold text-center">總銷售額</p>
                                <p className="text-xl font-bold text-emerald-400 text-center">${totalSales.toLocaleString()}</p>
                            </div>
                            <div className="px-4 py-2 rounded-xl bg-blue-500/10 border border-blue-500/20">
                                <p className="text-xs text-slate-400 uppercase font-bold text-center">總數量</p>
                                <p className="text-xl font-bold text-blue-400 text-center">{totalQty.toLocaleString()}</p>
                            </div>
                            <div className="px-4 py-2 rounded-xl bg-purple-500/10 border border-purple-500/20">
                                <p className="text-xs text-slate-400 uppercase font-bold text-center">總筆數</p>
                                <p className="text-xl font-bold text-purple-400 text-center">{reportData.length}</p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Filters */}
                <form onSubmit={handleSearch} className="mb-6 p-4 rounded-xl bg-slate-800/50 border border-slate-700/50">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-slate-500 uppercase px-1">開始日期</label>
                            <input
                                type="date"
                                required
                                className="input-field w-full"
                                value={startDate}
                                onChange={e => setStartDate(e.target.value)}
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-slate-500 uppercase px-1">結束日期</label>
                            <input
                                type="date"
                                required
                                className="input-field w-full"
                                value={endDate}
                                onChange={e => setEndDate(e.target.value)}
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-slate-500 uppercase px-1">銷售對象</label>
                            <input
                                type="text"
                                placeholder="輸入關鍵字..."
                                className="input-field w-full"
                                value={location}
                                onChange={e => setLocation(e.target.value)}
                            />
                        </div>
                        <div className="flex gap-2">
                            <div className="space-y-1 flex-1">
                                <label className="text-xs font-bold text-slate-500 uppercase px-1">業務員</label>
                                <input
                                    type="text"
                                    placeholder="姓名..."
                                    className="input-field w-full"
                                    value={salesRep}
                                    onChange={e => setSalesRep(e.target.value)}
                                />
                            </div>
                            <button
                                onClick={handleSearch}
                                disabled={loading}
                                className="btn-primary py-2 px-6 flex items-center gap-2 self-end h-[42px]"
                            >
                                {loading ? '...' : <Search size={18} />} 查詢
                            </button>
                        </div>
                    </div>
                </form>

                {/* Content Logic */}
                {reportData && (
                    <div className="space-y-6">
                        {/* 1. Summary Table */}
                        <div className="rounded-xl border border-slate-700/50 overflow-hidden">
                            <div className="px-4 py-3 bg-slate-800/80 border-b border-slate-700/50 backdrop-blur-sm">
                                <h3 className="font-bold text-white flex items-center gap-2">
                                    <Package size={16} className="text-blue-400" /> 商品銷售統計
                                </h3>
                            </div>
                            <div className="overflow-x-auto max-h-60">
                                <table className="w-full text-left">
                                    <thead className="bg-slate-800/50 text-slate-400 text-sm uppercase">
                                        <tr>
                                            <th className="p-4 font-medium">商品名稱</th>
                                            <th className="p-4 font-medium text-right">銷售數量</th>
                                            <th className="p-4 font-medium text-right">銷售金額</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/10 bg-slate-900/30">
                                        {summaryList.length > 0 ? (
                                            summaryList.map((item, idx) => (
                                                <tr key={idx} className="hover:bg-white/5 transition-colors">
                                                    <td className="p-4 text-white">{item.name}</td>
                                                    <td className="p-4 text-right text-slate-300">{item.qty}</td>
                                                    <td className="p-4 text-right text-emerald-400">${item.amount.toLocaleString()}</td>
                                                </tr>
                                            ))
                                        ) : (
                                            <tr>
                                                <td colSpan="3" className="p-8 text-center text-slate-500">查無資料</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* 2. Detailed History List */}
                        <div className="rounded-xl border border-slate-700/50 overflow-hidden">
                            <div className="px-4 py-3 bg-slate-800/80 border-b border-slate-700/50 backdrop-blur-sm">
                                <h3 className="font-bold text-white flex items-center gap-2">
                                    <TrendingUp size={16} className="text-emerald-400" /> 詳細銷售紀錄
                                </h3>
                            </div>
                            <div className="overflow-auto max-h-[600px]">
                                <table className="w-full text-left text-sm">
                                    <thead className="bg-slate-800/50 text-slate-400 sticky top-0 backdrop-blur-sm z-10">
                                        <tr>
                                            <th className="p-3 font-medium w-48">日期</th>
                                            <th className="p-3 font-medium w-32">銷售對象</th>
                                            <th className="p-3 font-medium w-32">業務</th>
                                            <th className="p-3 font-medium">商品</th>
                                            <th className="p-3 font-medium text-right w-24">數量</th>
                                            <th className="p-3 font-medium text-right w-32">金額</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5 text-slate-300 bg-slate-900/30">
                                        {reportData.map((item, idx) => (
                                            <tr key={idx} className="hover:bg-white/5">
                                                <td className="p-3 text-slate-400">
                                                    {new Date(item.date).toLocaleString('zh-TW', {
                                                        year: 'numeric',
                                                        month: '2-digit',
                                                        day: '2-digit',
                                                        hour: '2-digit',
                                                        minute: '2-digit'
                                                    })}
                                                </td>
                                                <td className="p-3">{item.location}</td>
                                                <td className="p-3">{item.salesRep}</td>
                                                <td className="p-3 text-white">{item.productName}</td>
                                                <td className="p-3 text-right">{item.soldQty}</td>
                                                <td className="p-3 text-right">${item.totalAmount}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
