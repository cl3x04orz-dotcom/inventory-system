import React, { useState, useEffect, useCallback } from 'react';
import { Package, Search, RefreshCw, Save, Image, Edit2, ChevronDown, ChevronUp, Check, AlertCircle } from 'lucide-react';
import { callGAS } from '../utils/api';

export default function ProductManagementPage({ user, apiUrl }) {
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [tempFlavorChoices, setTempFlavorChoices] = useState({}); // { [productId]: string }
    const [expandedIds, setExpandedIds] = useState(new Set()); // 展開的商品 ID
    const [savingStatus, setSavingStatus] = useState({}); // { [productId]: 'saving' | 'saved' | 'error' }
    const [lastError, setLastError] = useState({}); // { [productId]: string }
    const [stockMap, setStockMap] = useState({}); // { [productName]: number }
    const [stockFilter, setStockFilter] = useState('ALL'); // 'ALL' | 'HAS_STOCK' | 'NO_STOCK'

    const fetchProducts = useCallback(async () => {
        setLoading(true);
        try {
            const [productsData, inventoryData] = await Promise.all([
                callGAS(apiUrl, 'getProducts', {}, user.token),
                callGAS(apiUrl, 'getInventory', {}, user.token).catch(err => {
                    console.error('Fetch inventory in Product Page failed, fallback to empty:', err);
                    return [];
                })
            ]);

            if (Array.isArray(productsData)) {
                setProducts(productsData);
                
                // 初始化口味輸入框的暫存字串
                const initialTemp = {};
                productsData.forEach(p => {
                    initialTemp[p.id] = Array.isArray(p.flavor_choices) ? p.flavor_choices.join(', ') : '';
                });
                setTempFlavorChoices(initialTemp);
            }

            // 計算庫存對照表
            const tempStockMap = {};
            if (Array.isArray(inventoryData)) {
                inventoryData.forEach(item => {
                    const name = item.productName;
                    const qty = Number(item.quantity) || 0;
                    tempStockMap[name] = (tempStockMap[name] || 0) + qty;
                });
            }
            setStockMap(tempStockMap);

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

    // 展開與折疊
    const toggleExpand = (id) => {
        setExpandedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    // 自動背景存檔，不彈出 Alert 影響體驗
    const handleSaveProduct = async (id, updatedProductFields = {}) => {
        const currentProduct = products.find(p => p.id === id);
        if (!currentProduct) return;

        // 立即套用修改至本地 state，並標記儲存中
        const mergedProduct = { ...currentProduct, ...updatedProductFields };
        setSavingStatus(prev => ({ ...prev, [id]: 'saving' }));
        setLastError(prev => {
            const next = { ...prev };
            delete next[id];
            return next;
        });

        try {
            // 從暫存字串中解析口味陣列
            const rawStr = tempFlavorChoices[id] || '';
            const parsedFlavors = rawStr.split(/[,，]/).map(s => s.trim()).filter(Boolean);

            // 解析發貨階梯
            let parsedSteps = [];
            if (typeof mergedProduct.dispatchSteps === 'string') {
                parsedSteps = mergedProduct.dispatchSteps.split(/[,，]/).map(s => Number(s.trim())).filter(n => !isNaN(n));
            } else if (Array.isArray(mergedProduct.dispatchSteps)) {
                parsedSteps = mergedProduct.dispatchSteps.map(Number);
            }

            const res = await callGAS(apiUrl, 'updateProductDetails', {
                productId: mergedProduct.id,
                isActive: mergedProduct.isActive,
                imageUrl: mergedProduct.imageUrl,
                category: mergedProduct.category || '',
                expiryDate: mergedProduct.expiryDate,
                has_flavor_attributes: mergedProduct.has_flavor_attributes,
                flavor_choices: parsedFlavors,
                single_price: mergedProduct.single_price,
                has_volume_pricing: mergedProduct.has_volume_pricing,
                volume_pricing_settings: mergedProduct.volume_pricing_settings,
                price: mergedProduct.price,
                isBundle: mergedProduct.isBundle,
                bundleSize: mergedProduct.bundleSize !== undefined ? Number(mergedProduct.bundleSize) : 1,
                
                packSize: Number(mergedProduct.packSize || 1),
                dispatchSteps: parsedSteps,
                roundThreshold: Number(mergedProduct.roundThreshold !== undefined ? mergedProduct.roundThreshold : 99),
                autoSuppress: Boolean(mergedProduct.autoSuppress),
                maxSuggestion: Number(mergedProduct.maxSuggestion || 0)
            }, user.token);
            
            if (res && res.error) {
                throw new Error(res.error);
            }
            
            // 儲存成功，清除 _dirty
            setProducts(prev => prev.map(p => p.id === id ? { 
                ...p, 
                ...updatedProductFields,
                flavor_choices: parsedFlavors, 
                dispatchSteps: parsedSteps,
                _dirty: false 
            } : p));
            
            setSavingStatus(prev => ({ ...prev, [id]: 'saved' }));
            
            // 2.5 秒後淡出「已儲存」字眼
            setTimeout(() => {
                setSavingStatus(prev => {
                    const next = { ...prev };
                    if (next[id] === 'saved') delete next[id];
                    return next;
                });
            }, 2500);
            
        } catch (error) {
            console.error('Auto save error:', error);
            setSavingStatus(prev => ({ ...prev, [id]: 'error' }));
            setLastError(prev => ({ ...prev, [id]: error.message }));
        }
    };

    const filtered = products.filter(p => {
        const matchSearch = String(p.name || '').toLowerCase().includes(search.toLowerCase()) ||
                            String(p.id || '').toLowerCase().includes(search.toLowerCase());
        if (!matchSearch) return false;

        const qty = stockMap[p.name] || 0;
        if (stockFilter === 'HAS_STOCK') {
            return qty > 0;
        } else if (stockFilter === 'NO_STOCK') {
            return qty === 0;
        }

        return true;
    });

    return (
        <div className="max-w-6xl mx-auto h-[calc(100vh-6rem)] flex flex-col p-4 gap-4">
            {/* Header Area */}
            <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center bg-[var(--bg-secondary)] p-4 rounded-xl border border-[var(--border-primary)] shadow-sm gap-4">
                <h2 className="text-xl md:text-2xl font-bold flex items-center gap-2 text-[var(--text-primary)]">
                    <Package className="text-blue-600" />
                    商品屬性
                </h2>

                <div className="flex flex-wrap items-center gap-4 w-full md:w-auto">
                    <select
                        className="input-field py-2.5 px-3 text-sm bg-[var(--bg-secondary)] border-[var(--border-primary)] font-bold cursor-pointer w-40"
                        value={stockFilter}
                        onChange={(e) => setStockFilter(e.target.value)}
                    >
                        <option value="ALL">📦 顯示全部商品</option>
                        <option value="HAS_STOCK">🟢 只看有庫存</option>
                        <option value="NO_STOCK">🔴 只看無庫存</option>
                    </select>

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
                {loading && products.length === 0 ? (
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
                        {filtered.map(product => {
                            const isDirty = !!product._dirty;
                            const isExpanded = expandedIds.has(product.id);
                            const status = savingStatus[product.id];
                            
                            return (
                                <div key={product.id} className={`flex flex-col rounded-2xl border transition-all duration-300 bg-[var(--bg-secondary)] shadow-sm ${
                                    isExpanded 
                                        ? 'border-[var(--border-primary)] shadow-md' 
                                        : 'border-[var(--border-primary)] hover:border-[var(--border-primary)]/80 hover:shadow-md'
                                }`}>
                                    {/* 1. 商品標頭：主圖與基本資訊（點擊切換展開/折疊） */}
                                    <div 
                                        onClick={() => toggleExpand(product.id)}
                                        className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 cursor-pointer hover:bg-[var(--bg-tertiary)]/20 transition-all rounded-t-2xl"
                                    >
                                        <div className="flex items-center gap-4 flex-1 min-w-0">
                                            {/* 商品大圖 */}
                                            <div className="w-16 h-16 rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-tertiary)] overflow-hidden flex items-center justify-center flex-shrink-0 shadow-inner">
                                                {product.imageUrl ? (
                                                    <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" onError={(e) => { e.target.onerror = null; e.target.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'; }} />
                                                ) : (
                                                    <Image size={24} className="text-[var(--text-tertiary)]" />
                                                )}
                                            </div>
                                            {/* 名稱與ID */}
                                            <div className="min-w-0 flex-1">
                                                <div className="font-extrabold text-base md:text-lg text-[var(--text-primary)] truncate">{product.name}</div>
                                                <div className="text-xs text-[var(--text-tertiary)] font-mono mt-0.5 flex items-center gap-1.5">
                                                    <span className="bg-[var(--bg-tertiary)] px-1.5 py-0.2 rounded border border-[var(--border-primary)] text-[10px]">ID</span> 
                                                    <span className="truncate max-w-[120px] md:max-w-none">{product.id}</span>
                                                </div>
                                                <div className="text-xs font-bold text-blue-600 mt-1 flex flex-wrap items-center gap-3">
                                                    <span>銷售原價：<span className="font-mono text-sm text-[var(--text-primary)] font-bold">${product.single_price || '-'}</span></span>
                                                    <span className="h-3 w-[1px] bg-slate-300 dark:bg-slate-700" />
                                                    <span>庫存成本(進價)：<span className="font-mono text-sm text-amber-600">${product.price || '-'}</span></span>
                                                    <span className="h-3 w-[1px] bg-slate-300 dark:bg-slate-700" />
                                                    <span>當前庫存：<span className={`font-mono text-sm ${ (stockMap[product.name] || 0) > 0 ? 'text-emerald-600 font-extrabold' : 'text-slate-400' }`}>{stockMap[product.name] || 0}</span></span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* 右側操控區 (有效日期, 上架, 儲存狀態, 箭頭) */}
                                        <div className="flex items-center gap-4 flex-shrink-0 self-end md:self-auto">
                                            {/* 有效日期 */}
                                            <div className="flex flex-col gap-0.5" onClick={(e) => e.stopPropagation()}>
                                                <span className="text-[9px] uppercase font-bold text-[var(--text-secondary)]">有效日期</span>
                                                <input
                                                    type="date"
                                                    className="input-field text-xs px-2 py-1 w-32 font-semibold"
                                                    value={product.expiryDate || ''}
                                                    onChange={(e) => {
                                                        handleFieldChange(product.id, 'expiryDate', e.target.value);
                                                        handleSaveProduct(product.id, { expiryDate: e.target.value });
                                                    }}
                                                />
                                            </div>
                                            <div className="h-6 w-[1px] bg-[var(--border-primary)]" />
                                            {/* 上架 */}
                                            <div className="flex flex-col gap-0.5 items-center" onClick={(e) => e.stopPropagation()}>
                                                <span className="text-[9px] uppercase font-bold text-[var(--text-secondary)]">上架</span>
                                                <label className="relative inline-flex items-center cursor-pointer mt-0.5">
                                                    <input
                                                        type="checkbox"
                                                        className="sr-only peer"
                                                        checked={!!product.isActive}
                                                        onChange={(e) => {
                                                            handleFieldChange(product.id, 'isActive', e.target.checked);
                                                            handleSaveProduct(product.id, { isActive: e.target.checked });
                                                        }}
                                                    />
                                                    <div className="w-9 h-5 bg-gray-200 dark:bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                                                </label>
                                            </div>
                                            <div className="h-6 w-[1px] bg-[var(--border-primary)]" />
                                            
                                            {/* 自動儲存狀態 */}
                                            <div className="min-w-[65px] flex justify-end">
                                                {status === 'saving' && (
                                                    <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400 font-bold text-[10px] bg-blue-500/10 px-2 py-0.5 rounded-full">
                                                        <RefreshCw size={10} className="animate-spin" /> 儲存中
                                                    </span>
                                                )}
                                                {status === 'saved' && (
                                                    <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-bold text-[10px] bg-emerald-500/10 px-2 py-0.5 rounded-full animate-fade-in">
                                                        <Check size={10} /> 已儲存
                                                    </span>
                                                )}
                                                {status === 'error' && (
                                                    <span className="flex items-center gap-1 text-rose-600 dark:text-rose-400 font-bold text-[10px] bg-rose-500/10 px-2 py-0.5 rounded-full" title={lastError[product.id]}>
                                                        <AlertCircle size={10} /> 失敗
                                                    </span>
                                                )}
                                            </div>

                                            {/* 展開 Chevron */}
                                            <div className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors pl-1">
                                                {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                                            </div>
                                        </div>
                                    </div>

                                    {/* 展開的詳細欄位 */}
                                    {isExpanded && (
                                        <div className="p-5 border-t border-[var(--border-primary)]/40 flex flex-col gap-6 animate-slide-down">
                                            {/* 2. 第一大組：行銷與多規格配置 */}
                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
                                                {/* 圖片網址 */}
                                                <div className="flex flex-col gap-2 bg-[var(--bg-tertiary)]/30 p-3.5 rounded-xl border border-[var(--border-primary)]/50">
                                                    <span className="text-[10px] uppercase font-extrabold text-[var(--text-secondary)] tracking-wider">圖片網址</span>
                                                    <input
                                                        type="text"
                                                        className="input-field text-xs p-2.5"
                                                        placeholder="輸入圖片網址 https://..."
                                                        value={product.imageUrl || ''}
                                                        onChange={(e) => handleFieldChange(product.id, 'imageUrl', e.target.value)}
                                                        onBlur={(e) => handleSaveProduct(product.id, { imageUrl: e.target.value })}
                                                    />
                                                </div>

                                                {/* 商品分類 */}
                                                <div className="flex flex-col gap-2 bg-[var(--bg-tertiary)]/30 p-3.5 rounded-xl border border-[var(--border-primary)]/50">
                                                    <span className="text-[10px] uppercase font-extrabold text-[var(--text-secondary)] tracking-wider">商品分類</span>
                                                    <input
                                                        type="text"
                                                        className="input-field text-xs p-2.5"
                                                        placeholder="例：乳飲品、燕麥系列、優格系列"
                                                        value={product.category || ''}
                                                        onChange={(e) => handleFieldChange(product.id, 'category', e.target.value)}
                                                        onBlur={(e) => handleSaveProduct(product.id, { category: e.target.value })}
                                                    />
                                                </div>

                                                {/* 多規格口味 */}
                                                <div className="flex flex-col gap-2 bg-[var(--bg-tertiary)]/30 p-3.5 rounded-xl border border-[var(--border-primary)]/50">
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-[10px] uppercase font-extrabold text-[var(--text-secondary)] tracking-wider">多規格口味</span>
                                                        <label className="relative inline-flex items-center cursor-pointer">
                                                            <input
                                                                type="checkbox"
                                                                className="sr-only peer"
                                                                checked={!!product.has_flavor_attributes}
                                                                onChange={(e) => {
                                                                    handleFieldChange(product.id, 'has_flavor_attributes', e.target.checked);
                                                                    handleSaveProduct(product.id, { has_flavor_attributes: e.target.checked });
                                                                }}
                                                            />
                                                            <div className="w-9 h-5 bg-gray-200 dark:bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-500"></div>
                                                        </label>
                                                    </div>
                                                    <input
                                                        type="text"
                                                        className="input-field text-xs p-2.5"
                                                        placeholder="口味選項，以逗號分隔，例：原味, 巧克力"
                                                        disabled={!product.has_flavor_attributes}
                                                        value={tempFlavorChoices[product.id] || ''}
                                                        onChange={(e) => {
                                                            const val = e.target.value;
                                                            setTempFlavorChoices(prev => ({ ...prev, [product.id]: val }));
                                                            handleFieldChange(product.id, '_dirty', true);
                                                        }}
                                                        onBlur={() => handleSaveProduct(product.id)}
                                                    />
                                                </div>
                                                
                                                {/* 捆裝規格設定 */}
                                                <div className="flex flex-col gap-2 bg-[var(--bg-tertiary)]/30 p-3.5 rounded-xl border border-[var(--border-primary)]/50">
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-[10px] uppercase font-extrabold text-[var(--text-secondary)] tracking-wider">捆裝規格</span>
                                                        <label className="relative inline-flex items-center cursor-pointer">
                                                            <input
                                                                type="checkbox"
                                                                className="sr-only peer"
                                                                checked={!!product.isBundle}
                                                                onChange={(e) => {
                                                                    handleFieldChange(product.id, 'isBundle', e.target.checked);
                                                                    handleSaveProduct(product.id, { isBundle: e.target.checked });
                                                                }}
                                                            />
                                                            <div className="w-9 h-5 bg-gray-200 dark:bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-500"></div>
                                                        </label>
                                                    </div>
                                                    <input
                                                            type="number"
                                                            className="input-field text-xs p-2.5 mt-auto"
                                                            placeholder="捆裝數量，例：4 (四入一組)"
                                                            disabled={!product.isBundle}
                                                            value={product.bundleSize === '' || product.bundleSize === undefined || product.bundleSize === null || product.bundleSize === 1 ? '' : product.bundleSize}
                                                            onChange={(e) => handleFieldChange(product.id, 'bundleSize', e.target.value !== '' ? Number(e.target.value) : '')}
                                                            onBlur={(e) => handleSaveProduct(product.id, { bundleSize: e.target.value !== '' ? Number(e.target.value) : 1 })}
                                                        />
                                                </div>

                                                {/* 階梯組合價 */}
                                                <div className="lg:col-span-4 flex flex-col gap-3 bg-[var(--bg-tertiary)]/30 p-3.5 rounded-xl border border-[var(--border-primary)]/50">
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-[10px] uppercase font-extrabold text-[var(--text-secondary)] tracking-wider">階梯組合價與成本設定</span>
                                                        <label className="relative inline-flex items-center cursor-pointer">
                                                            <input
                                                                type="checkbox"
                                                                className="sr-only peer"
                                                                checked={!!product.has_volume_pricing}
                                                                onChange={(e) => {
                                                                    handleFieldChange(product.id, 'has_volume_pricing', e.target.checked);
                                                                    handleSaveProduct(product.id, { has_volume_pricing: e.target.checked });
                                                                }}
                                                            />
                                                            <div className="w-9 h-5 bg-gray-200 dark:bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-500"></div>
                                                        </label>
                                                    </div>

                                                    {/* 進價 & 原價：永遠可編輯，不受階梯開關影響 */}
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                        {/* 進價 */}
                                                        <div className="flex flex-col gap-1">
                                                            <span className="text-[10px] text-[var(--text-secondary)] font-medium">庫存成本 (進價)</span>
                                                            <div className="relative">
                                                                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] font-bold font-mono text-[10px]">$</span>
                                                                <input
                                                                    type="number"
                                                                    className="input-field text-xs pl-6 p-2 w-full"
                                                                    placeholder="進價成本"
                                                                    value={product.price || ''}
                                                                    onChange={(e) => handleFieldChange(product.id, 'price', e.target.value !== '' ? Number(e.target.value) : '')}
                                                                    onBlur={(e) => handleSaveProduct(product.id, { price: e.target.value !== '' ? Number(e.target.value) : '' })}
                                                                />
                                                            </div>
                                                        </div>
                                                        {/* 原價 */}
                                                        <div className="flex flex-col gap-1">
                                                            <span className="text-[10px] text-[var(--text-secondary)] font-medium">銷售原價</span>
                                                            <div className="relative">
                                                                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] font-bold font-mono text-[10px]">$</span>
                                                                <input
                                                                    type="number"
                                                                    className="input-field text-xs pl-6 p-2 w-full"
                                                                    placeholder="銷售原價"
                                                                    value={product.single_price || ''}
                                                                    onChange={(e) => handleFieldChange(product.id, 'single_price', e.target.value !== '' ? Number(e.target.value) : '')}
                                                                    onBlur={(e) => handleSaveProduct(product.id, { single_price: e.target.value !== '' ? Number(e.target.value) : '' })}
                                                                />
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* 滿件特惠：受階梯開關控制 */}
                                                    <div className={`flex flex-col gap-1 ${!product.has_volume_pricing ? 'opacity-40 pointer-events-none select-none' : ''}`}>
                                                        <span className="text-[10px] text-[var(--text-secondary)] font-medium">滿件特惠（滿 N 件，共 $ 總價）</span>
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-[10px] text-[var(--text-secondary)] whitespace-nowrap">滿</span>
                                                            <input
                                                                type="number"
                                                                className="input-field text-xs p-2 w-16 text-center"
                                                                placeholder="件"
                                                                disabled={!product.has_volume_pricing}
                                                                value={product.volume_pricing_settings?.target_quantity || ''}
                                                                onChange={(e) => {
                                                                    const settings = { ...(product.volume_pricing_settings || {}), target_quantity: e.target.value !== '' ? Number(e.target.value) : 0 };
                                                                    handleFieldChange(product.id, 'volume_pricing_settings', settings);
                                                                }}
                                                                onBlur={(e) => {
                                                                    const settings = { ...(product.volume_pricing_settings || {}), target_quantity: e.target.value !== '' ? Number(e.target.value) : 0 };
                                                                    handleSaveProduct(product.id, { volume_pricing_settings: settings });
                                                                }}
                                                            />
                                                            <span className="text-[10px] text-[var(--text-secondary)] whitespace-nowrap">件 共</span>
                                                            <div className="relative flex-1">
                                                                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] font-bold font-mono text-[10px]">$</span>
                                                                <input
                                                                    type="number"
                                                                    className="input-field text-xs pl-6 p-2 w-full"
                                                                    placeholder="組合總價"
                                                                    disabled={!product.has_volume_pricing}
                                                                    value={product.volume_pricing_settings?.package_price || ''}
                                                                    onChange={(e) => {
                                                                        const settings = { ...(product.volume_pricing_settings || {}), package_price: e.target.value !== '' ? Number(e.target.value) : 0 };
                                                                        handleFieldChange(product.id, 'volume_pricing_settings', settings);
                                                                    }}
                                                                    onBlur={(e) => {
                                                                        const settings = { ...(product.volume_pricing_settings || {}), package_price: e.target.value !== '' ? Number(e.target.value) : 0 };
                                                                        handleSaveProduct(product.id, { volume_pricing_settings: settings });
                                                                    }}
                                                                />
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>


                                            {/* 3. 第二大組：🤖 AI 自動領貨參數設定 */}
                                            <div className="bg-[var(--bg-primary)] rounded-2xl p-5 border border-[var(--border-primary)] text-xs flex flex-col gap-4 shadow-inner">
                                                <div className="flex items-center gap-1.5 pb-2 border-b border-[var(--border-primary)]">
                                                    <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                                                    <span className="text-xs uppercase font-extrabold text-blue-600 dark:text-blue-400 tracking-wider">🤖 AI 領貨補貨進階配置參數</span>
                                                </div>
                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                                    {/* AI 包裝與發貨階梯 */}
                                                    <div className="flex flex-col gap-2">
                                                        <span className="text-xs md:text-sm font-semibold text-[var(--text-primary)]">📦 發貨包裝與階梯</span>
                                                        <div className="grid grid-cols-2 gap-2">
                                                            <div className="flex flex-col gap-1">
                                                                <span className="text-[11px] md:text-xs text-[var(--text-secondary)] font-medium">整箱包裝數 (一箱)</span>
                                                                <input
                                                                    type="number"
                                                                    className="input-field text-xs p-2"
                                                                    placeholder="例：24"
                                                                    value={product.packSize === '' || product.packSize === undefined || product.packSize === null || product.packSize === 1 ? '' : product.packSize}
                                                                    onChange={(e) => handleFieldChange(product.id, 'packSize', e.target.value !== '' ? Number(e.target.value) : '')}
                                                                    onBlur={(e) => handleSaveProduct(product.id, { packSize: e.target.value !== '' ? Number(e.target.value) : 1 })}
                                                                />
                                                            </div>
                                                            <div className="flex flex-col gap-1">
                                                                <span className="text-[11px] md:text-xs text-[var(--text-secondary)] font-medium">發貨階梯 (逗號分隔)</span>
                                                                <input
                                                                    type="text"
                                                                    className="input-field text-xs p-2 font-mono"
                                                                    placeholder="例：24, 48, 72"
                                                                    value={Array.isArray(product.dispatchSteps) ? product.dispatchSteps.join(', ') : product.dispatchSteps || ''}
                                                                    onChange={(e) => handleFieldChange(product.id, 'dispatchSteps', e.target.value)}
                                                                    onBlur={(e) => handleSaveProduct(product.id, { dispatchSteps: e.target.value })}
                                                                />
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* 進位門檻與上限 */}
                                                    <div className="flex flex-col gap-2">
                                                        <span className="text-xs md:text-sm font-semibold text-[var(--text-primary)]">⚖️ 進位門檻與數量上限</span>
                                                        <div className="grid grid-cols-2 gap-2">
                                                            <div className="flex flex-col gap-1">
                                                                <span className="text-[11px] md:text-xs text-[var(--text-secondary)] font-medium">門檻 (尾數多於此即進箱)</span>
                                                                <input
                                                                    type="number"
                                                                    className="input-field text-xs p-2 text-center"
                                                                    placeholder="例：5"
                                                                    value={product.roundThreshold === '' || product.roundThreshold === undefined || product.roundThreshold === null || product.roundThreshold === 99 ? '' : product.roundThreshold}
                                                                    onChange={(e) => handleFieldChange(product.id, 'roundThreshold', e.target.value !== '' ? Number(e.target.value) : '')}
                                                                    onBlur={(e) => handleSaveProduct(product.id, { roundThreshold: e.target.value !== '' ? Number(e.target.value) : 99 })}
                                                                />
                                                            </div>
                                                            <div className="flex flex-col gap-1">
                                                                <span className="text-[11px] md:text-xs text-[var(--text-secondary)] font-medium">最大建議量 (0為無限制)</span>
                                                                <input
                                                                    type="number"
                                                                    className="input-field text-xs p-2 text-center"
                                                                    placeholder="無"
                                                                    value={product.maxSuggestion === '' || product.maxSuggestion === undefined || product.maxSuggestion === null || product.maxSuggestion === 0 ? '' : product.maxSuggestion}
                                                                    onChange={(e) => handleFieldChange(product.id, 'maxSuggestion', e.target.value !== '' ? Number(e.target.value) : '')}
                                                                    onBlur={(e) => handleSaveProduct(product.id, { maxSuggestion: e.target.value !== '' ? Number(e.target.value) : 0 })}
                                                                />
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* 智慧領貨抑制 */}
                                                    <div className="flex flex-col gap-2 md:pl-4 md:border-l border-[var(--border-primary)]/50">
                                                        <div className="flex justify-between items-center">
                                                            <span className="text-xs md:text-sm font-semibold text-[var(--text-primary)]">🧠 智慧散貨抑制</span>
                                                            <label className="relative inline-flex items-center cursor-pointer">
                                                                <input
                                                                    type="checkbox"
                                                                    className="sr-only peer"
                                                                    checked={!!product.autoSuppress}
                                                                    onChange={(e) => {
                                                                        handleFieldChange(product.id, 'autoSuppress', e.target.checked);
                                                                        handleSaveProduct(product.id, { autoSuppress: e.target.checked });
                                                                    }}
                                                                />
                                                                <div className="w-9 h-5 bg-gray-200 dark:bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                                                            </label>
                                                        </div>
                                                        <p className="text-xs text-[var(--text-secondary)] font-medium leading-relaxed mt-1">
                                                            啟用後，若預估需求過低，且車上剩餘量已過半箱，AI 會自動將領貨量歸零，避免出車只為領取極少量的散貨。
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
