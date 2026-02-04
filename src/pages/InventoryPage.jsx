import React, { useState, useEffect, useCallback } from 'react';
import { Package, Search, AlertCircle, RefreshCw, AlertTriangle, Trash2, Clock } from 'lucide-react';
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
                const savedSafety = localStorage.getItem('safetyStocks');
                if (savedSafety) setSafetyStocks(JSON.parse(savedSafety));

                const savedCaseSizes = localStorage.getItem('customCaseSizes');
                if (savedCaseSizes) setCustomCaseSizes(JSON.parse(savedCaseSizes));
            }
        };
        init();
    }, [user.token, fetchInventory]);

    const formatDate = (dateVal) => {
        if (!dateVal) return '-';
        const date = new Date(dateVal);
        if (isNaN(date.getTime())) return String(dateVal);
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
        localStorage.setItem('safetyStocks', JSON.stringify(newLevels));
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
        localStorage.setItem('customCaseSizes', JSON.stringify(newSizes));
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

    const stockItems = filteredInventory.filter(item => item.type === 'STOCK');
    const originalItems = filteredInventory.filter(item => item.type !== 'STOCK');

    // Calculate total quantity per product for safety check
    const productTotals = {};
    inventory.forEach(item => {
        if (!productTotals[item.productName]) productTotals[item.productName] = 0;
        productTotals[item.productName] += Number(item.quantity);
    });

    const renderInventoryTable = (items, title, Icon, colorClass) => (
        <div className="hidden md:flex bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-primary)] p-6 flex-col shadow-sm">
            <h3 className={`text-lg font-bold mb-4 flex items-center gap-2 ${colorClass}`}>
                <Icon size={20} /> {title}
            </h3>
            <div className="rounded-lg border border-[var(--border-primary)] overflow-hidden">
                <table className="w-full text-left border-collapse">
                    <thead className="bg-[var(--bg-tertiary)] text-[var(--text-secondary)] text-sm uppercase">
                        <tr>
                            <th className="p-4">產品名稱</th>
                            <th className="p-4 text-center">數量 / 箱數</th>
                            <th className="p-4">效期</th>
                            <th className="p-4 text-center">每箱規格</th>
                            <th className="p-4 text-center">安全庫存</th>
                            <th className="p-4 text-center">操作</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-primary)]">
                        {loading ? (
                            <tr><td colSpan="6" className="p-6 text-center text-[var(--text-secondary)]">載入中...</td></tr>
                        ) : items.length === 0 ? (
                            <tr><td colSpan="6" className="p-6 text-center text-[var(--text-secondary)]">無資料</td></tr>
                        ) : (
                            items.map((item, idx) => {
                                const safetyLevel = safetyStocks[item.productName] || 0;
                                const customCaseSize = customCaseSizes[item.productName];
                                const currentCaseSize = customCaseSize !== undefined && customCaseSize !== 0 ? customCaseSize : (CASE_MAP[item.productName] || 0);

                                const totalQty = productTotals[item.productName] || 0;
                                const isLowStock = safetyLevel > 0 && totalQty <= safetyLevel;

                                // 效期判斷邏輯 (大約抓三天)
                                const expiryDate = item.expiry ? new Date(item.expiry) : null;
                                const today = new Date();
                                today.setHours(0, 0, 0, 0);
                                const threeDaysLater = new Date(today);
                                threeDaysLater.setDate(today.getDate() + 3);

                                const isExpiringSoon = expiryDate && expiryDate >= today && expiryDate <= threeDaysLater;
                                const isExpired = expiryDate && expiryDate < today;

                                return (
                                    <tr key={idx} className={`hover:bg-[var(--bg-hover)] transition-colors ${isLowStock ? 'bg-red-50/10' : ''} ${isExpired ? 'bg-rose-50/10' : isExpiringSoon ? 'bg-amber-50/10' : ''}`}>
                                        <td className="p-4 font-medium text-[var(--text-primary)]">
                                            <div className="flex items-center gap-2">
                                                {isLowStock && <AlertTriangle size={16} className="text-red-400" />}
                                                {item.productName}
                                            </div>
                                        </td>
                                        <td className="p-4 text-center">
                                            <div className="flex flex-col items-center">
                                                <span className="font-mono text-emerald-600 font-bold text-lg">{item.quantity}</span>
                                                {currentCaseSize > 0 && (
                                                    <span className="text-blue-600 font-mono text-sm">
                                                        箱：{(item.quantity / currentCaseSize).toFixed(1)}
                                                    </span>
                                                )}
                                            </div>
                                        </td>
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
                                        <td className="p-4 text-center">
                                            <input
                                                id={`case-input-${item.productName}-${item.batchId}`}
                                                type="number"
                                                className="input-field w-16 text-center text-xs p-1 border-blue-200/30"
                                                value={customCaseSize !== undefined ? customCaseSize : (CASE_MAP[item.productName] || '')}
                                                onChange={(e) => updateCustomCaseSize(item.productName, e.target.value)}
                                                onKeyDown={(e) => handleSafetyKeyDown(e, idx, 'case', items)}
                                                placeholder="箱規"
                                            />
                                        </td>
                                        <td className="p-4 text-center">
                                            <input
                                                id={`safety-input-${item.productName}-${item.batchId}`}
                                                type="number"
                                                className="input-field w-16 text-center text-xs p-1 border-amber-200/30"
                                                value={tempSafetyInput[item.productName] !== undefined ? tempSafetyInput[item.productName] : (safetyStocks[item.productName] || '')}
                                                onChange={(e) => handleSafetyInputChange(item.productName, e.target.value)}
                                                onBlur={() => handleSafetyInputBlur(item.productName)}
                                                onKeyDown={(e) => handleSafetyKeyDown(e, idx, 'safety', items)}
                                                placeholder="低標"
                                            />
                                        </td>
                                        <td className="p-4 text-center">
                                            <button
                                                onClick={() => handleAdjustment(item)}
                                                className="btn-secondary text-xs px-3 py-1 flex items-center gap-1 mx-auto"
                                            >
                                                <Trash2 size={14} /> 異動
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );

    const renderInventoryCards = (items, title, Icon, colorClass) => (
        <div className="md:hidden flex flex-col gap-4">
            <h3 className={`text-lg font-bold flex items-center gap-2 ${colorClass} px-1`}>
                <Icon size={20} /> {title}
            </h3>
            <div className="space-y-4">
                {loading ? (
                    <div className="text-center py-8 text-[var(--text-secondary)]">載入中...</div>
                ) : items.length === 0 ? (
                    <div className="text-center py-8 text-[var(--text-secondary)] bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-primary)]">無資料</div>
                ) : (
                    items.map((item, idx) => {
                        const safetyLevel = safetyStocks[item.productName] || 0;
                        const customCaseSize = customCaseSizes[item.productName];
                        const currentCaseSize = customCaseSize !== undefined && customCaseSize !== 0 ? customCaseSize : (CASE_MAP[item.productName] || 0);

                        const totalQty = productTotals[item.productName] || 0;
                        const isLowStock = safetyLevel > 0 && totalQty <= safetyLevel;

                        const expiryDate = item.expiry ? new Date(item.expiry) : null;
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        const threeDaysLater = new Date(today);
                        threeDaysLater.setDate(today.getDate() + 3);

                        const isExpiringSoon = expiryDate && expiryDate >= today && expiryDate <= threeDaysLater;
                        const isExpired = expiryDate && expiryDate < today;

                        return (
                            <div key={idx} className={`bg-[var(--bg-secondary)] rounded-xl p-4 border shadow-sm ${isLowStock ? 'border-red-500/30 bg-red-500/5' : 'border-[var(--border-primary)]'}`}>
                                {/* Header: Product Name & Stock */}
                                <div className="flex justify-between items-start mb-3 border-b border-[var(--border-primary)] pb-2">
                                    <div className="flex items-center gap-2">
                                        {isLowStock && <AlertTriangle size={18} className="text-red-500" />}
                                        <span className="font-bold text-[var(--text-primary)] text-lg">{item.productName}</span>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-2xl font-bold text-emerald-600 font-mono">{item.quantity}</div>
                                        {currentCaseSize > 0 && (
                                            <div className="text-xs text-blue-600 font-mono">
                                                箱：{(item.quantity / currentCaseSize).toFixed(1)}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Details Grid */}
                                <div className="grid grid-cols-2 gap-3 mb-3">
                                    <div className="bg-[var(--bg-tertiary)] p-2 rounded-lg">
                                        <span className="text-[10px] text-[var(--text-tertiary)] uppercase font-bold block mb-1">效期</span>
                                        <div className="flex flex-col">
                                            <span className={`text-sm font-medium ${isExpired ? 'text-rose-600 line-through' : isExpiringSoon ? 'text-amber-600 font-bold' : 'text-slate-600'}`}>
                                                {formatDate(item.expiry)}
                                            </span>
                                            {isExpiringSoon && (
                                                <span className="text-[10px] text-amber-600 flex items-center gap-1 mt-0.5">
                                                    <Clock size={10} /> 即將過期
                                                </span>
                                            )}
                                            {isExpired && (
                                                <span className="text-[10px] text-rose-600 flex items-center gap-1 mt-0.5">
                                                    <AlertTriangle size={10} /> 已過期
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="bg-[var(--bg-tertiary)] p-2 rounded-lg flex flex-col justify-between">
                                        <div className="flex items-center justify-between gap-1 mb-1">
                                            <span className="text-[10px] text-[var(--text-tertiary)] uppercase font-bold">箱規</span>
                                            <input
                                                id={`m-case-input-${item.productName}-${item.batchId}`}
                                                type="number"
                                                className="w-12 text-center text-xs p-0.5 rounded border border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-primary)]"
                                                value={customCaseSize !== undefined ? customCaseSize : (CASE_MAP[item.productName] || '')}
                                                onChange={(e) => updateCustomCaseSize(item.productName, e.target.value)}
                                                onKeyDown={(e) => handleSafetyKeyDown(e, idx, 'case', items, true)}
                                            />
                                        </div>
                                        <div className="flex items-center justify-between gap-1">
                                            <span className="text-[10px] text-[var(--text-tertiary)] uppercase font-bold">低標</span>
                                            <input
                                                id={`m-safety-input-${item.productName}-${item.batchId}`}
                                                type="number"
                                                className="w-12 text-center text-xs p-0.5 rounded border border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-primary)]"
                                                value={tempSafetyInput[item.productName] !== undefined ? tempSafetyInput[item.productName] : (safetyStocks[item.productName] || '')}
                                                onChange={(e) => handleSafetyInputChange(item.productName, e.target.value)}
                                                onBlur={() => handleSafetyInputBlur(item.productName)}
                                                onKeyDown={(e) => handleSafetyKeyDown(e, idx, 'safety', items, true)}
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Footer: Action */}
                                <button
                                    onClick={() => handleAdjustment(item)}
                                    className="w-full btn-secondary py-2 flex items-center justify-center gap-2 text-sm"
                                >
                                    <Trash2 size={16} /> 庫存異動
                                </button>
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
                </div>
            </div>

            <div className="flex-1 overflow-y-auto flex flex-col gap-6 pb-6">
                {renderInventoryTable(stockItems, "現貨進貨", Package, "text-blue-600")}
                {renderInventoryCards(stockItems, "現貨進貨", Package, "text-blue-600")}

                {renderInventoryTable(originalItems, "原貨/退貨", AlertCircle, "text-orange-600")}
                {renderInventoryCards(originalItems, "原貨/退貨", AlertCircle, "text-orange-600")}
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
        </div>
    );
}
