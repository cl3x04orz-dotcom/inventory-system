import React, { useState, useEffect, useCallback } from 'react';
import { Save, Search, AlertTriangle, CheckSquare, RotateCcw, Package, AlertCircle } from 'lucide-react';
import { callGAS } from '../utils/api';
import { sortProducts, getLocalDateString } from '../utils/constants';

export default function StocktakePage({ user, apiUrl, logActivity }) {
    const [inventory, setInventory] = useState([]);
    const [stocktakeData, setStocktakeData] = useState({}); // { [productId]: { physicalQty, reason, accountability } }
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [showZeroStock, setShowZeroStock] = useState(false); // Manual toggle for zero stock items
    const getRowKey = useCallback((item) => `${item.productName}-${item.type}`, []);

    const fetchInventory = useCallback(async () => {
        setLoading(true);
        try {
            const data = await callGAS(apiUrl, 'getInventory', {}, user.token);
            if (Array.isArray(data)) {
                // [Aggregation Logic] Merge items with same name and type
                const aggregatedMap = {};
                data.forEach(item => {
                    const key = `${item.productName}-${item.type}`;
                    if (!aggregatedMap[key]) {
                        aggregatedMap[key] = {
                            ...item,
                            quantity: Number(item.quantity) || 0,
                            // Clear batch info as it's merged
                            batchId: 'aggregated',
                            id: item.productId || item.id
                        };
                    } else {
                        aggregatedMap[key].quantity += Number(item.quantity) || 0;
                    }
                });

                const aggregatedList = Object.values(aggregatedMap);
                const sorted = sortProducts(aggregatedList, 'productName');
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

    const handleKeyDown = (e, rowIdx, field, items, isMobile = false) => {
        const currentItem = items[rowIdx];
        const rowKey = getRowKey(currentItem);
        const entry = stocktakeData[rowKey] || {};
        const diff = calculateDiff(currentItem.quantity, entry.physicalQty);
        const hasDiff = entry.physicalQty !== '' && diff !== 0;

        const fields = ['qty', 'reason', 'acc'];
        const fieldIdx = fields.indexOf(field);
        const prefix = isMobile ? 'm-' : '';

        if (e.key === 'ArrowRight' || (e.key === 'Enter' && !e.shiftKey)) {
            e.preventDefault();
            // Move to next field in same row, or next row's first field
            if (field === 'qty' && !hasDiff) {
                // Skip reason/acc if no diff
                if (rowIdx < items.length - 1) {
                    focusAndSelect(`${prefix}qty-${getRowKey(items[rowIdx + 1])}`);
                }
            } else if (fieldIdx < fields.length - 1) {
                focusAndSelect(`${prefix}${fields[fieldIdx + 1]}-${rowKey}`);
            } else if (rowIdx < items.length - 1) {
                focusAndSelect(`${prefix}qty-${getRowKey(items[rowIdx + 1])}`);
            }
        } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            if (fieldIdx > 0) {
                focusAndSelect(`${prefix}${fields[fieldIdx - 1]}-${rowKey}`);
            }
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (rowIdx < items.length - 1) {
                focusAndSelect(`${prefix}${field}-${getRowKey(items[rowIdx + 1])}`);
            }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (rowIdx > 0) {
                focusAndSelect(`${prefix}${field}-${getRowKey(items[rowIdx - 1])}`);
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
        // [New Validation] Ensure ALL STOCK items (with quantity > 0) have a physical quantity entered
        const incompleteItems = inventory.filter(item => {
            if (item.type !== 'STOCK') return false;

            // Skip zero-stock items (usually hidden, no need to count)
            if (Number(item.quantity) === 0) return false;

            const rowKey = getRowKey(item);
            const entry = stocktakeData[rowKey];
            return !entry || entry.physicalQty === '' || entry.physicalQty === undefined;
        });

        if (incompleteItems.length > 0) {
            alert(`尚有 ${incompleteItems.length} 筆現貨商品未輸入盤點數量！\n請完成所有實盤數量後再提交。`);
            // Focus on the first incomplete item
            const firstKey = getRowKey(incompleteItems[0]);
            focusAndSelect(`qty-${firstKey}`);
            return;
        }

        const items = getItemsToSubmit();
        // (Since we validated all items have input, items.length should be > 0 if there are items)
        if (items.length === 0 && inventory.some(i => i.type === 'STOCK')) {
            // This case mimics "No items" but we just checked incomplete.
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

            // Log activity
            if (logActivity) {
                logActivity({
                    actionType: 'DATA_EDIT',
                    page: '庫存盤點',
                    details: JSON.stringify({
                        itemCount: items.length,
                        hasDifferences: items.some(i => i.diff !== 0),
                        totalDiff: items.reduce((acc, i) => acc + Math.abs(i.diff), 0)
                    })
                });
            }

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
        <div className="hidden md:flex bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-primary)] p-6 flex-col shadow-sm">
            <h3 className={`text-lg font-bold mb-4 flex items-center gap-2 ${colorClass}`}>
                <Icon size={20} /> {title}
                {!isStockType && <span className="text-xs text-[var(--text-secondary)] font-normal ml-2">（無需盤點）</span>}
            </h3>
            <div className="rounded-lg border border-[var(--border-primary)] overflow-hidden">
                <table className="w-full text-left text-sm">
                    <thead className="bg-[var(--bg-tertiary)] text-[var(--text-secondary)] text-xs uppercase font-bold border-b border-[var(--border-primary)]">
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
                    <tbody className="divide-y divide-[var(--border-primary)]">
                        {loading ? (
                            <tr><td colSpan={isStockType ? "6" : "2"} className="p-6 text-center text-[var(--text-secondary)]">載入中...</td></tr>
                        ) : items.length === 0 ? (
                            <tr><td colSpan={isStockType ? "6" : "2"} className="p-6 text-center text-[var(--text-secondary)]">無資料</td></tr>
                        ) : (
                            items.map((item, idx) => {
                                if (!item) return null;
                                const rowKey = getRowKey(item);
                                const entry = stocktakeData[rowKey] || { physicalQty: '', reason: '', accountability: user.username || '' };
                                const diff = calculateDiff(item.quantity, entry.physicalQty);

                                // Highlight original items with quantity > 0
                                const hasQuantity = !isStockType && Number(item.quantity) > 0;

                                return (
                                    <tr key={rowKey} className={`hover:bg-[var(--bg-hover)] transition-colors ${isStockType && diff !== 0 && entry.physicalQty !== '' ? 'bg-amber-500/10' :
                                        hasQuantity ? 'bg-orange-500/10 border-l-4 border-orange-500' : ''
                                        }`}>
                                        <td className={`p-4 font-medium ${hasQuantity ? 'text-orange-600 font-bold' : 'text-[var(--text-primary)]'}`}>
                                            {item.productName || '未命名商品'}
                                        </td>
                                        <td className={`p-4 text-right font-mono ${hasQuantity ? 'text-orange-500 font-bold text-lg' : 'text-[var(--text-secondary)]'}`}>
                                            {item.quantity}
                                        </td>
                                        {isStockType && (
                                            <>
                                                <td className="p-4">
                                                    <input
                                                        id={`qty-${rowKey}`}
                                                        type="number"
                                                        className={`input-field w-full text-right font-mono ${diff !== 0 && entry.physicalQty !== '' ? 'border-red-500 text-red-500' : ''}`}
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
                                                        className={`input-field w-full text-xs transition-all ${entry.physicalQty !== '' && diff !== 0 ? '' : 'bg-[var(--bg-tertiary)] cursor-not-allowed opacity-50'}`}
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
                                                        className={`input-field w-full text-xs transition-all ${entry.physicalQty !== '' && diff !== 0 ? '' : 'bg-[var(--bg-tertiary)] cursor-not-allowed opacity-50'}`}
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

    const renderStocktakeCards = (items, title, Icon, colorClass, isStockType) => (
        <div className="md:hidden flex flex-col gap-4">
            <h3 className={`text-lg font-bold flex items-center gap-2 ${colorClass} px-1`}>
                <Icon size={20} /> {title}
                {!isStockType && <span className="text-xs text-slate-500 font-normal ml-2">（無需盤點）</span>}
            </h3>
            <div className="space-y-4">
                {loading ? (
                    <div className="text-center py-8 text-[var(--text-secondary)]">載入中...</div>
                ) : items.length === 0 ? (
                    <div className="text-center py-8 text-[var(--text-secondary)] bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-primary)]">無資料</div>
                ) : (
                    items.map((item, idx) => {
                        if (!item) return null;
                        const rowKey = getRowKey(item);
                        const entry = stocktakeData[rowKey] || { physicalQty: '', reason: '', accountability: user.username || '' };
                        const diff = calculateDiff(item.quantity, entry.physicalQty);
                        const hasDiff = entry.physicalQty !== '' && diff !== 0;

                        // Highlight original items with quantity > 0
                        const hasQuantity = !isStockType && Number(item.quantity) > 0;

                        return (
                            <div key={rowKey} className={`bg-[var(--bg-secondary)] rounded-xl p-4 border shadow-sm space-y-3 ${isStockType && hasDiff ? 'border-amber-500/30 bg-amber-500/5' :
                                hasQuantity ? 'border-orange-500/30 bg-orange-500/5' : 'border-[var(--border-primary)]'
                                }`}>
                                {/* Header: Product Name & System Stock */}
                                <div className="flex justify-between items-start border-b border-[var(--border-primary)] pb-2">
                                    <span className={`font-bold text-lg ${hasQuantity ? 'text-orange-600' : 'text-[var(--text-primary)]'}`}>
                                        {item.productName || '未命名商品'}
                                    </span>
                                    <div className="flex flex-col items-end">
                                        <span className="text-xs text-[var(--text-secondary)]">帳面庫存</span>
                                        <span className={`font-mono text-lg font-bold ${hasQuantity ? 'text-orange-500' : 'text-[var(--text-secondary)]'}`}>
                                            {item.quantity}
                                        </span>
                                    </div>
                                </div>

                                {isStockType && (
                                    <>
                                        {/* Physical Qty Input */}
                                        <div className="flex items-center gap-3">
                                            <label className="text-sm font-bold text-[var(--text-secondary)] min-w-[70px]">實盤數量:</label>
                                            <input
                                                id={`m-qty-${rowKey}`}
                                                type="number"
                                                className={`input-field flex-1 text-right font-mono py-2 ${hasDiff ? 'border-red-500 text-red-500' : ''}`}
                                                placeholder="輸入數量"
                                                value={entry.physicalQty}
                                                onChange={(e) => handleInputChange(rowKey, 'physicalQty', e.target.value)}
                                                onKeyDown={(e) => handleKeyDown(e, idx, 'qty', items, true)}
                                            />
                                            {/* Diff Indicator */}
                                            <div className="w-12 text-right">
                                                <span className={`font-mono font-bold ${entry.physicalQty === '' || !hasDiff ? 'text-slate-300' : 'text-red-500'}`}>
                                                    {entry.physicalQty !== '' ? (diff > 0 ? `+${diff}` : diff) : '-'}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Reason & Accountability (Only show if Diff exists) */}
                                        {hasDiff && (
                                            <div className="bg-[var(--bg-tertiary)] p-3 rounded-lg border border-amber-500/20 space-y-3">
                                                <div className="flex flex-col gap-1">
                                                    <label className="text-xs font-bold text-[var(--text-secondary)]">差異原因</label>
                                                    <input
                                                        id={`m-reason-${rowKey}`}
                                                        type="text"
                                                        className="input-field w-full text-sm"
                                                        placeholder="請說明差異原因..."
                                                        value={entry.reason}
                                                        onChange={(e) => handleInputChange(rowKey, 'reason', e.target.value)}
                                                        onKeyDown={(e) => handleKeyDown(e, idx, 'reason', items, true)}
                                                    />
                                                </div>
                                                <div className="flex flex-col gap-1">
                                                    <label className="text-xs font-bold text-slate-500">責任歸屬</label>
                                                    <input
                                                        id={`m-acc-${rowKey}`}
                                                        type="text"
                                                        className="input-field w-full text-sm"
                                                        placeholder="責任人姓名"
                                                        value={entry.accountability}
                                                        onChange={(e) => handleInputChange(rowKey, 'accountability', e.target.value)}
                                                        onKeyDown={(e) => handleKeyDown(e, idx, 'acc', items, true)}
                                                    />
                                                </div>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );

    return (
        <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6 flex flex-col h-[calc(100vh-6rem)] relative">
            {submitting && (
                <div className="loading-overlay">
                    <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-lg font-bold text-[var(--text-primary)]">盤點存盤中，請稍後...</p>
                </div>
            )}
            {/* Desktop Header & Controls (Hidden on Mobile) */}
            <div className="hidden md:flex flex-col gap-6 shrink-0">
                <div className="flex justify-between items-center gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-[var(--text-primary)] flex items-center gap-2">
                            <CheckSquare className="text-blue-600" /> 庫存盤點
                        </h1>
                        <p className="text-[var(--text-secondary)] text-sm mt-1">現貨進貨需核對盤點，原貨退貨無需盤點</p>
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

                <div className="bg-[var(--bg-secondary)] p-4 rounded-xl border border-[var(--border-primary)] flex gap-4 items-center">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" size={18} />
                        <input
                            type="text"
                            placeholder="搜尋產品名稱..."
                            className="input-field pl-10 w-full"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>

                    <div className="flex items-center gap-3 bg-[var(--bg-primary)] p-2 px-4 rounded-xl border border-[var(--border-primary)] shadow-sm shrink-0">
                        <label className="text-sm font-bold text-[var(--text-secondary)] flex items-center gap-2 cursor-pointer">
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
            </div>

            {/* Mobile Header & Controls (Visible only on Mobile) */}
            <div className="md:hidden flex flex-col gap-3 shrink-0">
                <h1 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
                    <CheckSquare className="text-blue-600" /> 庫存盤點
                </h1>

                {/* Row 1: Search + Refresh */}
                <div className="flex gap-2">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" size={18} />
                        <input
                            type="text"
                            placeholder="搜尋產品..."
                            className="input-field pl-10 w-full"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <button
                        onClick={fetchInventory}
                        className="btn-secondary px-3 flex items-center justify-center shrink-0"
                        title="重新整理"
                    >
                        <RotateCcw size={20} />
                    </button>
                </div>

                {/* Row 2: Show Zero Stock + Submit */}
                <div className="flex gap-2">
                    <div className="flex-1 flex items-center justify-center gap-2 bg-[var(--bg-secondary)] px-3 py-2 rounded-xl border border-[var(--border-primary)] shadow-sm">
                        <input
                            type="checkbox"
                            className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                            checked={showZeroStock}
                            onChange={(e) => setShowZeroStock(e.target.checked)}
                        />
                        <span className="text-xs font-bold text-[var(--text-secondary)]">顯示 0 庫存</span>
                    </div>
                    <button
                        onClick={handleSubmit}
                        disabled={submitting}
                        className="btn-primary flex-1 py-2 flex items-center justify-center gap-2 text-sm"
                    >
                        {submitting ? '...' : <><Save size={16} /> 提交盤點</>}
                    </button>
                </div>
            </div>

            {/* Tables */}
            <div className="flex-1 overflow-y-auto flex flex-col gap-6 pb-6 w-full">
                {renderStocktakeTable(stockItems, "現貨進貨", Package, "text-blue-600", true)}
                {renderStocktakeCards(stockItems, "現貨進貨", Package, "text-blue-600", true)}

                {renderStocktakeTable(originalItems, "原貨/退貨", AlertCircle, "text-orange-600", false)}
                {renderStocktakeCards(originalItems, "原貨/退貨", AlertCircle, "text-orange-600", false)}
            </div>
        </div>
    );
}
