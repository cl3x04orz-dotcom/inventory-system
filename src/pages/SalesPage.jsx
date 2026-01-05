import React, { useState, useEffect, useCallback } from 'react';
import { Save, RefreshCw, Calculator, DollarSign } from 'lucide-react';
import { callGAS } from '../utils/api';
import { PRICE_MAP, sortProducts } from '../utils/constants';

export default function SalesPage({ user, apiUrl }) {
    const [rows, setRows] = useState([]);
    const [cashCounts, setCashCounts] = useState({ 1000: 0, 500: 0, 100: 0, 50: 0, 10: 0, 5: 0, 1: 0 });
    const [reserve, setReserve] = useState(0);
    const [expenses, setExpenses] = useState({
        stall: 0, cleaning: 0, electricity: 0, gas: 0, parking: 0,
        goods: 0, bags: 0, others: 0, linePay: 0, serviceFee: 0
    });
    const [location, setLocation] = useState('');



    const load = useCallback(async () => {
        try {
            const data = await callGAS(apiUrl, 'getProducts', {}, user.token);
            if (Array.isArray(data)) {
                // Ensure reliable numbers
                const activeProducts = sortProducts(
                    data.filter(p => Number(p.stock) > 0 || Number(p.originalStock) > 0),
                    'name'
                );

                setRows(activeProducts.map(p => {
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
            }
        } catch (error) {
            console.error("Fetch products failed", error);
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
    // ... (keep existing handleKeyDown)
    const handleKeyDown = (e, idx, field) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const sequence = ['picked', 'original', 'returns'];
            const currentFieldIdx = sequence.indexOf(field);

            if (currentFieldIdx < sequence.length - 1) {
                // Next field in same row
                const nextField = sequence[currentFieldIdx + 1];
                const nextId = `input-${idx}-${nextField}`;
                const el = document.getElementById(nextId);
                if (el) el.select();
            } else {
                // Next row 'picked'
                const nextRowId = `input-${idx + 1}-picked`;
                const el = document.getElementById(nextRowId);
                if (el) {
                    el.select();
                } else {
                    const cashEl = document.getElementById('input-cash-1000');
                    if (cashEl) cashEl.select();
                }
            }
        }
    };

    const handleFocusNext = (e, nextId) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const el = document.getElementById(nextId);
            if (el) {
                el.focus();
                el.select();
            }
        }
    };

    const totalSalesAmount = rows.reduce((acc, r) => acc + (r.subtotal || 0), 0);
    const totalCashCalc = Object.entries(cashCounts).reduce((acc, [denom, count]) => acc + (Number(denom) * count), 0);
    const totalCashNet = totalCashCalc - reserve;

    const totalExpensesPlusLinePay =
        Number(expenses.stall) + Number(expenses.cleaning) + Number(expenses.electricity) +
        Number(expenses.gas) + Number(expenses.parking) + Number(expenses.goods) +
        Number(expenses.bags) + Number(expenses.others) + Number(expenses.linePay);

    const finalTotal = totalCashNet + totalExpensesPlusLinePay - Number(expenses.serviceFee);

    const handleSubmit = async () => {
        if (!location.trim()) {
            alert('請輸入銷售地點！');
            const locationInput = document.getElementById('input-location');
            if (locationInput) locationInput.focus();
            return;
        }

        const payload = {
            salesRep: user.username,
            location: location,
            salesData: rows.map(r => ({
                productId: r.id,
                picked: r.picked,
                original: r.original,
                returns: r.returns,
                sold: r.sold,
                unitPrice: r.price
            })),
            cashData: { totalCash: totalCashNet, reserve },
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
                    <div className="flex items-center gap-2">
                        <label className="text-sm text-slate-400">地點:</label>
                        <input
                            id="input-location"
                            type="text"
                            className="input-field py-1 px-3 w-32 md:w-48"
                            placeholder="輸入銷售地點"
                            value={location}
                            onChange={(e) => setLocation(e.target.value)}
                        />
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
                                    <td className="p-3"><input type="number" className="input-field text-center p-1 w-20" value={row.price} onChange={(e) => handleRowChange(row.id, 'price', e.target.value)} /></td>
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

            {/* Cash & Expenses */}
            <div className="space-y-6 overflow-y-auto h-[calc(100vh-10rem)] pr-2">
                <div className="glass-panel p-6">
                    <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                        <Calculator size={20} className="text-yellow-400" /> 錢點清算
                    </h2>
                    <div className="space-y-3">
                        {[1000, 500, 100, 50, 10, 5, 1].map((denom, idx, arr) => {
                            const nextId = idx < arr.length - 1 ? `input-cash-${arr[idx + 1]}` : 'input-reserve';
                            return (
                                <div key={denom} className="flex items-center gap-4">
                                    <span className="w-12 text-slate-400 font-mono text-right">{denom}</span>
                                    <span className="text-slate-600">x</span>
                                    <input
                                        id={`input-cash-${denom}`}
                                        type="number"
                                        className="input-field flex-1"
                                        placeholder="0"
                                        value={cashCounts[denom] || ''}
                                        onChange={(e) => setCashCounts({ ...cashCounts, [denom]: Number(e.target.value) })}
                                        onKeyDown={(e) => handleFocusNext(e, nextId)}
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
                                onKeyDown={(e) => handleFocusNext(e, 'input-expense-stall')}
                            />
                        </div>
                        <div className="bg-slate-900/50 p-3 rounded flex justify-between items-center">
                            <span>總金額</span>
                            <span className="text-xl font-bold text-yellow-400">${totalCashNet.toLocaleString()}</span>
                        </div>
                    </div>
                </div>

                <div className="glass-panel p-6">
                    <h2 className="text-lg font-bold mb-4 text-rose-400">支出與其他</h2>
                    <div className="grid grid-cols-2 gap-3">
                        {['stall:攤位', 'cleaning:清潔', 'electricity:電費', 'gas:加油', 'parking:停車', 'goods:貨款', 'bags:塑膠袋', 'others:其他'].map((item, idx, arr) => {
                            const [key, label] = item.split(':');
                            const nextKey = idx < arr.length - 1 ? arr[idx + 1].split(':')[0] : 'linePay';
                            const nextId = idx < arr.length - 1 ? `input-expense-${nextKey}` : 'input-expense-linePay';

                            return (
                                <div key={key}>
                                    <label className="text-xs text-slate-500 block mb-1">{label}</label>
                                    <input
                                        id={`input-expense-${key}`}
                                        type="number"
                                        className="input-field text-sm"
                                        value={expenses[key] || ''}
                                        onChange={(e) => setExpenses({ ...expenses, [key]: Number(e.target.value) })}
                                        onKeyDown={(e) => handleFocusNext(e, nextId)}
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
                                onKeyDown={(e) => handleFocusNext(e, 'input-expense-serviceFee')}
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
                            // NO onKeyDown to submit here, per user request
                            />
                        </div>
                    </div>
                    <div className="mt-6 pt-6 border-t border-slate-700">
                        <div className="text-sm text-slate-400 mb-1">扣除後總金額 (結算)</div>
                        <div className="text-3xl font-bold text-white bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-emerald-400">${finalTotal.toLocaleString()}</div>
                        <button onClick={handleSubmit} className="btn-primary w-full mt-6 flex justify-center items-center gap-2">
                            <Save size={18} /> 保存今日資料
                        </button>
                    </div>
                </div>
            </div >
        </div >
    );
}
