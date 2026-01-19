import React, { useState, useEffect } from 'react';
import { BarChart2, Search, Calendar, RefreshCw, TrendingUp } from 'lucide-react';
import { callGAS } from '../utils/api';
import { getLocalDateString } from '../utils/constants';

export default function SalesRankingPage({ user, apiUrl }) {
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

            // 2. 獲取排行原始數據
            const response = await callGAS(apiUrl, 'getSalesRanking', { startDate, endDate }, user.token);
            if (Array.isArray(response)) {
                setData(response);
            } else {
                setData([]);
            }
        } catch (error) {
            console.error('Failed to fetch sales ranking:', error);
            alert('無法獲取銷售排行資料');
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

    return (
        <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6 flex flex-col h-[calc(100vh-6rem)]">
            <div className="flex justify-between items-center shrink-0">
                <div>
                    <h1 className="text-2xl font-bold text-[var(--text-primary)] flex items-center gap-2">
                        <BarChart2 className="text-[var(--accent-blue)]" /> 商品銷售排行
                    </h1>
                    <p className="text-[var(--text-secondary)] text-sm mt-1">分析指定期間內各商品的銷售數量與金額排名</p>
                </div>
                <button onClick={fetchData} disabled={loading} className="btn-secondary p-2 rounded-xl">
                    <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
                </button>
            </div>

            <div className="bg-[var(--bg-secondary)] p-4 rounded-xl border border-[var(--border-primary)] shrink-0 grid grid-cols-1 md:grid-cols-3 gap-4 shadow-sm">
                <div className="flex items-center gap-2">
                    <input type="date" className="input-field flex-1 text-sm bg-[var(--bg-tertiary)]" value={startDate} onChange={e => setStartDate(e.target.value)} />
                    <span className="text-[var(--text-secondary)] font-bold hidden md:inline">至</span>
                    <input type="date" className="input-field flex-1 text-sm bg-[var(--bg-tertiary)]" value={endDate} onChange={e => setEndDate(e.target.value)} />
                </div>
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" size={18} />
                    <input
                        type="text"
                        placeholder="搜尋產品名稱..."
                        className="input-field pl-10 w-full bg-[var(--bg-tertiary)]"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>
                <button onClick={fetchData} className="btn-primary flex items-center justify-center gap-2 h-[42px]">
                    <Search size={18} /> 執行查詢
                </button>
            </div>

            <div className="bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-primary)] overflow-hidden flex-1 flex flex-col shadow-sm">
                <div className="overflow-y-auto flex-1">
                    {/* Desktop View */}
                    <table className="hidden md:table w-full text-left text-sm">
                        <thead className="bg-[var(--bg-tertiary)] text-[var(--text-secondary)] text-xs uppercase sticky top-0 z-10 font-bold border-b border-[var(--border-primary)]">
                            <tr>
                                <th className="p-4 w-16 text-center">排名</th>
                                <th className="p-4">產品名稱</th>
                                <th className="p-4 text-right">銷售數量</th>
                                <th className="p-4 text-right">銷售金額</th>
                                <th className="p-4 text-right">平均單價</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border-primary)]">
                            {loading ? (
                                <tr><td colSpan="5" className="p-20 text-center text-[var(--text-tertiary)]">載入中...</td></tr>
                            ) : filteredData.length > 0 ? (
                                filteredData.map((item, idx) => (
                                    <tr key={idx} className="hover:bg-[var(--bg-hover)] transition-colors">
                                        <td className="p-4 text-center font-mono">
                                            {idx < 3 ? (
                                                <span className={`w-6 h-6 rounded-full inline-flex items-center justify-center text-[10px] font-bold shadow-sm ${idx === 0 ? 'bg-amber-100 text-amber-700 border border-amber-200' :
                                                    idx === 1 ? 'bg-slate-100 text-slate-600 border border-slate-200' :
                                                        'bg-orange-100 text-orange-700 border border-orange-200'
                                                    }`}>
                                                    {idx + 1}
                                                </span>
                                            ) : (idx + 1)}
                                        </td>
                                        <td className="p-4 font-bold text-[var(--text-primary)]">{productMap[item.productName] || item.productName}</td>
                                        <td className="p-4 text-right font-mono text-emerald-500">{item.totalQty.toLocaleString()}</td>
                                        <td className="p-4 text-right font-mono text-blue-500">${item.totalAmount.toLocaleString()}</td>
                                        <td className="p-4 text-right font-mono text-[var(--text-secondary)]">${(item.totalAmount / item.totalQty).toFixed(1)}</td>
                                    </tr>
                                ))
                            ) : (
                                <tr><td colSpan="5" className="p-20 text-center text-[var(--text-secondary)]">暫無資料</td></tr>
                            )}
                        </tbody>
                    </table>

                    {/* Mobile View */}
                    <div className="md:hidden divide-y divide-slate-100">
                        {loading ? (
                            <div className="p-10 text-center text-slate-500">載入中...</div>
                        ) : filteredData.length > 0 ? (
                            filteredData.map((item, idx) => (
                                <div key={idx} className="p-4 bg-[var(--bg-secondary)] active:bg-[var(--bg-hover)] transition-colors">
                                    <div className="flex justify-between items-start mb-2">
                                        <div className="flex items-center gap-3">
                                            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 shadow-sm ${idx === 0 ? 'bg-amber-100 text-amber-700' :
                                                idx === 1 ? 'bg-slate-100 text-slate-600' :
                                                    idx === 2 ? 'bg-orange-100 text-orange-700' : 'bg-slate-50 text-slate-400 border border-slate-100'
                                                }`}>
                                                {idx + 1}
                                            </span>
                                            <div className="text-sm font-bold text-[var(--text-primary)]">{productMap[item.productName] || item.productName}</div>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-3 gap-2 pl-9">
                                        <div className="space-y-0.5">
                                            <p className="text-[10px] text-slate-400 font-bold uppercase">數量</p>
                                            <p className="text-xs font-mono font-bold text-emerald-600">{item.totalQty.toLocaleString()}</p>
                                        </div>
                                        <div className="space-y-0.5">
                                            <p className="text-[10px] text-slate-400 font-bold uppercase">總額</p>
                                            <p className="text-xs font-mono font-bold text-blue-600">${item.totalAmount.toLocaleString()}</p>
                                        </div>
                                        <div className="space-y-0.5">
                                            <p className="text-[10px] text-slate-400 font-bold uppercase">均價</p>
                                            <p className="text-xs font-mono font-bold text-slate-500">${(item.totalAmount / item.totalQty).toFixed(1)}</p>
                                        </div>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="p-10 text-center text-slate-500">暫無資料</div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
