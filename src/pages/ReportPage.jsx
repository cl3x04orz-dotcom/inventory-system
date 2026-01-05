import React, { useState, useCallback } from 'react';
import { Search, Calendar, MapPin, User, FileText, TrendingUp, Package } from 'lucide-react';
import { callGAS } from '../utils/api';

export default function ReportPage({ user, apiUrl }) {
    const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
    const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
    const [location, setLocation] = useState('');
    const [salesRep, setSalesRep] = useState('');
    const [loading, setLoading] = useState(false);
    const [reportData, setReportData] = useState(null);

    const handleSearch = async (e) => {
        e.preventDefault();
        setLoading(true);
        setReportData(null); // Reset previous results
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
        <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                        <FileText className="text-blue-400" /> 銷售查詢報表
                    </h1>
                    <p className="text-slate-400 text-sm mt-1">查詢特定日期、銷售對象或業務的銷售紀錄</p>
                </div>
            </div>

            {/* Filters */}
            <div className="glass-panel p-6">
                <form onSubmit={handleSearch} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                    <div className="space-y-1">
                        <label className="text-xs text-slate-400 flex items-center gap-1">
                            <Calendar size={14} /> 開始日期
                        </label>
                        <input
                            type="date"
                            required
                            className="input-field w-full"
                            value={startDate}
                            onChange={e => setStartDate(e.target.value)}
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs text-slate-400 flex items-center gap-1">
                            <Calendar size={14} /> 結束日期
                        </label>
                        <input
                            type="date"
                            required
                            className="input-field w-full"
                            value={endDate}
                            onChange={e => setEndDate(e.target.value)}
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs text-slate-400 flex items-center gap-1">
                            <MapPin size={14} /> 銷售對象
                        </label>
                        <input
                            type="text"
                            placeholder="輸入銷售對象關鍵字"
                            className="input-field w-full"
                            value={location}
                            onChange={e => setLocation(e.target.value)}
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs text-slate-400 flex items-center gap-1">
                            <User size={14} /> 業務員 (選填)
                        </label>
                        <input
                            type="text"
                            placeholder="輸入業務姓名"
                            className="input-field w-full"
                            value={salesRep}
                            onChange={e => setSalesRep(e.target.value)}
                        />
                    </div>
                </form>
                <div className="mt-4 flex justify-end">
                    <button
                        onClick={handleSearch}
                        disabled={loading}
                        className="btn-primary py-2 px-6 flex items-center gap-2"
                    >
                        {loading ? '查詢中...' : <><Search size={18} /> 開始查詢</>}
                    </button>
                </div>
            </div>

            {/* Results */}
            {reportData && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Summary Cards */}
                    <div className="glass-panel p-6 flex items-center gap-4">
                        <div className="p-3 rounded-full bg-emerald-500/20 text-emerald-400">
                            <TrendingUp size={24} />
                        </div>
                        <div>
                            <p className="text-sm text-slate-400">總銷售額</p>
                            <p className="text-2xl font-bold text-white">${totalSales.toLocaleString()}</p>
                        </div>
                    </div>
                    <div className="glass-panel p-6 flex items-center gap-4">
                        <div className="p-3 rounded-full bg-blue-500/20 text-blue-400">
                            <Package size={24} />
                        </div>
                        <div>
                            <p className="text-sm text-slate-400">總銷售數量</p>
                            <p className="text-2xl font-bold text-white">{totalQty.toLocaleString()} 瓶/個</p>
                        </div>
                    </div>
                    <div className="glass-panel p-6 flex items-center gap-4">
                        <div className="p-3 rounded-full bg-purple-500/20 text-purple-400">
                            <FileText size={24} />
                        </div>
                        <div>
                            <p className="text-sm text-slate-400">總筆數</p>
                            <p className="text-2xl font-bold text-white">{reportData.length} 筆</p>
                        </div>
                    </div>

                    {/* Detailed Table */}
                    <div className="md:col-span-3 glass-panel p-0 overflow-hidden">
                        <div className="p-4 border-b border-white/10 bg-white/5">
                            <h3 className="font-bold text-white">商品銷售統計</h3>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead className="bg-slate-800/50 text-slate-400 text-sm uppercas">
                                    <tr>
                                        <th className="p-4 font-medium">商品名稱</th>
                                        <th className="p-4 font-medium text-right">銷售數量</th>
                                        <th className="p-4 font-medium text-right">銷售金額</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/10">
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
                                            <td colSpan="3" className="p-8 text-center text-slate-500">
                                                查無資料
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Raw History List (Collapsible or Bottom) */}
                    <div className="md:col-span-3 glass-panel p-0 overflow-hidden">
                        <div className="p-4 border-b border-white/10 bg-white/5">
                            <h3 className="font-bold text-white">詳細銷售紀錄</h3>
                        </div>
                        <div className="overflow-x-auto max-h-96">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-slate-800/50 text-slate-400 sticky top-0">
                                    <tr>
                                        <th className="p-3 font-medium">日期</th>
                                        <th className="p-3 font-medium">地點</th>
                                        <th className="p-3 font-medium">業務</th>
                                        <th className="p-3 font-medium">商品</th>
                                        <th className="p-3 font-medium text-right">數量</th>
                                        <th className="p-3 font-medium text-right">金額</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5 text-slate-300">
                                    {reportData.map((item, idx) => (
                                        <tr key={idx} className="hover:bg-white/5">
                                            <td className="p-3 text-slate-400">{new Date(item.date).toLocaleDateString('zh-TW')}</td>
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
    );
}
