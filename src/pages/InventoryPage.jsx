import React, { useState, useEffect, useCallback } from 'react';
import { Package, Search, AlertCircle, RefreshCw, AlertTriangle, Trash2, Clock } from 'lucide-react';
import { callGAS } from '../utils/api';
import { CASE_MAP } from '../utils/constants';

export default function InventoryPage({ user, apiUrl }) {
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

    const fetchInventory = useCallback(async () => {
        setLoading(true);
        try {
            const data = await callGAS(apiUrl, 'getInventory', {}, user.token);
            console.log('Inventory API Response:', data);

            if (Array.isArray(data)) {
                const activeBatches = data.filter(item => {
                    const qty = Number(item.quantity);
                    return !isNaN(qty) && qty > 0;
                });
                console.log('Filtered Inventory:', activeBatches);

                activeBatches.sort((a, b) => {
                    const nameA = String(a.productName || '').toLowerCase();
                    const nameB = String(b.productName || '').toLowerCase();
                    return nameA.localeCompare(nameB);
                });

                setInventory(activeBatches);
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
                const saved = localStorage.getItem('safetyStocks');
                if (saved) setSafetyStocks(JSON.parse(saved));
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

        try {
            await callGAS(apiUrl, 'adjustInventory', {
                batchId: selectedItem.batchId,
                type: adjustmentType,
                quantity: Number(adjustmentQty),
                note: adjustmentNote
            }, user.token);

            alert('庫存異動成功');
            setShowAdjustModal(false);
            fetchInventory();
        } catch (error) {
            alert('異動失敗: ' + error.message);
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
        <div className="glass-panel p-6 flex flex-col">
            <h3 className={`text-lg font-bold mb-4 flex items-center gap-2 ${colorClass}`}>
                <Icon size={20} /> {title}
            </h3>
            <div className="rounded-lg border border-slate-700/50 overflow-hidden">
                <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-800 text-slate-400 text-sm uppercase">
                        <tr>
                            <th className="p-4">產品名稱</th>
                            <th className="p-4 text-center">數量 / 箱數</th>
                            <th className="p-4">效期</th>
                            <th className="p-4 text-center">安全庫存</th>
                            <th className="p-4 text-center">操作</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/50">
                        {loading ? (
                            <tr><td colSpan="5" className="p-6 text-center text-slate-500">載入中...</td></tr>
                        ) : items.length === 0 ? (
                            <tr><td colSpan="5" className="p-6 text-center text-slate-500">無資料</td></tr>
                        ) : (
                            items.map((item, idx) => {
                                const safetyLevel = safetyStocks[item.productName] || 0;
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
                                    <tr key={idx} className={`hover:bg-slate-800/40 transition-colors ${isLowStock ? 'bg-red-900/10' : ''} ${isExpired ? 'bg-rose-950/20' : isExpiringSoon ? 'bg-amber-950/20' : ''}`}>
                                        <td className="p-4 font-medium text-white">
                                            <div className="flex items-center gap-2">
                                                {isLowStock && <AlertTriangle size={16} className="text-red-400" />}
                                                {item.productName}
                                            </div>
                                        </td>
                                        <td className="p-4 text-center">
                                            <div className="flex flex-col items-center">
                                                <span className="font-mono text-emerald-400 font-bold text-lg">{item.quantity}</span>
                                                {CASE_MAP[item.productName] && (
                                                    <span className="text-blue-300 font-mono text-sm">
                                                        箱：{(item.quantity / CASE_MAP[item.productName]).toFixed(1)}
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="p-4 text-sm whitespace-nowrap">
                                            <div className="flex flex-col gap-1">
                                                <span className={isExpired ? 'text-rose-400 line-through' : isExpiringSoon ? 'text-amber-400 font-bold' : 'text-slate-300'}>
                                                    {formatDate(item.expiry)}
                                                </span>
                                                {isExpiringSoon && (
                                                    <span className="text-[10px] bg-amber-500/10 text-amber-500 border border-amber-500/30 px-1.5 py-0.5 rounded self-start flex items-center gap-1">
                                                        <Clock size={10} /> 即將過期
                                                    </span>
                                                )}
                                                {isExpired && (
                                                    <span className="text-[10px] bg-rose-500/10 text-rose-500 border border-rose-500/30 px-1.5 py-0.5 rounded self-start flex items-center gap-1">
                                                        <AlertTriangle size={10} /> 已過期
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="p-4 text-center">
                                            <input
                                                type="number"
                                                className="input-field w-20 text-center text-sm p-1"
                                                value={tempSafetyInput[item.productName] !== undefined ? tempSafetyInput[item.productName] : (safetyStocks[item.productName] || '')}
                                                onChange={(e) => handleSafetyInputChange(item.productName, e.target.value)}
                                                onBlur={() => handleSafetyInputBlur(item.productName)}
                                                placeholder="0"
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

    return (
        <div className="max-w-6xl mx-auto h-[calc(100vh-6rem)] flex flex-col p-4 gap-4">
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

            <div className="flex-1 overflow-y-auto flex flex-col gap-6 pb-6">
                {renderInventoryTable(stockItems, "現貨進貨", Package, "text-blue-400")}
                {renderInventoryTable(originalItems, "原貨/退貨", AlertCircle, "text-orange-400")}
            </div>

            {showAdjustModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="glass-panel p-6 w-96 max-w-[90vw]">
                        <h3 className="text-xl font-bold mb-4">庫存異動</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="text-sm text-slate-400 block mb-1">產品資訊</label>
                                <div className="flex justify-between items-center p-2 bg-slate-800/50 rounded-lg">
                                    <div className="text-white font-bold">{selectedItem?.productName}</div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-slate-400">當前庫存:</span>
                                        <span className="text-emerald-400 font-mono font-bold text-lg">{selectedItem?.quantity}</span>
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
                                        if (e.key === 'Enter') {
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
                                        if (e.key === 'Enter' && e.ctrlKey) {
                                            e.preventDefault();
                                            submitAdjustment();
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
