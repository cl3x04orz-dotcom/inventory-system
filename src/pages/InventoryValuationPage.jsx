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
                    <h1 className="text-2xl font-bold text-[var(--text-primary)] flex items-center gap-2">
                        <DollarSign className="text-amber-500" /> 庫存估值報告
                    </h1>
                    <p className="text-[var(--text-secondary)] text-sm mt-1">即時庫存價值分析與統計</p>
                </div>

                {/* Stats Cards */}
                <div className="flex w-full md:w-auto gap-3">
                    <div className="flex-1 bg-[var(--bg-secondary)] px-3 py-3 border border-[var(--border-primary)] rounded-xl shadow-sm text-center">
                        <p className="text-xs text-[var(--text-secondary)] uppercase font-bold">總庫存價值</p>
                        <p className="text-xl md:text-2xl font-bold text-amber-500 flex justify-center items-baseline gap-1">
                            <span className="text-sm opacity-50">$</span>
                            {totalValue.toLocaleString()}
                        </p>
                    </div>
                    <div className="flex-1 bg-[var(--bg-secondary)] px-3 py-3 border border-[var(--border-primary)] rounded-xl shadow-sm text-center">
                        <p className="text-xs text-[var(--text-secondary)] uppercase font-bold">總庫存數量</p>
                        <p className="text-xl md:text-2xl font-bold text-blue-500">
                            {totalItems.toLocaleString()}
                        </p>
                    </div>
                </div>
            </div>

            {/* Controls */}
            <div className="bg-[var(--bg-secondary)] p-4 rounded-xl border border-[var(--border-primary)] flex gap-4 items-center shadow-sm">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" size={18} />
                    <input
                        type="text"
                        placeholder="搜尋產品名稱..."
                        className="input-field pl-10 w-full bg-[var(--bg-primary)]"
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

            {/* Desktop Table View */}
            <div className="hidden md:block bg-[var(--bg-primary)] rounded-xl border border-[var(--border-primary)] overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-[var(--bg-secondary)] text-[var(--text-secondary)] text-xs uppercase tracking-wider sticky top-0 font-bold border-b border-[var(--border-primary)]">
                            <tr>
                                <th className="p-4">產品名稱</th>
                                <th className="p-4 text-right">庫存數量</th>
                                <th className="p-4 text-right">單位成本</th>
                                <th className="p-4 text-right">總價值</th>
                                <th className="p-4 text-right">佔比</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border-primary)]">
                            {loading ? (
                                <tr><td colSpan="5" className="p-20 text-center text-[var(--text-secondary)]">計算中...</td></tr>
                            ) : filteredData.length > 0 ? (
                                filteredData.map((item, idx) => {
                                    const qty = Number(item.totalQty) || 0;
                                    const value = Number(item.totalValue) || 0;
                                    const unitCost = qty > 0 ? (value / qty) : 0;
                                    const percent = totalValue > 0 ? (value / totalValue * 100) : 0;

                                    return (
                                        <tr key={idx} className="hover:bg-[var(--bg-hover)] transition-colors">
                                            <td className="p-4 font-medium text-[var(--text-primary)]">
                                                {item.name}
                                            </td>
                                            <td className="p-4 text-right font-mono text-[var(--text-secondary)]">
                                                {qty.toLocaleString()}
                                            </td>
                                            <td className="p-4 text-right font-mono text-[var(--text-secondary)]">
                                                ${unitCost.toFixed(2)}
                                            </td>
                                            <td className="p-4 text-right font-mono font-bold text-amber-500">
                                                ${value.toLocaleString()}
                                            </td>
                                            <td className="p-4 text-right w-24">
                                                <div className="flex items-center gap-2 justify-end">
                                                    <span className="text-xs text-[var(--text-secondary)] w-8">{percent.toFixed(1)}%</span>
                                                    <div className="w-12 h-1.5 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
                                                        <div
                                                            className="h-full bg-amber-500"
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
                                            <TrendingUp size={32} className="text-[var(--text-secondary)]" />
                                            <p className="text-[var(--text-secondary)]">無估值資料</p>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Mobile Card View */}
            <div className="md:hidden space-y-4">
                {loading ? (
                    <div className="text-center py-8 text-[var(--text-secondary)]">載入中...</div>
                ) : filteredData.length > 0 ? (
                    filteredData.map((item, idx) => {
                        const qty = Number(item.totalQty) || 0;
                        const value = Number(item.totalValue) || 0;
                        const unitCost = qty > 0 ? (value / qty) : 0;
                        const percent = totalValue > 0 ? (value / totalValue * 100) : 0;

                        return (
                            <div key={idx} className="bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-primary)] p-4 shadow-sm flex flex-col gap-3">
                                <div className="flex justify-between items-start border-b border-[var(--border-primary)] pb-2">
                                    <h3 className="font-bold text-[var(--text-primary)] text-lg">{item.name}</h3>
                                    <div className="text-right">
                                        <div className="text-xs text-[var(--text-tertiary)]">總價值</div>
                                        <div className="font-bold text-amber-500 text-lg font-mono">${value.toLocaleString()}</div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-3 gap-2 text-center text-sm">
                                    <div className="bg-[var(--bg-tertiary)] p-2 rounded-lg">
                                        <div className="text-xs text-[var(--text-tertiary)] mb-1">庫存量</div>
                                        <div className="font-mono font-bold text-[var(--text-primary)]">{qty.toLocaleString()}</div>
                                    </div>
                                    <div className="bg-[var(--bg-tertiary)] p-2 rounded-lg">
                                        <div className="text-xs text-[var(--text-tertiary)] mb-1">單位成本</div>
                                        <div className="font-mono text-[var(--text-secondary)]">${unitCost.toFixed(0)}</div>
                                    </div>
                                    <div className="bg-[var(--bg-tertiary)] p-2 rounded-lg">
                                        <div className="text-xs text-[var(--text-tertiary)] mb-1">價值佔比</div>
                                        <div className="font-mono text-[var(--text-secondary)]">{percent.toFixed(1)}%</div>
                                    </div>
                                </div>

                                {/* Percentage Bar */}
                                <div className="w-full h-1.5 bg-[var(--bg-tertiary)] rounded-full overflow-hidden mt-1">
                                    <div
                                        className="h-full bg-amber-500 transition-all duration-500"
                                        style={{ width: `${Math.min(percent, 100)}%` }}
                                    />
                                </div>
                            </div>
                        );
                    })
                ) : (
                    <div className="text-center py-8 text-[var(--text-secondary)] bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-primary)]">
                        <TrendingUp size={24} className="mx-auto mb-2 text-[var(--text-tertiary)]" />
                        <p>無估值資料</p>
                    </div>
                )}
            </div>
        </div>
    );
}
