import React, { useState, useEffect, useCallback } from 'react';
import { Package, Search, RefreshCw, Save, Image, Edit2 } from 'lucide-react';
import { callGAS } from '../utils/api';

export default function ProductManagementPage({ user, apiUrl }) {
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [savingId, setSavingId] = useState(null);
    const [tempFlavorChoices, setTempFlavorChoices] = useState({}); // { [productId]: string }

    const fetchProducts = useCallback(async () => {
        setLoading(true);
        try {
            const data = await callGAS(apiUrl, 'getProducts', {}, user.token);
            if (Array.isArray(data)) {
                setProducts(data);
                
                // 初始化口味輸入框的暫存字串
                const initialTemp = {};
                data.forEach(p => {
                    initialTemp[p.id] = Array.isArray(p.flavor_choices) ? p.flavor_choices.join(', ') : '';
                });
                setTempFlavorChoices(initialTemp);
            }
        } catch (error) {
            alert('載入商品失敗: ' + error.message);
        } finally {
            setLoading(false);
        }
    }, [apiUrl, user.token]);

    useEffect(() => {
        if (user?.token) {
            fetchProducts();
        }
    }, [user.token, fetchProducts]);

    const handleFieldChange = (id, field, value) => {
        setProducts(prev => prev.map(p => p.id === id ? { ...p, [field]: value, _dirty: true } : p));
    };

    const handleSave = async (product) => {
        setSavingId(product.id);
        try {
            // 從暫存字串中解析口味陣列（相容中英文逗號）
            const rawStr = tempFlavorChoices[product.id] || '';
            const parsedFlavors = rawStr.split(/[,，]/).map(s => s.trim()).filter(Boolean);

            const res = await callGAS(apiUrl, 'updateProductDetails', {
                productId: product.id,
                isActive: product.isActive,
                imageUrl: product.imageUrl,
                expiryDate: product.expiryDate,
                has_flavor_attributes: product.has_flavor_attributes,
                flavor_choices: parsedFlavors,
                single_price: product.single_price,
                has_volume_pricing: product.has_volume_pricing,
                volume_pricing_settings: product.volume_pricing_settings
            }, user.token);
            
            if (res && res.error) {
                throw new Error(res.error);
            }
            
            setProducts(prev => prev.map(p => p.id === product.id ? { ...p, flavor_choices: parsedFlavors, _dirty: false } : p));
            alert(`${product.name} 儲存成功`);
        } catch (error) {
            alert('儲存失敗: ' + error.message);
        } finally {
            setSavingId(null);
        }
    };

    const filtered = products.filter(p => 
        String(p.name || '').toLowerCase().includes(search.toLowerCase()) ||
        String(p.id || '').toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="max-w-6xl mx-auto h-[calc(100vh-6rem)] flex flex-col p-4 gap-4">
            {/* Header Area */}
            <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center bg-[var(--bg-secondary)] p-4 rounded-xl border border-[var(--border-primary)] shadow-sm gap-4">
                <h2 className="text-xl md:text-2xl font-bold flex items-center gap-2 text-[var(--text-primary)]">
                    <Package className="text-blue-600" />
                    商品屬性
                </h2>

                <div className="flex gap-2 w-full md:w-auto">
                    <div className="relative flex-1 md:flex-none">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" size={18} />
                        <input
                            type="text"
                            placeholder="搜尋商品名稱或ID..."
                            className="input-field pl-10 w-full md:w-80"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                    <button onClick={fetchProducts} className="btn-secondary p-2 rounded-lg" title="重新整理">
                        <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>
            </div>

            {/* Product List */}
            <div className="flex-1 overflow-y-auto pb-6">
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-3 text-[var(--text-secondary)]">
                        <RefreshCw className="animate-spin text-blue-500" size={36} />
                        <span>載入中，請稍候...</span>
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="text-center py-20 text-[var(--text-secondary)] bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-primary)] shadow-sm">
                        無商品資料
                    </div>
                ) : (
                    <div className="space-y-4">
                        {filtered.map(product => (
                            <div key={product.id} className="flex flex-col gap-4 p-5 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] hover:border-blue-500/20 transition-all shadow-sm">
                                {/* Top row: Image & General info */}
                                <div className="flex flex-col md:flex-row md:items-center gap-4">
                                    {/* 圖片預覽 */}
                                    <div className="w-16 h-16 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-tertiary)] overflow-hidden flex items-center justify-center flex-shrink-0 relative group">
                                        {product.imageUrl ? (
                                            <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" onError={(e) => { e.target.onerror = null; e.target.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'; }} />
                                        ) : (
                                            <Image size={24} className="text-[var(--text-tertiary)]" />
                                        )}
                                    </div>

                                    {/* 商品資訊 */}
                                    <div className="flex-1 min-w-[150px]">
                                        <div className="font-bold text-lg text-[var(--text-primary)]">{product.name}</div>
                                        <div className="text-xs text-[var(--text-tertiary)] font-mono mt-0.5">ID: {product.id}</div>
                                        <div className="text-sm text-blue-600 font-bold mt-1">庫存單價: ${product.price}</div>
                                    </div>

                                    {/* 上架狀態 & 有效日期 */}
                                    <div className="flex items-center gap-4 flex-shrink-0">
                                        <div className="flex flex-col gap-1">
                                            <span className="text-[10px] uppercase font-bold text-[var(--text-tertiary)]">有效日期</span>
                                            <input
                                                type="date"
                                                className="input-field text-xs p-1.5 w-32"
                                                value={product.expiryDate || ''}
                                                onChange={(e) => handleFieldChange(product.id, 'expiryDate', e.target.value)}
                                            />
                                        </div>
                                        <div className="flex flex-col gap-1 items-center">
                                            <span className="text-[10px] uppercase font-bold text-[var(--text-tertiary)]">上架</span>
                                            <label className="relative inline-flex items-center cursor-pointer mt-1">
                                                <input
                                                    type="checkbox"
                                                    className="sr-only peer"
                                                    checked={!!product.isActive}
                                                    onChange={(e) => handleFieldChange(product.id, 'isActive', e.target.checked)}
                                                />
                                                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                                            </label>
                                        </div>
                                    </div>
                                </div>

                                {/* Middle row: Extended attributes grid */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 pt-4 border-t border-[var(--border-primary)]/50 text-xs">
                                    {/* Image URL input */}
                                    <div className="flex flex-col gap-1">
                                        <span className="text-[10px] uppercase font-bold text-[var(--text-tertiary)]">圖片網址</span>
                                        <input
                                            type="text"
                                            className="input-field text-xs p-2"
                                            placeholder="圖片網址 https://..."
                                            value={product.imageUrl || ''}
                                            onChange={(e) => handleFieldChange(product.id, 'imageUrl', e.target.value)}
                                        />
                                    </div>

                                    {/* Flavor Attributes settings */}
                                    <div className="flex flex-col gap-1">
                                        <div className="flex justify-between items-center">
                                            <span className="text-[10px] uppercase font-bold text-[var(--text-tertiary)]">多規格口味</span>
                                            <label className="relative inline-flex items-center cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    className="sr-only peer"
                                                    checked={!!product.has_flavor_attributes}
                                                    onChange={(e) => handleFieldChange(product.id, 'has_flavor_attributes', e.target.checked)}
                                                />
                                                <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                                            </label>
                                        </div>
                                        <input
                                            type="text"
                                            className="input-field text-xs p-2"
                                            placeholder="口味選項，以逗號分隔，例：麥芽, 蘋果"
                                            disabled={!product.has_flavor_attributes}
                                            value={tempFlavorChoices[product.id] || ''}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                setTempFlavorChoices(prev => ({ ...prev, [product.id]: val }));
                                                handleFieldChange(product.id, '_dirty', true);
                                            }}
                                        />
                                    </div>

                                    {/* Volume Pricing settings */}
                                    <div className="flex flex-col gap-1 border-t sm:border-t-0 sm:border-l border-[var(--border-primary)]/50 sm:pl-3">
                                        <div className="flex justify-between items-center">
                                            <span className="text-[10px] uppercase font-bold text-[var(--text-tertiary)]">啟用階梯組合價</span>
                                            <label className="relative inline-flex items-center cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    className="sr-only peer"
                                                    checked={!!product.has_volume_pricing}
                                                    onChange={(e) => handleFieldChange(product.id, 'has_volume_pricing', e.target.checked)}
                                                />
                                                <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                                            </label>
                                        </div>
                                        <div className="flex gap-2">
                                            <div className="flex-1">
                                                <input
                                                    type="number"
                                                    className="input-field text-xs p-2"
                                                    placeholder="單件原價"
                                                    value={product.single_price || ''}
                                                    onChange={(e) => handleFieldChange(product.id, 'single_price', e.target.value !== '' ? Number(e.target.value) : '')}
                                                />
                                            </div>
                                            <div className="flex-1 flex gap-1 items-center font-mono">
                                                <input
                                                    type="number"
                                                    className="input-field text-xs p-2 w-12 text-center"
                                                    placeholder="件數"
                                                    disabled={!product.has_volume_pricing}
                                                    value={product.volume_pricing_settings?.target_quantity || ''}
                                                    onChange={(e) => {
                                                        const settings = {
                                                            ...(product.volume_pricing_settings || {}),
                                                            target_quantity: e.target.value !== '' ? Number(e.target.value) : 0
                                                        };
                                                        handleFieldChange(product.id, 'volume_pricing_settings', settings);
                                                    }}
                                                />
                                                <span className="text-[10px] text-[var(--text-tertiary)]">件</span>
                                                <input
                                                    type="number"
                                                    className="input-field text-xs p-2 flex-1"
                                                    placeholder="組合價"
                                                    disabled={!product.has_volume_pricing}
                                                    value={product.volume_pricing_settings?.package_price || ''}
                                                    onChange={(e) => {
                                                        const settings = {
                                                            ...(product.volume_pricing_settings || {}),
                                                            package_price: e.target.value !== '' ? Number(e.target.value) : 0
                                                        };
                                                        handleFieldChange(product.id, 'volume_pricing_settings', settings);
                                                    }}
                                                />
                                                <span className="text-[10px] text-[var(--text-tertiary)]">元</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Action row (Save button) */}
                                <div className="flex justify-end pt-3 border-t border-[var(--border-primary)]/30">
                                    <button
                                        disabled={savingId === product.id || !product._dirty}
                                        onClick={() => handleSave(product)}
                                        className={`px-5 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                                            product._dirty 
                                                ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-md active:scale-95' 
                                                : 'bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-not-allowed'
                                        }`}
                                    >
                                        <Save size={14} />
                                        {savingId === product.id ? '儲存中...' : '儲存變更'}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
