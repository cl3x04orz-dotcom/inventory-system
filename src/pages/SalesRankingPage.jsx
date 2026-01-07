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
                    <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                        <BarChart2 className="text-blue-400" /> 商品銷售排行
                    </h1>
                    <p className="text-slate-400 text-sm mt-1">分析指定期間內各商品的銷售數量與金額排名</p>
                </div>
                <button onClick={fetchData} disabled={loading} className="btn-secondary p-2 rounded-xl">
                    <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
                </button>
            </div>

            <div className="glass-panel p-4 shrink-0 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="flex items-center gap-2">
                    <Calendar size={18} className="text-slate-400" />
                    <input type="date" className="input-field flex-1" value={startDate} onChange={e => setStartDate(e.target.value)} />
                    <span className="text-slate-500">至</span>
                    <input type="date" className="input-field flex-1" value={endDate} onChange={e => setEndDate(e.target.value)} />
                </div>
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input
                        type="text"
                        placeholder="搜尋產品名稱..."
                        className="input-field pl-10 w-full"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>
                <button onClick={fetchData} className="btn-primary flex items-center justify-center gap-2">
                    <Search size={18} /> 執行查詢
                </button>
            </div>

            <div className="glass-panel p-0 overflow-hidden flex-1 flex flex-col">
                <div className="overflow-y-auto flex-1">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-800 text-slate-400 text-xs uppercase sticky top-0 z-10">
                            <tr>
                                <th className="p-4 w-16 text-center">排名</th>
                                <th className="p-4">產品名稱</th>
                                <th className="p-4 text-right">銷售數量</th>
                                <th className="p-4 text-right">銷售金額</th>
                                <th className="p-4 text-right">平均單價</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {loading ? (
                                <tr><td colSpan="5" className="p-20 text-center text-slate-500">載入中...</td></tr>
                            ) : filteredData.length > 0 ? (
                                filteredData.map((item, idx) => (
                                    <tr key={idx} className="hover:bg-slate-800/30 transition-colors">
                                        <td className="p-4 text-center font-mono">
                                            {idx < 3 ? (
                                                <span className={`w-6 h-6 rounded-full inline-flex items-center justify-center text-[10px] font-bold ${idx === 0 ? 'bg-yellow-500/20 text-yellow-500 border border-yellow-500/30' :
                                                    idx === 1 ? 'bg-slate-300/20 text-slate-300 border border-slate-300/30' :
                                                        'bg-orange-500/20 text-orange-500 border border-orange-500/30'
                                                    }`}>
                                                    {idx + 1}
                                                </span>
                                            ) : (idx + 1)}
                                        </td>
                                        <td className="p-4 font-bold text-white">{productMap[item.productName] || item.productName}</td>
                                        <td className="p-4 text-right font-mono text-emerald-400">{item.totalQty.toLocaleString()}</td>
                                        <td className="p-4 text-right font-mono text-blue-400">${item.totalAmount.toLocaleString()}</td>
                                        <td className="p-4 text-right font-mono text-slate-400">${(item.totalAmount / item.totalQty).toFixed(1)}</td>
                                    </tr>
                                ))
                            ) : (
                                <tr><td colSpan="5" className="p-20 text-center text-slate-500">暫無資料</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
