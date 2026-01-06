import React, { useState, useEffect } from 'react';
import { PlusCircle } from 'lucide-react';
import { callGAS } from '../utils/api';

export default function PurchasePage({ user, apiUrl }) {
    // Each item now includes its own vendor field
    const [items, setItems] = useState([
        { id: Date.now(), vendor: '', productName: '', quantity: '', unitPrice: '', expiryYear: new Date().getFullYear().toString(), expiryMonth: '', expiryDay: '' }
    ]);
    const [suggestions, setSuggestions] = useState({ vendors: [], vendorProductMap: {} });
    const [loading, setLoading] = useState(false);
    const [paymentMethod, setPaymentMethod] = useState('CASH'); // 'CASH' or 'CREDIT'

    // Fetch Suggestions
    useEffect(() => {
        const fetchSuggestions = async () => {
            try {
                const data = await callGAS(apiUrl, 'getPurchaseSuggestions', {}, user.token);
                if (data.vendors) setSuggestions(data);
            } catch (e) {
                console.error("Failed to fetch suggestions", e);
            }
        };
        if (user?.token) fetchSuggestions();
    }, [user.token, apiUrl]);

    // Helper to get product list for a specific vendor
    const getProductSuggestions = (currentVendor) => {
        if (currentVendor && suggestions.vendorProductMap[currentVendor]) {
            return suggestions.vendorProductMap[currentVendor];
        }
        // If no vendor selected (or not found), show all unique products
        const allProducts = new Set();
        Object.values(suggestions.vendorProductMap || {}).forEach(list => list.forEach(p => allProducts.add(p)));
        return Array.from(allProducts);
    };

    const handleItemChange = (id, field, value) => {
        setItems(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item));
    };

    const addItem = () => {
        setItems(prev => [...prev, {
            id: Date.now() + Math.random(),
            vendor: '',
            productName: '',
            quantity: '',
            unitPrice: '',
            expiryYear: new Date().getFullYear().toString(),
            expiryMonth: '',
            expiryDay: ''
        }]);
    };

    const removeItem = (id) => {
        if (items.length > 1) {
            setItems(prev => prev.filter(item => item.id !== id));
        }
    };

    const handleKeyDown = (e, nextId) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (nextId === 'NEW_ROW') {
                addItem();
            } else {
                const el = document.getElementById(nextId);
                if (el) {
                    el.focus();
                    el.select();
                }
            }
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        // VALIDATION STEP
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (!item.vendor.trim() || !item.productName.trim() || !item.quantity || !item.unitPrice || !item.expiryYear || !item.expiryMonth || !item.expiryDay) {
                alert(`錯誤：第 ${i + 1} 列資料不完整！\n請確認「廠商」、「產品名稱」、「數量」、「單價」、「有效期限」皆已填寫。`);
                return;
            }
        }

        setLoading(true);

        const payloadItems = items.map(item => {
            const m = item.expiryMonth.padStart(2, '0');
            const d = item.expiryDay.padStart(2, '0');
            return {
                vendor: item.vendor,
                productName: item.productName,
                quantity: Number(item.quantity),
                price: Number(item.unitPrice),
                expiry: `${item.expiryYear}-${m}-${d}`
            };
        });

        // The API expects { vendor, items: [...] } usually, but since vendor is now per-item,
        // we might need to adjust the backend or payload structure.
        // Assuming backend supports `vendor` inside items if top-level `vendor` is missing, 
        // OR we just pass the first one as dummy if backend requires it.
        // Let's look at the instruction: "addPurchaseService" implementation.
        // It says: "const rowVendor = item.vendor || data.vendor;" 
        // So it supports per-item vendor! Perfect.

        try {
            const result = await callGAS(apiUrl, 'addPurchase', {
                items: payloadItems,
                operator: user.name, // Explicitly pass operator name
                paymentMethod: paymentMethod // 'CASH' or 'CREDIT'
            }, user.token);

            alert(`成功進貨 ${result.count} 筆商品！`);
            // Reset
            setItems([{ id: Date.now(), vendor: '', productName: '', quantity: '', unitPrice: '', expiryYear: new Date().getFullYear().toString(), expiryMonth: '', expiryDay: '' }]);
            setPaymentMethod('CASH'); // Reset payment method
        } catch (err) {
            alert('進貨失敗: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-[90rem] mx-auto p-4">
            <div className="glass-panel p-6">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold flex items-center gap-2 text-white">
                        <PlusCircle className="text-emerald-400" /> 批次進貨作業
                    </h2>

                    {/* Payment Method Toggle */}
                    <div className="flex bg-slate-800 p-1 rounded-lg border border-slate-600">
                        <button
                            onClick={() => setPaymentMethod('CASH')}
                            className={`px-4 py-2 rounded-md text-sm font-bold transition-all ${paymentMethod === 'CASH'
                                ? 'bg-emerald-500 text-white shadow-lg'
                                : 'text-slate-400 hover:text-white'
                                }`}
                        >
                            現金進貨
                        </button>
                        <button
                            onClick={() => setPaymentMethod('CREDIT')}
                            className={`px-4 py-2 rounded-md text-sm font-bold transition-all ${paymentMethod === 'CREDIT'
                                ? 'bg-purple-500 text-white shadow-lg'
                                : 'text-slate-400 hover:text-white'
                                }`}
                        >
                            賒帳進貨
                        </button>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Items Grid */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between px-2">
                            <h3 className="text-sm font-semibold text-slate-400">📦 商品清單</h3>
                            <span className="text-xs text-slate-600">共 {items.length} 項商品</span>
                        </div>

                        <datalist id="vendors-list">
                            {suggestions.vendors.map((v, i) => <option key={i} value={v} />)}
                        </datalist>

                        {items.map((item, idx) => {
                            const currentProductSuggestions = getProductSuggestions(item.vendor);

                            return (
                                <div key={item.id} className="group relative p-4 bg-gradient-to-r from-slate-800/40 to-slate-800/20 rounded-xl border border-slate-700/50 hover:border-emerald-500/30 hover:shadow-lg hover:shadow-emerald-900/10 transition-all duration-200">
                                    {/* Number Badge */}
                                    <div className="absolute -left-2 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
                                        <span className="text-[10px] font-bold text-emerald-400">{idx + 1}</span>
                                    </div>

                                    {/* Custom Grid Layout: 14 columns total for better spacing */}
                                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">

                                        {/* Vendor (3 cols) */}
                                        <div className="col-span-12 md:col-span-2">
                                            <label className="text-xs font-medium text-slate-400 mb-1.5 flex items-center gap-1">
                                                <span>🏢</span> 廠商
                                            </label>
                                            <input
                                                id={`item-${idx}-vendor`}
                                                list="vendors-list"
                                                className="input-field w-full"
                                                placeholder="廠商名稱"
                                                value={item.vendor}
                                                onChange={e => handleItemChange(item.id, 'vendor', e.target.value)}
                                                onKeyDown={(e) => handleKeyDown(e, `item-${idx}-product`)}
                                                autoFocus={idx === items.length - 1} // Auto focus on new row vendor
                                            />
                                        </div>

                                        {/* Product (3 cols) */}
                                        <div className="col-span-12 md:col-span-3">
                                            <label className="text-xs font-medium text-slate-400 mb-1.5 flex items-center gap-1">
                                                <span>📦</span> 產品名稱
                                            </label>
                                            <input
                                                id={`item-${idx}-product`}
                                                list={`products-list-${idx}`}
                                                className="input-field w-full"
                                                placeholder="產品名稱"
                                                value={item.productName}
                                                onChange={e => handleItemChange(item.id, 'productName', e.target.value)}
                                                onKeyDown={(e) => handleKeyDown(e, `item-${idx}-qty`)}
                                            />
                                            <datalist id={`products-list-${idx}`}>
                                                {currentProductSuggestions.map((n, i) => <option key={i} value={n} />)}
                                            </datalist>
                                        </div>

                                        {/* Qty (2 cols) */}
                                        <div className="col-span-6 md:col-span-2">
                                            <label className="text-xs font-medium text-slate-400 mb-1.5 flex items-center gap-1">
                                                <span>🔢</span> 數量
                                            </label>
                                            <input
                                                id={`item-${idx}-qty`}
                                                type="number"
                                                className="input-field w-full text-center"
                                                placeholder="0"
                                                value={item.quantity}
                                                onChange={e => handleItemChange(item.id, 'quantity', e.target.value)}
                                                onKeyDown={(e) => handleKeyDown(e, `item-${idx}-price`)}
                                            />
                                        </div>

                                        {/* Price (2 cols) */}
                                        <div className="col-span-6 md:col-span-2">
                                            <label className="text-xs font-medium text-slate-400 mb-1.5 flex items-center gap-1">
                                                <span>💰</span> 單價
                                            </label>
                                            <input
                                                id={`item-${idx}-price`}
                                                type="number"
                                                className="input-field w-full text-center"
                                                placeholder="0"
                                                value={item.unitPrice}
                                                onChange={e => handleItemChange(item.id, 'unitPrice', e.target.value)}
                                                onKeyDown={(e) => handleKeyDown(e, `item-${idx}-year`)}
                                            />
                                        </div>

                                        {/* Expiry (2 cols + delete btn space) */}
                                        <div className="col-span-12 md:col-span-3 grid grid-cols-[1fr_auto_1fr_auto_1fr_auto] gap-1 relative">
                                            <label className="absolute -top-6 left-0 text-xs font-medium text-slate-400 mb-1.5 flex items-center gap-1">
                                                <span>📅</span> 有效期限
                                            </label>

                                            <input
                                                id={`item-${idx}-year`}
                                                className="input-field w-full text-center font-mono px-1"
                                                placeholder="YYYY"
                                                value={item.expiryYear}
                                                onChange={e => handleItemChange(item.id, 'expiryYear', e.target.value)}
                                                onKeyDown={(e) => handleKeyDown(e, `item-${idx}-month`)}
                                            />
                                            <span className="text-slate-600 self-center">/</span>
                                            <input
                                                id={`item-${idx}-month`}
                                                className="input-field w-full text-center font-mono px-1"
                                                placeholder="MM"
                                                value={item.expiryMonth}
                                                onChange={e => handleItemChange(item.id, 'expiryMonth', e.target.value)}
                                                onKeyDown={(e) => handleKeyDown(e, `item-${idx}-day`)}
                                            />
                                            <span className="text-slate-600 self-center">/</span>
                                            <input
                                                id={`item-${idx}-day`}
                                                type="number"
                                                className="input-field w-full text-center font-mono px-1"
                                                placeholder="DD"
                                                value={item.expiryDay}
                                                onChange={e => handleItemChange(item.id, 'expiryDay', e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') {
                                                        e.preventDefault();
                                                        if (idx === items.length - 1) {
                                                            addItem();
                                                        } else {
                                                            const nextEl = document.getElementById(`item-${idx + 1}-vendor`);
                                                            if (nextEl) nextEl.focus();
                                                        }
                                                    }
                                                }}
                                            />

                                            {/* Delete Button (inline) */}
                                            {items.length > 1 && (
                                                <button
                                                    type="button"
                                                    onClick={() => removeItem(item.id)}
                                                    className="w-8 h-8 ml-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:text-red-300 transition-all flex items-center justify-center self-center"
                                                    title="刪除此列"
                                                >
                                                    ✕
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    <div className="flex gap-4 mt-8 pt-6 border-t border-slate-700/50">
                        <button
                            type="button"
                            onClick={addItem}
                            className="btn-secondary flex-1 py-4 text-base font-semibold flex items-center justify-center gap-2 hover:scale-105 transition-transform"
                        >
                            <span className="text-xl">➕</span> 新增一列
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="btn-primary flex-[2] py-4 text-lg font-bold shadow-xl shadow-emerald-900/30 hover:shadow-2xl hover:shadow-emerald-900/40 hover:scale-105 transition-all flex items-center justify-center gap-2"
                        >
                            {loading ? (
                                <>
                                    <span className="animate-spin">⏳</span> 處理中...
                                </>
                            ) : (
                                <>
                                    <span className="text-xl">✅</span> 確認全部進貨
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
