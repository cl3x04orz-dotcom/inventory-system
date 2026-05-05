import React, { useState } from 'react';
import { Save, DollarSign, Truck, Users, CreditCard, Clipboard, PiggyBank, Settings, Calendar } from 'lucide-react';
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

    // Modal state for salary confirmation
    const [users, setUsers] = useState([]);
    const [showSalaryModal, setShowSalaryModal] = useState(false);
    const [salaryConfig, setSalaryConfig] = useState({ 
        method: 'TRANSFER', 
        archive: 'LAST_MONTH',
        recipient: '',
        paymentDate: new Date().toISOString().split('T')[0]
    });

    // Fetch users for recipient list
    React.useEffect(() => {
        const fetchUsers = async () => {
            try {
                const data = await callGAS(apiUrl, 'getUsers', {}, user.token);
                if (Array.isArray(data)) setUsers(data);
            } catch (e) { console.error('Fetch users failed', e); }
        };
        fetchUsers();
    }, [apiUrl, user.token]);

    const handleSubmit = async (bypassModal = false) => {
        if (!note.trim()) {
            alert('請輸入備註！');
            const el = document.getElementById('input-expense-note');
            if (el) {
                el.focus();
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
            return;
        }

        // 當薪資大於0且尚未確認過，攔截並顯示對話框
        if (!bypassModal && Number(expenses.salary) > 0) {
            setShowSalaryModal(true);
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
            salesRep: user.username || user.name || 'Unknown',
            ...expenses,
            finalTotal: finalTotal,
            paymentMethod: salaryConfig.method,
            customer: Number(expenses.salary) > 0 ? salaryConfig.recipient : (expenses.customer || ''),
            paymentDate: Number(expenses.salary) > 0 ? salaryConfig.paymentDate : null,
            customDate: salaryConfig.archive === 'LAST_MONTH' 
                ? new Date(new Date().getFullYear(), new Date().getMonth(), 0).toISOString().split('T')[0]
                : new Date().toISOString().split('T')[0]
        };

        setIsSubmitting(true);
        try {
            const res = await callGAS(apiUrl, 'saveExpenditure', payload, user.token);
            if (res.success) {
                alert('保存成功！支出資料已寫入 Expenditures 試算表。');
                setExpenses({
                    stall: 0, cleaning: 0, electricity: 0, gas: 0, parking: 0,
                    goods: 0, bags: 0, others: 0, linePay: 0, serviceFee: 0,
                    vehicleMaintenance: 0, salary: 0, reserve: 0
                });
                setNote('');
                setShowSalaryModal(false);
            }
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
                    <p className="text-lg font-bold text-[var(--text-primary)]">資料存盤中，請稍後...</p>
                </div>
            )}
            {/* Header */}
            {/* Header */}
            <div className="flex flex-row justify-between items-center gap-4">
                <div className="flex-1 min-w-0">
                    <h1 className="text-xl md:text-2xl font-bold text-[var(--text-primary)] flex items-center gap-2 truncate">
                        <div className="p-1.5 md:p-2 bg-rose-100 rounded-lg shrink-0">
                            <DollarSign className="text-rose-600 w-5 h-5 md:w-6 md:h-6" />
                        </div>
                        支出管理
                    </h1>
                    <p className="text-[var(--text-secondary)] text-xs md:text-sm mt-1 truncate">整理與紀錄經營成本</p>
                </div>

                <div className="bg-rose-50 px-3 md:px-6 py-2 md:py-3 border border-rose-200 rounded-xl shadow-sm shrink-0 flex flex-col items-end">
                    <p className="text-[10px] text-[var(--text-secondary)] font-bold uppercase tracking-wider">今日總額</p>
                    <p className="text-lg md:text-2xl font-black text-rose-600">${finalTotal.toLocaleString()}</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Column: Essential Info & Main Expenses */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Basic Info */}
                    <div className="glass-panel p-6">
                        <div className="flex items-center gap-2 mb-4 text-[var(--accent-blue)] font-bold">
                            <Clipboard size={18} />
                            <span>基本資訊</span>
                        </div>
                        <div>
                            <label className="text-xs text-[var(--text-secondary)] font-bold block mb-2">備註 / 說明 *</label>
                            <input
                                id="input-expense-note"
                                type="text"
                                className="input-field w-full text-lg py-3 bg-[var(--bg-primary)]"
                                placeholder="例如：1/7 台北攤位支出..."
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                                onKeyDown={(e) => handleKeyDown(e, 'note')}
                            />
                        </div>
                    </div>

                    {/* Operational Expenses */}
                    <div className="glass-panel p-6">
                        <div className="flex items-center gap-2 mb-6 text-emerald-500 font-bold">
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
                                <div key={item.key} className="flex items-center justify-between gap-4 p-2 hover:bg-[var(--bg-secondary)] rounded-lg transition-colors border-b border-[var(--border-primary)] last:border-0">
                                    <label className="text-sm text-[var(--text-secondary)] font-medium whitespace-nowrap">{item.label}</label>
                                    <input
                                        id={`input-expense-${item.key}`}
                                        type="number"
                                        className="input-field text-right w-32 bg-[var(--bg-primary)]"
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
                    <div className="glass-panel p-6 border-[var(--border-primary)]">
                        <div className="flex items-center gap-2 mb-6 text-amber-500 font-bold">
                            <CreditCard size={18} />
                            <span>金流與服務費</span>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="text-xs text-[var(--text-secondary)] block mb-1">Line Pay 收款</label>
                                <div className="relative">
                                    <input
                                        id="input-expense-linePay"
                                        type="number"
                                        className="input-field w-full pl-8 border-[var(--border-primary)] text-emerald-500 bg-[var(--bg-secondary)]"
                                        value={expenses.linePay || ''}
                                        onChange={(e) => setExpenses({ ...expenses, linePay: Number(e.target.value) })}
                                        onKeyDown={(e) => handleKeyDown(e, 'linePay')}
                                        onWheel={(e) => e.target.blur()}
                                    />
                                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-500 font-bold">+</div>
                                </div>
                            </div>
                            <div>
                                <label className="text-xs text-[var(--text-secondary)] block mb-1">服務費扣除</label>
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
                                <label className="text-xs text-[var(--text-secondary)] flex items-center gap-2 font-bold">
                                    <Truck size={14} /> 車輛保養
                                </label>
                                <input
                                    id="input-expense-vehicleMaintenance"
                                    type="number"
                                    className="input-field w-28 text-right bg-[var(--bg-primary)]"
                                    value={expenses.vehicleMaintenance || ''}
                                    onChange={(e) => setExpenses({ ...expenses, vehicleMaintenance: Number(e.target.value) })}
                                    onKeyDown={(e) => handleKeyDown(e, 'vehicleMaintenance')}
                                    onWheel={(e) => e.target.blur()}
                                />
                            </div>
                            <div className="flex items-center justify-between gap-2">
                                <label className="text-xs text-[var(--text-secondary)] flex items-center gap-2 font-bold">
                                    <Users size={14} /> 薪資發放
                                </label>
                                <input
                                    id="input-expense-salary"
                                    type="number"
                                    className="input-field w-28 text-right bg-[var(--bg-primary)]"
                                    value={expenses.salary || ''}
                                    onChange={(e) => setExpenses({ ...expenses, salary: Number(e.target.value) })}
                                    onKeyDown={(e) => handleKeyDown(e, 'salary')}
                                    onWheel={(e) => e.target.blur()}
                                />
                            </div>
                            <div className="flex items-center justify-between gap-2">
                                <label className="text-xs text-[var(--text-secondary)] flex items-center gap-2 font-bold">
                                    <PiggyBank size={14} /> 公積金
                                </label>
                                <input
                                    id="input-expense-reserve"
                                    type="number"
                                    className="input-field w-28 text-right bg-[var(--bg-primary)]"
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
                        onClick={() => handleSubmit(false)}
                        className="btn-primary w-full py-4 text-lg font-black shadow-lg shadow-blue-100 hover:shadow-xl hover:shadow-blue-200 transition-all flex justify-center items-center gap-3 active:scale-95"
                    >
                        <Save size={22} /> 保存今日支出
                    </button>

                    <p className="text-center text-[var(--text-secondary)] text-[10px] uppercase font-bold tracking-tighter">
                        Data will be saved to Expenditures Sheet
                    </p>
                </div>
            </div>

            {/* Salary Confirmation Modal */}
            {showSalaryModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="bg-rose-600 p-6 text-white">
                            <h3 className="text-xl font-bold flex items-center gap-2">
                                <DollarSign size={24} /> 薪資發放確認
                            </h3>
                            <p className="text-rose-100 text-sm mt-1">請選擇薪資發放方式與歸帳月份</p>
                        </div>
                        
                        <div className="p-6 space-y-6">
                            {/* Method Choice */}
                            <div className="space-y-3">
                                <label className="text-sm font-bold text-gray-500 uppercase tracking-wider">1. 發放方式</label>
                                <div className="grid grid-cols-2 gap-3">
                                    <button 
                                        onClick={() => setSalaryConfig(prev => ({ ...prev, method: 'TRANSFER' }))}
                                        className={`py-4 rounded-xl font-bold border-2 transition-all flex flex-col items-center gap-1 ${salaryConfig.method === 'TRANSFER' ? 'border-rose-600 bg-rose-50 text-rose-600' : 'border-gray-100 text-gray-400 hover:border-gray-200'}`}
                                    >
                                        <CreditCard size={20} /> 匯款 (不扣應繳金)
                                    </button>
                                    <button 
                                        onClick={() => setSalaryConfig(prev => ({ ...prev, method: 'CASH' }))}
                                        className={`py-4 rounded-xl font-bold border-2 transition-all flex flex-col items-center gap-1 ${salaryConfig.method === 'CASH' ? 'border-rose-600 bg-rose-50 text-rose-600' : 'border-gray-100 text-gray-400 hover:border-gray-200'}`}
                                    >
                                        <DollarSign size={20} /> 現金 (扣除應繳金)
                                    </button>
                                </div>
                            </div>

                             {/* Archive Choice */}
                            <div className="space-y-3">
                                <label className="text-sm font-bold text-gray-500 uppercase tracking-wider">2. 歸帳月份 (損益表)</label>
                                <div className="grid grid-cols-2 gap-3">
                                    <button 
                                        onClick={() => setSalaryConfig(prev => ({ ...prev, archive: 'LAST_MONTH' }))}
                                        className={`py-4 rounded-xl font-bold border-2 transition-all flex flex-col items-center gap-1 ${salaryConfig.archive === 'LAST_MONTH' ? 'border-blue-600 bg-blue-50 text-blue-600' : 'border-gray-100 text-gray-400 hover:border-gray-200'}`}
                                    >
                                        <Calendar size={20} /> 上個月底
                                    </button>
                                    <button 
                                        onClick={() => setSalaryConfig(prev => ({ ...prev, archive: 'CURRENT' }))}
                                        className={`py-4 rounded-xl font-bold border-2 transition-all flex flex-col items-center gap-1 ${salaryConfig.archive === 'CURRENT' ? 'border-blue-600 bg-blue-50 text-blue-600' : 'border-gray-100 text-gray-400 hover:border-gray-200'}`}
                                    >
                                        <Save size={20} /> 今天/本月
                                    </button>
                                </div>
                            </div>

                            {/* Recipient & Payment Date */}
                            <div className="space-y-4 pt-2 border-t border-gray-100">
                                <div>
                                    <label className="text-sm font-bold text-gray-500 uppercase tracking-wider block mb-2">3. 發放對象</label>
                                    <select 
                                        className="input-field w-full"
                                        value={salaryConfig.recipient}
                                        onChange={(e) => setSalaryConfig(prev => ({ ...prev, recipient: e.target.value }))}
                                    >
                                        <option value="">-- 請選擇員工 --</option>
                                        {users.map(u => (
                                            <option key={u.username} value={u.username}>{u.username} ({u.role})</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="text-sm font-bold text-gray-500 uppercase tracking-wider block mb-2">4. 實際付款日期</label>
                                    <input 
                                        type="date"
                                        className="input-field w-full"
                                        value={salaryConfig.paymentDate}
                                        onChange={(e) => setSalaryConfig(prev => ({ ...prev, paymentDate: e.target.value }))}
                                    />
                                    <p className="text-[10px] text-amber-500 mt-1">※ 現金流扣除將以此日期為準</p>
                                </div>
                            </div>
                        </div>

                        <div className="p-6 bg-gray-50 flex gap-3">
                            <button 
                                onClick={() => setShowSalaryModal(false)}
                                className="flex-1 py-3 font-bold text-gray-500 hover:bg-gray-100 rounded-xl transition-colors"
                            >
                                取消
                            </button>
                            <button 
                                onClick={() => handleSubmit(true)}
                                disabled={isSubmitting}
                                className="flex-[2] py-3 font-bold bg-rose-600 text-white rounded-xl shadow-lg shadow-rose-200 hover:bg-rose-700 active:scale-95 transition-all flex items-center justify-center"
                            >
                                {isSubmitting ? '處理中...' : '確認存檔'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
