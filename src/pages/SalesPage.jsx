import React, { useState, useEffect, useCallback } from 'react';
import { Save, RefreshCw, Calculator, DollarSign, GripVertical, ListOrdered } from 'lucide-react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { callGAS } from '../utils/api';
import { PRICE_MAP, sortProducts } from '../utils/constants';

export default function SalesPage({ user, apiUrl, logActivity }) {
    const [rows, setRows] = useState([]);
    const [cashCounts, setCashCounts] = useState({ 1000: 0, 500: 0, 100: 0, 50: 0, 10: 0, 5: 0, 1: 0 });
    // Initialize reserve with 5000 for Cash default
    const [reserve, setReserve] = useState(5000);
    const [expenses, setExpenses] = useState({
        stall: 0, cleaning: 0, electricity: 0, gas: 0, parking: 0,
        goods: 0, bags: 0, others: 0, linePay: 0, serviceFee: 0
    });
    const [location, setLocation] = useState(''); // This will be used as "Sales Target"
    const [paymentType, setPaymentType] = useState('CASH');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSorting, setIsSorting] = useState(false);

    // Handle Payment Type Effects
    useEffect(() => {
        if (paymentType === 'CASH') {
            setReserve(5000);
        } else {
            setReserve(0);
        }
    }, [paymentType]);

    const load = useCallback(async () => {
        try {
            const data = await callGAS(apiUrl, 'getProducts', {}, user.token);
            console.log('Sales Page - Raw Products Data:', data);

            if (Array.isArray(data)) {
                // Show ALL products (removed stock filter for debugging)
                // [User Request] Filter out only if BOTH stock and originalStock are 0
                const content = data.filter(p => (Number(p.stock) || 0) > 0 || (Number(p.originalStock) || 0) > 0);
                const sortedProducts = sortProducts(content, 'name');
                console.log('Sales Page - Sorted Products (Stock or Original > 0):', sortedProducts);

                setRows(sortedProducts.map(p => {
                    // 1. Get system default and PRICE_MAP override
                    const systemPrice = Number(p.price) || 0;
                    const mapPrice = PRICE_MAP[p.name] !== undefined ? PRICE_MAP[p.name] : null;

                    // 2. Local memory override
                    const localPriceKey = `last_price_${p.id}`;
                    const localPrice = localStorage.getItem(localPriceKey);

                    // Priority: Local Memory > PRICE_MAP > System Price
                    let finalPrice = systemPrice;
                    if (mapPrice !== null) finalPrice = mapPrice;
                    if (localPrice !== null) finalPrice = Number(localPrice);

                    return {
                        id: p.id,
                        name: p.name,
                        stock: Number(p.stock) || 0,
                        originalStock: Number(p.originalStock) || 0,
                        picked: 0,
                        original: 0,
                        returns: 0,
                        sold: 0,
                        price: finalPrice,
                        subtotal: 0,
                        sortWeight: Number(p.sortWeight) || 0
                    };
                }));
            } else {
                console.error('Sales Page - Data is not an array:', data);
            }
        } catch (error) {
            console.error("Fetch products failed", error);
            alert('載入產品失敗: ' + error.message);
        }
    }, [apiUrl, user.token]);

    useEffect(() => {
        const init = async () => {
            if (user?.token) {
                await load();
            }
        };
        init();
    }, [user.token, load]);

    // Recalculate row
    const handleRowChange = (id, field, value) => {
        let val = Number(value);
        if (isNaN(val)) val = 0;

        setRows(prev => prev.map(r => {
            if (r.id !== id) return r;

            // 1. Propose new values based on input
            let newPicked = field === 'picked' ? val : (r.picked || 0);
            let newOriginal = field === 'original' ? val : (r.original || 0);
            let newReturns = field === 'returns' ? val : (r.returns || 0);
            let newPrice = field === 'price' ? val : (r.price || 0);

            // 2. Local Price Memory Persistence
            if (field === 'price') {
                localStorage.setItem(`last_price_${id}`, newPrice.toString());
            }

            // 3. Validate Stock Limits
            if (newPicked > r.stock) newPicked = r.stock;
            if (newPicked < 0) newPicked = 0;

            if (newOriginal > r.originalStock) newOriginal = r.originalStock;
            if (newOriginal < 0) newOriginal = 0;

            // 4. Validate Returns Limit (Cannot return more than taken)
            const totalInHand = newPicked + newOriginal;
            if (newReturns > totalInHand) newReturns = totalInHand;
            if (newReturns < 0) newReturns = 0;

            // 5. Construct updated row
            const updated = {
                ...r,
                picked: newPicked,
                original: newOriginal,
                returns: newReturns,
                price: newPrice
            };

            // 6. Calculate Sold & Subtotal
            updated.sold = updated.picked + updated.original - updated.returns;
            updated.subtotal = updated.sold * (updated.price || 0);

            return updated;
        }));
    };

    const handleDragEnd = async (result) => {
        if (!result.destination) return;

        const items = Array.from(rows);
        const [reorderedItem] = items.splice(result.source.index, 1);
        items.splice(result.destination.index, 0, reorderedItem);

        // Update local state immediately for responsiveness
        setRows(items);

        // Sync to Google Sheet
        try {
            const productIds = items.map(r => r.id);
            await callGAS(apiUrl, 'updateProductSortOrder', { productIds }, user.token);
            console.log('Sort order synced to Google Sheet');
        } catch (error) {
            console.error('Failed to sync sort order:', error);
            // Optionally revert the state if sync fails
        }
    };

    // Navigation Helpers
    const focusAndSelect = (id) => {
        const el = document.getElementById(id);
        if (el) {
            el.focus();
            el.select?.();
            // Ensure the element is scrolled into view smoothly
            el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    };

    const handleKeyDown = (e, idx, field, prefix = 'input-') => {
        const validKeys = ['Enter', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
        if (!validKeys.includes(e.key)) return;

        // Prevent default scrolling for arrow keys
        if (e.key.startsWith('Arrow')) e.preventDefault();

        const sequence = ['picked', 'original', 'returns', 'price'];
        const colIdx = sequence.indexOf(field);

        // Enter Logic
        if (e.key === 'Enter') {
            e.preventDefault();
            // User requested sequence: picked -> original -> returns -> price -> Next Row picked
            const enterSequence = ['picked', 'original', 'returns', 'price'];
            const currentFieldIdx = enterSequence.indexOf(field);

            if (currentFieldIdx < enterSequence.length - 1 && currentFieldIdx !== -1) {
                // Next field in same row
                const nextField = enterSequence[currentFieldIdx + 1];
                focusAndSelect(`${prefix}${idx}-${nextField}`);
            } else {
                // If it's price (or beyond), move to next row first field
                if (idx < rows.length - 1) {
                    focusAndSelect(`${prefix}${idx + 1}-picked`);
                } else {
                    // Last row last col -> Jump to Sidebar (1000 cash)
                    focusAndSelect('input-cash-1000');
                }
            }
            return;
        }

        // Arrow Logic (Mainly for desktop table, keeps functionality)
        let targetId = null;
        if (e.key === 'ArrowUp') {
            if (idx > 0) targetId = `${prefix}${idx - 1}-${field}`;
        } else if (e.key === 'ArrowDown') {
            if (idx < rows.length - 1) targetId = `${prefix}${idx + 1}-${field}`;
            else targetId = 'input-cash-1000';
        } else if (e.key === 'ArrowLeft') {
            if (colIdx > 0) {
                targetId = `${prefix}${idx}-${sequence[colIdx - 1]}`;
            } else {
                // At the first column (picked), jump to PREVIOUS row's last column (price)
                if (idx > 0) {
                    targetId = `${prefix}${idx - 1}-price`;
                }
            }
        } else if (e.key === 'ArrowRight') {
            if (colIdx < sequence.length - 1) {
                targetId = `${prefix}${idx}-${sequence[colIdx + 1]}`;
            } else {
                // At the last column (price), jump to the NEXT row's first column (picked)
                if (idx < rows.length - 1) {
                    targetId = `${prefix}${idx + 1}-picked`;
                } else {
                    // Last row last col -> Jump to Sidebar
                    targetId = 'input-cash-1000';
                }
            }
        }

        if (targetId) focusAndSelect(targetId);
    };

    const handleSidebarKeyDown = (e, targets = {}) => {
        const { next, prev, up, down, left, right } = targets;
        const validKeys = ['Enter', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
        if (!validKeys.includes(e.key)) return;
        if (e.key.startsWith('Arrow')) e.preventDefault();

        let targetId = null;
        if (e.key === 'Enter') {
            e.preventDefault();
            targetId = next;
        } else if (e.key === 'ArrowDown') {
            targetId = down || next;
        } else if (e.key === 'ArrowUp') {
            targetId = up || prev;
        } else if (e.key === 'ArrowLeft') {
            targetId = left || prev;
        } else if (e.key === 'ArrowRight') {
            targetId = right || next;
        }

        if (targetId) {
            focusAndSelect(targetId);
        } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
            // Top of sidebar -> Back to Table (Last row, last col)
            if (rows.length > 0) {
                focusAndSelect(`input-${rows.length - 1}-price`);
            }
        }
    };

    const totalSalesAmount = rows.reduce((acc, r) => acc + (r.subtotal || 0), 0);
    const totalCashCalc = Object.entries(cashCounts).reduce((acc, [denom, count]) => acc + (Number(denom) * count), 0);
    // If Credit, reserve is 0 effectively, and totalCashNet might not be relevant for balancing but let's keep calc
    const totalCashNet = totalCashCalc - reserve;

    const totalExpensesPlusLinePay =
        Number(expenses.stall) + Number(expenses.cleaning) + Number(expenses.electricity) +
        Number(expenses.gas) + Number(expenses.parking) + Number(expenses.goods) +
        Number(expenses.bags) + Number(expenses.others) + Number(expenses.linePay);

    const isCredit = paymentType === 'CREDIT';

    // Final Total Calculation Logic
    // 扣除後總金額 = (總金額 - 預備金) + 支出 + Line Pay + 服務費 - 總繳回金額
    // IF CASH: (Total Cash - Reserve) + Expenses + LinePay + ServiceFee - Total Sales Amount
    // IF CREDIT: Just the Total Sales Amount (Product Subtotals)
    const finalTotal = isCredit
        ? totalSalesAmount
        : (totalCashNet + totalExpensesPlusLinePay + Number(expenses.serviceFee) - totalSalesAmount);

    const handleSubmit = async () => {
        if (!location.trim()) {
            alert('請輸入銷售對象！');
            const locationInput = document.getElementById('input-location');
            if (locationInput) locationInput.focus();
            return;
        }

        const payload = {
            salesRep: user.username,
            customer: location, // Changed key to match backend 'customer'
            paymentMethod: paymentType, // Changed key to match backend 'paymentMethod'
            salesData: rows.map(r => ({
                productId: r.id,
                picked: r.picked,
                original: r.original,
                returns: r.returns,
                sold: r.sold,
                unitPrice: r.price
            })),
            // In Credit mode, maybe we don't want to send cashData? 
            // Or sending 0s is fine. User said "Lock", so values stay 0 or whatever.
            cashData: { totalCash: paymentType === 'CREDIT' ? 0 : totalCashNet, reserve },
            expenseData: { ...expenses, finalTotal }
        };

        setIsSubmitting(true);
        try {
            await callGAS(apiUrl, 'saveSales', payload, user.token);

            // Log activity
            if (logActivity) {
                logActivity({
                    actionType: 'DATA_EDIT',
                    page: '銷售登錄',
                    details: JSON.stringify({
                        customer: location,
                        paymentMethod: paymentType,
                        totalAmount: isCredit ? totalSalesAmount : finalTotal,
                        productCount: rows.filter(r => r.sold > 0).length
                    })
                });
            }

            alert('保存成功！資料已寫入 Google Sheet。');
            window.location.reload();
        } catch (e) {
            alert('保存失敗: ' + e.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 h-full overflow-y-auto xl:overflow-hidden">
            {isSubmitting && (
                <div className="loading-overlay">
                    <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-lg font-bold text-[var(--text-primary)]">資料存盤中，請稍後...</p>
                </div>
            )}
            {/* Product Table */}
            <div className="xl:col-span-2 glass-panel p-6 overflow-hidden flex flex-col h-auto min-h-[60vh] xl:h-[calc(100vh-10rem)]">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-4">
                    <h2 className="text-xl font-bold flex items-center gap-2 text-[var(--text-primary)]">
                        <RefreshCw size={20} className="text-[var(--accent-blue)]" /> 商品銷售登錄
                    </h2>

                    <div className="flex flex-col md:flex-row items-stretch md:items-center gap-4 w-full md:w-auto">
                        {/* Toggle on Left */}
                        <div className="flex bg-[var(--bg-tertiary)] rounded-lg p-1 border border-[var(--border-primary)] self-start md:self-auto">
                            <button
                                onClick={() => setPaymentType('CASH')}
                                className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${paymentType === 'CASH'
                                    ? 'bg-emerald-500 text-white shadow-sm'
                                    : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
                                    }`}
                            >
                                現金
                            </button>
                            <button
                                onClick={() => setPaymentType('CREDIT')}
                                className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${paymentType === 'CREDIT'
                                    ? 'bg-amber-500 text-white shadow-sm'
                                    : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
                                    }`}
                            >
                                賒銷
                            </button>
                        </div>

                        <div className="flex items-center gap-2 w-full md:w-auto">
                            <label className="text-sm text-[var(--text-secondary)] font-bold whitespace-nowrap">銷售對象:</label>
                            <input
                                id="input-location"
                                type="text"
                                className="input-field py-1 px-3 w-full md:w-48"
                                placeholder="輸入銷售對象..."
                                value={location}
                                onChange={(e) => setLocation(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        // Jump to first product (checks both mobile and desktop IDs)
                                        focusAndSelect('input-m-0-picked') || focusAndSelect('input-0-picked');
                                    }
                                }}
                            />
                        </div>

                        {/* Drag and Drop Sort Toggle */}
                        <button
                            onClick={() => setIsSorting(!isSorting)}
                            className={`flex items-center gap-2 px-3 py-1 text-xs font-bold rounded-lg border transition-all ${isSorting
                                ? 'bg-indigo-500 text-white border-indigo-500'
                                : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] border-[var(--border-primary)] hover:border-[var(--accent-blue)]'
                                }`}
                        >
                            <ListOrdered size={16} />
                            {isSorting ? '儲存排序' : '自定義排序'}
                        </button>
                    </div>
                </div>
                <div className="flex-1 overflow-auto">
                    {/* Mobile Card View (Visible on < md) */}
                    <DragDropContext onDragEnd={handleDragEnd}>
                        <Droppable droppableId="mobile-rows" isDropDisabled={!isSorting}>
                            {(provided) => (
                                <div
                                    {...provided.droppableProps}
                                    ref={provided.innerRef}
                                    className="md:hidden space-y-4"
                                >
                                    {rows.map((row, idx) => (
                                        <Draggable key={row.id} draggableId={String(row.id)} index={idx} isDragDisabled={!isSorting}>
                                            {(provided, snapshot) => (
                                                <div
                                                    ref={provided.innerRef}
                                                    {...provided.draggableProps}
                                                    className={`bg-[var(--bg-secondary)] rounded-xl p-4 border border-[var(--border-primary)] ${snapshot.isDragging ? 'shadow-2xl z-50 ring-2 ring-indigo-500' : ''}`}
                                                >
                                                    {/* Header: Name & Stock */}
                                                    <div className="flex justify-between items-start mb-3">
                                                        <div className="flex items-center gap-2">
                                                            {isSorting && (
                                                                <div {...provided.dragHandleProps} className="text-[var(--text-tertiary)] cursor-grab active:cursor-grabbing">
                                                                    <GripVertical size={20} />
                                                                </div>
                                                            )}
                                                            <div className="font-bold text-[var(--text-primary)] text-lg">{row.name}</div>
                                                        </div>
                                                        <div className="text-xs font-mono bg-[var(--bg-tertiary)] px-2 py-1 rounded border border-[var(--border-primary)]">
                                                            <span className="text-[var(--text-tertiary)] mr-1">庫存</span>
                                                            <span className="text-blue-500 font-bold">{row.stock}</span>
                                                            <span className="text-[var(--text-tertiary)] mx-1">/</span>
                                                            <span className="text-orange-500 font-bold">{row.originalStock || 0}</span>
                                                        </div>
                                                    </div>

                                                    {/* Inputs Grid */}
                                                    <div className="grid grid-cols-4 gap-2 mb-3">
                                                        <div className="flex flex-col gap-1">
                                                            <label className="text-[10px] text-[var(--text-secondary)] text-center font-bold">領貨</label>
                                                            <input
                                                                id={`input-m-${idx}-picked`}
                                                                type="number"
                                                                className="input-field text-center p-2 text-base font-bold"
                                                                value={row.picked || ''}
                                                                onChange={(e) => handleRowChange(row.id, 'picked', e.target.value)}
                                                                onKeyDown={(e) => handleKeyDown(e, idx, 'picked', 'input-m-')}
                                                                disabled={isSorting}
                                                            />
                                                        </div>
                                                        <div className="flex flex-col gap-1">
                                                            <label className="text-[10px] text-[var(--text-secondary)] text-center font-bold">原貨</label>
                                                            <input
                                                                id={`input-m-${idx}-original`}
                                                                type="number"
                                                                className="input-field text-center p-2 text-base font-bold"
                                                                value={row.original || ''}
                                                                onChange={(e) => handleRowChange(row.id, 'original', e.target.value)}
                                                                onKeyDown={(e) => handleKeyDown(e, idx, 'original', 'input-m-')}
                                                                disabled={isSorting}
                                                            />
                                                        </div>
                                                        <div className="flex flex-col gap-1">
                                                            <label className="text-[10px] text-[var(--text-secondary)] text-center font-bold">退貨</label>
                                                            <input
                                                                id={`input-m-${idx}-returns`}
                                                                type="number"
                                                                className="input-field text-center p-2 text-base font-bold text-red-600"
                                                                value={row.returns || ''}
                                                                onChange={(e) => handleRowChange(row.id, 'returns', e.target.value)}
                                                                onKeyDown={(e) => handleKeyDown(e, idx, 'returns', 'input-m-')}
                                                                disabled={isSorting}
                                                            />
                                                        </div>
                                                        <div className="flex flex-col gap-1">
                                                            <label className="text-[10px] text-[var(--text-secondary)] text-center font-bold">單價</label>
                                                            <input
                                                                id={`input-m-${idx}-price`}
                                                                type="number"
                                                                className="input-field text-center p-2 text-base font-bold"
                                                                value={row.price}
                                                                onChange={(e) => handleRowChange(row.id, 'price', e.target.value)}
                                                                onKeyDown={(e) => handleKeyDown(e, idx, 'price', 'input-m-')}
                                                                disabled={isSorting}
                                                            />
                                                        </div>
                                                    </div>

                                                    {/* Summary Footer */}
                                                    <div className="flex justify-between items-center pt-2 border-t border-[var(--border-primary)]">
                                                        <div className="text-xs text-[var(--text-secondary)]">
                                                            售出: <span className="font-bold text-blue-500 text-sm ml-1">{row.sold}</span>
                                                        </div>
                                                        <div className="text-sm font-bold text-rose-600 font-mono">
                                                            <span className="text-xs text-[var(--text-tertiary)] font-normal mr-1">小計</span>
                                                            ${row.subtotal?.toLocaleString()}
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </Draggable>
                                    ))}
                                    {provided.placeholder}
                                </div>
                            )}
                        </Droppable>

                        {/* Desktop Table View (Hidden on < md) */}
                        <table className="hidden md:table w-full text-left border-collapse">
                            <thead className="sticky top-0 bg-[var(--bg-secondary)] z-10 text-[var(--text-secondary)] text-xs uppercase font-bold border-b border-[var(--border-primary)]">
                                <tr>
                                    <th className="p-3 w-10"></th>
                                    <th className="p-3">品項</th>
                                    <th className="p-3 w-20">庫存</th>
                                    <th className="p-3 w-24">領貨(+)</th>
                                    <th className="p-3 w-24">原貨(+)</th>
                                    <th className="p-3 w-24">退貨(-)</th>
                                    <th className="p-3 w-20 text-center">售出</th>
                                    <th className="p-3 w-24">單價</th>
                                    <th className="p-3 w-28 text-right">繳回金額</th>
                                </tr>
                            </thead>
                            <Droppable droppableId="desktop-rows" isDropDisabled={!isSorting}>
                                {(provided) => (
                                    <tbody
                                        {...provided.droppableProps}
                                        ref={provided.innerRef}
                                        className="divide-y divide-[var(--border-primary)]"
                                    >
                                        {rows.map((row, idx) => (
                                            <Draggable key={row.id} draggableId={String(row.id)} index={idx} isDragDisabled={!isSorting}>
                                                {(provided, snapshot) => (
                                                    <tr
                                                        ref={provided.innerRef}
                                                        {...provided.draggableProps}
                                                        className={`hover:bg-[var(--bg-hover)] transition-colors ${snapshot.isDragging ? 'bg-[var(--bg-tertiary)] shadow-xl z-50' : ''}`}
                                                    >
                                                        <td className="p-3">
                                                            {isSorting && (
                                                                <div {...provided.dragHandleProps} className="text-[var(--text-tertiary)] cursor-grab active:cursor-grabbing">
                                                                    <GripVertical size={16} />
                                                                </div>
                                                            )}
                                                        </td>
                                                        <td className="p-3 font-medium text-[var(--text-primary)]">{row.name}</td>
                                                        <td className="p-3 text-[var(--text-secondary)] font-mono tracking-wider">
                                                            <span className="text-blue-500">{row.stock}</span>
                                                            <span className="text-[var(--text-tertiary)] mx-1">/</span>
                                                            <span className="text-orange-500">{row.originalStock || 0}</span>
                                                        </td>
                                                        <td className="p-3">
                                                            <input
                                                                id={`input-${idx}-picked`}
                                                                type="number"
                                                                className="input-field text-center p-1"
                                                                value={row.picked || ''}
                                                                onChange={(e) => handleRowChange(row.id, 'picked', e.target.value)}
                                                                onKeyDown={(e) => handleKeyDown(e, idx, 'picked')}
                                                                disabled={isSorting}
                                                            />
                                                        </td>
                                                        <td className="p-3">
                                                            <input
                                                                id={`input-${idx}-original`}
                                                                type="number"
                                                                className="input-field text-center p-1"
                                                                value={row.original || ''}
                                                                onChange={(e) => handleRowChange(row.id, 'original', e.target.value)}
                                                                onKeyDown={(e) => handleKeyDown(e, idx, 'original')}
                                                                disabled={isSorting}
                                                            />
                                                        </td>
                                                        <td className="p-3">
                                                            <input
                                                                id={`input-${idx}-returns`}
                                                                type="number"
                                                                className="input-field text-center p-1 text-red-600"
                                                                value={row.returns || ''}
                                                                onChange={(e) => handleRowChange(row.id, 'returns', e.target.value)}
                                                                onKeyDown={(e) => handleKeyDown(e, idx, 'returns')}
                                                                disabled={isSorting}
                                                            />
                                                        </td>
                                                        <td className="p-3 text-center font-bold text-blue-500">{row.sold}</td>
                                                        <td className="p-3"><input id={`input-${idx}-price`} type="number" className="input-field text-center p-1 w-20" value={row.price} onChange={(e) => handleRowChange(row.id, 'price', e.target.value)} onKeyDown={(e) => handleKeyDown(e, idx, 'price')} disabled={isSorting} /></td>
                                                        <td className="p-3 text-right font-mono text-rose-600">${row.subtotal?.toLocaleString()}</td>
                                                    </tr>
                                                )}
                                            </Draggable>
                                        ))}
                                        {provided.placeholder}
                                    </tbody>
                                )}
                            </Droppable>
                        </table>
                    </DragDropContext>
                </div>
                <div className="mt-4 pt-4 border-t border-[var(--border-primary)] flex justify-between items-center bg-[var(--bg-secondary)] p-4 rounded-lg">
                    <span className="text-[var(--text-secondary)]">總繳回金額 (商品計算)</span>
                    <span className="text-2xl font-bold text-rose-600">${totalSalesAmount.toLocaleString()}</span>
                </div>
            </div>

            {/* Right Side: Cash, Expenses & Final Result (Unified Column) */}
            <div className="flex flex-col h-auto xl:h-[calc(100vh-10rem)] gap-6">
                {/* Scrollable Content: Cash & Expenses */}
                <div className={`flex-1 xl:overflow-y-auto pr-0 xl:pr-2 space-y-6 transition-opacity ${isCredit ? 'opacity-50 pointer-events-none grayscale' : ''}`}>

                    {/* Overlay for locking if strictly needed, but pointer-events-none does the trick interactively */}

                    <div className="glass-panel p-6 relative">
                        {isCredit && <div className="absolute inset-0 z-50 cursor-not-allowed"></div>}

                        <h2 className="text-lg font-bold mb-4 flex items-center gap-2 text-[var(--text-primary)]">
                            <Calculator size={20} className="text-amber-500" /> 錢點清算
                        </h2>
                        <div className="space-y-3">
                            {[1000, 500, 100, 50, 10, 5, 1].map((denom, idx, arr) => {
                                const currentId = `input-cash-${denom}`;
                                const nextId = idx < arr.length - 1 ? `input-cash-${arr[idx + 1]}` : 'input-reserve';
                                const prevId = idx > 0 ? `input-cash-${arr[idx - 1]}` : null; // null means jump to table
                                return (
                                    <div key={denom} className="flex items-center gap-4">
                                        <span className="w-12 text-[var(--text-secondary)] font-mono text-right">{denom}</span>
                                        <span className="text-[var(--text-tertiary)]">x</span>
                                        <input
                                            id={currentId}
                                            type="number"
                                            className="input-field flex-1"
                                            placeholder="0"
                                            value={cashCounts[denom] || ''}
                                            onChange={(e) => setCashCounts({ ...cashCounts, [denom]: Number(e.target.value) })}
                                            onKeyDown={(e) => handleSidebarKeyDown(e, {
                                                next: nextId,
                                                prev: prevId,
                                                right: nextId,
                                                left: prevId
                                            })}
                                            disabled={isCredit}
                                        />
                                        <span className="w-20 text-right font-mono text-[var(--text-secondary)]">${(denom * cashCounts[denom]).toLocaleString()}</span>
                                    </div>
                                );
                            })}
                            <div className="border-t border-[var(--border-primary)] my-2 pt-2 flex items-center gap-4 text-red-500">
                                <span className="w-12 text-right">預備金</span>
                                <span className="text-[var(--text-tertiary)]">-</span>
                                <input
                                    id="input-reserve"
                                    type="number"
                                    className="input-field flex-1 border-red-900/50 focus:ring-red-500"
                                    value={reserve}
                                    onChange={(e) => setReserve(Number(e.target.value))}
                                    onKeyDown={(e) => handleSidebarKeyDown(e, {
                                        next: 'input-expense-stall',
                                        prev: 'input-cash-1',
                                        right: 'input-expense-stall',
                                        left: 'input-cash-1'
                                    })}
                                    disabled={isCredit}
                                />
                            </div>
                            <div className="bg-[var(--bg-secondary)] p-3 rounded flex justify-between items-center border border-[var(--border-primary)]">
                                <span className="text-[var(--text-secondary)]">總金額</span>
                                <span className="text-xl font-bold text-amber-500">${(isCredit ? 0 : totalCashNet).toLocaleString()}</span>
                            </div>
                        </div>
                    </div>

                    <div className="glass-panel p-6 relative">
                        {isCredit && <div className="absolute inset-0 z-50 cursor-not-allowed"></div>}

                        <h2 className="text-lg font-bold mb-4 text-rose-500">支出與其他</h2>
                        <div className="grid grid-cols-2 gap-3">
                            {['stall:攤位', 'cleaning:清潔', 'electricity:電費', 'gas:加油', 'parking:停車', 'goods:貨款', 'bags:塑膠袋', 'others:其他'].map((item, idx, arr) => {
                                const [key, label] = item.split(':');
                                const currentId = `input-expense-${key}`;

                                // Sequential Navigation
                                const nextKey = idx < arr.length - 1 ? arr[idx + 1].split(':')[0] : 'linePay';
                                const nextId = `input-expense-${nextKey}`;
                                const prevId = idx > 0 ? `input-expense-${arr[idx - 1].split(':')[0]}` : 'input-reserve';

                                // Grid Navigation (2 columns)
                                const upKey = idx >= 2 ? arr[idx - 2].split(':')[0] : null;
                                const downKey = idx < arr.length - 2 ? arr[idx + 2].split(':')[0] : 'linePay';

                                return (
                                    <div key={key}>
                                        <label className="text-xs text-[var(--text-secondary)] block mb-1">{label}</label>
                                        <input
                                            id={currentId}
                                            type="number"
                                            className="input-field text-sm"
                                            value={expenses[key] || ''}
                                            onChange={(e) => setExpenses({ ...expenses, [key]: Number(e.target.value) })}
                                            onKeyDown={(e) => handleSidebarKeyDown(e, {
                                                next: nextId,
                                                prev: prevId,
                                                right: nextId,
                                                left: prevId,
                                                up: upKey ? `input-expense-${upKey}` : 'input-reserve',
                                                down: downKey.startsWith('input-') ? downKey : `input-expense-${downKey}`
                                            })}
                                            disabled={isCredit}
                                        />
                                    </div>
                                );
                            })}
                        </div>
                        <div className="mt-4 space-y-3">
                            <div>
                                <label className="text-xs text-[var(--text-secondary)] block mb-1">Line Pay (收款)</label>
                                <input
                                    id="input-expense-linePay"
                                    type="number"
                                    className="input-field border-green-200 text-green-600"
                                    value={expenses.linePay || ''}
                                    onChange={(e) => setExpenses({ ...expenses, linePay: Number(e.target.value) })}
                                    onKeyDown={(e) => handleSidebarKeyDown(e, {
                                        next: 'input-expense-serviceFee',
                                        prev: 'input-expense-others',
                                        right: 'input-expense-serviceFee',
                                        left: 'input-expense-others',
                                        up: 'input-expense-bags' // Index 6 is bags, index 7 is others. LinePay is below both. 
                                    })}
                                    disabled={isCredit}
                                />
                            </div>
                            <div>
                                <label className="text-xs text-[var(--text-secondary)] block mb-1">服務費 (扣除)</label>
                                <input
                                    id="input-expense-serviceFee"
                                    type="number"
                                    className="input-field border-red-200 text-red-600"
                                    value={expenses.serviceFee || ''}
                                    onChange={(e) => setExpenses({ ...expenses, serviceFee: Number(e.target.value) })}
                                    disabled={isCredit}
                                    onKeyDown={(e) => handleSidebarKeyDown(e, {
                                        next: 'btn-save-data',
                                        prev: 'input-expense-linePay',
                                        right: 'btn-save-data',
                                        left: 'input-expense-linePay',
                                        up: 'input-expense-others'
                                    })}
                                />
                            </div>
                        </div>

                    </div>
                </div>

                {/* Final Result Card (Fixed at bottom of the right column) */}
                <div className="p-6 glass-panel shadow-lg border-t-4 border-t-blue-600 opacity-100 pointer-events-auto">
                    <div className="text-sm text-[var(--text-secondary)] mb-1 font-bold">扣除後總金額 (結算)</div>
                    <div className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-700 to-indigo-700">
                        ${(isCredit ? totalSalesAmount : finalTotal).toLocaleString()}
                    </div>
                    <button id="btn-save-data" onClick={handleSubmit} className="btn-primary w-full mt-6 flex justify-center items-center gap-2 py-4 text-lg">
                        <Save size={20} /> 保存今日資料
                    </button>
                </div>
            </div>
        </div>
    );
}
