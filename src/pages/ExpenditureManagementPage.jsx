import React, { useState } from 'react';
import { Save, DollarSign, Truck, Users, CreditCard, Clipboard, PiggyBank, Settings } from 'lucide-react';
import { callGAS } from '../utils/api';

export default function ExpenditureManagementPage({ user, apiUrl }) {
    const [isSubmitting, setIsSubmitting] = useState(false);
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

        setIsSubmitting(true);
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
        } finally {
            setIsSubmitting(false);
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

    const handleKeyDown = (e, field) => {
        const fields = [
            'note', 'stall', 'cleaning', 'electricity', 'gas', 'parking', 'goods', 'bags', 'others',
            'linePay', 'serviceFee', 'vehicleMaintenance', 'salary', 'reserve'
        ];
        const fieldIdx = fields.indexOf(field);

        if (e.key === 'Enter' || e.key === 'ArrowRight') {
            e.preventDefault();
            if (fieldIdx < fields.length - 1) {
                focusAndSelect(`input-expense-${fields[fieldIdx + 1]}`);
            } else if (e.key === 'Enter') {
                handleSubmit();
            }
        } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            if (fieldIdx > 0) {
                focusAndSelect(`input-expense-${fields[fieldIdx - 1]}`);
            }
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            // grid Layout based movements (rough logic for 2-column Operatonal Expenses)
            if (['stall', 'cleaning', 'electricity', 'gas', 'parking', 'goods'].includes(field)) {
                const nextMap = { stall: 'electricity', cleaning: 'gas', electricity: 'parking', gas: 'goods', parking: 'bags', goods: 'others' };
                focusAndSelect(`input-expense-${nextMap[field]}`);
            } else if (fieldIdx < fields.length - 1) {
                focusAndSelect(`input-expense-${fields[fieldIdx + 1]}`);
            }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (['electricity', 'gas', 'parking', 'goods', 'bags', 'others'].includes(field)) {
                const prevMap = { electricity: 'stall', gas: 'cleaning', parking: 'electricity', goods: 'gas', bags: 'parking', others: 'goods' };
                focusAndSelect(`input-expense-${prevMap[field]}`);
            } else if (fieldIdx > 0) {
                focusAndSelect(`input-expense-${fields[fieldIdx - 1]}`);
            }
        }
    };

    const totalExpenses =
        Number(expenses.stall) + Number(expenses.cleaning) + Number(expenses.electricity) +
        Number(expenses.gas) + Number(expenses.parking) + Number(expenses.goods) +
        Number(expenses.bags) + Number(expenses.others) + Number(expenses.serviceFee) +
        Number(expenses.vehicleMaintenance) + Number(expenses.salary) + Number(expenses.reserve);

    const finalTotal = totalExpenses + Number(expenses.linePay);

    return (
        <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-6 animate-in fade-in duration-500 relative">
            {isSubmitting && (
                <div className="loading-overlay">
                    <div className="w-12 h-12 border-4 border-rose-600 border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-lg font-bold text-slate-800">資料存盤中，請稍後...</p>
                </div>
            )}
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <div className="p-2 bg-rose-100 rounded-lg">
                            <DollarSign className="text-rose-600" size={24} />
                        </div>
                        支出管理
                    </h1>
                    <p className="text-slate-500 text-sm mt-1">整理與紀錄經營成本，並同步至雲端試算表</p>
                </div>

                <div className="bg-rose-50 px-6 py-3 border border-rose-200 rounded-xl shadow-sm">
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">今日計算總額 (結算)</p>
                    <p className="text-2xl font-black text-rose-600">${finalTotal.toLocaleString()}</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Column: Essential Info & Main Expenses */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Basic Info */}
                    <div className="glass-panel p-6">
                        <div className="flex items-center gap-2 mb-4 text-blue-600 font-bold">
                            <Clipboard size={18} />
                            <span>基本資訊</span>
                        </div>
                        <div>
                            <label className="text-xs text-slate-500 font-bold block mb-2">備註 / 說明 *</label>
                            <input
                                id="input-expense-note"
                                type="text"
                                className="input-field w-full text-lg py-3 bg-white"
                                placeholder="例如：1/7 台北攤位支出..."
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                                onKeyDown={(e) => handleKeyDown(e, 'note')}
                            />
                        </div>
                    </div>

                    {/* Operational Expenses */}
                    <div className="glass-panel p-6">
                        <div className="flex items-center gap-2 mb-6 text-emerald-600 font-bold">
                            <Settings size={18} />
                            <span>基礎營運支出</span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                            {[
                                { key: 'stall', label: '攤位', next: 'cleaning' },
                                { key: 'cleaning', label: '清潔', next: 'electricity', prev: 'stall' },
                                { key: 'electricity', label: '電費', next: 'gas', prev: 'cleaning' },
                                { key: 'gas', label: '加油', next: 'parking', prev: 'electricity' },
                                { key: 'parking', label: '停車', next: 'goods', prev: 'gas' },
                                { key: 'goods', label: '貨款', next: 'bags', prev: 'parking' },
                                { key: 'bags', label: '塑膠袋', next: 'others', prev: 'goods' },
                                { key: 'others', label: '其他', next: 'linePay', prev: 'bags' },
                            ].map((item) => (
                                <div key={item.key} className="flex items-center justify-between gap-4 p-2 hover:bg-slate-50 rounded-lg transition-colors border-b border-slate-100 last:border-0">
                                    <label className="text-sm text-slate-600 font-medium whitespace-nowrap">{item.label}</label>
                                    <input
                                        id={`input-expense-${item.key}`}
                                        type="number"
                                        className="input-field text-right w-32 bg-white"
                                        value={expenses[item.key] || ''}
                                        onChange={(e) => setExpenses({ ...expenses, [item.key]: Number(e.target.value) })}
                                        onKeyDown={(e) => handleKeyDown(e, item.key)}
                                        onWheel={(e) => e.target.blur()}
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Right Column: Special Items & Submit */}
                <div className="space-y-6">
                    {/* Money & Services */}
                    <div className="glass-panel p-6 border-amber-200">
                        <div className="flex items-center gap-2 mb-6 text-amber-600 font-bold">
                            <CreditCard size={18} />
                            <span>金流與服務費</span>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="text-xs text-slate-500 block mb-1">Line Pay 收款</label>
                                <div className="relative">
                                    <input
                                        id="input-expense-linePay"
                                        type="number"
                                        className="input-field w-full pl-8 border-emerald-200 text-emerald-700 bg-emerald-50"
                                        value={expenses.linePay || ''}
                                        onChange={(e) => setExpenses({ ...expenses, linePay: Number(e.target.value) })}
                                        onKeyDown={(e) => handleKeyDown(e, 'linePay')}
                                        onWheel={(e) => e.target.blur()}
                                    />
                                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-600 font-bold">+</div>
                                </div>
                            </div>
                            <div>
                                <label className="text-xs text-slate-500 block mb-1">服務費扣除</label>
                                <div className="relative">
                                    <input
                                        id="input-expense-serviceFee"
                                        type="number"
                                        className="input-field w-full pl-8 border-rose-200 text-rose-700 bg-rose-50"
                                        value={expenses.serviceFee || ''}
                                        onChange={(e) => setExpenses({ ...expenses, serviceFee: Number(e.target.value) })}
                                        onKeyDown={(e) => handleKeyDown(e, 'serviceFee')}
                                        onWheel={(e) => e.target.blur()}
                                    />
                                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-rose-600 font-bold">-</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Maintenance & Salary */}
                    <div className="glass-panel p-6 border-indigo-200">
                        <div className="flex items-center gap-2 mb-6 text-indigo-600 font-bold">
                            <Truck size={18} />
                            <span>車輛與人事</span>
                        </div>
                        <div className="space-y-4">
                            <div className="flex items-center justify-between gap-2">
                                <label className="text-xs text-slate-500 flex items-center gap-2 font-bold">
                                    <Truck size={14} /> 車輛保養
                                </label>
                                <input
                                    id="input-expense-vehicleMaintenance"
                                    type="number"
                                    className="input-field w-28 text-right bg-white"
                                    value={expenses.vehicleMaintenance || ''}
                                    onChange={(e) => setExpenses({ ...expenses, vehicleMaintenance: Number(e.target.value) })}
                                    onKeyDown={(e) => handleKeyDown(e, 'vehicleMaintenance')}
                                    onWheel={(e) => e.target.blur()}
                                />
                            </div>
                            <div className="flex items-center justify-between gap-2">
                                <label className="text-xs text-slate-500 flex items-center gap-2 font-bold">
                                    <Users size={14} /> 薪資發放
                                </label>
                                <input
                                    id="input-expense-salary"
                                    type="number"
                                    className="input-field w-28 text-right bg-white"
                                    value={expenses.salary || ''}
                                    onChange={(e) => setExpenses({ ...expenses, salary: Number(e.target.value) })}
                                    onKeyDown={(e) => handleKeyDown(e, 'salary')}
                                    onWheel={(e) => e.target.blur()}
                                />
                            </div>
                            <div className="flex items-center justify-between gap-2">
                                <label className="text-xs text-slate-500 flex items-center gap-2 font-bold">
                                    <PiggyBank size={14} /> 公積金
                                </label>
                                <input
                                    id="input-expense-reserve"
                                    type="number"
                                    className="input-field w-28 text-right bg-white"
                                    value={expenses.reserve || ''}
                                    onChange={(e) => setExpenses({ ...expenses, reserve: Number(e.target.value) })}
                                    onKeyDown={(e) => handleKeyDown(e, 'reserve')}
                                    onWheel={(e) => e.target.blur()}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Final Action */}
                    <button
                        onClick={handleSubmit}
                        className="btn-primary w-full py-4 text-lg font-black shadow-lg shadow-blue-100 hover:shadow-xl hover:shadow-blue-200 transition-all flex justify-center items-center gap-3 active:scale-95"
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
