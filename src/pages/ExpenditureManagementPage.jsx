import React, { useState } from 'react';
import { Save, DollarSign, Truck, Users, CreditCard, Clipboard, PiggyBank, Settings } from 'lucide-react';
import { callGAS } from '../utils/api';

export default function ExpenditureManagementPage({ user, apiUrl }) {
    const [expenses, setExpenses] = useState({
        stall: 0,           // B 攤位
        cleaning: 0,        // C 清潔
        electricity: 0,     // D 電費
        gas: 0,             // E 加油
        parking: 0,         // F 停車
        goods: 0,           // G 貨款
        bags: 0,            // H 塑膠袋
        others: 0,          // I 其他
        linePay: 0,         // J Line Pay (收款)
        serviceFee: 0,      // K 服務費 (扣除)
        vehicleMaintenance: 0, // P 車輛保養
        salary: 0,          // Q 薪資發放
        reserve: 0          // R 公積金
    });
    const [note, setNote] = useState('');

    const handleSubmit = async () => {
        if (!note.trim()) {
            alert('請輸入備註！');
            document.getElementById('input-note')?.focus();
            return;
        }

        const totalExpenses =
            Number(expenses.stall) +
            Number(expenses.cleaning) +
            Number(expenses.electricity) +
            Number(expenses.gas) +
            Number(expenses.parking) +
            Number(expenses.goods) +
            Number(expenses.bags) +
            Number(expenses.others) +
            Number(expenses.serviceFee) +
            Number(expenses.vehicleMaintenance) +
            Number(expenses.salary) +
            Number(expenses.reserve);

        const finalTotal = totalExpenses + Number(expenses.linePay);

        const payload = {
            note: note,
            salesRep: user.username,
            ...expenses,
            finalTotal: finalTotal
        };

        try {
            await callGAS(apiUrl, 'saveExpenditure', payload, user.token);
            alert('保存成功！支出資料已寫入 Expenditures 試算表。');
            setExpenses({
                stall: 0, cleaning: 0, electricity: 0, gas: 0, parking: 0,
                goods: 0, bags: 0, others: 0, linePay: 0, serviceFee: 0,
                vehicleMaintenance: 0, salary: 0, reserve: 0
            });
            setNote('');
        } catch (e) {
            alert('保存失敗: ' + e.message);
        }
    };

    const handleKeyDown = (e, currentId, nextId, prevId) => {
        const validKeys = ['Enter', 'ArrowUp', 'ArrowDown'];
        if (!validKeys.includes(e.key)) return;
        if (e.key.startsWith('Arrow')) e.preventDefault();

        if (e.key === 'Enter' || e.key === 'ArrowDown') {
            e.preventDefault();
            if (nextId) document.getElementById(nextId)?.focus();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (prevId) document.getElementById(prevId)?.focus();
        }
    };

    const totalExpenses =
        Number(expenses.stall) + Number(expenses.cleaning) + Number(expenses.electricity) +
        Number(expenses.gas) + Number(expenses.parking) + Number(expenses.goods) +
        Number(expenses.bags) + Number(expenses.others) + Number(expenses.serviceFee) +
        Number(expenses.vehicleMaintenance) + Number(expenses.salary) + Number(expenses.reserve);

    const finalTotal = totalExpenses + Number(expenses.linePay);

    return (
        <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-6 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                        <div className="p-2 bg-rose-500/20 rounded-lg">
                            <DollarSign className="text-rose-400" size={24} />
                        </div>
                        支出管理
                    </h1>
                    <p className="text-slate-400 text-sm mt-1">整理與紀錄經營成本，並同步至雲端試算表</p>
                </div>

                <div className="glass-panel px-6 py-3 border-rose-500/20 bg-rose-500/5">
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">今日計算總額 (結算)</p>
                    <p className="text-2xl font-black text-rose-400">${finalTotal.toLocaleString()}</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Column: Essential Info & Main Expenses */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Basic Info */}
                    <div className="glass-panel p-6">
                        <div className="flex items-center gap-2 mb-4 text-blue-400 font-bold">
                            <Clipboard size={18} />
                            <span>基本資訊</span>
                        </div>
                        <div>
                            <label className="text-xs text-slate-500 font-bold block mb-2">備註 / 說明 *</label>
                            <input
                                id="input-note"
                                type="text"
                                className="input-field w-full text-lg py-3"
                                placeholder="例如：1/7 台北攤位支出..."
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        document.getElementById('input-expense-stall')?.focus();
                                    }
                                }}
                            />
                        </div>
                    </div>

                    {/* Operational Expenses */}
                    <div className="glass-panel p-6">
                        <div className="flex items-center gap-2 mb-6 text-emerald-400 font-bold">
                            <Settings size={18} />
                            <span>基礎營運支出</span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                            {[
                                { key: 'stall', label: '攤位 (B)', next: 'cleaning' },
                                { key: 'cleaning', label: '清潔 (C)', next: 'electricity', prev: 'note' },
                                { key: 'electricity', label: '電費 (D)', next: 'gas', prev: 'stall' },
                                { key: 'gas', label: '加油 (E)', next: 'parking', prev: 'cleaning' },
                                { key: 'parking', label: '停車 (F)', next: 'goods', prev: 'electricity' },
                                { key: 'goods', label: '貨款 (G)', next: 'bags', prev: 'gas' },
                                { key: 'bags', label: '塑膠袋 (H)', next: 'others', prev: 'parking' },
                                { key: 'others', label: '其他 (I)', next: 'linePay', prev: 'goods' },
                            ].map((item) => (
                                <div key={item.key} className="flex items-center justify-between gap-4 p-2 hover:bg-white/5 rounded-lg transition-colors">
                                    <label className="text-sm text-slate-300 font-medium whitespace-nowrap">{item.label}</label>
                                    <input
                                        id={`input-expense-${item.key}`}
                                        type="number"
                                        className="input-field text-right w-32 border-transparent bg-slate-800/50 focus:border-emerald-500/50"
                                        value={expenses[item.key] || ''}
                                        onChange={(e) => setExpenses({ ...expenses, [item.key]: Number(e.target.value) })}
                                        onKeyDown={(e) => handleKeyDown(
                                            e,
                                            `input-expense-${item.key}`,
                                            item.next ? `input-expense-${item.next === 'linePay' ? 'linePay' : item.next}` : null,
                                            item.prev === 'note' ? 'input-note' : `input-expense-${item.prev}`
                                        )}
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Right Column: Special Items & Submit */}
                <div className="space-y-6">
                    {/* Money & Services */}
                    <div className="glass-panel p-6 border-amber-500/10">
                        <div className="flex items-center gap-2 mb-6 text-amber-400 font-bold">
                            <CreditCard size={18} />
                            <span>金流與服務費</span>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="text-xs text-slate-500 block mb-1">Line Pay 收款 (J)</label>
                                <div className="relative">
                                    <input
                                        id="input-expense-linePay"
                                        type="number"
                                        className="input-field w-full pl-8 border-green-800/50 text-green-400 bg-green-500/5"
                                        value={expenses.linePay || ''}
                                        onChange={(e) => setExpenses({ ...expenses, linePay: Number(e.target.value) })}
                                        onKeyDown={(e) => handleKeyDown(e, 'input-expense-linePay', 'input-expense-serviceFee', 'input-expense-others')}
                                    />
                                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-green-600">+</div>
                                </div>
                            </div>
                            <div>
                                <label className="text-xs text-slate-500 block mb-1">服務費扣除 (K)</label>
                                <div className="relative">
                                    <input
                                        id="input-expense-serviceFee"
                                        type="number"
                                        className="input-field w-full pl-8 border-rose-800/50 text-rose-400 bg-rose-500/5"
                                        value={expenses.serviceFee || ''}
                                        onChange={(e) => setExpenses({ ...expenses, serviceFee: Number(e.target.value) })}
                                        onKeyDown={(e) => handleKeyDown(e, 'input-expense-serviceFee', 'input-expense-vehicleMaintenance', 'input-expense-linePay')}
                                    />
                                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-rose-600">-</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Maintenance & Salary */}
                    <div className="glass-panel p-6 border-indigo-500/10">
                        <div className="flex items-center gap-2 mb-6 text-indigo-400 font-bold">
                            <Truck size={18} />
                            <span>車輛與人事</span>
                        </div>
                        <div className="space-y-4">
                            <div className="flex items-center justify-between gap-2">
                                <label className="text-xs text-slate-400 flex items-center gap-2">
                                    <Truck size={14} /> 車輛保養 (P)
                                </label>
                                <input
                                    id="input-expense-vehicleMaintenance"
                                    type="number"
                                    className="input-field w-28 text-right bg-slate-800/50"
                                    value={expenses.vehicleMaintenance || ''}
                                    onChange={(e) => setExpenses({ ...expenses, vehicleMaintenance: Number(e.target.value) })}
                                    onKeyDown={(e) => handleKeyDown(e, 'input-expense-vehicleMaintenance', 'input-expense-salary', 'input-expense-serviceFee')}
                                />
                            </div>
                            <div className="flex items-center justify-between gap-2">
                                <label className="text-xs text-slate-400 flex items-center gap-2">
                                    <Users size={14} /> 薪資發放 (Q)
                                </label>
                                <input
                                    id="input-expense-salary"
                                    type="number"
                                    className="input-field w-28 text-right bg-slate-800/50"
                                    value={expenses.salary || ''}
                                    onChange={(e) => setExpenses({ ...expenses, salary: Number(e.target.value) })}
                                    onKeyDown={(e) => handleKeyDown(e, 'input-expense-salary', 'input-expense-reserve', 'input-expense-vehicleMaintenance')}
                                />
                            </div>
                            <div className="flex items-center justify-between gap-2">
                                <label className="text-xs text-slate-400 flex items-center gap-2">
                                    <PiggyBank size={14} /> 公積金 (R)
                                </label>
                                <input
                                    id="input-expense-reserve"
                                    type="number"
                                    className="input-field w-28 text-right bg-slate-800/50"
                                    value={expenses.reserve || ''}
                                    onChange={(e) => setExpenses({ ...expenses, reserve: Number(e.target.value) })}
                                    onKeyDown={(e) => handleKeyDown(e, 'input-expense-reserve', null, 'input-expense-salary')}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Final Action */}
                    <button
                        onClick={handleSubmit}
                        className="btn-primary w-full py-4 text-lg font-black shadow-[0_0_20px_rgba(37,99,235,0.3)] hover:shadow-[0_0_30px_rgba(37,99,235,0.5)] transition-all flex justify-center items-center gap-3 active:scale-95"
                    >
                        <Save size={22} /> 保存今日支出
                    </button>

                    <p className="text-center text-slate-500 text-[10px] uppercase font-bold tracking-tighter">
                        Data will be saved to Expenditures Sheet
                    </p>
                </div>
            </div>
        </div>
    );
}
