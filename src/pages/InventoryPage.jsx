import { safeLocalStorage, safeSessionStorage } from '../utils/storage';
import React, { useState, useEffect, useCallback } from 'react';
import { Package, Search, AlertCircle, RefreshCw, AlertTriangle, Trash2, Clock, Edit2, Save, Image, X } from 'lucide-react';
import { callGAS } from '../utils/api';
import { CASE_MAP, sortProducts } from '../utils/constants';

export default function InventoryPage({ user, apiUrl, logActivity }) {
    const [inventory, setInventory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [showAdjustModal, setShowAdjustModal] = useState(false);
    const [selectedItem, setSelectedItem] = useState(null);
    const [adjustmentType, setAdjustmentType] = useState('SCRAP');
    const [adjustmentQty, setAdjustmentQty] = useState('');
    const [adjustmentNote, setAdjustmentNote] = useState('');
    const [safetyStocks, setSafetyStocks] = useState({});
    const [tempSafetyInput, setTempSafetyInput] = useState({});
    const [customCaseSizes, setCustomCaseSizes] = useState({}); // Hand-tuned case sizes
    const [isAdjusting, setIsAdjusting] = useState(false);
    const [showProductModal, setShowProductModal] = useState(false);

    const fetchInventory = useCallback(async () => {
        setLoading(true);
        try {
            const data = await callGAS(apiUrl, 'getInventory', {}, user.token);
            console.log('Inventory API Response:', data);

            if (Array.isArray(data)) {
                const activeBatches = data.filter(item => {
                    const qty = Number(item.quantity);
                    // [Adjustment] Show negative quantities so the total matches Stocktake view
                    return !isNaN(qty) && qty !== 0;
                });
                console.log('Filtered Inventory:', activeBatches);

                const sortedBatches = sortProducts(activeBatches, 'productName');
                console.log('Sorted Inventory:', sortedBatches);

                setInventory(sortedBatches);
            } else {
                console.error('Inventory data is not an array:', data);
                setInventory([]);
            }
        } catch (error) {
            console.error('Failed to fetch inventory:', error);
            alert('載入庫存失敗: ' + error.message);
            setInventory([]);
        } finally {
            setLoading(false);
        }
    }, [apiUrl, user.token]);

    useEffect(() => {
        const init = async () => {
            if (user?.token) {
                await fetchInventory();
                const savedSafety = safeLocalStorage.getItem('safetyStocks');
                if (savedSafety) {
                    try {
                        setSafetyStocks(JSON.parse(savedSafety));
                    } catch (e) {
                        console.error('Failed to parse safetyStocks:', e);
                    }
                }

                const savedCaseSizes = safeLocalStorage.getItem('customCaseSizes');
                if (savedCaseSizes) {
                    try {
                        setCustomCaseSizes(JSON.parse(savedCaseSizes));
                    } catch (e) {
                        console.error('Failed to parse customCaseSizes:', e);
                    }
                }
            }
        };
        init();
    }, [user.token, fetchInventory]);

    const formatDate = (dateVal) => {
        if (!dateVal) return '-';
        const date = new Date(dateVal);
        // [Fix] Even if date is invalid (e.g. 2026-02-30), format it consistently with slashes
        if (isNaN(date.getTime())) return String(dateVal).replace(/-/g, '/');
        return date.toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' });
    };

    const handleAdjustment = (item) => {
        setSelectedItem(item);
        setAdjustmentQty('');
        setAdjustmentNote('');
        setShowAdjustModal(true);
    };

    const submitAdjustment = async () => {
        if (!adjustmentQty || Number(adjustmentQty) <= 0) {
            alert('請輸入有效數量');
            return;
        }

        if (!adjustmentNote.trim()) {
            alert('請填寫備註原因');
            return;
        }

        setIsAdjusting(true);
        try {
            await callGAS(apiUrl, 'adjustInventory', {
                batchId: selectedItem.batchId,
                type: adjustmentType,
                quantity: Number(adjustmentQty),
                note: adjustmentNote
            }, user.token);

            // Log activity
            if (logActivity) {
                logActivity({
                    actionType: 'DATA_EDIT',
                    page: '庫存檢視',
                    details: JSON.stringify({
                        type: 'ADJUSTMENT',
                        product: selectedItem.productName,
                        adjustType: adjustmentType,
                        quantity: Number(adjustmentQty),
                        note: adjustmentNote
                    })
                });
            }

            alert('庫存異動成功');
            setShowAdjustModal(false);
            fetchInventory();
        } catch (error) {
            alert('異動失敗: ' + error.message);
        } finally {
            setIsAdjusting(false);
        }
    };

    const updateSafetyStock = (productName, level) => {
        const newLevels = { ...safetyStocks, [productName]: Number(level) || 0 };
        setSafetyStocks(newLevels);
        safeLocalStorage.setItem('safetyStocks', JSON.stringify(newLevels));
    };

    const handleSafetyInputChange = (productName, value) => {
        setTempSafetyInput({ ...tempSafetyInput, [productName]: value });
    };

    const handleSafetyInputBlur = (productName) => {
        const value = tempSafetyInput[productName];
        if (value !== undefined) {
            updateSafetyStock(productName, value);
        }
    };

    const updateCustomCaseSize = (productName, size) => {
        const newSizes = { ...customCaseSizes, [productName]: Number(size) || 0 };
        setCustomCaseSizes(newSizes);
        safeLocalStorage.setItem('customCaseSizes', JSON.stringify(newSizes));
    };

    const focusAndSelect = (id) => {
        const el = document.getElementById(id);
        if (el) {
            el.focus();
            el.select?.();
            el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    };

    const handleSafetyKeyDown = (e, idx, field, items, isMobile = false) => {
        const item = items[idx];
        const prefix = isMobile ? 'm-' : '';
        if (e.key === 'Enter' || e.key === 'ArrowRight') {
            e.preventDefault();
            if (field === 'case') {
                focusAndSelect(`${prefix}safety-input-${item.productName}-${item.batchId}`);
            } else if (idx < items.length - 1) {
                const next = items[idx + 1];
                focusAndSelect(`${prefix}case-input-${next.productName}-${next.batchId}`);
            }
        } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            if (field === 'safety') {
                focusAndSelect(`${prefix}case-input-${item.productName}-${item.batchId}`);
            } else if (idx > 0) {
                const prev = items[idx - 1];
                focusAndSelect(`${prefix}safety-input-${prev.productName}-${prev.batchId}`);
            }
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (idx < items.length - 1) {
                const next = items[idx + 1];
                focusAndSelect(`${prefix}${field}-input-${next.productName}-${next.batchId}`);
            }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (idx > 0) {
                const prev = items[idx - 1];
                focusAndSelect(`${prefix}${field}-input-${prev.productName}-${prev.batchId}`);
            }
        }
    };

    const filteredInventory = inventory.filter(item => {
        const name = String(item.productName || '').toLowerCase();
        const term = searchTerm.toLowerCase();

        // Priority: Match product name
        if (name.includes(term)) return true;

        // Optional: Match batch ID only if search term is somewhat specific (e.g., > 6 chars)
        // This prevents short numeric searches from matching every UUID batch ID
        if (term.length > 6) {
            const batch = String(item.batchId || '').toLowerCase();
            return batch.includes(term);
        }

        return false;
    });

    const stockItems = filteredInventory.filter(item => item.type === 'STOCK' || item.type === 'VOID_REFUND');
    const originalItems = filteredInventory.filter(item => item.type !== 'STOCK' && item.type !== 'VOID_REFUND');

    // Calculate total quantity per product for safety check
    const productTotals = {};
    inventory.forEach(item => {
        if (!productTotals[item.productName]) productTotals[item.productName] = 0;
        productTotals[item.productName] += Number(item.quantity);
    });

    // [New] Grouping Logic
    const groupItems = (items) => {
        const groups = {};
        items.forEach(item => {
            if (!groups[item.productName]) {
                groups[item.productName] = [];
            }
            groups[item.productName].push(item);
        });

        // [Adjustment] Aggregate by Expiry Date
        return Object.values(groups).map(group => {
            const expiryMap = {};
            const aggregatedGroup = [];

            group.forEach(item => {
                // Feature: Group by Local Date (fix UTC mismatch)
                let dateKey = 'NO_DATE';
                try {
                    if (item.expiry) {
                        const d = new Date(item.expiry);
                        if (!isNaN(d.getTime())) {
                            // Use local time components to match what user sees
                            const year = d.getFullYear();
                            const month = String(d.getMonth() + 1).padStart(2, '0');
                            const day = String(d.getDate()).padStart(2, '0');
                            dateKey = `${year}-${month}-${day}`;
                        }
                    }
                } catch (e) {
                    console.warn('Invalid date:', item.expiry);
                }

                if (expiryMap[dateKey]) {
                    expiryMap[dateKey].quantity = Number(expiryMap[dateKey].quantity) + Number(item.quantity);
                    // We keep the first batchId for adjustment purposes
                } else {
                    // Clone item to avoid mutating original state
                    expiryMap[dateKey] = { ...item, quantity: Number(item.quantity) };
                    aggregatedGroup.push(expiryMap[dateKey]);
                }
            });

            // Feature: Filter out rows that sum to 0 (e.g., +2 and -2 for same date)
            const nonZeroRows = aggregatedGroup.filter(item => item.quantity !== 0);

            // Sort: Oldest first, No-Date last
            nonZeroRows.sort((a, b) => {
                if (a.expiry === b.expiry) return 0;
                if (!a.expiry) return 1;
                if (!b.expiry) return -1;
                return new Date(a.expiry) - new Date(b.expiry);
            });

            return nonZeroRows;
        }).filter(group => {
            if (group.length === 0) return false;
            // Feature: Hide product if total quantity is 0 (even if it has + and - rows)
            const groupTotal = group.reduce((sum, item) => sum + Number(item.quantity), 0);
            return groupTotal !== 0;
        });
    };

    const groupedStockItems = groupItems(stockItems);
    const groupedOriginalItems = groupItems(originalItems);

    const renderInventoryTable = (groupedItems, title, Icon, colorClass) => (
        <div className="hidden md:flex bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-primary)] p-6 flex-col shadow-sm">
            <h3 className={`text-lg font-bold mb-4 flex items-center gap-2 ${colorClass}`}>
                <Icon size={20} /> {title}
            </h3>
            <div className="rounded-lg border border-[var(--border-primary)] overflow-hidden">
                <table className="w-full text-left border-collapse">
                    <thead className="bg-[var(--bg-tertiary)] text-[var(--text-secondary)] text-sm uppercase">
                        <tr>
                            <th className="p-4 w-1/4">產品名稱</th>
                            <th className="p-4 text-center w-24">數量</th>
                            <th className="p-4 w-32">效期</th>
                            {user.role !== 'EMPLOYEE' && (
                                <>
                                    <th className="p-4 text-center w-24">每箱規格</th>
                                    <th className="p-4 text-center w-24">安全庫存</th>
                                    <th className="p-4 text-center w-20">操作</th>
                                </>
                            )}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-primary)]">
                        {loading ? (
                            <tr><td colSpan={user.role === 'EMPLOYEE' ? "3" : "6"} className="p-6 text-center text-[var(--text-secondary)]">載入中...</td></tr>
                        ) : groupedItems.length === 0 ? (
                            <tr><td colSpan={user.role === 'EMPLOYEE' ? "3" : "6"} className="p-6 text-center text-[var(--text-secondary)]">無資料</td></tr>
                        ) : (
                            groupedItems.map((group, groupIdx) => {
                                const firstItem = group[0];
                                const productName = firstItem.productName;
                                const safetyLevel = safetyStocks[productName] || 0;
                                const customCaseSize = customCaseSizes[productName];
                                const currentCaseSize = customCaseSize !== undefined && customCaseSize !== 0 ? customCaseSize : (CASE_MAP[productName] || 0);
                                const totalQty = productTotals[productName] || 0;
                                const isLowStock = safetyLevel > 0 && totalQty <= safetyLevel;

                                return (
                                    <React.Fragment key={productName}>
                                        {group.map((item, idx) => {
                                            const isLast = idx === group.length - 1;

                                            // Expiry Logic
                                            const expiryDate = item.expiry ? new Date(item.expiry) : null;
                                            const today = new Date();
                                            today.setHours(0, 0, 0, 0);
                                            const threeDaysLater = new Date(today);
                                            threeDaysLater.setDate(today.getDate() + 3);
                                            const isExpiringSoon = expiryDate && expiryDate >= today && expiryDate <= threeDaysLater;
                                            const isExpired = expiryDate && expiryDate < today;

                                            return (
                                                <tr key={item.batchId} className={`hover:bg-[var(--bg-hover)] transition-colors ${isLowStock ? 'bg-red-50/10' : ''} ${!isLast ? 'border-b border-dashed border-slate-200' : ''}`}>
                                                    {/* Product Name - Merged Cell */}
                                                    {idx === 0 && (
                                                        <td className="p-4 font-medium text-[var(--text-primary)] align-top pt-6 border-r border-[var(--border-primary)]/50" rowSpan={group.length}>
                                                            <div className="flex flex-col gap-1">
                                                                <div className="flex items-center gap-2">
                                                                    {isLowStock && <AlertTriangle size={16} className="text-red-400" />}
                                                                    <span className="font-bold text-lg">{productName}</span>
                                                                </div>
                                                                <span className="text-xs text-[var(--text-secondary)]">
                                                                    總庫存: <span className="font-mono font-bold text-emerald-600 text-sm">{totalQty}</span>
                                                                    {currentCaseSize > 0 && (
                                                                        <span className="ml-2 text-blue-600">({(totalQty / currentCaseSize).toFixed(1)}箱)</span>
                                                                    )}
                                                                </span>
                                                            </div>
                                                        </td>
                                                    )}

                                                    {/* Quantity */}
                                                    <td className="p-4 text-center">
                                                        <span className={`font-mono font-bold text-lg ${Number(item.quantity) < 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                                                            {item.quantity}
                                                        </span>
                                                    </td>

                                                    {/* Expiry */}
                                                    <td className="p-4 text-sm whitespace-nowrap">
                                                        <div className="flex flex-col gap-1">
                                                            <span className={isExpired ? 'text-rose-500 line-through' : isExpiringSoon ? 'text-amber-500 font-bold' : 'text-[var(--text-secondary)]'}>
                                                                {formatDate(item.expiry)}
                                                            </span>
                                                            {isExpiringSoon && (
                                                                <span className="text-[10px] bg-amber-100 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded self-start flex items-center gap-1 font-bold">
                                                                    <Clock size={10} /> 即將過期
                                                                </span>
                                                            )}
                                                            {isExpired && (
                                                                <span className="text-[10px] bg-rose-100 text-rose-700 border border-rose-200 px-1.5 py-0.5 rounded self-start flex items-center gap-1 font-bold">
                                                                    <AlertTriangle size={10} /> 已過期
                                                                </span>
                                                            )}
                                                        </div>
                                                    </td>

                                                    {/* Case Size - Merged Cell */}
                                                    {user.role !== 'EMPLOYEE' && idx === 0 && (
                                                        <td className="p-4 text-center align-top pt-5 border-l border-[var(--border-primary)]/50" rowSpan={group.length}>
                                                            <input
                                                                id={`case-input-${productName}`}
                                                                type="number"
                                                                className="input-field w-16 text-center text-xs p-1 border-blue-200/30"
                                                                value={customCaseSize !== undefined ? customCaseSize : (CASE_MAP[productName] || '')}
                                                                onChange={(e) => updateCustomCaseSize(productName, e.target.value)}
                                                                placeholder="箱規"
                                                            />
                                                            {currentCaseSize > 0 && <div className="text-[10px] text-slate-400 mt-1">預設: {CASE_MAP[productName] || '-'}</div>}
                                                        </td>
                                                    )}

                                                    {/* Safety Stock - Merged Cell */}
                                                    {user.role !== 'EMPLOYEE' && idx === 0 && (
                                                        <td className="p-4 text-center align-top pt-5 border-l border-[var(--border-primary)]/50" rowSpan={group.length}>
                                                            <input
                                                                id={`safety-input-${productName}`}
                                                                type="number"
                                                                className="input-field w-16 text-center text-xs p-1 border-amber-200/30"
                                                                value={tempSafetyInput[productName] !== undefined ? tempSafetyInput[productName] : (safetyStocks[productName] || '')}
                                                                onChange={(e) => handleSafetyInputChange(productName, e.target.value)}
                                                                onBlur={() => handleSafetyInputBlur(productName)}
                                                                placeholder="低標"
                                                            />
                                                        </td>
                                                    )}

                                                    {/* Action */}
                                                    {user.role !== 'EMPLOYEE' && (
                                                        <td className="p-4 text-center">
                                                            <button
                                                                onClick={() => handleAdjustment(item)}
                                                                className="btn-secondary text-xs px-3 py-1 flex items-center gap-1 mx-auto"
                                                                title="單批次異動"
                                                            >
                                                                <Trash2 size={14} /> 異動
                                                            </button>
                                                        </td>
                                                    )}
                                                </tr>
                                            );
                                        })}
                                    </React.Fragment>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );

    const renderInventoryCards = (groupedItems, title, Icon, colorClass) => (
        <div className="md:hidden flex flex-col gap-4">
            <h3 className={`text-lg font-bold flex items-center gap-2 ${colorClass} px-1`}>
                <Icon size={20} /> {title}
            </h3>
            <div className="space-y-4">
                {loading ? (
                    <div className="text-center py-8 text-[var(--text-secondary)]">載入中...</div>
                ) : groupedItems.length === 0 ? (
                    <div className="text-center py-8 text-[var(--text-secondary)] bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-primary)]">無資料</div>
                ) : (
                    groupedItems.map((group, idx) => {
                        const firstItem = group[0];
                        const productName = firstItem.productName;
                        const safetyLevel = safetyStocks[productName] || 0;
                        const customCaseSize = customCaseSizes[productName];
                        const currentCaseSize = customCaseSize !== undefined && customCaseSize !== 0 ? customCaseSize : (CASE_MAP[productName] || 0);
                        const totalQty = productTotals[productName] || 0;
                        const isLowStock = safetyLevel > 0 && totalQty <= safetyLevel;

                        return (
                            <div key={idx} className={`bg-[var(--bg-secondary)] rounded-xl p-4 border shadow-sm ${isLowStock ? 'border-red-500/30 bg-red-500/5' : 'border-[var(--border-primary)]'}`}>
                                {/* Header: Product Name & Total Stock */}
                                <div className="flex justify-between items-start mb-3 border-b border-[var(--border-primary)] pb-2">
                                    <div className="flex items-center gap-2">
                                        {isLowStock && <AlertTriangle size={18} className="text-red-500" />}
                                        <span className="font-bold text-[var(--text-primary)] text-lg">{productName}</span>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-2xl font-bold text-emerald-600 font-mono">{totalQty}</div>
                                        {currentCaseSize > 0 && (
                                            <div className="text-xs text-blue-600 font-mono">
                                                箱：{(totalQty / currentCaseSize).toFixed(1)}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Batches List */}
                                <div className="space-y-2 mb-3">
                                    {group.map((item, bIdx) => {
                                        const expiryDate = item.expiry ? new Date(item.expiry) : null;
                                        const today = new Date();
                                        today.setHours(0, 0, 0, 0);
                                        const isExpired = expiryDate && expiryDate < today;

                                        return (
                                            <div key={bIdx} className="flex justify-between items-center bg-[var(--bg-tertiary)] p-2 rounded text-sm">
                                                <div className="flex flex-col">
                                                    <span className={`font-mono ${isExpired ? 'text-rose-600 line-through' : 'text-[var(--text-secondary)]'}`}>
                                                        {formatDate(item.expiry)}
                                                    </span>
                                                    {isExpired && <span className="text-[10px] text-rose-500 font-bold">已過期</span>}
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <span className={`font-mono font-bold ${Number(item.quantity) < 0 ? 'text-red-500' : 'text-emerald-700'}`}>
                                                        {item.quantity}
                                                    </span>
                                                    {user.role !== 'EMPLOYEE' && (
                                                        <button onClick={() => handleAdjustment(item)} className="text-[var(--text-tertiary)] hover:text-red-500 p-1">
                                                            <Trash2 size={14} />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Controls: Case Size & Low Stock */}
                                {user.role !== 'EMPLOYEE' && (
                                    <div className="grid grid-cols-2 gap-3 mt-3 border-t border-[var(--border-primary)] pt-3">
                                        <div className="flex items-center justify-between gap-1">
                                            <span className="text-[10px] text-[var(--text-tertiary)] uppercase font-bold">箱規</span>
                                            <input
                                                type="number"
                                                className="w-12 text-center text-xs p-0.5 rounded border border-[var(--border-primary)] bg-[var(--bg-primary)]"
                                                value={customCaseSize !== undefined ? customCaseSize : (CASE_MAP[productName] || '')}
                                                onChange={(e) => updateCustomCaseSize(productName, e.target.value)}
                                            />
                                        </div>
                                        <div className="flex items-center justify-between gap-1">
                                            <span className="text-[10px] text-[var(--text-tertiary)] uppercase font-bold">低標</span>
                                            <input
                                                type="number"
                                                className="w-12 text-center text-xs p-0.5 rounded border border-[var(--border-primary)] bg-[var(--bg-primary)]"
                                                value={tempSafetyInput[productName] !== undefined ? tempSafetyInput[productName] : (safetyStocks[productName] || '')}
                                                onChange={(e) => handleSafetyInputChange(productName, e.target.value)}
                                                onBlur={() => handleSafetyInputBlur(productName)}
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );

    return (
        <div className="max-w-6xl mx-auto h-[calc(100vh-6rem)] flex flex-col p-4 gap-4">
            {/* Search Bar - Responsive */}
            <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center bg-[var(--bg-secondary)] p-4 rounded-xl border border-[var(--border-primary)] shadow-sm gap-4">
                <h2 className="text-xl md:text-2xl font-bold flex items-center gap-2 text-[var(--text-primary)]">
                    <Package className="text-blue-600" /> 庫存檢視
                </h2>
                <div className="flex gap-2 w-full md:w-auto">
                    <div className="relative flex-1 md:flex-none">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" size={18} />
                        <input
                            type="text"
                            placeholder="搜尋產品..."
                            className="input-field pl-10 w-full md:w-64"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <button onClick={fetchInventory} className="btn-secondary p-2 whitespace-nowrap" title="重新整理">
                        <RefreshCw size={20} />
                    </button>
                    {user.role === 'BOSS' && (
                        <button
                            onClick={() => setShowProductModal(true)}
                            className="btn-primary px-3 py-2 text-sm flex items-center gap-1 whitespace-nowrap"
                        >
                            <Edit2 size={16} /> 商品管理
                        </button>
                    )}
                </div>
            </div>

            <div className="flex-1 overflow-y-auto flex flex-col gap-6 pb-6">
                {renderInventoryTable(groupedStockItems, "現貨進貨", Package, "text-blue-600")}
                {renderInventoryCards(groupedStockItems, "現貨進貨", Package, "text-blue-600")}

                {renderInventoryTable(groupedOriginalItems, "原貨/退貨", AlertCircle, "text-orange-600")}
                {renderInventoryCards(groupedOriginalItems, "原貨/退貨", AlertCircle, "text-orange-600")}
            </div>

            {showAdjustModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    {isAdjusting && (
                        <div className="loading-overlay">
                            <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                            <p className="text-lg font-bold text-slate-800">異動處理中，請稍後...</p>
                        </div>
                    )}
                    <div className="glass-panel p-6 w-96 max-w-[90vw]">
                        <h3 className="text-xl font-bold mb-4">庫存異動</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="text-sm text-[var(--text-secondary)] block mb-1">產品資訊</label>
                                <div className="flex justify-between items-center p-2 bg-[var(--bg-tertiary)] rounded-lg border border-[var(--border-primary)]">
                                    <div className="text-[var(--text-primary)] font-bold">{selectedItem?.productName}</div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-slate-400">當前庫存:</span>
                                        <span className="text-emerald-600 font-mono font-bold text-lg">{selectedItem?.quantity}</span>
                                    </div>
                                </div>
                            </div>
                            <div>
                                <label className="text-sm text-slate-400 block mb-1">異動類型</label>
                                <select
                                    className="input-field w-full"
                                    value={adjustmentType}
                                    onChange={(e) => setAdjustmentType(e.target.value)}
                                >
                                    <option value="SCRAP">報廢</option>
                                    <option value="RETURN">退貨</option>
                                    <option value="LOSS">損耗</option>
                                    <option value="OTHER">其他</option>
                                </select>
                            </div>
                            <div>
                                <label className="text-sm text-slate-400 block mb-1">異動數量</label>
                                <input
                                    id="adjustment-qty-input"
                                    type="number"
                                    className="input-field w-full"
                                    value={adjustmentQty}
                                    onChange={(e) => setAdjustmentQty(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === 'ArrowDown') {
                                            e.preventDefault();
                                            document.getElementById('adjustment-note-input')?.focus();
                                        }
                                    }}
                                    placeholder="輸入數量"
                                    autoFocus
                                />
                            </div>
                            <div>
                                <label className="text-sm text-slate-400 block mb-1">備註 <span className="text-red-400">*</span></label>
                                <textarea
                                    id="adjustment-note-input"
                                    className="input-field w-full"
                                    rows="3"
                                    value={adjustmentNote}
                                    onChange={(e) => setAdjustmentNote(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            submitAdjustment();
                                        } else if (e.key === 'ArrowUp') {
                                            e.preventDefault();
                                            document.getElementById('adjustment-qty-input')?.focus();
                                        }
                                    }}
                                    placeholder="輸入備註原因（必填）..."
                                />
                            </div>
                            <div className="flex gap-2">
                                <button onClick={submitAdjustment} className="btn-primary flex-1">
                                    確認異動
                                </button>
                                <button onClick={() => setShowAdjustModal(false)} className="btn-secondary flex-1">
                                    取消
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {showProductModal && (
                <ProductManagementModal
                    isOpen={showProductModal}
                    onClose={() => {
                        setShowProductModal(false);
                        fetchInventory();
                    }}
                    apiUrl={apiUrl}
                    token={user.token}
                />
            )}
        </div>
    );
}

function ProductManagementModal({ isOpen, onClose, apiUrl, token }) {
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [savingId, setSavingId] = useState(null);
    const [tempFlavorChoices, setTempFlavorChoices] = useState({}); // { [productId]: string }

    const fetchProducts = async () => {
        setLoading(true);
        try {
            const data = await callGAS(apiUrl, 'getProducts', {}, token);
            if (Array.isArray(data)) {
                setProducts(data);
                
                // 初始化口味輸入框的暫存字串
                const initialTemp = {};
                data.forEach(p => {
                    initialTemp[p.id] = Array.isArray(p.flavor_choices) ? p.flavor_choices.join(', ') : '';
                });
                setTempFlavorChoices(initialTemp);
            }
        } catch (error) {
            alert('載入商品失敗: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen) {
            fetchProducts();
        }
    }, [isOpen]);

    const handleFieldChange = (id, field, value) => {
        setProducts(prev => prev.map(p => p.id === id ? { ...p, [field]: value, _dirty: true } : p));
    };

    const handleSave = async (product) => {
        setSavingId(product.id);
        try {
            // 從暫存字串中解析口味陣列（相容中英文逗號）
            const rawStr = tempFlavorChoices[product.id] || '';
            const parsedFlavors = rawStr.split(/[,，]/).map(s => s.trim()).filter(Boolean);

            const res = await callGAS(apiUrl, 'updateProductDetails', {
                productId: product.id,
                isActive: product.isActive,
                imageUrl: product.imageUrl,
                expiryDate: product.expiryDate,
                has_flavor_attributes: product.has_flavor_attributes,
                flavor_choices: parsedFlavors,
                single_price: product.single_price,
                has_volume_pricing: product.has_volume_pricing,
                volume_pricing_settings: product.volume_pricing_settings
            }, token);
            
            if (res && res.error) {
                throw new Error(res.error);
            }
            
            setProducts(prev => prev.map(p => p.id === product.id ? { ...p, flavor_choices: parsedFlavors, _dirty: false } : p));
            alert(`${product.name} 儲存成功`);
        } catch (error) {
            alert('儲存失敗: ' + error.message);
        } finally {
            setSavingId(null);
        }
    };

    if (!isOpen) return null;

    const filtered = products.filter(p => 
        String(p.name || '').toLowerCase().includes(search.toLowerCase()) ||
        String(p.id || '').toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-fade-in">
            <div className="bg-[var(--bg-secondary)] rounded-2xl border border-[var(--border-primary)] shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden glass-panel">
                <div className="p-5 border-b border-[var(--border-primary)] flex justify-between items-center bg-[var(--bg-tertiary)]">
                    <h3 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
                        <Package className="text-blue-500" size={22} />
                        商品上架與屬性管理
                    </h3>
                    <button onClick={onClose} className="text-[var(--text-secondary)] hover:text-red-500 transition-colors p-1.5 rounded-lg hover:bg-[var(--bg-hover)]">
                        <X size={20} />
                    </button>
                </div>
                
                <div className="p-4 bg-[var(--bg-secondary)] border-b border-[var(--border-primary)] flex gap-4 items-center">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" size={18} />
                        <input
                            type="text"
                            placeholder="搜尋商品名稱或ID..."
                            className="input-field pl-10 w-full"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                    <button onClick={fetchProducts} className="btn-secondary p-2 rounded-lg" title="重新整理">
                        <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 bg-[var(--bg-primary)]">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-20 gap-3 text-[var(--text-secondary)]">
                            <RefreshCw className="animate-spin text-blue-500" size={36} />
                            <span>載入中，請稍候...</span>
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="text-center py-20 text-[var(--text-secondary)] bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-primary)]">
                            無商品資料
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {filtered.map(product => (
                                <div key={product.id} className="flex flex-col gap-4 p-4 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] hover:border-blue-500/20 transition-all shadow-sm">
                                    {/* Top row: Image & General info */}
                                    <div className="flex flex-col md:flex-row md:items-center gap-4">
                                        {/* 圖片預覽 */}
                                        <div className="w-16 h-16 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-tertiary)] overflow-hidden flex items-center justify-center flex-shrink-0 relative group">
                                            {product.imageUrl ? (
                                                <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" onError={(e) => { e.target.onerror = null; e.target.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'; }} />
                                            ) : (
                                                <Image size={24} className="text-[var(--text-tertiary)]" />
                                            )}
                                        </div>

                                        {/* 商品資訊 */}
                                        <div className="flex-1 min-w-[150px]">
                                            <div className="font-bold text-base text-[var(--text-primary)]">{product.name}</div>
                                            <div className="text-xs text-[var(--text-tertiary)] font-mono mt-0.5">ID: {product.id}</div>
                                            <div className="text-sm text-blue-600 font-bold mt-1">單價: ${product.price}</div>
                                        </div>

                                        {/* 上架狀態 & 有效日期 */}
                                        <div className="flex items-center gap-4 flex-shrink-0">
                                            <div className="flex flex-col gap-1">
                                                <span className="text-[10px] uppercase font-bold text-[var(--text-tertiary)]">有效日期</span>
                                                <input
                                                    type="date"
                                                    className="input-field text-xs p-1.5 w-32"
                                                    value={product.expiryDate || ''}
                                                    onChange={(e) => handleFieldChange(product.id, 'expiryDate', e.target.value)}
                                                />
                                            </div>
                                            <div className="flex flex-col gap-1 items-center">
                                                <span className="text-[10px] uppercase font-bold text-[var(--text-tertiary)]">上架</span>
                                                <label className="relative inline-flex items-center cursor-pointer mt-1">
                                                    <input
                                                        type="checkbox"
                                                        className="sr-only peer"
                                                        checked={!!product.isActive}
                                                        onChange={(e) => handleFieldChange(product.id, 'isActive', e.target.checked)}
                                                    />
                                                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                                                </label>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Middle row: Extended attributes grid */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-2 border-t border-[var(--border-primary)]/50 text-xs">
                                        {/* Image URL input */}
                                        <div className="flex flex-col gap-1">
                                            <span className="text-[10px] uppercase font-bold text-[var(--text-tertiary)]">圖片網址</span>
                                            <input
                                                type="text"
                                                className="input-field text-xs p-1.5"
                                                placeholder="圖片網址 https://..."
                                                value={product.imageUrl || ''}
                                                onChange={(e) => handleFieldChange(product.id, 'imageUrl', e.target.value)}
                                            />
                                        </div>

                                        {/* Flavor Attributes settings */}
                                        <div className="flex flex-col gap-1">
                                            <div className="flex justify-between items-center">
                                                <span className="text-[10px] uppercase font-bold text-[var(--text-tertiary)]">多規格口味</span>
                                                <label className="relative inline-flex items-center cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        className="sr-only peer"
                                                        checked={!!product.has_flavor_attributes}
                                                        onChange={(e) => handleFieldChange(product.id, 'has_flavor_attributes', e.target.checked)}
                                                    />
                                                    <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                                                </label>
                                            </div>
                                            <input
                                                type="text"
                                                className="input-field text-xs p-1.5"
                                                placeholder="口味選項，以逗號分隔，例：麥芽, 蘋果"
                                                disabled={!product.has_flavor_attributes}
                                                value={tempFlavorChoices[product.id] || ''}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    setTempFlavorChoices(prev => ({ ...prev, [product.id]: val }));
                                                    handleFieldChange(product.id, '_dirty', true);
                                                }}
                                            />
                                        </div>

                                        {/* Volume Pricing settings */}
                                        <div className="flex flex-col gap-1 border-t sm:border-t-0 sm:border-l border-[var(--border-primary)]/50 sm:pl-3">
                                            <div className="flex justify-between items-center">
                                                <span className="text-[10px] uppercase font-bold text-[var(--text-tertiary)]">啟用階梯組合價</span>
                                                <label className="relative inline-flex items-center cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        className="sr-only peer"
                                                        checked={!!product.has_volume_pricing}
                                                        onChange={(e) => handleFieldChange(product.id, 'has_volume_pricing', e.target.checked)}
                                                    />
                                                    <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                                                </label>
                                            </div>
                                            <div className="flex gap-2">
                                                <div className="flex-1">
                                                    <input
                                                        type="number"
                                                        className="input-field text-xs p-1.5"
                                                        placeholder="單件原價"
                                                        value={product.single_price || ''}
                                                        onChange={(e) => handleFieldChange(product.id, 'single_price', e.target.value !== '' ? Number(e.target.value) : '')}
                                                    />
                                                </div>
                                                <div className="flex-1 flex gap-1 items-center font-mono">
                                                    <input
                                                        type="number"
                                                        className="input-field text-xs p-1.5 w-12 text-center"
                                                        placeholder="件數"
                                                        disabled={!product.has_volume_pricing}
                                                        value={product.volume_pricing_settings?.target_quantity || ''}
                                                        onChange={(e) => {
                                                            const settings = {
                                                                ...(product.volume_pricing_settings || {}),
                                                                target_quantity: e.target.value !== '' ? Number(e.target.value) : 0
                                                            };
                                                            handleFieldChange(product.id, 'volume_pricing_settings', settings);
                                                        }}
                                                    />
                                                    <span className="text-[10px] text-[var(--text-tertiary)]">件</span>
                                                    <input
                                                        type="number"
                                                        className="input-field text-xs p-1.5 flex-1"
                                                        placeholder="組合價"
                                                        disabled={!product.has_volume_pricing}
                                                        value={product.volume_pricing_settings?.package_price || ''}
                                                        onChange={(e) => {
                                                            const settings = {
                                                                ...(product.volume_pricing_settings || {}),
                                                                package_price: e.target.value !== '' ? Number(e.target.value) : 0
                                                            };
                                                            handleFieldChange(product.id, 'volume_pricing_settings', settings);
                                                        }}
                                                    />
                                                    <span className="text-[10px] text-[var(--text-tertiary)]">元</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Action row (Save button) */}
                                    <div className="flex justify-end pt-2 border-t border-[var(--border-primary)]/30">
                                        <button
                                            disabled={savingId === product.id || !product._dirty}
                                            onClick={() => handleSave(product)}
                                            className={`px-4 py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition-all ${
                                                product._dirty 
                                                    ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-md active:scale-95' 
                                                    : 'bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-not-allowed'
                                            }`}
                                        >
                                            <Save size={14} />
                                            {savingId === product.id ? '儲存中...' : '儲存變更'}
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
