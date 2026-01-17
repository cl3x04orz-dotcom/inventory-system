import React, { useState, useEffect } from 'react';
import { TrendingUp, Search, Calendar, RefreshCw, AlertTriangle } from 'lucide-react';
import { callGAS } from '../utils/api';
import { getLocalDateString } from '../utils/constants';

export default function ProfitAnalysisPage({ user, apiUrl }) {
    const [data, setData] = useState([]);
    const [productMap, setProductMap] = useState({}); // 動態產品對照表
    const [loading, setLoading] = useState(false);
    const [startDate, setStartDate] = useState(getLocalDateString());
    const [endDate, setEndDate] = useState(getLocalDateString());
    const [searchTerm, setSearchTerm] = useState('');

    const fetchData = async () => {
        setLoading(true);
        try {
            // 1. 同步獲取產品清單來建立名稱對照表
            const products = await callGAS(apiUrl, 'getProducts', {}, user.token);
            const pMap = {};
            if (Array.isArray(products)) {
                products.forEach(p => {
                    pMap[p.id] = p.name;
                });
                setProductMap(pMap);
            }

            // 2. 獲取毛利分析原始數據
            const response = await callGAS(apiUrl, 'getProfitAnalysis', { startDate, endDate }, user.token);
            if (Array.isArray(response)) {
                setData(response);
            } else {
                setData([]);
            }
        } catch (error) {
            console.error('Failed to fetch profit analysis:', error);
            alert('無法獲取毛利分析資料');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (user?.token) fetchData();
    }, [user.token, apiUrl]);

    const filteredData = data.filter(item => {
        const displayName = productMap[item.productName] || item.productName;
        return String(displayName || '').toLowerCase().includes(searchTerm.toLowerCase());
    });

    const totalRevenue = filteredData.reduce((sum, i) => sum + i.revenue, 0);
    const totalCost = filteredData.reduce((sum, i) => sum + i.cost, 0);
    const totalProfit = totalRevenue - totalCost;
    const avgMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

    return (
        <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6 flex flex-col h-[calc(100vh-6rem)]">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shrink-0">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <TrendingUp className="text-emerald-600" /> 毛利分析報表
                    </h1>
                    <p className="text-slate-500 text-sm mt-1">針對指定期間內各商品的銷售額、成本與毛利結構</p>
                </div>
                <div className="flex gap-2 md:gap-4">
                    <div className="bg-emerald-50 px-3 py-1.5 md:px-4 md:py-2 border border-emerald-200 rounded-xl shadow-sm flex-1">
                        <p className="text-[8px] md:text-[10px] text-slate-500 uppercase font-bold text-center">總毛利</p>
                        <p className="text-sm md:text-xl font-bold text-emerald-700 text-center">${totalProfit.toLocaleString()}</p>
                    </div>
                    <div className="bg-blue-50 px-3 py-1.5 md:px-4 md:py-2 border border-blue-200 rounded-xl shadow-sm flex-1">
                        <p className="text-[8px] md:text-[10px] text-slate-500 uppercase font-bold text-center">平均毛利率</p>
                        <p className="text-sm md:text-xl font-bold text-blue-700 text-center">{avgMargin.toFixed(1)}%</p>
                    </div>
                </div>
            </div>

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 shrink-0 grid grid-cols-1 md:grid-cols-3 gap-4 shadow-sm">
                <div className="flex items-center gap-2">
                    <Calendar size={18} className="text-slate-400" />
                    <input type="date" className="input-field flex-1 bg-white text-sm" value={startDate} onChange={e => setStartDate(e.target.value)} />
                    <span className="text-slate-500 font-bold hidden md:inline">至</span>
                    <input type="date" className="input-field flex-1 bg-white text-sm" value={endDate} onChange={e => setEndDate(e.target.value)} />
                </div>
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input type="text" placeholder="搜尋產品名稱..." className="input-field pl-10 w-full bg-white" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                </div>
                <button onClick={fetchData} className="btn-primary flex items-center justify-center gap-2 h-[42px]">
                    <RefreshCw size={18} className={loading ? 'animate-spin' : ''} /> 執行分析
                </button>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden flex-1 flex flex-col shadow-sm">
                <div className="overflow-y-auto flex-1">
                    {/* Desktop View */}
                    <table className="hidden md:table w-full text-left text-sm border-collapse">
                        <thead className="bg-slate-50 text-slate-500 text-xs uppercase sticky top-0 z-10 font-bold border-b border-slate-100">
                            <tr>
                                <th className="p-4 whitespace-nowrap">產品名稱</th>
                                <th className="p-4 text-right whitespace-nowrap">銷售收入</th>
                                <th className="p-4 text-right whitespace-nowrap">成本</th>
                                <th className="p-4 text-right whitespace-nowrap">毛利額</th>
                                <th className="p-4 text-right whitespace-nowrap">毛利率</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {loading ? (
                                <tr><td colSpan="5" className="p-20 text-center text-slate-500">
                                    <div className="flex flex-col items-center gap-2">
                                        <RefreshCw className="animate-spin text-emerald-500" />
                                        <span>正在計算毛利數據...</span>
                                    </div>
                                </td></tr>
                            ) : filteredData.length > 0 ? (
                                filteredData.map((item, idx) => {
                                    const profit = item.revenue - item.cost;
                                    const margin = item.revenue > 0 ? (profit / item.revenue) * 100 : 0;
                                    const displayName = productMap[item.productName] || item.productName;

                                    return (
                                        <tr key={idx} className="hover:bg-slate-50 transition-colors group">
                                            <td className="p-4 font-bold text-slate-800">
                                                <div className="flex flex-col">
                                                    <span>{displayName}</span>
                                                    {productMap[item.productName] && (
                                                        <span className="text-[10px] text-slate-400 font-normal mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                            ID: {item.productName.substring(0, 8)}...
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="p-4 text-right font-mono text-slate-600">
                                                ${Math.round(item.revenue).toLocaleString()}
                                            </td>
                                            <td className="p-4 text-right font-mono text-rose-600/80">
                                                ${Math.round(item.cost).toLocaleString()}
                                            </td>
                                            <td className={`p-4 text-right font-mono font-bold ${profit >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                                                {profit < 0 ? '-' : ''}${Math.abs(Math.round(profit)).toLocaleString()}
                                            </td>
                                            <td className="p-4 text-right">
                                                <span className={`inline-block px-2 py-1 rounded text-xs font-bold min-w-[50px] text-center ${margin >= 30 ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' :
                                                    margin >= 10 ? 'bg-blue-100 text-blue-700 border border-blue-200' :
                                                        'bg-rose-100 text-rose-700 border border-rose-200'
                                                    }`}>
                                                    {margin.toFixed(1)}%
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })
                            ) : (
                                <tr><td colSpan="5" className="p-20 text-center text-slate-500">暫無資料</td></tr>
                            )}
                        </tbody>
                    </table>

                    {/* Mobile View */}
                    <div className="md:hidden divide-y divide-slate-100">
                        {loading ? (
                            <div className="p-10 text-center text-slate-500 italic">正在計算毛利數據...</div>
                        ) : filteredData.length > 0 ? (
                            filteredData.map((item, idx) => {
                                const profit = item.revenue - item.cost;
                                const margin = item.revenue > 0 ? (profit / item.revenue) * 100 : 0;
                                const displayName = productMap[item.productName] || item.productName;

                                return (
                                    <div key={idx} className="p-4 bg-white active:bg-slate-50 transition-colors">
                                        <div className="flex justify-between items-start mb-2">
                                            <div className="text-sm font-bold text-slate-800 max-w-[65%] leading-tight">{displayName}</div>
                                            <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${margin >= 30 ? 'bg-emerald-100 text-emerald-700' :
                                                margin >= 10 ? 'bg-blue-100 text-blue-700' : 'bg-rose-100 text-rose-700'
                                                }`}>
                                                {margin.toFixed(1)}%
                                            </span>
                                        </div>
                                        <div className="grid grid-cols-3 gap-2 mt-3">
                                            <div className="space-y-1">
                                                <p className="text-[10px] text-slate-400 font-bold uppercase">收入</p>
                                                <p className="text-xs font-mono font-bold text-slate-600">${Math.round(item.revenue).toLocaleString()}</p>
                                            </div>
                                            <div className="space-y-1">
                                                <p className="text-[10px] text-slate-400 font-bold uppercase">成本</p>
                                                <p className="text-xs font-mono font-bold text-rose-500/80">${Math.round(item.cost).toLocaleString()}</p>
                                            </div>
                                            <div className="space-y-1">
                                                <p className="text-[10px] text-slate-400 font-bold uppercase">毛利</p>
                                                <p className={`text-xs font-mono font-bold ${profit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                    ${Math.abs(Math.round(profit)).toLocaleString()}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        ) : (
                            <div className="p-10 text-center text-slate-500">暫無資料</div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
