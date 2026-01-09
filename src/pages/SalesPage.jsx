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
                const sortedProducts = sortProducts(data, 'name');
                console.log('Sales Page - Sorted Products:', sortedProducts);

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
    // Mapping sidebar Inputs for easier navigation logic
    // Sidebar structure: Cash (1000..1), Reserve, Expenses (stall..others), LinePay, ServiceFee
    // We will assign them IDs and maybe a logical sequence list if needed, but direct ID jumping is easier.

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
                document.getElementById(`input-${idx}-${nextField}`)?.select();
            } else {
                // If it's returns (or price/other unexpected), move to next row
                if (idx < rows.length - 1) {
                    // Go to next row picked
                    document.getElementById(`input-${idx + 1}-picked`)?.select();
                } else {
                    // Last row -> Jump to Sidebar (1000 cash or first available)
                    document.getElementById('input-cash-1000')?.select();
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
            const el = document.getElementById(targetId);
            if (el) el.select();
        }
    };

    const handleSidebarKeyDown = (e, currentId, nextId, prevId) => {
        const validKeys = ['Enter', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
        if (!validKeys.includes(e.key)) return;
        if (e.key.startsWith('Arrow')) e.preventDefault();

        if (e.key === 'Enter' || e.key === 'ArrowDown') {
            e.preventDefault();
            if (nextId) document.getElementById(nextId)?.select();
        } else if (e.key === 'ArrowUp') {
            if (prevId) document.getElementById(prevId)?.select();
            else {
                // Top of sidebar -> Back to Table (Last row, last col)
                if (rows.length > 0) {
                    document.getElementById(`input-${rows.length - 1}-price`)?.select();
                }
            }
        } else if (e.key === 'ArrowLeft') {
            // Back to Table (Last row, last col)
            if (rows.length > 0) {
                document.getElementById(`input-${rows.length - 1}-price`)?.select();
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

        try {
            await callGAS(apiUrl, 'saveSales', payload, user.token);
            alert('保存成功！資料已寫入 Google Sheet。');
            window.location.reload();
        } catch (e) {
            alert('保存失敗: ' + e.message);
        }
    };

    return (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            {/* Product Table */}
            <div className="xl:col-span-2 glass-panel p-6 overflow-hidden flex flex-col h-[calc(100vh-10rem)]">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold flex items-center gap-2">
                        <RefreshCw size={20} className="text-blue-400" /> 商品銷售登錄
                    </h2>

                    <div className="flex items-center gap-4">
                        {/* Toggle on Left */}
                        <div className="flex bg-slate-800 rounded-lg p-1 border border-slate-700">
                            <button
                                onClick={() => setPaymentType('CASH')}
                                className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${paymentType === 'CASH'
                                    ? 'bg-green-500 text-white shadow-lg'
                                    : 'text-slate-400 hover:text-white'
                                    }`}
                            >
                                現金
                            </button>
                            <button
                                onClick={() => setPaymentType('CREDIT')}
                                className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${paymentType === 'CREDIT'
                                    ? 'bg-amber-500 text-white shadow-lg'
                                    : 'text-slate-400 hover:text-white'
                                    }`}
                            >
                                賒銷
                            </button>
                        </div>

                        <div className="flex items-center gap-2">
                            <label className="text-sm text-slate-400 font-bold">銷售對象:</label>
                            <input
                                id="input-location"
                                type="text"
                                className="input-field py-1 px-3 w-32 md:w-48"
                                placeholder="輸入銷售對象..."
                                value={location}
                                onChange={(e) => setLocation(e.target.value)}
                            />
                        </div>
                    </div>
                </div>
                <div className="flex-1 overflow-auto">
                    <table className="w-full text-left border-collapse">
                        <thead className="sticky top-0 bg-slate-800/90 backdrop-blur z-10 text-slate-400 text-sm uppercase">
                            <tr>
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
                        <tbody className="divide-y divide-slate-700/50">
                            {rows.map((row, idx) => (
                                <tr key={row.id} className="hover:bg-slate-800/40 transition-colors">
                                    <td className="p-3 font-medium">{row.name}</td>
                                    <td className="p-3 text-slate-500 font-mono tracking-wider">
                                        <span className="text-blue-300">{row.stock}</span>
                                        <span className="text-slate-600 mx-1">/</span>
                                        <span className="text-orange-300">{row.originalStock || 0}</span>
                                    </td>
                                    <td className="p-3">
                                        <input
                                            id={`input-${idx}-picked`}
                                            type="number"
                                            className="input-field text-center p-1"
                                            value={row.picked || ''}
                                            onChange={(e) => handleRowChange(row.id, 'picked', e.target.value)}
                                            onKeyDown={(e) => handleKeyDown(e, idx, 'picked')}
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
                                        />
                                    </td>
                                    <td className="p-3">
                                        <input
                                            id={`input-${idx}-returns`}
                                            type="number"
                                            className="input-field text-center p-1 text-red-300"
                                            value={row.returns || ''}
                                            onChange={(e) => handleRowChange(row.id, 'returns', e.target.value)}
                                            onKeyDown={(e) => handleKeyDown(e, idx, 'returns')}
                                        />
                                    </td>
                                    <td className="p-3 text-center font-bold text-blue-300">{row.sold}</td>
                                    <td className="p-3"><input id={`input-${idx}-price`} type="number" className="input-field text-center p-1 w-20" value={row.price} onChange={(e) => handleRowChange(row.id, 'price', e.target.value)} onKeyDown={(e) => handleKeyDown(e, idx, 'price')} /></td>
                                    <td className="p-3 text-right font-mono text-emerald-400">${row.subtotal?.toLocaleString()}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div className="mt-4 pt-4 border-t border-slate-700 flex justify-between items-center bg-slate-900/40 p-4 rounded-lg">
                    <span className="text-slate-400">總繳回金額 (商品計算)</span>
                    <span className="text-2xl font-bold text-emerald-400">${totalSalesAmount.toLocaleString()}</span>
                </div>
            </div>

            {/* Cash & Expenses - LOCK if Credit */}
            <div className={`space-y-6 overflow-y-auto h-[calc(100vh-10rem)] pr-2 transition-opacity ${isCredit ? 'opacity-50 pointer-events-none grayscale' : ''}`}>

                {/* Overlay for locking if strictly needed, but pointer-events-none does the trick interactively */}

                <div className="glass-panel p-6 relative">
                    {isCredit && <div className="absolute inset-0 z-50 cursor-not-allowed"></div>}

                    <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                        <Calculator size={20} className="text-yellow-400" /> 錢點清算
                    </h2>
                    <div className="space-y-3">
                        {[1000, 500, 100, 50, 10, 5, 1].map((denom, idx, arr) => {
                            const currentId = `input-cash-${denom}`;
                            const nextId = idx < arr.length - 1 ? `input-cash-${arr[idx + 1]}` : 'input-reserve';
                            const prevId = idx > 0 ? `input-cash-${arr[idx - 1]}` : null; // null means jump to table
                            return (
                                <div key={denom} className="flex items-center gap-4">
                                    <span className="w-12 text-slate-400 font-mono text-right">{denom}</span>
                                    <span className="text-slate-600">x</span>
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
                                    <span className="w-20 text-right font-mono text-slate-300">${(denom * cashCounts[denom]).toLocaleString()}</span>
                                </div>
                            );
                        })}
                        <div className="border-t border-slate-700 my-2 pt-2 flex items-center gap-4 text-red-300">
                            <span className="w-12 text-right">預備金</span>
                            <span className="text-slate-600">-</span>
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
                        <div className="bg-slate-900/50 p-3 rounded flex justify-between items-center">
                            <span>總金額</span>
                            <span className="text-xl font-bold text-yellow-400">${(isCredit ? 0 : totalCashNet).toLocaleString()}</span>
                        </div>
                    </div>
                </div>

                <div className="glass-panel p-6 relative">
                    {isCredit && <div className="absolute inset-0 z-50 cursor-not-allowed"></div>}

                    <h2 className="text-lg font-bold mb-4 text-rose-400">支出與其他</h2>
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
                                className="input-field border-green-800/50 text-green-400"
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
                                className="input-field border-red-800/50 text-red-400"
                                value={expenses.serviceFee || ''}
                                onChange={(e) => setExpenses({ ...expenses, serviceFee: Number(e.target.value) })}
                                disabled={isCredit}
                                onKeyDown={(e) => handleSidebarKeyDown(e, 'input-expense-serviceFee', null, 'input-expense-linePay')}
                            />
                        </div>
                    </div>

                </div>

                {/* Submit button needs to be clickable even in credit mode, so keep it out of the disabled div or remove pointer-events if needed. 
                    Actually, the prompt said "Lock Cash Counting, Expenses and Others". It didn't say lock submit.
                    The submit button was inside the expense panel logic-wise visually in previous, but functionally should remain active.
                    I'll extract the submit button visual to be outside the disabled group or ensure it's clickable.
                    Re-structuring: I will move the submit button OUT of the disabled expense panel to ensure it's always clickable.
                */}
            </div>

            {/* Sticky Footer or separate panel for Submit? 
                 In original, it was inside the expense panel. 
                 To keep UI consistent but enable click:
                 I will make the submit button 'relative z-50 pointer-events-auto' so it bypasses the parent disable if I used CSS,
                 but since I used specific input disabled, the button is fine unless inside a pointer-events-none container.
                 My previous div has `pointer-events-none` if credit.
                 So I should pull the submit button out or override the class.
             */}
            <div className="xl:col-start-3 p-6 glass-panel mt-6 xl:mt-0 opacity-100 pointer-events-auto">
                <div className="text-sm text-slate-400 mb-1">扣除後總金額 (結算)</div>
                <div className="text-3xl font-bold text-white bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-emerald-400">
                    ${(isCredit ? totalSalesAmount /* For credit, maybe just sales amount? Or keep 0? usually Credit = Account Receivable. Let's show Sales Amount or 0. User didn't specify calc change for Credit final total. I will show standard calculation which might be just expenses if cash is 0. 
                     If Credit, "Final Total" usually implies Cash to return. So it should be close to 0 or negative expenses. 
                     But let's stick to the code visual: finalTotal variable.
                     */ : finalTotal).toLocaleString()}
                </div>
                <button onClick={handleSubmit} className="btn-primary w-full mt-6 flex justify-center items-center gap-2">
                    <Save size={18} /> 保存今日資料
                </button>
            </div>
        </div >
    );
}
