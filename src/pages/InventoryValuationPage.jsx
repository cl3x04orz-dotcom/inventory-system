import React, { useState, useEffect } from 'react';
import { DollarSign, Search, TrendingUp, RefreshCw } from 'lucide-react';
import { callGAS } from '../utils/api';
import { sortProducts } from '../utils/constants';

export default function InventoryValuationPage({ user, apiUrl }) {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    const fetchData = async () => {
        setLoading(true);
        try {
            const response = await callGAS(apiUrl, 'getInventoryValuation', {}, user.token);
            console.log('Inventory Valuation Data:', response);

            if (Array.isArray(response)) {
                // Backend returns: { name, totalQty, totalValue }
                const sorted = sortProducts(response, 'name');
                setData(sorted);
            } else {
                console.error('Valuation data is not an array:', response);
                setData([]);
            }
        } catch (error) {
            console.error('Failed to fetch valuation:', error);
            alert('無法獲取庫存估值資料: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (user?.token) fetchData();
    }, [user.token, apiUrl]);

    const filteredData = data.filter(item =>
        String(item.name || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    const totalValue = filteredData.reduce((sum, item) => sum + (Number(item.totalValue) || 0), 0);
    const totalItems = filteredData.reduce((sum, item) => sum + (Number(item.totalQty) || 0), 0);

    return (
        <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                        <DollarSign className="text-yellow-400" /> 庫存估值報告
                    </h1>
                    <p className="text-slate-400 text-sm mt-1">即時庫存價值分析與統計</p>
                </div>

                {/* Stats Cards */}
                <div className="flex gap-4">
                    <div className="glass-panel px-5 py-3 border-yellow-500/20 bg-yellow-500/5">
                        <p className="text-xs text-slate-400 uppercase font-bold">總庫存價值</p>
                        <p className="text-2xl font-bold text-yellow-400 flex items-baseline gap-1">
                            <span className="text-sm opacity-50">$</span>
                            {totalValue.toLocaleString()}
                        </p>
                    </div>
                    <div className="glass-panel px-5 py-3 border-blue-500/20 bg-blue-500/5">
                        <p className="text-xs text-slate-400 uppercase font-bold">總庫存數量</p>
                        <p className="text-2xl font-bold text-blue-400">
                            {totalItems.toLocaleString()}
                        </p>
                    </div>
                </div>
            </div>

            {/* Controls */}
            <div className="glass-panel p-4 flex gap-4 items-center">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                    <input
                        type="text"
                        placeholder="搜尋產品名稱..."
                        className="input-field pl-10 w-full"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <button
                    onClick={fetchData}
                    disabled={loading}
                    className="btn-secondary h-[42px] px-4 flex items-center gap-2"
                >
                    <RefreshCw size={18} className={loading ? 'animate-spin' : ''} /> 刷新
                </button>
            </div>

            {/* Table */}
            <div className="glass-panel p-0 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-800/50 text-slate-400 text-xs uppercase tracking-wider sticky top-0">
                            <tr>
                                <th className="p-4">產品名稱</th>
                                <th className="p-4 text-right">庫存數量</th>
                                <th className="p-4 text-right">單位成本</th>
                                <th className="p-4 text-right">總價值</th>
                                <th className="p-4 text-right">佔比</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {loading ? (
                                <tr><td colSpan="5" className="p-20 text-center text-slate-500">計算中...</td></tr>
                            ) : filteredData.length > 0 ? (
                                filteredData.map((item, idx) => {
                                    const qty = Number(item.totalQty) || 0;
                                    const value = Number(item.totalValue) || 0;
                                    const unitCost = qty > 0 ? (value / qty) : 0;
                                    const percent = totalValue > 0 ? (value / totalValue * 100) : 0;

                                    return (
                                        <tr key={idx} className="hover:bg-white/5 transition-colors">
                                            <td className="p-4 font-medium text-white">
                                                {item.name}
                                            </td>
                                            <td className="p-4 text-right font-mono text-slate-300">
                                                {qty.toLocaleString()}
                                            </td>
                                            <td className="p-4 text-right font-mono text-slate-400">
                                                ${unitCost.toFixed(2)}
                                            </td>
                                            <td className="p-4 text-right font-mono font-bold text-yellow-400">
                                                ${value.toLocaleString()}
                                            </td>
                                            <td className="p-4 text-right w-24">
                                                <div className="flex items-center gap-2 justify-end">
                                                    <span className="text-xs text-slate-500 w-8">{percent.toFixed(1)}%</span>
                                                    <div className="w-12 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                                                        <div
                                                            className="h-full bg-yellow-500/50"
                                                            style={{ width: `${Math.min(percent, 100)}%` }}
                                                        />
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            ) : (
                                <tr>
                                    <td colSpan="5" className="p-20 text-center">
                                        <div className="flex flex-col items-center gap-4">
                                            <TrendingUp size={32} className="text-slate-600" />
                                            <p className="text-slate-500">無估值資料</p>
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
