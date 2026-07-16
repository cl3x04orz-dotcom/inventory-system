import React, { useState, useEffect } from 'react';
import { callGAS } from '../utils/api';
import { 
    Calendar, Users, RefreshCw, Plus, Edit2, Trash2, 
    X, Sparkles, Phone, Search, 
    ArrowLeftRight
} from 'lucide-react';

export default function SubscriptionManagementPage({ user, apiUrl }) {
    const [subscriptions, setSubscriptions] = useState([]);
    const [products, setProducts] = useState([]);
    const [buildings, setBuildings] = useState([]);
    const [loading, setLoading] = useState(true);
    
    // UI 篩選狀態
    const [selectedBuilding, setSelectedBuilding] = useState('ALL');
    const [searchQuery, setSearchQuery] = useState('');
    
    // 編輯/新增 Modal 狀態
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingSub, setEditingSub] = useState(null); // null 代表新增
    const [submitting, setSubmitting] = useState(false);
    
    // 表單資料
    const [formBuilding, setFormBuilding] = useState('');
    const [formCustomerName, setFormCustomerName] = useState('');
    const [formPhone, setFormPhone] = useState('');
    const [formProductId, setFormProductId] = useState('');
    const [formQuantity, setFormQuantity] = useState(1);
    const [formFrequency, setFormFrequency] = useState([]); // 陣列：0=日, 1=一, 2=二, ...
    const [formPaymentMethod, setFormPaymentMethod] = useState('奶包金');
    const [formIsActive, setFormIsActive] = useState(true);
    const [formNote, setFormNote] = useState('');

    const daysOfWeekText = ['日', '一', '二', '三', '四', '五', '六'];

    const fetchData = async () => {
        setLoading(true);
        try {
            const [subRes, prodRes, bldRes] = await Promise.all([
                callGAS(apiUrl, 'getSubscriptions', {}, user.token),
                callGAS(apiUrl, 'getProducts', {}, user.token),
                callGAS(apiUrl, 'getBuildingSettings', {}, user.token)
            ]);
            
            if (Array.isArray(subRes)) setSubscriptions(subRes);
            if (Array.isArray(prodRes)) setProducts(prodRes.filter(p => p.isActive));
            if (Array.isArray(bldRes)) setBuildings(bldRes);
        } catch (err) {
            console.error('Failed to fetch subscription page data:', err);
            alert(err.message || '載入資料失敗');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [apiUrl, user.token]);

    const openCreateModal = () => {
        setEditingSub(null);
        setFormBuilding(buildings[0]?.building || '');
        setFormCustomerName('');
        setFormPhone('');
        setFormProductId(products[0]?.id || '');
        setFormQuantity(1);
        setFormFrequency([1, 3, 5]); // 預設一、三、五配送
        setFormPaymentMethod('奶包金');
        setFormIsActive(true);
        setFormNote('');
        setIsModalOpen(true);
    };

    const openEditModal = (sub) => {
        setEditingSub(sub);
        setFormBuilding(sub.building);
        setFormCustomerName(sub.customerName);
        setFormPhone(sub.phone);
        setFormProductId(sub.productId);
        setFormQuantity(sub.quantity);
        setFormFrequency(sub.frequency || []);
        setFormPaymentMethod(sub.paymentMethod);
        setFormIsActive(sub.isActive);
        setFormNote(sub.note);
        setIsModalOpen(true);
    };

    const handleToggleActive = async (sub) => {
        try {
            const updated = { ...sub, isActive: !sub.isActive };
            setSubscriptions(prev => prev.map(s => s.subscriptionId === sub.subscriptionId ? updated : s));
            
            await callGAS(apiUrl, 'saveSubscription', {
                ...updated,
                frequency: updated.frequency
            }, user.token);
        } catch (err) {
            console.error('Failed to toggle active status:', err);
            alert(err.message || '更新狀態失敗，請重試');
            setSubscriptions(prev => prev.map(s => s.subscriptionId === sub.subscriptionId ? sub : s));
        }
    };

    const handleSave = async (e) => {
        e.preventDefault();
        if (!formBuilding || !formCustomerName || !formProductId || !formQuantity || formFrequency.length === 0) {
            alert('請填寫所有必要欄位，且至少勾選一個配送星期。');
            return;
        }

        setSubmitting(true);
        try {
            const matchedProduct = products.find(p => p.id === formProductId);
            const payload = {
                subscriptionId: editingSub ? editingSub.subscriptionId : null,
                building: formBuilding,
                customerName: formCustomerName.trim(),
                phone: formPhone.trim(),
                productId: formProductId,
                productName: matchedProduct ? matchedProduct.name : '',
                quantity: Number(formQuantity),
                frequency: formFrequency,
                paymentMethod: formPaymentMethod,
                isActive: formIsActive,
                note: formNote.trim()
            };

            const res = await callGAS(apiUrl, 'saveSubscription', payload, user.token);
            if (res && res.success) {
                setIsModalOpen(false);
                fetchData();
            }
        } catch (err) {
            console.error('Failed to save subscription:', err);
            alert(err.message || '儲存訂閱失敗');
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async (subId) => {
        if (!window.confirm('確定要刪除此筆定期配送計畫嗎？此動作無法復原。')) return;
        
        try {
            const res = await callGAS(apiUrl, 'deleteSubscription', { subscriptionId: subId }, user.token);
            if (res && res.success) {
                setSubscriptions(prev => prev.filter(s => s.subscriptionId !== subId));
            }
        } catch (err) {
            console.error('Failed to delete subscription:', err);
            alert(err.message || '刪除失敗');
        }
    };

    const toggleFrequencyDay = (dayNum) => {
        if (formFrequency.includes(dayNum)) {
            setFormFrequency(prev => prev.filter(d => d !== dayNum));
        } else {
            setFormFrequency(prev => [...prev, dayNum].sort());
        }
    };

    // 過濾資料
    const filteredSubs = subscriptions.filter(sub => {
        const matchB = selectedBuilding === 'ALL' || sub.building === selectedBuilding;
        const matchQ = !searchQuery || 
                       sub.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                       sub.phone.includes(searchQuery);
        return matchB && matchQ;
    });

    return (
        <div className="flex flex-col h-full bg-[var(--bg-primary)] p-4 md:p-6 overflow-hidden">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                <div>
                    <h1 className="text-xl md:text-2xl font-black text-[var(--text-primary)] tracking-tight flex items-center gap-2">
                        <Calendar className="text-blue-600 dark:text-blue-400" size={28} />
                        定期配 / 月訂鮮奶管理
                    </h1>
                    <p className="text-xs text-[var(--text-secondary)] mt-1">
                        設定大樓住戶定期派送鮮奶等商品的規則，系統會在大樓開團時自動生成對應的待確認訂單。
                    </p>
                </div>
                
                <div className="flex items-center gap-2.5 w-full md:w-auto">
                    <button onClick={fetchData} className="btn-secondary p-2.5 rounded-xl transition-all" title="重新整理">
                        <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                    </button>
                    {user.role === 'BOSS' && (
                        <button onClick={openCreateModal} className="btn-primary flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl shadow-lg shadow-blue-500/10 font-bold text-sm w-full md:w-auto">
                            <Plus size={18} />
                            新增定期配
                        </button>
                    )}
                </div>
            </div>

            {/* Filter Bar */}
            <div className="bg-[var(--bg-secondary)] rounded-2xl p-4 border border-[var(--border-primary)] shadow-sm flex flex-col md:flex-row gap-4 items-center mb-6">
                {/* 搜尋 */}
                <div className="relative w-full md:w-72">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" size={16} />
                    <input
                        type="text"
                        placeholder="搜尋客戶姓名、電話..."
                        className="input-field text-xs pl-9 pr-4 py-2.5 w-full"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
                
                {/* 大樓分類 */}
                <div className="flex flex-wrap gap-1.5 w-full md:w-auto">
                    <button
                        onClick={() => setSelectedBuilding('ALL')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                            selectedBuilding === 'ALL'
                                ? 'bg-blue-500 text-white shadow-md'
                                : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                        }`}
                    >
                        全部大樓
                    </button>
                    {buildings.map(b => (
                        <button
                            key={b.building}
                            onClick={() => setSelectedBuilding(b.building)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                selectedBuilding === b.building
                                    ? 'bg-blue-500 text-white shadow-md'
                                    : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                            }`}
                        >
                            {b.building}
                        </button>
                    ))}
                </div>
            </div>

            {/* Content List */}
            <div className="flex-1 overflow-y-auto">
                {loading && subscriptions.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-3 text-[var(--text-secondary)]">
                        <RefreshCw className="animate-spin text-blue-500" size={36} />
                        <span className="text-sm font-medium">載入定期配資料中，請稍候...</span>
                    </div>
                ) : filteredSubs.length === 0 ? (
                    <div className="text-center py-20 text-[var(--text-secondary)] bg-[var(--bg-secondary)] rounded-2xl border border-[var(--border-primary)] shadow-sm">
                        無符合條件的定期配設定
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-6">
                        {filteredSubs.map((sub) => (
                            <div 
                                key={sub.subscriptionId}
                                className={`bg-[var(--bg-secondary)] rounded-2xl p-5 border transition-all duration-200 hover:shadow-md flex flex-col gap-4 relative overflow-hidden ${
                                    sub.isActive ? 'border-[var(--border-primary)]' : 'border-slate-200/50 dark:border-slate-800 opacity-60'
                                }`}
                            >
                                {/* Top Badges */}
                                <div className="flex justify-between items-start">
                                    <div className="flex flex-col">
                                        <span className="bg-blue-500/10 text-blue-600 dark:text-blue-400 font-extrabold text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-md self-start">
                                            {sub.building}
                                        </span>
                                    </div>
                                    
                                    {/* Status Switch & Actions */}
                                    <div className="flex items-center gap-2">
                                        {user.role === 'BOSS' && (
                                            <>
                                                <button 
                                                    onClick={() => openEditModal(sub)}
                                                    className="p-1.5 text-slate-500 hover:text-blue-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                                                    title="編輯"
                                                >
                                                    <Edit2 size={14} />
                                                </button>
                                                <button 
                                                    onClick={() => handleDelete(sub.subscriptionId)}
                                                    className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                                                    title="刪除"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </>
                                        )}
                                        
                                        {/* Toggle Active Switch */}
                                        <label className="relative inline-flex items-center cursor-pointer ml-1">
                                            <input
                                                type="checkbox"
                                                className="sr-only peer"
                                                checked={sub.isActive}
                                                onChange={() => handleToggleActive(sub)}
                                                disabled={user.role !== 'BOSS'}
                                            />
                                            <div className="w-8 h-4.5 bg-gray-200 dark:bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-emerald-500"></div>
                                        </label>
                                    </div>
                                </div>
                                
                                {/* Info Details */}
                                <div>
                                    <h3 className="font-extrabold text-base text-[var(--text-primary)] flex items-center gap-1">
                                        {sub.customerName}
                                        {sub.phone && (
                                            <span className="text-xs text-[var(--text-tertiary)] font-mono flex items-center font-normal ml-1">
                                                <Phone size={10} className="mr-0.5" /> {sub.phone}
                                            </span>
                                        )}
                                    </h3>
                                    
                                    <div className="mt-2 bg-[var(--bg-tertiary)]/50 p-2.5 rounded-xl border border-[var(--border-primary)]/40 flex items-center justify-between">
                                        <span className="font-bold text-xs text-[var(--text-secondary)]">{sub.productName}</span>
                                        <span className="font-mono text-sm font-extrabold text-blue-600 bg-blue-500/10 px-2.5 py-0.5 rounded-md">
                                            x {sub.quantity}
                                        </span>
                                    </div>
                                </div>
                                
                                {/* Frequency Display */}
                                <div>
                                    <span className="text-[10px] uppercase font-bold text-[var(--text-tertiary)] tracking-wider">配送頻率</span>
                                    <div className="flex gap-1.5 mt-1">
                                        {daysOfWeekText.map((day, idx) => {
                                            const active = sub.frequency.includes(idx);
                                            return (
                                                <span 
                                                    key={day}
                                                    className={`w-6 h-6 flex items-center justify-center rounded-lg text-xs font-black transition-all ${
                                                        active 
                                                            ? 'bg-blue-600 text-white shadow-sm font-black' 
                                                            : 'bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] opacity-40'
                                                    }`}
                                                >
                                                    {day}
                                                </span>
                                            );
                                        })}
                                    </div>
                                </div>
                                
                                {/* Bottom Billing & Notes */}
                                <div className="pt-2 border-t border-[var(--border-primary)]/40 flex justify-between items-center text-[10px] text-[var(--text-secondary)]">
                                    <span className="flex items-center gap-1">
                                        <ArrowLeftRight size={10} className="text-blue-500" />
                                        預設付款：<strong className="text-[var(--text-primary)] font-bold">{sub.paymentMethod}</strong>
                                    </span>
                                    {sub.note && (
                                        <span className="truncate max-w-[120px]" title={sub.note}>
                                            📝 {sub.note}
                                        </span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Create/Edit Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
                    <div className="bg-[var(--bg-primary)] rounded-3xl w-full max-w-md border border-[var(--border-primary)] shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                        {/* Modal Header */}
                        <div className="p-5 border-b border-[var(--border-primary)] flex justify-between items-center bg-[var(--bg-secondary)]">
                            <h2 className="text-base md:text-lg font-black text-[var(--text-primary)] flex items-center gap-2">
                                <Sparkles className="text-blue-500" size={20} />
                                {editingSub ? '編輯定期配計畫' : '建立全新定期配計畫'}
                            </h2>
                            <button onClick={() => setIsModalOpen(false)} className="p-1 rounded-lg text-[var(--text-tertiary)] hover:bg-[var(--bg-tertiary)]">
                                <X size={20} />
                            </button>
                        </div>
                        
                        {/* Modal Form */}
                        <form onSubmit={handleSave} className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
                            {/* 大樓選擇 */}
                            <div className="flex flex-col gap-1">
                                <label className="text-[10px] uppercase font-bold text-[var(--text-secondary)] tracking-wider">配送大樓 <span className="text-rose-500">*</span></label>
                                <select 
                                    className="input-field text-xs p-2.5 font-bold"
                                    value={formBuilding}
                                    onChange={(e) => setFormBuilding(e.target.value)}
                                    required
                                >
                                    {buildings.map(b => (
                                        <option key={b.building} value={b.building}>{b.building}</option>
                                    ))}
                                </select>
                            </div>
                            
                            {/* 客戶名稱 & 電話 */}
                            <div className="grid grid-cols-2 gap-3">
                                <div className="flex flex-col gap-1">
                                    <label className="text-[10px] uppercase font-bold text-[var(--text-secondary)] tracking-wider">客戶姓名 <span className="text-rose-500">*</span></label>
                                    <input
                                        type="text"
                                        className="input-field text-xs p-2.5"
                                        placeholder="如：黃世成"
                                        value={formCustomerName}
                                        onChange={(e) => setFormCustomerName(e.target.value)}
                                        required
                                    />
                                </div>
                                <div className="flex flex-col gap-1">
                                    <label className="text-[10px] uppercase font-bold text-[var(--text-secondary)] tracking-wider">客戶電話</label>
                                    <input
                                        type="tel"
                                        className="input-field text-xs p-2.5"
                                        placeholder="如：0912..."
                                        value={formPhone}
                                        onChange={(e) => setFormPhone(e.target.value)}
                                    />
                                </div>
                            </div>
                            
                            {/* 選擇商品 & 每期數量 */}
                            <div className="grid grid-cols-3 gap-3">
                                <div className="col-span-2 flex flex-col gap-1">
                                    <label className="text-[10px] uppercase font-bold text-[var(--text-secondary)] tracking-wider">訂閱商品 <span className="text-rose-500">*</span></label>
                                    <select 
                                        className="input-field text-xs p-2.5"
                                        value={formProductId}
                                        onChange={(e) => setFormProductId(e.target.value)}
                                        required
                                    >
                                        {products.map(p => (
                                            <option key={p.id} value={p.id}>{p.name} (${p.single_price || p.price})</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="flex flex-col gap-1">
                                    <label className="text-[10px] uppercase font-bold text-[var(--text-secondary)] tracking-wider">每期數量 <span className="text-rose-500">*</span></label>
                                    <input
                                        type="number"
                                        min="1"
                                        className="input-field text-xs p-2.5 font-bold"
                                        value={formQuantity}
                                        onChange={(e) => setFormQuantity(Number(e.target.value))}
                                        required
                                    />
                                </div>
                            </div>

                            {/* 配送星期 */}
                            <div className="flex flex-col gap-1">
                                <label className="text-[10px] uppercase font-bold text-[var(--text-secondary)] tracking-wider">配送頻率 (可多選) <span className="text-rose-500">*</span></label>
                                <div className="flex justify-between mt-1 bg-[var(--bg-tertiary)]/50 p-2 rounded-xl border border-[var(--border-primary)]/40">
                                    {daysOfWeekText.map((day, idx) => {
                                        const checked = formFrequency.includes(idx);
                                        return (
                                            <button
                                                key={day}
                                                type="button"
                                                onClick={() => toggleFrequencyDay(idx)}
                                                className={`w-8 h-8 flex items-center justify-center rounded-lg text-xs font-bold transition-all ${
                                                    checked
                                                        ? 'bg-blue-600 text-white shadow-sm font-black'
                                                        : 'bg-[var(--bg-secondary)] text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)]'
                                                }`}
                                            >
                                                {day}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* 付款方式 & 是否啟用 */}
                            <div className="grid grid-cols-2 gap-3 items-center pt-2">
                                <div className="flex flex-col gap-1">
                                    <label className="text-[10px] uppercase font-bold text-[var(--text-secondary)] tracking-wider">預設付款扣款</label>
                                    <select 
                                        className="input-field text-xs p-2.5"
                                        value={formPaymentMethod}
                                        onChange={(e) => setFormPaymentMethod(e.target.value)}
                                    >
                                        <option value="奶包金">奶包金 (扣餘額)</option>
                                        <option value="賒帳">賒帳 / 月結</option>
                                        <option value="現金">現金 / 貨到付</option>
                                        <option value="轉帳">轉帳</option>
                                    </select>
                                </div>
                                <div className="flex items-center gap-2 mt-4 select-none">
                                    <input
                                        type="checkbox"
                                        id="formIsActive"
                                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                        checked={formIsActive}
                                        onChange={(e) => setFormIsActive(e.target.checked)}
                                    />
                                    <label htmlFor="formIsActive" className="text-xs font-bold text-[var(--text-primary)] cursor-pointer">
                                        立刻啟用此定期配
                                    </label>
                                </div>
                            </div>

                            {/* 配送備註 */}
                            <div className="flex flex-col gap-1">
                                <label className="text-[10px] uppercase font-bold text-[var(--text-secondary)] tracking-wider">配送備註</label>
                                <input
                                    type="text"
                                    className="input-field text-xs p-2.5"
                                    placeholder="例如：放至 B 棟管理室、早上 8 點前送達"
                                    value={formNote}
                                    onChange={(e) => setFormNote(e.target.value)}
                                />
                            </div>

                            {/* Footer Buttons */}
                            <div className="flex justify-end gap-2 pt-4 border-t border-[var(--border-primary)]/40">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="btn-secondary px-4 py-2.5 rounded-xl font-bold text-xs"
                                >
                                    取消
                                </button>
                                <button
                                    type="submit"
                                    disabled={submitting}
                                    className="btn-primary px-5 py-2.5 rounded-xl font-bold text-xs shadow-lg shadow-blue-500/10 flex items-center gap-1.5"
                                >
                                    {submitting ? '儲存中...' : '儲存計畫'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
