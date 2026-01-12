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
    const [zeroStockDates, setZeroStockDates] = useState({}); // Track when products hit zero stock
    const getRowKey = useCallback((item) => `${item.id}-${item.batchId || 'no-batch'}`, []);

    // Load zero stock tracking from localStorage
    useEffect(() => {
        const saved = localStorage.getItem('zeroStockDates');
        if (saved) {
            try {
                setZeroStockDates(JSON.parse(saved));
            } catch (e) {
                console.error('Failed to parse zeroStockDates:', e);
            }
        }
    }, []);

    const fetchInventory = useCallback(async () => {
        setLoading(true);
        try {
            const data = await callGAS(apiUrl, 'getInventory', {}, user.token);
            if (Array.isArray(data)) {
                const sorted = sortProducts(data, 'productName');

                // Update zero stock tracking using functional update
                const today = new Date().toISOString().split('T')[0];

                setZeroStockDates(prevDates => {
                    const newZeroStockDates = { ...prevDates };

                    sorted.forEach(item => {
                        const qty = Number(item.quantity) || 0;
                        const productKey = item.id;

                        if (qty === 0) {
                            // If not already tracked, start tracking
                            if (!newZeroStockDates[productKey]) {
                                newZeroStockDates[productKey] = today;
                            }
                        } else {
                            // If stock is back, remove from tracking
                            if (newZeroStockDates[productKey]) {
                                delete newZeroStockDates[productKey];
                            }
                        }
                    });

                    localStorage.setItem('zeroStockDates', JSON.stringify(newZeroStockDates));
                    return newZeroStockDates;
                });

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

    // Check if product should be hidden (zero stock for more than 2 days)
    const shouldHideProduct = (item) => {
        const qty = Number(item.quantity) || 0;
        if (qty > 0) return false;

        const zeroDate = zeroStockDates[item.id];
        if (!zeroDate) return false;

        const today = new Date();
        const zeroDateObj = new Date(zeroDate);
        const daysDiff = Math.floor((today - zeroDateObj) / (1000 * 60 * 60 * 24));

        return daysDiff > 2;
    };

    const filteredInventory = inventory.filter(item => {
        if (!item) return false;

        // Hide products with zero stock for more than 2 days
        if (shouldHideProduct(item)) return false;

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
                                                        className="input-field w-full text-xs bg-white"
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
                                                        className="input-field w-full text-xs bg-white"
                                                        placeholder={diff !== 0 && entry.physicalQty !== '' ? "必填..." : "選填"}
                                                        value={entry.accountability}
                                                        onChange={(e) => handleInputChange(rowKey, 'accountability', e.target.value)}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') {
                                                                e.preventDefault();
                                                                const nextItem = items[idx + 1];
                                                                if (nextItem) {
                                                                    const nextKey = getRowKey(nextItem);
                                                                    document.getElementById(`qty-${nextKey}`)?.focus();
                                                                }
                                                            }
                                                        }}
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
        <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6 flex flex-col h-[calc(100vh-6rem)]">
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
            </div>

            {/* Tables */}
            <div className="flex-1 overflow-y-auto flex flex-col gap-6 pb-6">
                {renderStocktakeTable(stockItems, "現貨進貨", Package, "text-blue-600", true)}
                {renderStocktakeTable(originalItems, "原貨/退貨", AlertCircle, "text-orange-600", false)}
            </div>
        </div>
    );
}
