import React, { useState, useEffect, useCallback } from 'react';
import { Package, ClipboardList, Eye, Edit, Trash2, CheckCircle, RefreshCw, X, User, Phone, MapPin, FileText, Plus, Minus, Save, Calendar, Check, Search } from 'lucide-react';
import { callGAS } from '../utils/api';

export default function PendingOrdersPage({ user, apiUrl }) {
    const [orders, setOrders] = useState([]);
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('PENDING'); // 'PENDING' | 'CONFIRMED'

    // 編輯 Modal
    const [showEditModal, setShowEditModal] = useState(false);
    const [editingOrder, setEditingOrder] = useState(null);
    const [isSaving, setIsSaving] = useState(false);

    // 搜尋與篩選
    const [searchTerm, setSearchTerm] = useState('');

    const fetchOrders = useCallback(async () => {
        setLoading(true);
        try {
            const data = await callGAS(apiUrl, 'getPendingOrders', { status: activeTab }, user.token);
            if (Array.isArray(data)) {
                setOrders(data);
            }
        } catch (error) {
            console.error('Failed to fetch orders:', error);
            alert('載入訂單失敗: ' + error.message);
        } finally {
            setLoading(false);
        }
    }, [apiUrl, user.token, activeTab]);

    const fetchProducts = useCallback(async () => {
        try {
            const data = await callGAS(apiUrl, 'getProducts', {}, user.token);
            if (Array.isArray(data)) {
                setProducts(data);
            }
        } catch (error) {
            console.error('Failed to fetch products:', error);
        }
    }, [apiUrl, user.token]);

    useEffect(() => {
        if (user?.token) {
            fetchOrders();
            fetchProducts();
        }
    }, [user.token, activeTab, fetchOrders, fetchProducts]);

    const handleConfirmOrder = async (orderId) => {
        if (!window.confirm(`確定要將訂單 ${orderId} 確認出貨嗎？\n此動作會正式扣減商品庫存，並寫入銷售紀錄！`)) {
            return;
        }

        setLoading(true);
        try {
            const res = await callGAS(apiUrl, 'confirmPendingOrder', { orderId }, user.token);
            if (res && res.error) {
                throw new Error(res.error);
            }
            alert('訂單確認出貨成功，庫存已扣減！');
            fetchOrders();
        } catch (error) {
            alert('確認出貨失敗: ' + error.message);
            setLoading(false);
        }
    };

    const handleDeleteOrder = async (orderId) => {
        if (!window.confirm(`確定要【刪除】訂單 ${orderId} 嗎？\n此動作無法復原，通常用於客人誤按送出的情況。`)) return;
        setLoading(true);
        try {
            const res = await callGAS(apiUrl, 'deletePendingOrder', { orderId }, user.token);
            if (res?.error) throw new Error(res.error);
            fetchOrders();
        } catch (error) {
            alert('刪除失敗: ' + error.message);
            setLoading(false);
        }
    };

    const handleOpenEdit = (order) => {
        // 深拷貝 order 的 items，以免直接污染狀態
        setEditingOrder({
            ...order,
            items: order.items.map(item => ({ ...item }))
        });
        setShowEditModal(true);
    };

    const handleEditFieldChange = (field, value) => {
        setEditingOrder(prev => ({
            ...prev,
            [field]: value
        }));
    };

    const handleItemQtyChange = (productId, qty) => {
        setEditingOrder(prev => {
            const newItems = prev.items.map(item => {
                if (item.productId === productId) {
                    const newQty = Math.max(0, Number(qty) || 0);
                    return {
                        ...item,
                        qty: newQty,
                        subtotal: newQty * item.unitPrice
                    };
                }
                return item;
            }).filter(item => item.qty > 0); // 若數量為 0，直接移除 (或可以在介面手動刪)

            const total = newItems.reduce((sum, item) => sum + item.subtotal, 0);
            return {
                ...prev,
                items: newItems,
                totalAmount: total
            };
        });
    };

    const handleRemoveItem = (productId) => {
        setEditingOrder(prev => {
            const newItems = prev.items.filter(item => item.productId !== productId);
            const total = newItems.reduce((sum, item) => sum + item.subtotal, 0);
            return {
                ...prev,
                items: newItems,
                totalAmount: total
            };
        });
    };

    const handleAddItem = (productId) => {
        const prod = products.find(p => p.id === productId);
        if (!prod) return;

        setEditingOrder(prev => {
            // 檢查是否已存在
            const existing = prev.items.find(item => item.productId === productId);
            let newItems = [];
            if (existing) {
                newItems = prev.items.map(item => {
                    if (item.productId === productId) {
                        const newQty = item.qty + 1;
                        return {
                            ...item,
                            qty: newQty,
                            subtotal: newQty * item.unitPrice
                        };
                    }
                    return item;
                });
            } else {
                newItems = [
                    ...prev.items,
                    {
                        productId: prod.id,
                        productName: prod.name,
                        unitPrice: prod.price,
                        qty: 1,
                        subtotal: prod.price
                    }
                ];
            }

            const total = newItems.reduce((sum, item) => sum + item.subtotal, 0);
            return {
                ...prev,
                items: newItems,
                totalAmount: total
            };
        });
    };

    const handleSaveOrderEdit = async (e) => {
        e.preventDefault();
        if (editingOrder.items.length === 0) {
            alert('訂單商品明細不可為空');
            return;
        }

        setIsSaving(true);
        try {
            const res = await callGAS(apiUrl, 'updatePendingOrder', {
                orderId: editingOrder.orderId,
                customerName: editingOrder.customerName,
                customerPhone: editingOrder.customerPhone,
                deliveryAddress: editingOrder.deliveryAddress,
                note: editingOrder.note,
                items: editingOrder.items
            }, user.token);

            if (res && res.error) {
                throw new Error(res.error);
            }

            alert('訂單修改成功');
            setShowEditModal(false);
            fetchOrders();
        } catch (error) {
            alert('修改失敗: ' + error.message);
        } finally {
            setIsSaving(false);
        }
    };

    const filteredOrders = orders.filter(order => {
        const search = searchTerm.toLowerCase();
        return (
            String(order.orderId || '').toLowerCase().includes(search) ||
            String(order.customerName || '').toLowerCase().includes(search) ||
            String(order.customerPhone || '').toLowerCase().includes(search) ||
            String(order.deliveryAddress || '').toLowerCase().includes(search) ||
            String(order.sourceGroup || '').toLowerCase().includes(search)
        );
    });

    const formatDate = (isoString) => {
        if (!isoString) return '-';
        const d = new Date(isoString);
        if (isNaN(d.getTime())) return isoString;
        return d.toLocaleString('zh-TW', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    return (
        <div className="max-w-6xl mx-auto h-[calc(100vh-6rem)] flex flex-col p-4 gap-4">
            {/* Header Area */}
            <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center bg-[var(--bg-secondary)] p-4 rounded-xl border border-[var(--border-primary)] shadow-sm gap-4">
                <h2 className="text-xl md:text-2xl font-bold flex items-center gap-2 text-[var(--text-primary)]">
                    <ClipboardList className="text-blue-600" />
                    團購訂單審核與出貨
                </h2>

                {/* 搜尋 */}
                <div className="flex gap-2 w-full md:w-auto">
                    <div className="relative flex-1 md:flex-none">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" size={18} />
                        <input
                            type="text"
                            placeholder="搜尋編號、姓名、電話、地址、群組..."
                            className="input-field pl-10 w-full md:w-80"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <button onClick={fetchOrders} className="btn-secondary p-2 whitespace-nowrap" title="重新整理">
                        <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-[var(--border-primary)] gap-2">
                <button
                    onClick={() => { setActiveTab('PENDING'); }}
                    className={`px-5 py-2.5 font-bold text-sm transition-colors border-b-2 ${activeTab === 'PENDING'
                            ? 'border-blue-500 text-blue-600'
                            : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                        }`}
                >
                    待確認訂單 (PENDING)
                </button>
                <button
                    onClick={() => { setActiveTab('CONFIRMED'); }}
                    className={`px-5 py-2.5 font-bold text-sm transition-colors border-b-2 ${activeTab === 'CONFIRMED'
                            ? 'border-blue-500 text-blue-600'
                            : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                        }`}
                >
                    已出貨/確認訂單 (CONFIRMED)
                </button>
            </div>

            {/* Orders Area */}
            <div className="flex-1 overflow-y-auto pb-6">
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-3 text-[var(--text-secondary)]">
                        <RefreshCw className="animate-spin text-blue-500" size={36} />
                        <span>訂單資料讀取中...</span>
                    </div>
                ) : filteredOrders.length === 0 ? (
                    <div className="text-center py-20 text-[var(--text-secondary)] bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-primary)] shadow-sm">
                        沒有找到任何訂單。
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {filteredOrders.map(order => (
                            <div key={order.orderId} className="bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-primary)] shadow-sm p-5 flex flex-col justify-between hover:border-blue-500/20 transition-colors">
                                {/* Order Header */}
                                <div>
                                    <div className="flex justify-between items-start mb-3 pb-2 border-b border-[var(--border-primary)]">
                                        <div>
                                            <span className="font-mono font-bold text-base text-[var(--text-primary)]">{order.orderId}</span>
                                            <div className="text-[10px] text-[var(--text-tertiary)] font-semibold mt-0.5 flex items-center gap-1">
                                                <Calendar size={12} /> {formatDate(order.createdAt)}
                                            </div>
                                        </div>
                                        <div>
                                            <span className={`inline-block text-xs px-2.5 py-1 rounded-full font-bold uppercase tracking-wider ${order.status === 'PENDING'
                                                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'
                                                    : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400'
                                                }`}>
                                                {order.status === 'PENDING' ? '待確認' : '已出貨'}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Client Details */}
                                    <div className="space-y-1.5 text-sm mb-4">
                                        <div className="flex items-center gap-2 text-[var(--text-primary)]">
                                            <User size={16} className="text-[var(--text-tertiary)]" />
                                            <span className="font-bold">{order.customerName}</span>
                                            {order.sourceGroup && (
                                                <span className="bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 text-[10px] px-1.5 py-0.5 rounded">
                                                    {order.sourceGroup}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2 text-[var(--text-secondary)]">
                                            <Phone size={16} className="text-[var(--text-tertiary)]" />
                                            <span>{order.customerPhone}</span>
                                        </div>
                                        {order.deliveryAddress && (
                                            <div className="flex items-center gap-2 text-[var(--text-secondary)]">
                                                <MapPin size={16} className="text-[var(--text-tertiary)] animate-pulse" />
                                                <span>{order.deliveryAddress}</span>
                                            </div>
                                        )}
                                        {order.note && (
                                            <div className="flex items-start gap-2 bg-[var(--bg-tertiary)] p-2 rounded-lg border border-[var(--border-primary)] text-xs text-[var(--text-secondary)]">
                                                <FileText size={14} className="text-[var(--text-tertiary)] mt-0.5 flex-shrink-0" />
                                                <span className="italic">"{order.note}"</span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Items List */}
                                    <div className="bg-[var(--bg-tertiary)] rounded-lg p-3 border border-[var(--border-primary)] mb-4">
                                        <div className="text-[10px] uppercase font-bold text-[var(--text-tertiary)] mb-2 tracking-wider">訂單商品明細</div>
                                        <div className="divide-y divide-[var(--border-primary)] divide-dashed space-y-2">
                                            {order.items.map((item, idx) => (
                                                <div key={idx} className="flex justify-between items-center text-sm pt-2 first:pt-0">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="font-medium text-[var(--text-primary)]">{item.productName}</span>
                                                        <span className="text-xs text-[var(--text-tertiary)] font-bold">x {item.qty}</span>
                                                    </div>
                                                    <span className="font-mono text-[var(--text-secondary)]">${item.subtotal}</span>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="flex justify-between items-center border-t border-[var(--border-primary)] mt-3 pt-2 font-bold text-base">
                                            <span className="text-[var(--text-primary)]">金額合計</span>
                                            <span className="text-blue-600 font-mono">${order.totalAmount}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Actions */}
                                {order.status === 'PENDING' && (
                                    <div className="grid grid-cols-3 gap-2 border-t border-[var(--border-primary)] pt-3 mt-auto">
                                        <button
                                            onClick={() => handleDeleteOrder(order.orderId)}
                                            className="col-span-1 py-2 text-xs flex items-center justify-center gap-1 rounded-lg border border-red-200 dark:border-red-800/30 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors font-bold"
                                        >
                                            <Trash2 size={13} /> 刪除
                                        </button>
                                        <button
                                            onClick={() => handleOpenEdit(order)}
                                            className="btn-secondary py-2 text-xs flex items-center justify-center gap-1"
                                        >
                                            <Edit size={14} /> 修改
                                        </button>
                                        <button
                                            onClick={() => handleConfirmOrder(order.orderId)}
                                            className="btn-primary py-2 text-xs flex items-center justify-center gap-1 bg-emerald-600 hover:bg-emerald-700 border-none"
                                        >
                                            <CheckCircle size={14} /> 出貨
                                        </button>
                                    </div>
                                )}
                                {order.status === 'CONFIRMED' && (
                                    <div className="border-t border-[var(--border-primary)] pt-3 mt-auto flex items-center gap-1.5 justify-center text-xs text-[var(--text-secondary)] font-semibold">
                                        <Check className="text-emerald-500" size={16} />
                                        <span>已於 {formatDate(order.confirmedAt)} 由 {order.confirmedBy} 確認出貨</span>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* 編輯訂單 Modal */}
            {showEditModal && editingOrder && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
                    <form onSubmit={handleSaveOrderEdit} className="bg-[var(--bg-secondary)] rounded-2xl border border-[var(--border-primary)] shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
                        {/* Title */}
                        <div className="p-5 border-b border-[var(--border-primary)] flex justify-between items-center bg-[var(--bg-tertiary)]">
                            <h3 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2">
                                <Edit size={20} className="text-blue-500" />
                                修改訂單內容 ({editingOrder.orderId})
                            </h3>
                            <button type="button" onClick={() => setShowEditModal(false)} className="text-[var(--text-secondary)] hover:text-red-500 p-1.5 rounded-lg hover:bg-[var(--bg-hover)]">
                                <X size={18} />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-4">
                            {/* 客戶基本資料 */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-[var(--text-secondary)] flex items-center gap-1">
                                        <User size={13} /> 姓名
                                    </label>
                                    <input
                                        type="text"
                                        className="input-field w-full p-2 text-sm"
                                        value={editingOrder.customerName}
                                        onChange={(e) => handleEditFieldChange('customerName', e.target.value)}
                                        required
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-[var(--text-secondary)] flex items-center gap-1">
                                        <Phone size={13} /> 電話
                                    </label>
                                    <input
                                        type="text"
                                        className="input-field w-full p-2 text-sm"
                                        value={editingOrder.customerPhone}
                                        onChange={(e) => handleEditFieldChange('customerPhone', e.target.value)}
                                        required
                                    />
                                </div>
                            </div>

                            <div className="space-y-1">
                                <label className="text-xs font-bold text-[var(--text-secondary)] flex items-center gap-1">
                                    <MapPin size={13} /> 地址 / 自取
                                </label>
                                <input
                                    type="text"
                                    className="input-field w-full p-2 text-sm"
                                    value={editingOrder.deliveryAddress}
                                    onChange={(e) => handleEditFieldChange('deliveryAddress', e.target.value)}
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="text-xs font-bold text-[var(--text-secondary)] flex items-center gap-1">
                                    <FileText size={13} /> 備註
                                </label>
                                <textarea
                                    className="input-field w-full p-2 text-sm"
                                    rows="2"
                                    value={editingOrder.note}
                                    onChange={(e) => handleEditFieldChange('note', e.target.value)}
                                />
                            </div>

                            {/* 商品細明修改 */}
                            <div className="border-t border-[var(--border-primary)] pt-4">
                                <div className="flex justify-between items-center mb-3">
                                    <span className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                                        <Package size={16} className="text-blue-500" />
                                        訂單品項與數量
                                    </span>

                                    {/* 新增商品選單 */}
                                    <div className="flex gap-1.5 items-center">
                                        <select
                                            id="add-item-select"
                                            className="input-field text-xs py-1.5 px-2 bg-[var(--bg-tertiary)] border-[var(--border-primary)] rounded-lg max-w-[180px]"
                                            defaultValue=""
                                            onChange={(e) => {
                                                if (e.target.value) {
                                                    handleAddItem(e.target.value);
                                                    e.target.value = ""; // 重設選單
                                                }
                                            }}
                                        >
                                            <option value="" disabled>-- 新增商品到訂單 --</option>
                                            {products.map(p => (
                                                <option key={p.id} value={p.id}>
                                                    {p.name} (${p.price})
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                <div className="divide-y divide-[var(--border-primary)] bg-[var(--bg-tertiary)] rounded-xl border border-[var(--border-primary)] overflow-hidden">
                                    {editingOrder.items.length === 0 ? (
                                        <div className="p-4 text-center text-xs text-[var(--text-secondary)]">訂單目前沒有任何商品</div>
                                    ) : (
                                        editingOrder.items.map((item, idx) => (
                                            <div key={idx} className="flex justify-between items-center p-3 text-sm hover:bg-[var(--bg-hover)]">
                                                <div className="flex-1">
                                                    <div className="font-bold text-[var(--text-primary)]">{item.productName}</div>
                                                    <div className="text-[10px] text-[var(--text-tertiary)] font-semibold mt-0.5">單價: ${item.unitPrice}</div>
                                                </div>

                                                <div className="flex items-center gap-4">
                                                    {/* 數量調整 */}
                                                    <div className="flex items-center gap-1 bg-[var(--bg-primary)] rounded-lg p-0.5 border border-[var(--border-primary)]">
                                                        <button
                                                            type="button"
                                                            onClick={() => handleItemQtyChange(item.productId, item.qty - 1)}
                                                            className="w-6 h-6 flex items-center justify-center rounded-md text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
                                                        >
                                                            <Minus size={12} />
                                                        </button>
                                                        <input
                                                            type="number"
                                                            className="w-10 text-center font-bold font-mono text-xs bg-transparent border-none focus:outline-none"
                                                            value={item.qty}
                                                            onChange={(e) => handleItemQtyChange(item.productId, e.target.value)}
                                                            min="1"
                                                        />
                                                        <button
                                                            type="button"
                                                            onClick={() => handleItemQtyChange(item.productId, item.qty + 1)}
                                                            className="w-6 h-6 flex items-center justify-center rounded-md text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
                                                        >
                                                            <Plus size={12} />
                                                        </button>
                                                    </div>

                                                    <span className="w-16 text-right font-mono font-bold text-[var(--text-primary)]">${item.subtotal}</span>

                                                    {/* 刪除鈕 */}
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRemoveItem(item.productId)}
                                                        className="text-red-500 hover:text-red-600 p-1 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-md"
                                                    >
                                                        <Trash2 size={15} />
                                                    </button>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>

                                <div className="flex justify-between items-center mt-4 p-3 bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded-xl font-bold text-lg">
                                    <span className="text-[var(--text-primary)]">金額合計</span>
                                    <span className="text-blue-600 font-mono">${editingOrder.totalAmount}</span>
                                </div>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="p-4 bg-[var(--bg-secondary)] border-t border-[var(--border-primary)] flex gap-3 justify-end">
                            <button
                                type="button"
                                onClick={() => setShowEditModal(false)}
                                className="btn-secondary px-5 py-2.5 text-xs font-bold"
                                disabled={isSaving}
                            >
                                取消
                            </button>
                            <button
                                type="submit"
                                className="btn-primary px-5 py-2.5 text-xs font-bold flex items-center gap-1.5"
                                disabled={isSaving}
                            >
                                <Save size={15} />
                                {isSaving ? '保存中...' : '儲存修改'}
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
}
