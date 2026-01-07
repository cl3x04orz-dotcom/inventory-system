import React, { useState, useEffect } from 'react';
import { Activity, Search, Calendar, RefreshCw, Info } from 'lucide-react';
import { callGAS } from '../utils/api';
import { getLocalDateString } from '../utils/constants';

export default function TurnoverRatePage({ user, apiUrl }) {
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

            // 2. 獲取原始數據
            const response = await callGAS(apiUrl, 'getTurnoverRate', { startDate, endDate }, user.token);
            if (Array.isArray(response)) {
                setData(response);
            } else {
                setData([]);
            }
        } catch (error) {
            console.error('Failed to fetch turnover rate:', error);
            alert('無法獲取周轉率資料');
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
                        <Activity className="text-orange-400" /> 庫存周轉率
                    </h1>
                    <p className="text-slate-400 text-sm mt-1">評估庫存流動性：周轉率 = 銷售成本 / 平均庫存金、額</p>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-800/50 px-3 py-1.5 rounded-lg border border-slate-700">
                    <Info size={14} />
                    <span>周轉率越高代表商品流動性越好</span>
                </div>
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
                    <input type="text" placeholder="搜尋產品名稱..." className="input-field pl-10 w-full" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                </div>
                <button onClick={fetchData} className="btn-primary flex items-center justify-center gap-2">
                    <RefreshCw size={18} /> 計算周轉率
                </button>
            </div>

            <div className="glass-panel p-0 overflow-hidden flex-1 flex flex-col">
                <div className="overflow-y-auto flex-1">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-800 text-slate-400 text-xs uppercase sticky top-0 z-10">
                            <tr>
                                <th className="p-4">產品名稱</th>
                                <th className="p-4 text-right">銷售成本 (COGS)</th>
                                <th className="p-4 text-right">平均庫存</th>
                                <th className="p-4 text-right">周轉次數</th>
                                <th className="p-4 text-center">狀態</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {loading ? (
                                <tr><td colSpan="5" className="p-20 text-center text-slate-500">運算中...</td></tr>
                            ) : filteredData.length > 0 ? (
                                filteredData.map((item, idx) => {
                                    const turnover = item.avgInventory > 0 ? (item.cogs / item.avgInventory) : 0;
                                    return (
                                        <tr key={idx} className="hover:bg-slate-800/30 transition-colors">
                                            <td className="p-4 font-bold text-white">{productMap[item.productName] || item.productName}</td>
                                            <td className="p-4 text-right font-mono text-slate-300 font-bold">${item.cogs.toLocaleString()}</td>
                                            <td className="p-4 text-right font-mono text-slate-400">${item.avgInventory.toLocaleString()}</td>
                                            <td className="p-4 text-right font-mono text-orange-400 font-bold">{turnover.toFixed(2)} 次</td>
                                            <td className="p-4 text-center">
                                                {turnover >= 4 ? (
                                                    <span className="px-2 py-1 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">高流動</span>
                                                ) : turnover >= 1 ? (
                                                    <span className="px-2 py-1 rounded text-[10px] font-bold bg-blue-500/10 text-blue-500 border border-blue-500/20">正常</span>
                                                ) : (
                                                    <span className="px-2 py-1 rounded text-[10px] font-bold bg-rose-500/10 text-rose-500 border border-rose-500/20">滯銷風險</span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })
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
