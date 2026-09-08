import React, { useState, useEffect } from 'react';
import { Save, Loader2, Store } from 'lucide-react';
import { callGAS } from '../utils/api';
import { useStoreSetting } from '../hooks/useStoreSetting';

export default function StoreSettingsPage({ user, apiUrl }) {
    const { setting, loading: settingLoading } = useStoreSetting();
    const [formData, setFormData] = useState({
        name: '',
        logoUrl: '',
        primaryColor: '',
        secondaryColor: '',
        phone: '',
        address: '',
        lineOA: '',
        linePay: '',
        liffId: '',
        businessHours: '',
        timezone: '',
        language: '',
        currency: '',
    });
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (setting) {
            setFormData({
                name: setting.name || '',
                logoUrl: setting.logoUrl || '',
                primaryColor: setting.primaryColor || '',
                secondaryColor: setting.secondaryColor || '',
                phone: setting.phone || '',
                address: setting.address || '',
                lineOA: setting.lineOA || '',
                linePay: setting.linePay || '',
                liffId: setting.liffId || '',
                businessHours: setting.businessHours || '',
                timezone: setting.timezone || '',
                language: setting.language || '',
                currency: setting.currency || '',
            });
        }
    }, [setting]);

    const handleSave = async () => {
        if (!formData.name) {
            alert('請填寫店家名稱');
            return;
        }

        try {
            setIsSaving(true);
            const targetStoreCode = setting?.storeCode || 'MILI001';
            await callGAS(apiUrl, 'saveStoreSetting', { ...formData, storeCode: targetStoreCode }, user?.token);
            alert('店家設定已儲存！重整頁面後生效。');
            window.location.reload();
        } catch (error) {
            console.error('儲存失敗', error);
            alert('儲存失敗: ' + error.message);
        } finally {
            setIsSaving(false);
        }
    };

    if (settingLoading) {
        return (
            <div className="flex items-center justify-center h-full">
                <Loader2 className="animate-spin text-blue-500" size={32} />
            </div>
        );
    }

    return (
        <div className="p-6 max-w-4xl mx-auto pb-24">
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center text-blue-600">
                        <Store size={20} />
                    </div>
                    <div>
                        <h1 className="text-2xl font-black text-slate-800 tracking-tight">店家設定</h1>
                        <p className="text-sm text-slate-500 mt-1 font-medium">管理品牌資訊與系統參數</p>
                    </div>
                </div>
                <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-bold shadow-md shadow-blue-500/20 active:scale-95 transition-all disabled:opacity-70 disabled:active:scale-100"
                >
                    {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                    {isSaving ? '儲存中...' : '儲存設定'}
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* 品牌設定 */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                        <div className="w-1 h-5 bg-blue-500 rounded-full" />
                        品牌資訊
                    </h2>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-1">店家名稱 *</label>
                            <input
                                type="text"
                                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-blue-500 outline-none transition-colors"
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                                placeholder="例如：米立微"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-1">Logo 網址</label>
                            <input
                                type="text"
                                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-blue-500 outline-none transition-colors"
                                value={formData.logoUrl}
                                onChange={e => setFormData({ ...formData, logoUrl: e.target.value })}
                                placeholder="https://..."
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">主色調 (Primary)</label>
                                <div className="flex gap-2">
                                    <input
                                        type="color"
                                        className="h-10 w-12 rounded cursor-pointer"
                                        value={formData.primaryColor || '#000000'}
                                        onChange={e => setFormData({ ...formData, primaryColor: e.target.value })}
                                    />
                                    <input
                                        type="text"
                                        className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none"
                                        value={formData.primaryColor}
                                        onChange={e => setFormData({ ...formData, primaryColor: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">次色調 (Secondary)</label>
                                <div className="flex gap-2">
                                    <input
                                        type="color"
                                        className="h-10 w-12 rounded cursor-pointer"
                                        value={formData.secondaryColor || '#000000'}
                                        onChange={e => setFormData({ ...formData, secondaryColor: e.target.value })}
                                    />
                                    <input
                                        type="text"
                                        className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none"
                                        value={formData.secondaryColor}
                                        onChange={e => setFormData({ ...formData, secondaryColor: e.target.value })}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 聯絡與營業 */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                        <div className="w-1 h-5 bg-green-500 rounded-full" />
                        聯絡與營業資訊
                    </h2>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-1">聯絡電話</label>
                            <input
                                type="text"
                                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-blue-500 outline-none"
                                value={formData.phone}
                                onChange={e => setFormData({ ...formData, phone: e.target.value })}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-1">地址</label>
                            <input
                                type="text"
                                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-blue-500 outline-none"
                                value={formData.address}
                                onChange={e => setFormData({ ...formData, address: e.target.value })}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-1">營業時間</label>
                            <input
                                type="text"
                                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-blue-500 outline-none"
                                value={formData.businessHours}
                                onChange={e => setFormData({ ...formData, businessHours: e.target.value })}
                            />
                        </div>
                    </div>
                </div>

                {/* LINE / 系統設定 */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm md:col-span-2">
                    <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                        <div className="w-1 h-5 bg-purple-500 rounded-full" />
                        LINE 與系統整合
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">LINE 官方帳號 (OA 連結)</label>
                                <input
                                    type="text"
                                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-blue-500 outline-none"
                                    value={formData.lineOA}
                                    onChange={e => setFormData({ ...formData, lineOA: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">LINE Pay 連結</label>
                                <input
                                    type="text"
                                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-blue-500 outline-none"
                                    value={formData.linePay}
                                    onChange={e => setFormData({ ...formData, linePay: e.target.value })}
                                />
                            </div>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">LIFF ID (用於點餐頁)</label>
                                <input
                                    type="text"
                                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-blue-500 outline-none"
                                    value={formData.liffId}
                                    onChange={e => setFormData({ ...formData, liffId: e.target.value })}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1">時區</label>
                                    <input
                                        type="text"
                                        className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-blue-500 outline-none"
                                        value={formData.timezone}
                                        onChange={e => setFormData({ ...formData, timezone: e.target.value })}
                                        placeholder="Asia/Taipei"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1">幣別</label>
                                    <input
                                        type="text"
                                        className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-blue-500 outline-none"
                                        value={formData.currency}
                                        onChange={e => setFormData({ ...formData, currency: e.target.value })}
                                        placeholder="TWD"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
