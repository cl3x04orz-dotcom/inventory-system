import React, { useState, useEffect, useCallback } from 'react';
import { Save, Search, AlertTriangle, CheckSquare, RotateCcw, Package, AlertCircle } from 'lucide-react';
import { callGAS } from '../utils/api';
import { sortProducts, getLocalDateString } from '../utils/constants';

export default function StocktakePage({ user, apiUrl }) {
    const [inventory, setInventory] = useState([]);
    const [stocktakeData, setStocktakeData] = useState({}); // { [productId]: { physicalQty, reason, accountability } }
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [showZeroStock, setShowZeroStock] = useState(false); // Manual toggle for zero stock items
    const getRowKey = useCallback((item) => `${item.id}-${item.batchId || 'no-batch'}`, []);

    const fetchInventory = useCallback(async () => {
        setLoading(true);
        try {
            const data = await callGAS(apiUrl, 'getInventory', {}, user.token);
            if (Array.isArray(data)) {
                const sorted = sortProducts(data, 'productName');
                setInventory(sorted);

                // Initialize stocktake data only for STOCK items
                const initialData = {};
                sorted.forEach(item => {
                    if (item.type === 'STOCK') {
                        initialData[getRowKey(item)] = {
                            physicalQty: '',
                            reason: '',
                            accountability: ''
                        };
                    }
                });
                setStocktakeData(initialData);
            }
        } catch (error) {
            console.error('Failed to fetch inventory for stocktake:', error);
            alert('無法載入庫存資料');
        } finally {
            setLoading(false);
        }
    }, [apiUrl, user.token, getRowKey]);

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

    const focusAndSelect = (id) => {
        const el = document.getElementById(id);
        if (el) {
            el.focus();
            el.select?.();
            el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    };

    const handleKeyDown = (e, rowIdx, field, items) => {
        const currentItem = items[rowIdx];
        const rowKey = getRowKey(currentItem);
        const entry = stocktakeData[rowKey] || {};
        const diff = calculateDiff(currentItem.quantity, entry.physicalQty);
        const hasDiff = entry.physicalQty !== '' && diff !== 0;

        const fields = ['qty', 'reason', 'acc'];
        const fieldIdx = fields.indexOf(field);

        if (e.key === 'ArrowRight' || (e.key === 'Enter' && !e.shiftKey)) {
            e.preventDefault();
            // Move to next field in same row, or next row's first field
            if (field === 'qty' && !hasDiff) {
                // Skip reason/acc if no diff
                if (rowIdx < items.length - 1) {
                    focusAndSelect(`qty-${getRowKey(items[rowIdx + 1])}`);
                }
            } else if (fieldIdx < fields.length - 1) {
                focusAndSelect(`${fields[fieldIdx + 1]}-${rowKey}`);
            } else if (rowIdx < items.length - 1) {
                focusAndSelect(`qty-${getRowKey(items[rowIdx + 1])}`);
            }
        } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            if (fieldIdx > 0) {
                focusAndSelect(`${fields[fieldIdx - 1]}-${rowKey}`);
            }
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (rowIdx < items.length - 1) {
                focusAndSelect(`${field}-${getRowKey(items[rowIdx + 1])}`);
            }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (rowIdx > 0) {
                focusAndSelect(`${field}-${getRowKey(items[rowIdx - 1])}`);
            }
        }
    };

    const calculateDiff = (bookQty, physicalQty) => {
        if (physicalQty === '' || physicalQty === undefined) return 0;
        return Number(physicalQty) - Number(bookQty);
    };

    const getItemsToSubmit = () => {
        // Only submit STOCK items where physicalQty has been entered
        return inventory.filter(item => {
            if (item.type !== 'STOCK') return false;
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

        // Manual toggle to show/hide zero stock
        if (!showZeroStock && (Number(item.quantity) || 0) === 0) return false;

        const nameMatch = String(item.productName || '').toLowerCase().includes(searchTerm.toLowerCase());
        return nameMatch;
    });

    // Separate stock and original items
    const stockItems = filteredInventory.filter(item => item.type === 'STOCK');
    const originalItems = filteredInventory.filter(item => item.type !== 'STOCK');

    const renderStocktakeTable = (items, title, Icon, colorClass, isStockType) => (
        <div className="bg-white rounded-xl border border-slate-200 p-6 flex flex-col shadow-sm">
            <h3 className={`text-lg font-bold mb-4 flex items-center gap-2 ${colorClass}`}>
                <Icon size={20} /> {title}
                {!isStockType && <span className="text-xs text-slate-500 font-normal ml-2">（無需盤點）</span>}
            </h3>
            <div className="rounded-lg border border-slate-200 overflow-hidden">
                <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-bold border-b border-slate-100">
                        <tr>
                            <th className="p-4">產品名稱</th>
                            <th className="p-4 text-right">帳面庫存</th>
                            {isStockType && (
                                <>
                                    <th className="p-4">實盤數量</th>
                                    <th className="p-4 text-center">差異</th>
                                    <th className="p-4">差異原因</th>
                                    <th className="p-4">責任歸屬</th>
                                </>
                            )}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {loading ? (
                            <tr><td colSpan={isStockType ? "6" : "2"} className="p-6 text-center text-slate-500">載入中...</td></tr>
                        ) : items.length === 0 ? (
                            <tr><td colSpan={isStockType ? "6" : "2"} className="p-6 text-center text-slate-500">無資料</td></tr>
                        ) : (
                            items.map((item, idx) => {
                                if (!item) return null;
                                const rowKey = getRowKey(item);
                                const entry = stocktakeData[rowKey] || { physicalQty: '', reason: '', accountability: user.username || '' };
                                const diff = calculateDiff(item.quantity, entry.physicalQty);

                                // Highlight original items with quantity > 0
                                const hasQuantity = !isStockType && Number(item.quantity) > 0;

                                return (
                                    <tr key={rowKey} className={`hover:bg-slate-50 transition-colors ${isStockType && diff !== 0 && entry.physicalQty !== '' ? 'bg-amber-50' :
                                        hasQuantity ? 'bg-orange-50 border-l-4 border-orange-500' : ''
                                        }`}>
                                        <td className={`p-4 font-medium ${hasQuantity ? 'text-orange-700 font-bold' : 'text-slate-800'}`}>
                                            {item.productName || '未命名商品'}
                                        </td>
                                        <td className={`p-4 text-right font-mono ${hasQuantity ? 'text-orange-600 font-bold text-lg' : 'text-slate-500'}`}>
                                            {item.quantity}
                                        </td>
                                        {isStockType && (
                                            <>
                                                <td className="p-4">
                                                    <input
                                                        id={`qty-${rowKey}`}
                                                        type="number"
                                                        className={`input-field w-full text-right font-mono bg-white ${diff !== 0 && entry.physicalQty !== '' ? 'border-red-300 text-red-700' : ''}`}
                                                        placeholder="0"
                                                        value={entry.physicalQty}
                                                        onChange={(e) => handleInputChange(rowKey, 'physicalQty', e.target.value)}
                                                        onKeyDown={(e) => handleKeyDown(e, idx, 'qty', items)}
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
                                                        disabled={entry.physicalQty === '' || diff === 0}
                                                        className={`input-field w-full text-xs transition-all ${entry.physicalQty !== '' && diff !== 0 ? 'bg-white' : 'bg-slate-100 cursor-not-allowed opacity-50'}`}
                                                        placeholder={diff !== 0 && entry.physicalQty !== '' ? "原因..." : "-"}
                                                        value={entry.reason}
                                                        onChange={(e) => handleInputChange(rowKey, 'reason', e.target.value)}
                                                        onKeyDown={(e) => handleKeyDown(e, idx, 'reason', items)}
                                                    />
                                                </td>
                                                <td className="p-4">
                                                    <input
                                                        id={`acc-${rowKey}`}
                                                        type="text"
                                                        disabled={entry.physicalQty === '' || diff === 0}
                                                        className={`input-field w-full text-xs transition-all ${entry.physicalQty !== '' && diff !== 0 ? 'bg-white' : 'bg-slate-100 cursor-not-allowed opacity-50'}`}
                                                        placeholder={diff !== 0 && entry.physicalQty !== '' ? "責任人..." : "-"}
                                                        value={entry.accountability}
                                                        onChange={(e) => handleInputChange(rowKey, 'accountability', e.target.value)}
                                                        onKeyDown={(e) => handleKeyDown(e, idx, 'acc', items)}
                                                    />
                                                </td>
                                            </>
                                        )}
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );

    return (
        <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6 flex flex-col h-[calc(100vh-6rem)] relative">
            {submitting && (
                <div className="loading-overlay">
                    <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-lg font-bold text-slate-800">盤點存盤中，請稍後...</p>
                </div>
            )}
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shrink-0">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <CheckSquare className="text-blue-600" /> 庫存盤點
                    </h1>
                    <p className="text-slate-500 text-sm mt-1">現貨進貨需核對盤點，原貨退貨無需盤點</p>
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
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 shrink-0 flex flex-col md:flex-row gap-4 items-center">
                <div className="relative flex-1 w-full">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input
                        type="text"
                        placeholder="搜尋產品名稱..."
                        className="input-field pl-10 w-full bg-white"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                <div className="flex items-center gap-3 bg-white p-2 px-4 rounded-xl border border-slate-200 shadow-sm shrink-0">
                    <label className="text-sm font-bold text-slate-600 flex items-center gap-2 cursor-pointer">
                        <input
                            type="checkbox"
                            className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                            checked={showZeroStock}
                            onChange={(e) => setShowZeroStock(e.target.checked)}
                        />
                        顯示庫存為 0 的品項
                    </label>
                </div>
            </div>

            {/* Tables */}
            <div className="flex-1 overflow-y-auto flex flex-col gap-6 pb-6">
                {renderStocktakeTable(stockItems, "現貨進貨", Package, "text-blue-600", true)}
                {renderStocktakeTable(originalItems, "原貨/退貨", AlertCircle, "text-orange-600", false)}
            </div>
        </div>
    );
}
