import React, { useState, useEffect, useCallback } from 'react';
import { Save, Search, AlertTriangle, CheckSquare, RotateCcw, Package } from 'lucide-react';
import { callGAS } from '../utils/api';
import { sortProducts } from '../utils/constants';

export default function StocktakePage({ user, apiUrl }) {
    const [inventory, setInventory] = useState([]);
    const [stocktakeData, setStocktakeData] = useState({}); // { [productId]: { physicalQty, reason, accountability } }
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [showDiffOnly, setShowDiffOnly] = useState(false);

    const fetchInventory = useCallback(async () => {
        setLoading(true);
        try {
            const data = await callGAS(apiUrl, 'getInventory', {}, user.token);
            if (Array.isArray(data)) {
                const sorted = sortProducts(data, 'productName');
                setInventory(sorted);

                // Initialize stocktake data with empty values or pre-fill if needed
                // Here we keep it empty to force manual entry, or we could copy quantity
                const initialData = {};
                sorted.forEach(item => {
                    initialData[item.id] = {
                        physicalQty: '',
                        reason: '',
                        accountability: ''
                    };
                });
                setStocktakeData(initialData);
            }
        } catch (error) {
            console.error('Failed to fetch inventory for stocktake:', error);
            alert('無法載入庫存資料');
        } finally {
            setLoading(false);
        }
    }, [apiUrl, user.token]);

    useEffect(() => {
        if (user?.token) fetchInventory();
    }, [user.token, fetchInventory]);

    const handleInputChange = (id, field, value) => {
        setStocktakeData(prev => ({
            ...prev,
            [id]: {
                ...prev[id],
                [field]: value
            }
        }));
    };

    const calculateDiff = (bookQty, physicalQty) => {
        if (physicalQty === '' || physicalQty === undefined) return 0;
        return Number(physicalQty) - Number(bookQty);
    };

    const getItemsToSubmit = () => {
        // Only submit items where physicalQty has been entered (is not empty string)
        return inventory.filter(item => {
            const entry = stocktakeData[item.id];
            return entry && entry.physicalQty !== '';
        }).map(item => {
            const entry = stocktakeData[item.id];
            const diff = calculateDiff(item.quantity, entry.physicalQty);
            return {
                productId: item.id,
                productName: item.productName,
                bookQty: Number(item.quantity),
                physicalQty: Number(entry.physicalQty),
                diff,
                reason: entry.reason,
                accountability: entry.accountability,
                batchId: item.batchId || ''
            };
        });
    };

    const handleSubmit = async () => {
        const items = getItemsToSubmit();
        if (items.length === 0) {
            alert('請至少輸入一項商品的實盤數量');
            return;
        }

        // Validate reason for discrepancies
        const missingReason = items.find(item => item.diff !== 0 && !item.reason);
        if (missingReason) {
            alert(`商品「${missingReason.productName}」有盤點差異，請填寫差異原因`);
            return;
        }

        if (!confirm(`確定要提交 ${items.length} 筆盤點資料嗎？庫存將會依據實盤數量更新。`)) return;

        setSubmitting(true);
        try {
            await callGAS(apiUrl, 'submitStocktake', {
                date: new Date().toISOString().split('T')[0],
                items,
                operator: user.username
            }, user.token);

            alert('盤點資料提交成功！');
            // Reset and reload
            setStocktakeData({});
            await fetchInventory();
        } catch (error) {
            console.error('Stocktake submit failed:', error);
            alert('提交失敗: ' + error.message);
        } finally {
            setSubmitting(false);
        }
    };

    const filteredInventory = inventory.filter(item => {
        const matchesSearch = item.productName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            item.batchId?.toLowerCase().includes(searchTerm.toLowerCase());

        if (!matchesSearch) return false;

        if (showDiffOnly) {
            const entry = stocktakeData[item.id];
            const diff = calculateDiff(item.quantity, entry?.physicalQty);
            return diff !== 0 && entry?.physicalQty !== '';
        }

        return true;
    });

    return (
        <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6 flex flex-col h-[calc(100vh-6rem)]">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shrink-0">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                        <CheckSquare className="text-blue-400" /> 庫存盤點
                    </h1>
                    <p className="text-slate-400 text-sm mt-1">輸入實盤數量，系統將自動調整庫存並記錄差異</p>
                </div>

                <div className="flex gap-3">
                    <button
                        onClick={fetchInventory}
                        className="btn-secondary h-[42px] px-4"
                        title="重新載入庫存"
                    >
                        <RotateCcw size={18} />
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={submitting}
                        className="btn-primary h-[42px] px-6 flex items-center gap-2"
                    >
                        {submitting ? '提交中...' : <><Save size={18} /> 提交盤點結果</>}
                    </button>
                </div>
            </div>

            {/* Controls */}
            <div className="glass-panel p-4 shrink-0 flex flex-col md:flex-row gap-4 items-center">
                <div className="relative flex-1 w-full">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                    <input
                        type="text"
                        placeholder="搜尋產品或批號..."
                        className="input-field pl-10 w-full"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <label className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 border border-white/5 cursor-pointer hover:bg-slate-700 transition-colors">
                    <input
                        type="checkbox"
                        checked={showDiffOnly}
                        onChange={(e) => setShowDiffOnly(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-600 text-blue-500 focus:ring-blue-500"
                    />
                    <span className="text-sm text-slate-300">僅顯示有差異項目</span>
                </label>
            </div>

            {/* Table */}
            <div className="glass-panel p-0 overflow-hidden flex-1 flex flex-col">
                <div className="overflow-y-auto flex-1">
                    <table className="w-full text-left text-sm relative">
                        <thead className="bg-slate-800 text-slate-400 text-xs uppercase tracking-wider sticky top-0 z-10 shadow-sm">
                            <tr>
                                <th className="p-4 w-[25%]">產品資料</th>
                                <th className="p-4 text-right w-[10%]">帳面庫存</th>
                                <th className="p-4 w-[15%]">實盤數量</th>
                                <th className="p-4 text-center w-[10%]">差異</th>
                                <th className="p-4 w-[20%]">差異原因</th>
                                <th className="p-4 w-[20%]">責任歸屬</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {loading ? (
                                <tr><td colSpan="6" className="p-20 text-center text-slate-500">載入庫存資料中...</td></tr>
                            ) : filteredInventory.length > 0 ? (
                                filteredInventory.map((item) => {
                                    const entry = stocktakeData[item.id] || { physicalQty: '', reason: '', accountability: '' };
                                    const diff = calculateDiff(item.quantity, entry.physicalQty);
                                    const hasDiff = entry.physicalQty !== '' && diff !== 0;

                                    return (
                                        <tr key={item.id} className={`hover:bg-slate-800/30 transition-colors ${hasDiff ? 'bg-amber-500/5' : ''}`}>
                                            <td className="p-4">
                                                <div className="font-bold text-white">{item.productName}</div>
                                                <div className="text-xs text-slate-500 font-mono mt-0.5">
                                                    批號: {item.batchId || '-'}
                                                </div>
                                            </td>
                                            <td className="p-4 text-right font-mono text-slate-400">
                                                {item.quantity}
                                            </td>
                                            <td className="p-4">
                                                <input
                                                    type="number"
                                                    className={`input-field w-full text-right font-mono ${hasDiff ? 'border-amber-500/50 text-amber-200' : ''}`}
                                                    placeholder="-"
                                                    value={entry.physicalQty}
                                                    onChange={(e) => handleInputChange(item.id, 'physicalQty', e.target.value)}
                                                    onWheel={(e) => e.target.blur()}
                                                />
                                            </td>
                                            <td className="p-4 text-center">
                                                {entry.physicalQty !== '' ? (
                                                    <span className={`inline-flex items-center gap-1 font-mono font-bold ${diff === 0 ? 'text-green-500' : diff > 0 ? 'text-blue-400' : 'text-red-400'
                                                        }`}>
                                                        {diff > 0 ? `+${diff}` : diff}
                                                        {diff !== 0 && <AlertTriangle size={12} />}
                                                    </span>
                                                ) : (
                                                    <span className="text-slate-600">-</span>
                                                )}
                                            </td>
                                            <td className="p-4">
                                                <input
                                                    type="text"
                                                    className="input-field w-full text-xs"
                                                    placeholder={hasDiff ? "必填..." : "選填"}
                                                    value={entry.reason}
                                                    onChange={(e) => handleInputChange(item.id, 'reason', e.target.value)}
                                                    disabled={entry.physicalQty === '' || diff === 0}
                                                />
                                            </td>
                                            <td className="p-4">
                                                <input
                                                    type="text"
                                                    className="input-field w-full text-xs"
                                                    placeholder="選填"
                                                    value={entry.accountability}
                                                    onChange={(e) => handleInputChange(item.id, 'accountability', e.target.value)}
                                                    disabled={entry.physicalQty === '' || diff === 0}
                                                />
                                            </td>
                                        </tr>
                                    );
                                })
                            ) : (
                                <tr>
                                    <td colSpan="6" className="p-20 text-center">
                                        <div className="flex flex-col items-center gap-4">
                                            <Package size={32} className="text-slate-600" />
                                            <p className="text-slate-500">無符合條件的商品</p>
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
