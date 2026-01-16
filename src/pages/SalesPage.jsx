import React, { useState, useEffect, useCallback } from 'react';
import { Save, RefreshCw, Calculator, DollarSign } from 'lucide-react';
import { callGAS } from '../utils/api';
import { PRICE_MAP, sortProducts } from '../utils/constants';

export default function SalesPage({ user, apiUrl }) {
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
    const [mobileTab, setMobileTab] = useState('products'); // 'products' or 'settlement'

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
                    // Use custom selling price if available, otherwise fallback to system price
                    const systemPrice = Number(p.price) || 0;
                    const customPrice = PRICE_MAP[p.name] !== undefined ? PRICE_MAP[p.name] : systemPrice;

                    return {
                        id: p.id,
                        name: p.name,
                        stock: Number(p.stock) || 0,
                        originalStock: Number(p.originalStock) || 0,
                        picked: 0,
                        original: 0,
                        returns: 0,
                        sold: 0,
                        price: customPrice,
                        subtotal: 0
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

            // 2. Validate Stock Limits
            if (newPicked > r.stock) newPicked = r.stock;
            if (newPicked < 0) newPicked = 0;

            if (newOriginal > r.originalStock) newOriginal = r.originalStock;
            if (newOriginal < 0) newOriginal = 0;

            // 3. Validate Returns Limit (Cannot return more than taken)
            const totalInHand = newPicked + newOriginal;
            if (newReturns > totalInHand) newReturns = totalInHand;
            if (newReturns < 0) newReturns = 0;

            // 4. Construct updated row
            const updated = {
                ...r,
                picked: newPicked,
                original: newOriginal,
                returns: newReturns,
                price: newPrice
            };

            // 5. Calculate Sold & Subtotal
            updated.sold = updated.picked + updated.original - updated.returns;
            updated.subtotal = updated.sold * (updated.price || 0);

            return updated;
        }));
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

    const handleKeyDown = (e, idx, field) => {
        const validKeys = ['Enter', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
        if (!validKeys.includes(e.key)) return;

        // Prevent default scrolling for arrow keys
        if (e.key.startsWith('Arrow')) e.preventDefault();

        const sequence = ['picked', 'original', 'returns', 'price'];
        const colIdx = sequence.indexOf(field);

        // Enter Logic
        if (e.key === 'Enter') {
            e.preventDefault();
            // SKIP Price for Enter key navigation
            // Sequence for Enter: picked -> original -> returns -> Next Row picked
            const enterSequence = ['picked', 'original', 'returns'];
            const currentFieldIdx = enterSequence.indexOf(field);

            if (currentFieldIdx < enterSequence.length - 1 && currentFieldIdx !== -1) {
                // Next field in same row (picked -> original -> returns)
                const nextField = enterSequence[currentFieldIdx + 1];
                focusAndSelect(`input-${idx}-${nextField}`);
            } else {
                // If it's returns (or price/other unexpected), move to next row
                if (idx < rows.length - 1) {
                    // Go to next row picked
                    focusAndSelect(`input-${idx + 1}-picked`);
                } else {
                    // Last row -> Jump to Sidebar (1000 cash or first available)
                    focusAndSelect('input-cash-1000');
                }
            }
            return;
        }

        // Arrow Logic
        let targetId = null;

        if (e.key === 'ArrowUp') {
            if (idx > 0) targetId = `input-${idx - 1}-${field}`;
        } else if (e.key === 'ArrowDown') {
            if (idx < rows.length - 1) {
                targetId = `input-${idx + 1}-${field}`;
            } else {
                // From last row down -> go to sidebar top
                targetId = 'input-cash-1000';
            }
        } else if (e.key === 'ArrowLeft') {
            if (colIdx > 0) {
                targetId = `input-${idx}-${sequence[colIdx - 1]}`;
            }
        } else if (e.key === 'ArrowRight') {
            if (colIdx < sequence.length - 1) {
                targetId = `input-${idx}-${sequence[colIdx + 1]}`;
            } else {
                // From rightmost column -> Jump to Sidebar
                // Try to map row index to sidebar item roughly if possible, or just top
                targetId = 'input-cash-1000';
            }
        }

        if (targetId) {
            focusAndSelect(targetId);
        }
    };

    const handleSidebarKeyDown = (e, currentId, nextId, prevId) => {
        const validKeys = ['Enter', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
        if (!validKeys.includes(e.key)) return;
        if (e.key.startsWith('Arrow')) e.preventDefault();

        if (e.key === 'Enter' || e.key === 'ArrowDown') {
            e.preventDefault();
            if (nextId) focusAndSelect(nextId);
        } else if (e.key === 'ArrowUp') {
            if (prevId) focusAndSelect(prevId);
            else {
                // Top of sidebar -> Back to Table (Last row, last col)
                if (rows.length > 0) {
                    focusAndSelect(`input-${rows.length - 1}-price`);
                }
            }
        } else if (e.key === 'ArrowLeft') {
            // Back to Table (Last row, last col)
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
            alert('保存成功！資料已寫入 Google Sheet。');
            window.location.reload();
        } catch (e) {
            alert('保存失敗: ' + e.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="flex flex-col h-[calc(100vh-8rem)] lg:h-auto">
            {isSubmitting && (
                <div className="loading-overlay">
                    <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-lg font-bold text-slate-800">資料存盤中，請稍後...</p>
                </div>
            )}

            {/* Mobile Tab Switcher */}
            <div className="flex lg:hidden bg-white border-b border-slate-200 sticky top-0 z-50 mb-4 rounded-xl p-1 gap-1">
                <button
                    onClick={() => setMobileTab('products')}
                    className={`flex-1 py-3 text-sm font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${mobileTab === 'products' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500'}`}
                >
                    <RefreshCw size={18} /> 商品清單
                </button>
                <button
                    onClick={() => setMobileTab('settlement')}
                    className={`flex-1 py-3 text-sm font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${mobileTab === 'settlement' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500'}`}
                >
                    <Calculator size={18} /> 結算清算
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 overflow-hidden">
                {/* Product Section */}
                <div className={`lg:col-span-2 flex flex-col ${mobileTab !== 'products' ? 'hidden lg:flex' : 'flex'}`}>
                    <div className="glass-panel p-4 lg:p-6 overflow-hidden flex flex-col h-full lg:h-[calc(100vh-10rem)]">
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
                            <h2 className="text-xl font-bold flex items-center gap-2 text-slate-800">
                                <RefreshCw size={20} className="text-blue-600" /> 商品銷售登錄
                            </h2>

                            <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                                <div className="flex bg-slate-100 rounded-lg p-1 border border-slate-200">
                                    <button
                                        onClick={() => setPaymentType('CASH')}
                                        className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${paymentType === 'CASH' ? 'bg-emerald-500 text-white shadow-sm' : 'text-slate-400'}`}
                                    >
                                        現金
                                    </button>
                                    <button
                                        onClick={() => setPaymentType('CREDIT')}
                                        className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${paymentType === 'CREDIT' ? 'bg-amber-500 text-white shadow-sm' : 'text-slate-400'}`}
                                    >
                                        賒銷
                                    </button>
                                </div>

                                <div className="flex items-center gap-2 flex-1 md:flex-none">
                                    <input
                                        id="input-location"
                                        type="text"
                                        className="input-field py-1.5 px-3 w-full md:w-48"
                                        placeholder="對象 (如：屏東門市)..."
                                        value={location}
                                        onChange={(e) => setLocation(e.target.value)}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Desktop Table View */}
                        <div className="hidden lg:block flex-1 overflow-auto">
                            <table className="w-full text-left border-collapse">
                                <thead className="sticky top-0 bg-white z-10 text-slate-500 text-xs uppercase font-bold border-b border-slate-100">
                                    <tr>
                                        <th className="p-3">品項</th>
                                        <th className="p-3 w-20 text-center">庫存 (領/原)</th>
                                        <th className="p-3 w-24">領貨(+)</th>
                                        <th className="p-3 w-24">原貨(+)</th>
                                        <th className="p-3 w-24">退貨(-)</th>
                                        <th className="p-3 w-16 text-center">售出</th>
                                        <th className="p-3 w-24">單價</th>
                                        <th className="p-3 w-28 text-right">繳回</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {rows.map((row, idx) => (
                                        <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                                            <td className="p-3 font-medium text-slate-800">{row.name}</td>
                                            <td className="p-3 text-center text-[10px] font-mono whitespace-nowrap">
                                                <span className="text-blue-600">{row.stock}</span>
                                                <span className="text-slate-300 mx-0.5">/</span>
                                                <span className="text-orange-600">{row.originalStock || 0}</span>
                                            </td>
                                            <td className="p-3">
                                                <input
                                                    id={`input-${idx}-picked`}
                                                    type="number"
                                                    className="input-field text-center p-1 bg-white h-8"
                                                    value={row.picked || ''}
                                                    onChange={(e) => handleRowChange(row.id, 'picked', e.target.value)}
                                                    onKeyDown={(e) => handleKeyDown(e, idx, 'picked')}
                                                />
                                            </td>
                                            <td className="p-3">
                                                <input
                                                    id={`input-${idx}-original`}
                                                    type="number"
                                                    className="input-field text-center p-1 bg-white h-8"
                                                    value={row.original || ''}
                                                    onChange={(e) => handleRowChange(row.id, 'original', e.target.value)}
                                                    onKeyDown={(e) => handleKeyDown(e, idx, 'original')}
                                                />
                                            </td>
                                            <td className="p-3">
                                                <input
                                                    id={`input-${idx}-returns`}
                                                    type="number"
                                                    className="input-field text-center p-1 text-red-600 h-8"
                                                    value={row.returns || ''}
                                                    onChange={(e) => handleRowChange(row.id, 'returns', e.target.value)}
                                                    onKeyDown={(e) => handleKeyDown(e, idx, 'returns')}
                                                />
                                            </td>
                                            <td className="p-3 text-center font-bold text-blue-600">{row.sold}</td>
                                            <td className="p-3">
                                                <input
                                                    id={`input-${idx}-price`}
                                                    type="number"
                                                    className="input-field text-center p-1 w-full bg-white h-8"
                                                    value={row.price}
                                                    onChange={(e) => handleRowChange(row.id, 'price', e.target.value)}
                                                    onKeyDown={(e) => handleKeyDown(e, idx, 'price')}
                                                />
                                            </td>
                                            <td className="p-3 text-right font-mono text-emerald-600 text-sm whitespace-nowrap">
                                                ${row.subtotal?.toLocaleString()}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Mobile Card View */}
                        <div className="lg:hidden flex-1 overflow-auto space-y-4 pb-20">
                            {rows.map((row, idx) => (
                                <div key={row.id} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                                    <div className="flex justify-between items-start mb-3">
                                        <div>
                                            <h3 className="font-bold text-slate-800">{row.name}</h3>
                                            <div className="text-[10px] text-slate-500 mt-1">
                                                庫存: <span className="text-blue-600 font-bold">{row.stock}</span> |
                                                原貨: <span className="text-orange-600 font-bold">{row.originalStock || 0}</span>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-xs text-slate-400">小計</div>
                                            <div className="text-lg font-bold text-emerald-600">${row.subtotal?.toLocaleString()}</div>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-4 gap-2">
                                        <div className="col-span-1">
                                            <label className="text-[10px] text-slate-400 block mb-1">領貨</label>
                                            <input
                                                type="number"
                                                className="input-field text-center p-2 h-10 text-sm"
                                                value={row.picked || ''}
                                                onChange={(e) => handleRowChange(row.id, 'picked', e.target.value)}
                                            />
                                        </div>
                                        <div className="col-span-1">
                                            <label className="text-[10px] text-slate-400 block mb-1">原貨</label>
                                            <input
                                                type="number"
                                                className="input-field text-center p-2 h-10 text-sm"
                                                value={row.original || ''}
                                                onChange={(e) => handleRowChange(row.id, 'original', e.target.value)}
                                            />
                                        </div>
                                        <div className="col-span-1">
                                            <label className="text-[10px] text-red-400 block mb-1">退貨</label>
                                            <input
                                                type="number"
                                                className="input-field text-center p-2 h-10 text-sm text-red-600"
                                                value={row.returns || ''}
                                                onChange={(e) => handleRowChange(row.id, 'returns', e.target.value)}
                                            />
                                        </div>
                                        <div className="col-span-1">
                                            <label className="text-[10px] text-slate-400 block mb-1">售出</label>
                                            <div className="h-10 flex items-center justify-center font-bold text-blue-600 bg-slate-50 rounded-lg border border-slate-100">
                                                {row.sold}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="mt-2 text-right">
                                        <span className="text-[10px] text-slate-400 mr-2">單價:</span>
                                        <input
                                            type="number"
                                            className="w-16 border-b border-slate-200 text-right text-xs focus:border-blue-500 outline-none"
                                            value={row.price}
                                            onChange={(e) => handleRowChange(row.id, 'price', e.target.value)}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Desktop Total */}
                        <div className="hidden lg:flex mt-4 pt-4 border-t border-slate-100 justify-between items-center bg-slate-50 p-4 rounded-lg">
                            <span className="text-slate-500">總繳回金額 (商品計算)</span>
                            <span className="text-2xl font-bold text-emerald-600">${totalSalesAmount.toLocaleString()}</span>
                        </div>
                    </div>
                </div>

                {/* Settlement Section (Right Side on Desktop / Tab 2 on Mobile) */}
                <div className={`flex flex-col h-full lg:h-[calc(100vh-10rem)] gap-6 ${mobileTab !== 'settlement' ? 'hidden lg:flex' : 'flex'}`}>
                    <div className={`flex-1 overflow-y-auto space-y-6 pb-24 lg:pb-0 ${isCredit ? 'opacity-50 pointer-events-none' : ''}`}>

                        {/* Overlay for locking if strictly needed, but pointer-events-none does the trick interactively */}

                        <div className="glass-panel p-6 relative">
                            {isCredit && <div className="absolute inset-0 z-50 cursor-not-allowed"></div>}

                            <h2 className="text-lg font-bold mb-4 flex items-center gap-2 text-slate-800">
                                <Calculator size={20} className="text-amber-600" /> 錢點清算
                            </h2>
                            <div className="space-y-3">
                                {[1000, 500, 100, 50, 10, 5, 1].map((denom, idx, arr) => {
                                    const currentId = `input-cash-${denom}`;
                                    const nextId = idx < arr.length - 1 ? `input-cash-${arr[idx + 1]}` : 'input-reserve';
                                    const prevId = idx > 0 ? `input-cash-${arr[idx - 1]}` : null; // null means jump to table
                                    return (
                                        <div key={denom} className="flex items-center gap-4">
                                            <span className="w-12 text-slate-500 font-mono text-right">{denom}</span>
                                            <span className="text-slate-300">x</span>
                                            <input
                                                id={currentId}
                                                type="number"
                                                className="input-field flex-1"
                                                placeholder="0"
                                                value={cashCounts[denom] || ''}
                                                onChange={(e) => setCashCounts({ ...cashCounts, [denom]: Number(e.target.value) })}
                                                onKeyDown={(e) => handleSidebarKeyDown(e, currentId, nextId, prevId)}
                                                disabled={isCredit}
                                            />
                                            <span className="w-20 text-right font-mono text-slate-500">${(denom * cashCounts[denom]).toLocaleString()}</span>
                                        </div>
                                    );
                                })}
                                <div className="border-t border-slate-100 my-2 pt-2 flex items-center gap-4 text-red-600">
                                    <span className="w-12 text-right">預備金</span>
                                    <span className="text-slate-300">-</span>
                                    <input
                                        id="input-reserve"
                                        type="number"
                                        className="input-field flex-1 border-red-900/50 focus:ring-red-500"
                                        value={reserve}
                                        onChange={(e) => setReserve(Number(e.target.value))}
                                        onKeyDown={(e) => handleSidebarKeyDown(e, 'input-reserve', 'input-expense-stall', 'input-cash-1')}
                                        disabled={isCredit}
                                    />
                                </div>
                                <div className="bg-slate-50 p-3 rounded flex justify-between items-center border border-slate-100">
                                    <span className="text-slate-500">總金額</span>
                                    <span className="text-xl font-bold text-amber-600">${(isCredit ? 0 : totalCashNet).toLocaleString()}</span>
                                </div>
                            </div>
                        </div>

                        <div className="glass-panel p-6 relative">
                            {isCredit && <div className="absolute inset-0 z-50 cursor-not-allowed"></div>}

                            <h2 className="text-lg font-bold mb-4 text-rose-600">支出與其他</h2>
                            <div className="grid grid-cols-2 gap-3">
                                {['stall:攤位', 'cleaning:清潔', 'electricity:電費', 'gas:加油', 'parking:停車', 'goods:貨款', 'bags:塑膠袋', 'others:其他'].map((item, idx, arr) => {
                                    const [key, label] = item.split(':');
                                    const currentId = `input-expense-${key}`;
                                    // Logical flow: stall -> cleaning -> electricity ... 
                                    // Grid layout is 2 columns. 
                                    // Order in array: stall, cleaning, electricity, gas, parking, goods, bags, others.
                                    // Visual order might be row by row. But tabbing order follows DOM order.
                                    // Let's stick to array sequence for next/prev.

                                    const nextKey = idx < arr.length - 1 ? arr[idx + 1].split(':')[0] : 'linePay';
                                    const nextId = idx < arr.length - 1 ? `input-expense-${nextKey}` : 'input-expense-linePay';

                                    const prevKey = idx > 0 ? arr[idx - 1].split(':')[0] : null;
                                    const prevId = idx > 0 ? `input-expense-${prevKey}` : 'input-reserve';

                                    return (
                                        <div key={key}>
                                            <label className="text-xs text-slate-500 block mb-1">{label}</label>
                                            <input
                                                id={currentId}
                                                type="number"
                                                className="input-field text-sm"
                                                value={expenses[key] || ''}
                                                onChange={(e) => setExpenses({ ...expenses, [key]: Number(e.target.value) })}
                                                onKeyDown={(e) => handleSidebarKeyDown(e, currentId, nextId, prevId)}
                                                disabled={isCredit}
                                            />
                                        </div>
                                    );
                                })}
                            </div>
                            <div className="mt-4 space-y-3">
                                <div>
                                    <label className="text-xs text-slate-500 block mb-1">Line Pay (收款)</label>
                                    <input
                                        id="input-expense-linePay"
                                        type="number"
                                        className="input-field border-green-200 text-green-600"
                                        value={expenses.linePay || ''}
                                        onChange={(e) => setExpenses({ ...expenses, linePay: Number(e.target.value) })}
                                        onKeyDown={(e) => handleSidebarKeyDown(e, 'input-expense-linePay', 'input-expense-serviceFee', 'input-expense-others')}
                                        disabled={isCredit}
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-slate-500 block mb-1">服務費 (扣除)</label>
                                    <input
                                        id="input-expense-serviceFee"
                                        type="number"
                                        className="input-field border-red-200 text-red-600"
                                        value={expenses.serviceFee || ''}
                                        onChange={(e) => setExpenses({ ...expenses, serviceFee: Number(e.target.value) })}
                                        disabled={isCredit}
                                        onKeyDown={(e) => handleSidebarKeyDown(e, 'input-expense-serviceFee', null, 'input-expense-linePay')}
                                    />
                                </div>
                            </div>

                        </div>
                    </div>

                    {/* Final Result Card (Sticky at bottom on Mobile, Fixed on Desktop) */}
                    <div className="fixed lg:static bottom-0 left-0 right-0 p-4 lg:p-6 bg-white lg:bg-transparent border-t lg:border-t-0 border-slate-200 lg:shadow-none z-40 bg-white/90 backdrop-blur-md">
                        <div className="max-w-md mx-auto lg:max-w-none glass-panel p-4 lg:p-6 shadow-lg border-t-4 border-t-blue-600">
                            <div className="flex justify-between items-end mb-4 lg:block">
                                <div>
                                    <div className="text-[10px] lg:text-sm text-slate-500 font-bold uppercase tracking-wider">
                                        {isCredit ? '賒銷總計' : '扣除後結算'}
                                    </div>
                                    <div className="text-2xl lg:text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-700 to-indigo-700">
                                        ${(isCredit ? totalSalesAmount : finalTotal).toLocaleString()}
                                    </div>
                                </div>
                                <button
                                    onClick={handleSubmit}
                                    className="lg:hidden btn-primary flex items-center gap-2 py-2 px-6"
                                    disabled={isSubmitting}
                                >
                                    <Save size={18} /> 保存
                                </button>
                            </div>
                            <button
                                onClick={handleSubmit}
                                className="hidden lg:flex btn-primary w-full mt-2 justify-center items-center gap-2 py-4 text-lg"
                                disabled={isSubmitting}
                            >
                                <Save size={20} /> 保存今日資料
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
