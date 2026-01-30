import React, { useState, useEffect } from 'react';
import { PlusCircle } from 'lucide-react';
import { callGAS } from '../utils/api';
import { evaluateFormula } from '../utils/mathUtils';

const getSafeNum = (v) => {
    if (typeof v === 'string' && v.trim().startsWith('=')) return 0;
    const n = Number(v);
    return isNaN(n) ? 0 : n;
};

export default function PurchasePage({ user, apiUrl, logActivity }) {
    // Each item now includes its own vendor field
    const currentYear = new Date().getFullYear().toString();
    const [items, setItems] = useState([
        { id: Date.now(), vendor: '', productName: '', quantity: '', unitPrice: '', expiryYear: currentYear, expiryMonth: '', expiryDay: '', paymentMethod: 'CASH' }
    ]);
    const [suggestions, setSuggestions] = useState({ vendors: [], vendorProductMap: {} });
    const [loading, setLoading] = useState(false);

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

    // Auto-switch payment method per item when vendor changes
    useEffect(() => {
        setItems(prev => prev.map(item => {
            const defMethod = suggestions.vendorDefaults?.[item.vendor];
            if (defMethod && item.paymentMethod !== defMethod) {
                return { ...item, paymentMethod: defMethod };
            }
            return item;
        }));
    }, [suggestions.vendorDefaults, items.map(i => i.vendor).join(',')]);

    const handleSaveDefault = async (item) => {
        if (!item.vendor) return;

        try {
            await callGAS(apiUrl, 'saveVendorDefault', { vendor: item.vendor, method: item.paymentMethod }, user.token);
            alert(`已將「${item.vendor}」的預設支付方式設為「${item.paymentMethod === 'CASH' ? '現金' : '賒帳'}」`);
            setSuggestions(prev => ({
                ...prev,
                vendorDefaults: { ...prev.vendorDefaults, [item.vendor]: item.paymentMethod }
            }));
        } catch (e) {
            alert("保存失敗: " + e.message);
        }
    };

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
        setItems(prev => prev.map(item => {
            if (item.id !== id) return item;

            // 如果值是公式（以 = 開頭），我們暫存字串不計算數字
            if (field === 'quantity' || field === 'unitPrice') {
                if (typeof value === 'string' && value.trim().startsWith('=')) {
                    return { ...item, [field]: value };
                }
            }

            return { ...item, [field]: value };
        }));
    };

    const handleBlur = (id, field, value) => {
        if (field === 'quantity' || field === 'unitPrice') {
            if (typeof value === 'string' && value.trim().startsWith('=')) {
                const result = evaluateFormula(value);
                handleItemChange(id, field, result);
            } else {
                // Force numeric cleanup on blur
                handleItemChange(id, field, getSafeNum(value));
            }
        }
    };

    const addItem = () => {
        setItems(prev => [...prev, {
            id: Date.now() + Math.random(),
            vendor: '',
            productName: '',
            quantity: '',
            unitPrice: '',
            expiryYear: currentYear,
            expiryMonth: '',
            expiryDay: '',
            paymentMethod: 'CASH'
        }]);
    };

    const removeItem = (id) => {
        if (items.length > 1) {
            setItems(prev => prev.filter(item => item.id !== id));
        }
    };

    const focusAndSelect = (id) => {
        const el = document.getElementById(id);
        if (el) {
            el.focus();
            el.select?.();
            el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    };

    const handleKeyDown = (e, idx, field) => {
        const isMobile = e.target.id.includes('-m-');
        const prefix = isMobile ? 'item-m-' : 'item-';
        const fields = ['vendor', 'product', 'qty', 'price', 'year', 'month', 'day'];
        const fieldIdx = fields.indexOf(field);

        if (e.key === 'Enter' || e.key === 'ArrowRight') {
            e.preventDefault();
            if (fieldIdx < fields.length - 1) {
                focusAndSelect(`${prefix}${idx}-${fields[fieldIdx + 1]}`);
            } else if (idx < items.length - 1) {
                focusAndSelect(`${prefix}${idx + 1}-vendor`);
            } else if (e.key === 'Enter') {
                addItem();
                // We need a short delay to wait for React to render the new row
                setTimeout(() => focusAndSelect(`${prefix}${idx + 1}-vendor`), 50);
            }
        } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            if (fieldIdx > 0) {
                focusAndSelect(`${prefix}${idx}-${fields[fieldIdx - 1]}`);
            } else if (idx > 0) {
                focusAndSelect(`${prefix}${idx - 1}-day`);
            }
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (idx < items.length - 1) {
                focusAndSelect(`${prefix}${idx + 1}-${field}`);
            }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (idx > 0) {
                focusAndSelect(`${prefix}${idx - 1}-${field}`);
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
                expiry: `${item.expiryYear}-${m}-${d}`,
                paymentMethod: item.paymentMethod
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
                operator: user.username
            }, user.token);

            // Log activity
            if (logActivity) {
                const methods = Array.from(new Set(payloadItems.map(i => i.paymentMethod)));
                logActivity({
                    actionType: 'DATA_EDIT',
                    page: '進貨作業',
                    details: JSON.stringify({
                        vendorCount: new Set(payloadItems.map(i => i.vendor)).size,
                        productCount: payloadItems.length,
                        totalPrice: payloadItems.reduce((acc, i) => acc + (i.quantity * i.price), 0),
                        paymentMethods: methods.join(', ')
                    })
                });
            }

            alert(`成功進貨 ${result.count} 筆商品！`);
            // Reset
            setItems([{ id: Date.now(), vendor: '', productName: '', quantity: '', unitPrice: '', expiryYear: currentYear, expiryMonth: '', expiryDay: '', paymentMethod: 'CASH' }]);
        } catch (err) {
            alert('進貨失敗: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-[90rem] mx-auto p-4">
            {loading && (
                <div className="loading-overlay">
                    <div className="w-12 h-12 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-lg font-bold text-[var(--text-primary)]">資料存盤中，請稍後...</p>
                </div>
            )}
            <div className="glass-panel p-6">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold flex items-center gap-2 text-[var(--text-primary)]">
                        進貨作業
                    </h2>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Items Grid */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between px-2">
                            <h3 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider">商品清單</h3>
                            <span className="text-xs text-[var(--text-tertiary)]">共 {items.length} 項商品</span>
                        </div>

                        <datalist id="vendors-list">
                            {suggestions.vendors.map((v, i) => <option key={i} value={v} />)}
                        </datalist>

                        {items.map((item, idx) => {
                            const currentProductSuggestions = getProductSuggestions(item.vendor);

                            return (
                                <div key={item.id} className="group relative p-0 md:p-4 bg-transparent md:bg-[var(--bg-tertiary)] rounded-none md:rounded-xl border-b md:border border-[var(--border-primary)] hover:md:shadow-lg transition-all duration-200 mb-6 md:mb-0">
                                    {/* Number Badge */}
                                    <div className="md:absolute md:-left-2 md:top-1/2 md:-translate-y-1/2 mb-2 md:mb-0 flex items-center justify-between md:block">
                                        <div className="flex items-center gap-2">
                                            <div className="w-5 h-5 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
                                                <span className="text-[10px] font-bold text-emerald-600"> {idx + 1}</span>
                                            </div>
                                            <span className="md:hidden text-sm font-bold text-[var(--text-secondary)]">商品資料</span>
                                        </div>

                                        {/* Mobile Save Default */}
                                        {item.vendor && (
                                            <button
                                                type="button"
                                                onClick={() => handleSaveDefault(item)}
                                                className="md:hidden text-[10px] px-2 py-1 rounded-md bg-slate-100 text-slate-500 border border-slate-200"
                                            >
                                                📌 設為預設
                                            </button>
                                        )}
                                    </div>

                                    {/* MOBILE VIEW (Horizontal Layout) */}
                                    <div className="md:hidden space-y-3 pb-4">
                                        {/* Vendor */}
                                        <div className="flex items-center gap-3">
                                            <label className="text-sm font-bold text-[var(--text-secondary)] whitespace-nowrap w-[70px]">廠商:</label>
                                            <input
                                                id={`item-m-${idx}-vendor`}
                                                list="vendors-list"
                                                className="input-field flex-1 py-1.5 px-3"
                                                placeholder="廠商名稱"
                                                value={item.vendor}
                                                onChange={e => handleItemChange(item.id, 'vendor', e.target.value)}
                                                onKeyDown={(e) => handleKeyDown(e, idx, 'vendor')}
                                            />
                                        </div>

                                        {/* Product */}
                                        <div className="flex items-center gap-3">
                                            <label className="text-sm font-bold text-[var(--text-secondary)] whitespace-nowrap w-[70px]">產品名稱:</label>
                                            <input
                                                id={`item-m-${idx}-product`}
                                                list={`products-list-${idx}`}
                                                className="input-field flex-1 py-1.5 px-3"
                                                placeholder="產品名稱"
                                                value={item.productName}
                                                onChange={e => handleItemChange(item.id, 'productName', e.target.value)}
                                                onKeyDown={(e) => handleKeyDown(e, idx, 'product')}
                                            />
                                            <datalist id={`products-list-${idx}`}>
                                                {currentProductSuggestions.map((n, i) => <option key={i} value={n} />)}
                                            </datalist>
                                        </div>

                                        {/* Qty */}
                                        <div className="flex items-center gap-3">
                                            <label className="text-sm font-bold text-[var(--text-secondary)] whitespace-nowrap w-[70px]">數量:</label>
                                            <input
                                                id={`item-m-${idx}-qty`}
                                                type="text"
                                                inputMode="decimal"
                                                className="input-field flex-1 py-1.5 px-3"
                                                placeholder="0"
                                                value={item.quantity}
                                                onChange={e => handleItemChange(item.id, 'quantity', e.target.value)}
                                                onBlur={e => handleBlur(item.id, 'quantity', e.target.value)}
                                                onKeyDown={(e) => handleKeyDown(e, idx, 'qty')}
                                            />
                                        </div>

                                        {/* Price */}
                                        <div className="flex items-center gap-3">
                                            <label className="text-sm font-bold text-[var(--text-secondary)] whitespace-nowrap w-[70px]">單價:</label>
                                            <input
                                                id={`item-m-${idx}-price`}
                                                type="text"
                                                inputMode="decimal"
                                                className="input-field flex-1 py-1.5 px-3"
                                                placeholder="0"
                                                value={item.unitPrice}
                                                onChange={e => handleItemChange(item.id, 'unitPrice', e.target.value)}
                                                onBlur={e => handleBlur(item.id, 'unitPrice', e.target.value)}
                                                onKeyDown={(e) => handleKeyDown(e, idx, 'price')}
                                            />
                                        </div>

                                        {/* Mobile Payment Toggle */}
                                        <div className="flex items-center gap-3">
                                            <label className="text-sm font-bold text-[var(--text-secondary)] whitespace-nowrap w-[70px]">支付方式:</label>
                                            <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 flex-1">
                                                <button
                                                    type="button"
                                                    onClick={() => handleItemChange(item.id, 'paymentMethod', 'CASH')}
                                                    className={`flex-1 py-1 text-[10px] font-bold rounded-md transition-all ${item.paymentMethod === 'CASH' ? 'bg-emerald-500 text-white' : 'text-slate-400'}`}
                                                >
                                                    現金
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleItemChange(item.id, 'paymentMethod', 'CREDIT')}
                                                    className={`flex-1 py-1 text-[10px] font-bold rounded-md transition-all ${item.paymentMethod === 'CREDIT' ? 'bg-purple-600 text-white' : 'text-slate-400'}`}
                                                >
                                                    賒帳
                                                </button>
                                            </div>
                                        </div>

                                        {/* Expiry */}
                                        <div className="flex items-center gap-3">
                                            <label className="text-sm font-bold text-[var(--text-secondary)] whitespace-nowrap w-[70px]">有效期限:</label>
                                            <div className="flex flex-1 gap-1 items-center">
                                                <input
                                                    id={`item-m-${idx}-year`}
                                                    type="number"
                                                    className="input-field flex-[2] py-1.5 px-1 text-center"
                                                    placeholder="YYYY"
                                                    value={item.expiryYear}
                                                    onChange={e => handleItemChange(item.id, 'expiryYear', e.target.value)}
                                                    onKeyDown={(e) => handleKeyDown(e, idx, 'year')}
                                                />
                                                <span className="text-slate-300">/</span>
                                                <input
                                                    id={`item-m-${idx}-month`}
                                                    type="number"
                                                    className="input-field flex-1 py-1.5 px-1 text-center"
                                                    placeholder="MM"
                                                    value={item.expiryMonth}
                                                    onChange={e => handleItemChange(item.id, 'expiryMonth', e.target.value)}
                                                    onKeyDown={(e) => handleKeyDown(e, idx, 'month')}
                                                />
                                                <span className="text-slate-300">/</span>
                                                <input
                                                    id={`item-m-${idx}-day`}
                                                    type="number"
                                                    className="input-field flex-1 py-1.5 px-1 text-center"
                                                    placeholder="DD"
                                                    value={item.expiryDay}
                                                    onChange={e => handleItemChange(item.id, 'expiryDay', e.target.value)}
                                                    onKeyDown={(e) => handleKeyDown(e, idx, 'day')}
                                                />

                                                {/* Delete Button Mobile */}
                                                {items.length > 1 && (
                                                    <button
                                                        type="button"
                                                        onClick={() => removeItem(item.id)}
                                                        className="w-8 h-8 ml-1 rounded-lg bg-red-500/10 text-red-500 flex items-center justify-center border border-red-500/20"
                                                    >
                                                        ✕
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* DESKTOP VIEW (Original Grid Layout) */}
                                    <div className="hidden md:grid grid-cols-1 md:grid-cols-12 gap-3 items-end">

                                        {/* Vendor (2 cols) */}
                                        <div className="col-span-12 md:col-span-2">
                                            <label className="text-[10px] font-bold text-[var(--text-secondary)] mb-1 uppercase">
                                                廠商
                                            </label>
                                            <input
                                                id={`item-${idx}-vendor`}
                                                list="vendors-list"
                                                className="input-field w-full py-1.5 px-2 text-sm"
                                                placeholder="廠商"
                                                value={item.vendor}
                                                onChange={e => handleItemChange(item.id, 'vendor', e.target.value)}
                                                onKeyDown={(e) => handleKeyDown(e, idx, 'vendor')}
                                                autoFocus={idx === items.length - 1}
                                            />
                                        </div>

                                        {/* Product (2 cols) */}
                                        <div className="col-span-12 md:col-span-2">
                                            <label className="text-[10px] font-bold text-[var(--text-secondary)] mb-1 uppercase">
                                                產品名稱
                                            </label>
                                            <input
                                                id={`item-${idx}-product`}
                                                list={`products-list-${idx}`}
                                                className="input-field w-full py-1.5 px-2 text-sm"
                                                placeholder="產品名稱"
                                                value={item.productName}
                                                onChange={e => handleItemChange(item.id, 'productName', e.target.value)}
                                                onKeyDown={(e) => handleKeyDown(e, idx, 'product')}
                                            />
                                        </div>

                                        {/* Qty (1 col) */}
                                        <div className="col-span-6 md:col-span-1">
                                            <label className="text-[10px] font-bold text-[var(--text-secondary)] mb-1 text-center block uppercase">
                                                數量
                                            </label>
                                            <input
                                                id={`item-${idx}-qty`}
                                                type="text"
                                                inputMode="decimal"
                                                className="input-field w-full py-1.5 px-1 text-center text-sm"
                                                placeholder="0"
                                                value={item.quantity}
                                                onChange={e => handleItemChange(item.id, 'quantity', e.target.value)}
                                                onBlur={e => handleBlur(item.id, 'quantity', e.target.value)}
                                                onKeyDown={(e) => handleKeyDown(e, idx, 'qty')}
                                            />
                                        </div>

                                        {/* Price (1 col) */}
                                        <div className="col-span-6 md:col-span-1">
                                            <label className="text-[10px] font-bold text-[var(--text-secondary)] mb-1 text-center block uppercase">
                                                單價
                                            </label>
                                            <input
                                                id={`item-${idx}-price`}
                                                type="text"
                                                inputMode="decimal"
                                                className="input-field w-full py-1.5 px-1 text-center text-sm"
                                                placeholder="0"
                                                value={item.unitPrice}
                                                onChange={e => handleItemChange(item.id, 'unitPrice', e.target.value)}
                                                onBlur={e => handleBlur(item.id, 'unitPrice', e.target.value)}
                                                onKeyDown={(e) => handleKeyDown(e, idx, 'price')}
                                            />
                                        </div>

                                        {/* Expiry (3 cols) */}
                                        <div className="col-span-12 md:col-span-3 flex items-end gap-1">
                                            <div className="flex-1">
                                                <label className="text-[10px] font-bold text-[var(--text-secondary)] mb-1 uppercase">
                                                    有效期限
                                                </label>
                                                <div className="grid grid-cols-[1.5fr_auto_1fr_auto_1fr] gap-1 items-center">
                                                    <input
                                                        id={`item-${idx}-year`}
                                                        className="input-field py-1.5 px-0.5 text-center text-sm font-mono"
                                                        placeholder="YYYY"
                                                        value={item.expiryYear}
                                                        onChange={e => handleItemChange(item.id, 'expiryYear', e.target.value)}
                                                        onKeyDown={(e) => handleKeyDown(e, idx, 'year')}
                                                    />
                                                    <span className="text-[var(--text-tertiary)] text-[10px]">/</span>
                                                    <input
                                                        id={`item-${idx}-month`}
                                                        className="input-field py-1.5 px-0.5 text-center text-sm font-mono"
                                                        placeholder="MM"
                                                        value={item.expiryMonth}
                                                        onChange={e => handleItemChange(item.id, 'expiryMonth', e.target.value)}
                                                        onKeyDown={(e) => handleKeyDown(e, idx, 'month')}
                                                    />
                                                    <span className="text-[var(--text-tertiary)] text-[10px]">/</span>
                                                    <input
                                                        id={`item-${idx}-day`}
                                                        className="input-field py-1.5 px-0.5 text-center text-sm font-mono"
                                                        placeholder="DD"
                                                        value={item.expiryDay}
                                                        onChange={e => handleItemChange(item.id, 'expiryDay', e.target.value)}
                                                        onKeyDown={(e) => handleKeyDown(e, idx, 'day')}
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        {/* Payment (3 cols) */}
                                        <div className="col-span-12 md:col-span-3">
                                            <div className="flex items-center justify-between mb-1">
                                                <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase">
                                                    支付方式
                                                </label>
                                                {item.vendor && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleSaveDefault(item)}
                                                        className="text-[9px] text-emerald-600 hover:text-emerald-700 font-bold transition-colors flex items-center gap-0.5"
                                                    >
                                                        📌 設為預設
                                                    </button>
                                                )}
                                            </div>
                                            <div className="flex bg-[var(--bg-primary)] p-0.5 rounded-lg border border-[var(--border-primary)] shadow-sm h-8">
                                                <button
                                                    type="button"
                                                    onClick={() => handleItemChange(item.id, 'paymentMethod', 'CASH')}
                                                    className={`flex-1 py-0.5 text-[10px] font-bold rounded-md transition-all ${item.paymentMethod === 'CASH' ? 'bg-emerald-500 text-white' : 'text-[var(--text-tertiary)] hover:bg-slate-50'}`}
                                                >
                                                    現金
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleItemChange(item.id, 'paymentMethod', 'CREDIT')}
                                                    className={`flex-1 py-0.5 text-[10px] font-bold rounded-md transition-all ${item.paymentMethod === 'CREDIT' ? 'bg-purple-600 text-white' : 'text-[var(--text-tertiary)] hover:bg-slate-50'}`}
                                                >
                                                    賒帳
                                                </button>
                                            </div>
                                        </div>

                                        {/* Action (Delete) */}
                                        <div className="col-span-12 md:col-span-1 flex items-end justify-center">
                                            {items.length > 1 && (
                                                <button
                                                    type="button"
                                                    onClick={() => removeItem(item.id)}
                                                    className="w-8 h-8 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-all flex items-center justify-center mb-[2px]"
                                                    title="刪除"
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

                    <div className="flex gap-4 mt-8 pt-6 border-t border-[var(--border-primary)]">
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
                            className="btn-primary flex-[2] py-4 text-lg font-bold shadow-lg shadow-emerald-100 hover:shadow-xl hover:shadow-emerald-200 hover:scale-105 transition-all flex items-center justify-center gap-2"
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
