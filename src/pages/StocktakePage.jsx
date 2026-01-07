import React, { useState, useEffect, useCallback } from 'react';
import { Save, Search, AlertTriangle, CheckSquare, RotateCcw, Package } from 'lucide-react';
import { callGAS } from '../utils/api';
import { sortProducts, getLocalDateString } from '../utils/constants';

export default function StocktakePage({ user, apiUrl }) {
    const [inventory, setInventory] = useState([]);
    const [stocktakeData, setStocktakeData] = useState({}); // { [productId]: { physicalQty, reason, accountability } }
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [showDiffOnly, setShowDiffOnly] = useState(false);
    const getRowKey = useCallback((item) => `${item.id}-${item.batchId || 'no-batch'}`, []);

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
                    initialData[getRowKey(item)] = {
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
            const entry = stocktakeData[getRowKey(item)];
            return entry && entry.physicalQty !== '';
        }).map(item => {
            const entry = stocktakeData[getRowKey(item)];
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

        // Validate reason and accountability for discrepancies
        const missingInfo = items.find(item => item.diff !== 0 && (!item.reason || !item.accountability));
        if (missingInfo) {
            alert(`商品「${missingInfo.productName}」有盤點差異，請填寫差異原因與責任歸屬`);
            const key = getRowKey(missingInfo);
            if (!stocktakeData[key].reason) document.getElementById(`reason-${key}`)?.focus();
            else document.getElementById(`acc-${key}`)?.focus();
            return;
        }

        if (!confirm(`確定要提交 ${items.length} 筆盤點資料嗎？庫存將會依據實盤數量更新。`)) return;

        setSubmitting(true);
        try {
            await callGAS(apiUrl, 'saveStocktake', {
                date: getLocalDateString(),
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
        if (!item) return false;
        const nameMatch = String(item.productName || '').toLowerCase().includes(searchTerm.toLowerCase());
        const matchesSearch = nameMatch;

        if (!matchesSearch) return false;

        if (showDiffOnly) {
            const entry = stocktakeData[getRowKey(item)];
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
                        placeholder="搜尋產品名稱..."
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
                                <th className="p-4 w-[20%]">產品資料</th>
                                <th className="p-4 w-[10%] text-right">帳面庫存</th>
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
                                filteredInventory.map((item, idx) => {
                                    if (!item) return null;
                                    const rowKey = getRowKey(item);
                                    const entry = stocktakeData[rowKey] || { physicalQty: '', reason: '', accountability: user.username || '' };
                                    const diff = calculateDiff(item.quantity, entry.physicalQty);

                                    return (
                                        <tr key={rowKey} className={`hover:bg-slate-800/30 transition-colors ${diff !== 0 && entry.physicalQty !== '' ? 'bg-amber-500/5' : ''}`}>
                                            <td className="p-4">
                                                <div className="font-bold text-white">{item.productName || '未命名商品'}</div>
                                            </td>
                                            <td className="p-4 text-right font-mono text-slate-400">
                                                {item.quantity}
                                            </td>
                                            <td className="p-4">
                                                <input
                                                    id={`qty-${rowKey}`}
                                                    type="number"
                                                    className={`input-field w-full text-right font-mono ${diff !== 0 && entry.physicalQty !== '' ? 'border-red-500/50 text-red-200' : ''}`}
                                                    placeholder="0"
                                                    value={entry.physicalQty}
                                                    onChange={(e) => handleInputChange(rowKey, 'physicalQty', e.target.value)}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') {
                                                            e.preventDefault();
                                                            document.getElementById(`reason-${rowKey}`)?.focus();
                                                        }
                                                    }}
                                                    onWheel={(e) => e.target.blur()}
                                                />
                                            </td>
                                            <td className="p-4 text-center">
                                                <span className={`inline-flex items-center gap-1 font-mono font-bold ${entry.physicalQty === '' || diff === 0 ? 'text-green-500' : 'text-red-500 underline'}`}>
                                                    {entry.physicalQty !== '' ? (diff > 0 ? `+${diff}` : diff) : 0}
                                                    {entry.physicalQty !== '' && diff !== 0 && <AlertTriangle size={12} />}
                                                </span>
                                            </td>
                                            <td className="p-4">
                                                <input
                                                    id={`reason-${rowKey}`}
                                                    type="text"
                                                    className="input-field w-full text-xs"
                                                    placeholder={diff !== 0 && entry.physicalQty !== '' ? "必填..." : "選填"}
                                                    value={entry.reason}
                                                    onChange={(e) => handleInputChange(rowKey, 'reason', e.target.value)}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') {
                                                            e.preventDefault();
                                                            document.getElementById(`acc-${rowKey}`)?.focus();
                                                        }
                                                    }}
                                                />
                                            </td>
                                            <td className="p-4">
                                                <input
                                                    id={`acc-${rowKey}`}
                                                    type="text"
                                                    className="input-field w-full text-xs"
                                                    placeholder={diff !== 0 && entry.physicalQty !== '' ? "必填..." : "選填"}
                                                    value={entry.accountability}
                                                    onChange={(e) => handleInputChange(rowKey, 'accountability', e.target.value)}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') {
                                                            e.preventDefault();
                                                            const nextItem = filteredInventory[idx + 1];
                                                            if (nextItem) {
                                                                const nextKey = getRowKey(nextItem);
                                                                document.getElementById(`qty-${nextKey}`)?.focus();
                                                            }
                                                        }
                                                    }}
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
