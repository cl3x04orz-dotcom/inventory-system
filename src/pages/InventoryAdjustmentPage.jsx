import React, { useState, useEffect, useCallback } from 'react';
import { Settings2, Search, ArrowRight, Save, Package, AlertCircle, Trash2 } from 'lucide-react';
import { callGAS } from '../utils/api';
import { sortProducts } from '../utils/constants';

export default function InventoryAdjustmentPage({ user, apiUrl }) {
    const [inventory, setInventory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedItem, setSelectedItem] = useState(null);
    const [adjustment, setAdjustment] = useState({ afterQty: '', note: '' });
    const [saving, setSaving] = useState(false);

    const fetchInventory = useCallback(async () => {
        setLoading(true);
        try {
            const data = await callGAS(apiUrl, 'getInventory', {}, user.token);
            if (Array.isArray(data)) {
                setInventory(sortProducts(data, 'productName'));
            }
        } catch (error) {
            console.error('Failed to fetch inventory:', error);
        } finally {
            setLoading(false);
        }
    }, [apiUrl, user.token]);

    useEffect(() => {
        if (user?.token) fetchInventory();
    }, [user.token, fetchInventory]);

    const filteredInventory = inventory.filter(item =>
        item.productName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.batchId?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handleSave = async (e) => {
        e.preventDefault();
        if (!selectedItem || adjustment.afterQty === '') return;

        setSaving(true);
        try {
            const payload = {
                productId: selectedItem.id,
                batchId: selectedItem.batchId,
                afterQty: Number(adjustment.afterQty),
                beforeQty: Number(selectedItem.quantity),
                note: adjustment.note,
                operator: user.username
            };
            await callGAS(apiUrl, 'adjustInventory', payload, user.token);
            alert('庫存調整成功！');
            setSelectedItem(null);
            setAdjustment({ afterQty: '', note: '' });
            await fetchInventory();
        } catch (error) {
            alert('調整失敗: ' + error.message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: Product List */}
            <div className="space-y-4 flex flex-col h-[calc(100vh-10rem)]">
                <div className="flex justify-between items-center">
                    <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                        <Package className="text-blue-600" /> 選擇調整品項
                    </h2>
                </div>

                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input
                        type="text"
                        placeholder="搜尋產品名稱或批號..."
                        className="input-field pl-10 bg-white"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                <div className="flex-1 overflow-y-auto rounded-xl border border-slate-200 bg-white">
                    <table className="w-full text-left">
                        <thead className="sticky top-0 bg-slate-50 text-slate-500 text-xs uppercase z-10">
                            <tr>
                                <th className="p-3">產品名稱</th>
                                <th className="p-3">預計效期</th>
                                <th className="p-3 text-right">當前庫存</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {loading ? (
                                <tr><td colSpan="3" className="p-8 text-center text-slate-500">載入中...</td></tr>
                            ) : filteredInventory.map((item, idx) => (
                                <tr
                                    key={idx}
                                    onClick={() => {
                                        setSelectedItem(item);
                                        setAdjustment({ ...adjustment, afterQty: item.quantity });
                                    }}
                                    className={`cursor-pointer transition-colors ${selectedItem === item ? 'bg-blue-50 active' : 'hover:bg-slate-50'}`}
                                >
                                    <td className="p-3 font-medium text-slate-900">{item.productName}</td>
                                    <td className="p-3 text-sm text-slate-500">{item.expiry ? new Date(item.expiry).toLocaleDateString('zh-TW') : '-'}</td>
                                    <td className="p-3 text-right font-mono font-bold text-emerald-600">{item.quantity}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Right: Adjustment Form */}
            <div className="space-y-6">
                <div className="glass-panel p-6 border-slate-200 h-fit">
                    <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
                        <Settings2 className="text-blue-600" /> 庫存調整內容
                    </h2>

                    {selectedItem ? (
                        <form onSubmit={handleSave} className="space-y-6">
                            <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
                                <label className="text-xs text-slate-400 block mb-1">調整品項</label>
                                <div className="text-lg font-bold text-slate-800">{selectedItem.productName}</div>
                                <div className="text-sm text-slate-500">批號: {selectedItem.batchId || '-'}</div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs text-slate-400 block mb-1">調整前庫存</label>
                                    <div className="input-field bg-slate-50 text-slate-400 cursor-not-allowed border-slate-100">
                                        {selectedItem.quantity}
                                    </div>
                                </div>
                                <div>
                                    <label className="text-xs text-blue-600 block mb-1 flex items-center gap-1 font-bold">
                                        <ArrowRight size={12} /> 調整後庫存
                                    </label>
                                    <input
                                        type="number"
                                        required
                                        autoFocus
                                        className="input-field border-blue-200 focus:ring-blue-500 bg-white"
                                        value={adjustment.afterQty}
                                        onChange={e => setAdjustment({ ...adjustment, afterQty: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="text-xs text-slate-400 block mb-1">調整備註 / 原因</label>
                                <textarea
                                    className="input-field min-h-[100px] resize-none bg-white"
                                    placeholder="例如: 破損、贈樣、盤點誤差..."
                                    value={adjustment.note}
                                    onChange={e => setAdjustment({ ...adjustment, note: e.target.value })}
                                />
                            </div>

                            <div className="flex gap-3">
                                <button
                                    type="button"
                                    onClick={() => setSelectedItem(null)}
                                    className="btn-secondary flex-1"
                                >
                                    取消
                                </button>
                                <button
                                    type="submit"
                                    disabled={saving}
                                    className="btn-primary flex-[2] flex items-center justify-center gap-2"
                                >
                                    {saving ? '儲存中...' : <><Save size={18} /> 確認調整</>}
                                </button>
                            </div>
                        </form>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-20 text-slate-500 gap-4">
                            <AlertCircle size={48} className="opacity-20" />
                            <p>請從左側清單選擇欲調整的品項</p>
                        </div>
                    )}
                </div>

                <div className="p-4 rounded-xl border border-amber-200 bg-amber-50 flex gap-3">
                    <AlertCircle className="text-amber-500 shrink-0" size={20} />
                    <div className="text-sm text-amber-700">
                        <p className="font-bold text-amber-600 mb-1">注意事項</p>
                        <p>庫存調整會即時反映至 Google Sheets 並同步至各終端。所有調整動作都會被記錄在盤點歷史中以供審核。</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
