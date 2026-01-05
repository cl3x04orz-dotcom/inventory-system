import React, { useState, useEffect, useCallback } from 'react';
import { Package, Search, AlertCircle, RefreshCw } from 'lucide-react';
import { callGAS } from '../utils/api';
import { sortProducts, CASE_MAP } from '../utils/constants';

export default function InventoryPage({ user, apiUrl }) {
    const [inventory, setInventory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    const fetchInventory = useCallback(async () => {
        setLoading(true);
        try {
            const data = await callGAS(apiUrl, 'getInventory', {}, user.token);
            if (Array.isArray(data)) {
                const activeBatches = sortProducts(
                    data.filter(item => Number(item.quantity) > 0),
                    'productName'
                );
                setInventory(activeBatches);
            }
        } catch (error) {
            console.error('Failed to fetch inventory:', error);
        } finally {
            setLoading(false);
        }
    }, [apiUrl, user.token]);

    useEffect(() => {
        const init = async () => {
            if (user?.token) {
                await fetchInventory();
            }
        };
        init();
    }, [user.token, fetchInventory]);

    // Fix for "Invalid Date"
    const formatDate = (dateVal) => {
        if (!dateVal) return '-';
        const date = new Date(dateVal);
        if (isNaN(date.getTime())) {
            // Try to handle potential GAS string formats if needed, or just return original
            return String(dateVal);
        }
        return date.toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' });
    };

    const filteredInventory = inventory.filter(item => {
        const name = String(item.productName || '');
        const batch = String(item.batchId || '');
        const term = searchTerm.toLowerCase();
        return name.toLowerCase().includes(term) || batch.toLowerCase().includes(term);
    });

    const stockItems = filteredInventory.filter(item => item.type === 'STOCK');
    const originalItems = filteredInventory.filter(item => item.type !== 'STOCK');

    const InventoryTable = ({ items, title, icon: Icon, colorClass }) => (
        <div className="glass-panel p-6 flex flex-col">
            <h3 className={`text-lg font-bold mb-4 flex items-center gap-2 ${colorClass}`}>
                <Icon size={20} /> {title}
            </h3>
            <div className="rounded-lg border border-slate-700/50 overflow-hidden">
                <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-800 text-slate-400 text-sm uppercase">
                        <tr>
                            <th className="p-4">產品名稱</th>
                            <th className="p-4 text-right">數量</th>
                            <th className="p-4 text-center">箱數</th>
                            <th className="p-4">效期</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/50">
                        {loading ? (
                            <tr><td colSpan="3" className="p-6 text-center text-slate-500">載入中...</td></tr>
                        ) : items.length === 0 ? (
                            <tr><td colSpan="3" className="p-6 text-center text-slate-500">無資料</td></tr>
                        ) : (
                            items.map((item, idx) => (
                                <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                                    <td className="p-4 font-medium text-white">{item.productName}</td>
                                    <td className="p-4 text-right font-mono text-emerald-400 font-bold">{item.quantity}</td>
                                    <td className="p-4 text-center">
                                        {CASE_MAP[item.productName] ? (
                                            <span className="text-blue-300 font-mono">
                                                {(item.quantity / CASE_MAP[item.productName]).toFixed(1)}
                                                <span className="text-xs ml-1 text-slate-500">箱</span>
                                            </span>
                                        ) : (
                                            <span className="text-slate-600">-</span>
                                        )}
                                    </td>
                                    <td className="p-4 text-slate-300 text-sm">
                                        {formatDate(item.expiry)}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );

    return (
        <div className="max-w-6xl mx-auto h-[calc(100vh-6rem)] flex flex-col p-4 gap-4">
            {/* Header */}
            <div className="flex justify-between items-center bg-slate-900/50 p-4 rounded-xl border border-slate-800 backdrop-blur-sm">
                <h2 className="text-2xl font-bold flex items-center gap-2 text-white">
                    <Package className="text-blue-400" /> 庫存檢視
                </h2>
                <div className="flex gap-4">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input
                            type="text"
                            placeholder="搜尋產品..."
                            className="input-field pl-10 w-64"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <button onClick={fetchInventory} className="btn-secondary p-2" title="重新整理">
                        <RefreshCw size={20} />
                    </button>
                </div>
            </div>

            {/* Content Split */}
            <div className="flex-1 overflow-y-auto flex flex-col gap-6 pb-6">
                <InventoryTable
                    items={stockItems}
                    title="現貨進貨"
                    icon={Package}
                    colorClass="text-blue-400"
                />
                <InventoryTable
                    items={originalItems}
                    title="原貨/退貨"
                    icon={AlertCircle}
                    colorClass="text-orange-400"
                />
            </div>
        </div>
    );
}
