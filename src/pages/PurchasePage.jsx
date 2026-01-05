import React, { useState, useEffect, useMemo } from 'react';
import { PlusCircle, Search } from 'lucide-react';
import { callGAS } from '../utils/api';

export default function PurchasePage({ user, apiUrl }) {
    const [vendor, setVendor] = useState('');
    const [items, setItems] = useState([
        { id: Date.now(), productName: '', quantity: '', unitPrice: '', expiryYear: new Date().getFullYear().toString(), expiryMonth: '', expiryDay: '' }
    ]);
    const [suggestions, setSuggestions] = useState({ vendors: [], vendorProductMap: {} });
    const [loading, setLoading] = useState(false);

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

    // Derived product suggestions (Memoized)
    const productSuggestions = useMemo(() => {
        if (vendor && suggestions.vendorProductMap[vendor]) {
            return suggestions.vendorProductMap[vendor];
        }
        if (!vendor) {
            const allProducts = new Set();
            Object.values(suggestions.vendorProductMap || {}).forEach(list => list.forEach(p => allProducts.add(p)));
            return Array.from(allProducts);
        }
        return [];
    }, [vendor, suggestions]);

    const handleItemChange = (id, field, value) => {
        setItems(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item));
    };

    const addItem = () => {
        const newItem = {
            id: Date.now() + Math.random(),
            productName: '',
            quantity: '',
            unitPrice: '',
            expiryYear: new Date().getFullYear().toString(),
            expiryMonth: '',
            expiryDay: ''
        };
        setItems(prev => [...prev, newItem]);
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
        if (!vendor.trim()) {
            alert('錯誤：請輸入廠商名稱！');
            const vendorInput = document.querySelector('input[list="vendors-list"]');
            if (vendorInput) vendorInput.focus();
            return;
        }

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (!item.productName.trim() || !item.quantity || !item.unitPrice || !item.expiryYear || !item.expiryMonth || !item.expiryDay) {
                alert(`錯誤：第 ${i + 1} 列資料不完整！\n請確認「產品名稱」、「數量」、「單價」、「有效期限 (年/月/日)」皆已填寫。`);
                return;
            }
        }

        setLoading(true);

        const payloadItems = items.map(item => {
            const m = item.expiryMonth.padStart(2, '0');
            const d = item.expiryDay.padStart(2, '0');
            return {
                productName: item.productName,
                quantity: Number(item.quantity),
                price: Number(item.unitPrice),
                expiry: `${item.expiryYear}-${m}-${d}`
            };
        });

        try {
            const result = await callGAS(apiUrl, 'addPurchase', {
                vendor: vendor,
                items: payloadItems
            }, user.token);

            alert(`成功進貨 ${result.count} 筆商品！`);
            // Reset
            setVendor('');
            setItems([{ id: Date.now(), productName: '', quantity: '', unitPrice: '', expiryYear: new Date().getFullYear().toString(), expiryMonth: '', expiryDay: '' }]);
        } catch (err) {
            alert('進貨失敗: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-6xl mx-auto">
            <div className="glass-panel p-6">
                <h2 className="text-2xl font-bold mb-6 flex items-center gap-2 text-white">
                    <PlusCircle className="text-emerald-400" /> 批次進貨作業
                </h2>

                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Header: Vendor */}
                    <div className="p-6 bg-gradient-to-r from-slate-800/50 to-slate-800/30 rounded-xl border border-slate-700/50 shadow-lg">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                                <span className="text-2xl">🏢</span>
                            </div>
                            <div>
                                <h3 className="text-sm font-semibold text-emerald-400">廠商資訊</h3>
                                <p className="text-xs text-slate-500">請選擇或輸入廠商名稱</p>
                            </div>
                        </div>
                        <input
                            list="vendors-list"
                            className="input-field w-full text-lg"
                            placeholder="🔍 搜尋或輸入廠商名稱..."
                            value={vendor}
                            onChange={e => setVendor(e.target.value)}
                            onKeyDown={(e) => handleKeyDown(e, `item-0-product`)}
                            autoFocus
                        />
                        <datalist id="vendors-list">
                            {suggestions.vendors.map((v, i) => <option key={i} value={v} />)}
                        </datalist>
                    </div>

                    {/* Items Grid */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between px-2">
                            <h3 className="text-sm font-semibold text-slate-400">📦 商品清單</h3>
                            <span className="text-xs text-slate-600">共 {items.length} 項商品</span>
                        </div>
                        {items.map((item, idx) => (
                            <div key={item.id} className="group relative p-4 bg-gradient-to-r from-slate-800/40 to-slate-800/20 rounded-xl border border-slate-700/50 hover:border-emerald-500/30 hover:shadow-lg hover:shadow-emerald-900/10 transition-all duration-200">
                                {/* Row Number Badge */}
                                <div className="absolute -left-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
                                    <span className="text-xs font-bold text-emerald-400">{idx + 1}</span>
                                </div>

                                <div className="grid grid-cols-12 gap-3 items-end">
                                    <div className="col-span-3">
                                        <label className="text-xs font-medium text-slate-400 mb-1.5 block flex items-center gap-1">
                                            <span>📦</span> 產品名稱
                                        </label>
                                        <input
                                            id={`item-${idx}-product`}
                                            list="products-list-bulk"
                                            className="input-field w-full"
                                            placeholder="輸入產品名稱..."
                                            value={item.productName}
                                            onChange={e => handleItemChange(item.id, 'productName', e.target.value)}
                                            onKeyDown={(e) => handleKeyDown(e, `item-${idx}-qty`)}
                                        />
                                    </div>
                                    <div className="col-span-2">
                                        <label className="text-xs font-medium text-slate-400 mb-1.5 block flex items-center gap-1">
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
                                    <div className="col-span-2">
                                        <label className="text-xs font-medium text-slate-400 mb-1.5 block flex items-center gap-1">
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
                                    <div className="col-span-4">
                                        <label className="text-xs font-medium text-slate-400 mb-1.5 block flex items-center gap-1">
                                            <span>📅</span> 有效期限
                                        </label>
                                        <div className="flex gap-2">
                                            <input
                                                id={`item-${idx}-year`}
                                                className="input-field w-full text-center font-mono"
                                                placeholder="YYYY"
                                                value={item.expiryYear}
                                                onChange={e => handleItemChange(item.id, 'expiryYear', e.target.value)}
                                                onKeyDown={(e) => handleKeyDown(e, `item-${idx}-month`)}
                                            />
                                            <span className="text-slate-600 self-center">/</span>
                                            <input
                                                id={`item-${idx}-month`}
                                                className="input-field w-full text-center font-mono"
                                                placeholder="MM"
                                                value={item.expiryMonth}
                                                onChange={e => handleItemChange(item.id, 'expiryMonth', e.target.value)}
                                                onKeyDown={(e) => handleKeyDown(e, `item-${idx}-day`)}
                                            />
                                            <span className="text-slate-600 self-center">/</span>
                                            <input
                                                id={`item-${idx}-day`}
                                                type="number"
                                                min="1" max="31"
                                                className="input-field w-full text-center font-mono"
                                                placeholder="DD"
                                                value={item.expiryDay}
                                                onChange={e => handleItemChange(item.id, 'expiryDay', e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') {
                                                        e.preventDefault();
                                                        if (idx === items.length - 1) {
                                                            addItem();
                                                        } else {
                                                            const nextEl = document.getElementById(`item-${idx + 1}-product`);
                                                            if (nextEl) nextEl.focus();
                                                        }
                                                    }
                                                }}
                                            />
                                        </div>
                                    </div>
                                    <div className="col-span-1 flex justify-center">
                                        {items.length > 1 && (
                                            <button
                                                type="button"
                                                onClick={() => removeItem(item.id)}
                                                className="w-8 h-8 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:text-red-300 transition-all opacity-0 group-hover:opacity-100 flex items-center justify-center"
                                                title="刪除此列"
                                            >
                                                ✕
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Shared Datalist */}
                    <datalist id="products-list-bulk">
                        {productSuggestions.map((n, i) => <option key={i} value={n} />)}
                    </datalist>


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
