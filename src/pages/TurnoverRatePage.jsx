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
                    <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <Activity className="text-orange-600" /> 庫存周轉率
                    </h1>
                    <p className="text-slate-500 text-sm mt-1">評估庫存流動性：周轉率 = 銷售成本 / 平均庫存金額</p>
                </div>
                <div className="flex items-center gap-2 text-xs text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-200 shadow-sm font-bold">
                    <Info size={14} />
                    <span>周轉率越高代表商品流動性越好</span>
                </div>
            </div>

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 shrink-0 grid grid-cols-1 md:grid-cols-3 gap-4 shadow-sm">
                <div className="flex items-center gap-2">
                    <Calendar size={18} className="text-slate-400" />
                    <input type="date" className="input-field flex-1 bg-white" value={startDate} onChange={e => setStartDate(e.target.value)} />
                    <span className="text-slate-500 font-bold">至</span>
                    <input type="date" className="input-field flex-1 bg-white" value={endDate} onChange={e => setEndDate(e.target.value)} />
                </div>
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input type="text" placeholder="搜尋產品名稱..." className="input-field pl-10 w-full bg-white" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                </div>
                <button onClick={fetchData} className="btn-primary flex items-center justify-center gap-2 h-[42px]">
                    <RefreshCw size={18} /> 計算周轉率
                </button>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden flex-1 flex flex-col shadow-sm">
                <div className="overflow-y-auto flex-1">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 text-slate-500 text-xs uppercase sticky top-0 z-10 font-bold border-b border-slate-100">
                            <tr>
                                <th className="p-4">產品名稱</th>
                                <th className="p-4 text-right">銷售成本 (COGS)</th>
                                <th className="p-4 text-right">平均庫存</th>
                                <th className="p-4 text-right">周轉次數</th>
                                <th className="p-4 text-center">狀態</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {loading ? (
                                <tr><td colSpan="5" className="p-20 text-center text-slate-500">運算中...</td></tr>
                            ) : filteredData.length > 0 ? (
                                filteredData.map((item, idx) => {
                                    const turnover = item.avgInventory > 0 ? (item.cogs / item.avgInventory) : 0;
                                    return (
                                        <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                            <td className="p-4 font-bold text-slate-900">{productMap[item.productName] || item.productName}</td>
                                            <td className="p-4 text-right font-mono text-slate-600 font-bold">${item.cogs.toLocaleString()}</td>
                                            <td className="p-4 text-right font-mono text-slate-500">${item.avgInventory.toLocaleString()}</td>
                                            <td className="p-4 text-right font-mono text-orange-600 font-bold">{turnover.toFixed(2)} 次</td>
                                            <td className="p-4 text-center">
                                                {turnover >= 4 ? (
                                                    <span className="px-2 py-1 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200 uppercase">高流動</span>
                                                ) : turnover >= 1 ? (
                                                    <span className="px-2 py-1 rounded text-[10px] font-bold bg-blue-100 text-blue-700 border border-blue-200 uppercase">正常</span>
                                                ) : (
                                                    <span className="px-2 py-1 rounded text-[10px] font-bold bg-rose-100 text-rose-700 border border-rose-200 uppercase">滯銷風險</span>
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
