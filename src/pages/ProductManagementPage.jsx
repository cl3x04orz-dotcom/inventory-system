import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Package, Search, RefreshCw, Save, Image, Edit2, ChevronDown, ChevronUp, Check, AlertCircle, Store, Barcode, DollarSign, TrendingUp, Zap, X, ScanLine, AlertTriangle, Clock, ShieldAlert, Trash2 } from 'lucide-react';
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
    const [communities, setCommunities] = useState([]); // [{ communityId, communityName }]
    const [activeTabs, setActiveTabs] = useState({}); // { [productId]: 'basic' | 'promo' | 'community' | 'ai' }

    // ── 效期預警彈窗 (低於 7 天) State ──────────────────────────────
    const [showExpiryModal, setShowExpiryModal] = useState(false);
    const [dontRemindToday, setDontRemindToday] = useState(false);

    // 計算距離效期剩餘天數
    const getDaysLeft = useCallback((expiryDateStr) => {
        if (!expiryDateStr) return null;
        const parts = String(expiryDateStr).trim().split(/[-/]/);
        if (parts.length < 3) return null;
        const expiry = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        expiry.setHours(0, 0, 0, 0);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const diffTime = expiry.getTime() - today.getTime();
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }, []);

    // 篩選出所有效期低於等於 7 天的商品
    const expiringProducts = useMemo(() => {
        return products.filter(p => {
            if (!p.expiryDate) return false;
            const daysLeft = getDaysLeft(p.expiryDate);
            return daysLeft !== null && daysLeft <= 7;
        });
    }, [products, getDaysLeft]);

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
            // 同時拉取開團大樓 (getBuildingSettings) 與社區清單 (getCommunities)，確保與「開團管理」100% 同步
            Promise.all([
                callGAS(apiUrl, 'getBuildingSettings', {}, user.token).catch(() => []),
                callGAS(apiUrl, 'getCommunities', {}, user.token).catch(() => [])
            ]).then(([buildingsData, communitiesData]) => {
                const combined = [];
                const seen = new Set();
                
                if (Array.isArray(buildingsData)) {
                    buildingsData.forEach(b => {
                        const name = b.building || b.communityName;
                        if (name && !seen.has(name)) {
                            seen.add(name);
                            combined.push({
                                communityId: b.community_id || b.communityId || name,
                                communityName: name,
                                status: b.status || 'ACTIVE'
                            });
                        }
                    });
                }
                
                if (Array.isArray(communitiesData)) {
                    communitiesData.forEach(c => {
                        const name = c.communityName || c.CommunityName;
                        const id = c.communityId || c.CommunityId || name;
                        if (name && !seen.has(name)) {
                            seen.add(name);
                            combined.push({
                                communityId: id,
                                communityName: name,
                                status: c.status || 'ACTIVE'
                            });
                        }
                    });
                }
                
                setCommunities(combined);
            });
        }
    }, [user.token, fetchProducts, apiUrl]);

    // 當商品載入完成且有低於 7 天效期商品時，自動跳出預警彈窗 (若當日未被選擇不再提醒)
    useEffect(() => {
        if (!loading && products.length > 0) {
            const todayStr = new Date().toISOString().split('T')[0];
            const dismissedKey = `expiry_alert_dismissed_${todayStr}`;
            const isDismissedToday = localStorage.getItem(dismissedKey) === 'true';

            const hasExpiring = products.some(p => {
                if (!p.expiryDate) return false;
                const days = getDaysLeft(p.expiryDate);
                return days !== null && days <= 7;
            });

            if (hasExpiring && !isDismissedToday) {
                setShowExpiryModal(true);
            }
        }
    }, [loading, products, getDaysLeft]);

    const handleCloseExpiryModal = () => {
        if (dontRemindToday) {
            const todayStr = new Date().toISOString().split('T')[0];
            const dismissedKey = `expiry_alert_dismissed_${todayStr}`;
            localStorage.setItem(dismissedKey, 'true');
        }
        setShowExpiryModal(false);
    };

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
                capacity: mergedProduct.capacity !== undefined ? String(mergedProduct.capacity).trim() : '',
                expiryDate: mergedProduct.expiryDate,
                has_flavor_attributes: mergedProduct.has_flavor_attributes,
                flavor_choices: parsedFlavors,
                single_price: mergedProduct.single_price,
                has_volume_pricing: mergedProduct.has_volume_pricing,
                volume_pricing_settings: mergedProduct.volume_pricing_settings,
                price: mergedProduct.price,
                isBundle: mergedProduct.isBundle,
                bundleSize: mergedProduct.bundleSize !== undefined ? Number(mergedProduct.bundleSize) : 1,
                maxTotalQty: (mergedProduct.maxTotalQty !== undefined && mergedProduct.maxTotalQty !== '' && mergedProduct.maxTotalQty !== null) ? Number(mergedProduct.maxTotalQty) : null,
                allowedCommunityIds: Array.isArray(mergedProduct.allowedCommunityIds) ? mergedProduct.allowedCommunityIds : [],
                communityQuotas: mergedProduct.communityQuotas || {},
                
                packSize: Number(mergedProduct.packSize || 1),
                dispatchSteps: parsedSteps,
                roundThreshold: (mergedProduct.roundThreshold !== undefined && mergedProduct.roundThreshold !== '' && mergedProduct.roundThreshold !== null) ? Number(mergedProduct.roundThreshold) : null,
                autoSuppress: Boolean(mergedProduct.autoSuppress),
                maxSuggestion: Number(mergedProduct.maxSuggestion || 0),
                stopPickupThreshold: (mergedProduct.stopPickupThreshold !== undefined && mergedProduct.stopPickupThreshold !== '' && mergedProduct.stopPickupThreshold !== null) ? Number(mergedProduct.stopPickupThreshold) : null,
                posSettings: mergedProduct.posSettings,
                barcodes: mergedProduct.barcodes || []
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

        const isOnline = p.isActive === true || p.isActive === 'true' || p.isActive === 1 || p.isActive === '1';

        if (stockFilter === 'ONLINE') {
            if (!isOnline) return false;
        } else if (stockFilter === 'OFFLINE') {
            if (isOnline) return false;
        } else if (stockFilter === 'HAS_STOCK') {
            const qty = stockMap[p.name] || 0;
            if (qty <= 0) return false;
        } else if (stockFilter === 'NO_STOCK') {
            const qty = stockMap[p.name] || 0;
            if (qty > 0) return false;
        }

        return true;
    });

    return (
        <div className="max-w-6xl mx-auto h-[calc(100vh-6rem)] flex flex-col p-4 gap-4">
            {/* Header Area */}
            <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center bg-[var(--bg-secondary)] p-4 rounded-xl border border-[var(--border-primary)] shadow-sm gap-3">
                <h2 className="text-xl md:text-2xl font-bold flex items-center gap-2 text-[var(--text-primary)]">
                    <Package className="text-blue-600" />
                    商品屬性
                </h2>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full sm:w-auto">
                    {/* Style A Custom Dropdown Selector */}
                    <div className="relative w-full sm:w-44">
                        <Package size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                        <select
                            value={stockFilter}
                            onChange={(e) => setStockFilter(e.target.value)}
                            className="w-full appearance-none pl-9 pr-8 py-2 text-xs font-bold rounded-xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] text-[var(--text-primary)] focus:outline-none focus:border-blue-500 hover:border-blue-300 transition-all cursor-pointer shadow-sm"
                        >
                            <option value="ALL">📦 顯示全部商品</option>
                            <option value="ONLINE">🟢 已上架</option>
                            <option value="OFFLINE">🔴 已下架</option>
                            <option value="HAS_STOCK">🟢 只看有庫存</option>
                            <option value="NO_STOCK">🔴 只看無庫存</option>
                        </select>
                        <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    </div>

                    <div className="flex items-center gap-2 flex-1 w-full sm:w-auto">
                        <div className="relative flex-1 sm:w-64">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" size={16} />
                            <input
                                type="text"
                                placeholder="搜尋商品名稱或ID..."
                                className="input-field pl-9 py-2 text-xs w-full"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>
                        <button onClick={fetchProducts} className="btn-secondary p-2 rounded-xl shrink-0" title="重新整理">
                            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                        </button>
                    </div>
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
                                <div key={product.id} className={`flex flex-col rounded-2xl border transition-all duration-300 bg-[var(--bg-secondary)] shadow-sm overflow-hidden ${
                                    isExpanded 
                                        ? 'border-[var(--border-primary)] shadow-md' 
                                        : 'border-[var(--border-primary)] hover:border-[var(--border-primary)]/80 hover:shadow-md'
                                }`}>
                                    {/* 1. 商品標頭：主圖與基本資訊（點擊整張卡片切換展開/折疊） */}
                                    <div 
                                        onClick={() => toggleExpand(product.id)}
                                        className="flex items-center gap-3 md:gap-4 p-4 md:p-5 hover:bg-[var(--bg-tertiary)]/20 transition-all rounded-t-2xl cursor-pointer select-none"
                                    >
                                        {/* 商品大圖 */}
                                        <div 
                                            className="w-14 h-14 md:w-16 md:h-16 rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-tertiary)] overflow-hidden flex items-center justify-center flex-shrink-0 shadow-inner"
                                        >
                                            {product.imageUrl ? (
                                                <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" onError={(e) => { e.target.onerror = null; e.target.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'; }} />
                                            ) : (
                                                <Image size={22} className="text-[var(--text-tertiary)]" />
                                            )}
                                        </div>
                                         {/* 名稱與ID */}
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="font-extrabold text-base md:text-lg text-[var(--text-primary)] truncate">
                                                    {product.name}
                                                </div>
                                                
                                                {/* 上架開關 (商品名稱同列最右側靠右對齊) */}
                                                <div className="flex items-center gap-1.5 bg-[var(--bg-tertiary)] px-2 py-0.5 rounded-lg border border-[var(--border-primary)] shadow-2xs" onClick={(e) => e.stopPropagation()}>
                                                    <span className={`text-[11px] font-bold whitespace-nowrap ${product.isActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>
                                                        {product.isActive ? '🌐 網購上架' : '❌ 網購下架'}
                                                    </span>
                                                    <label className="relative inline-flex items-center cursor-pointer">
                                                        <input
                                                            type="checkbox"
                                                            className="sr-only peer"
                                                            checked={!!product.isActive}
                                                            onChange={(e) => {
                                                                handleFieldChange(product.id, 'isActive', e.target.checked);
                                                                handleSaveProduct(product.id, { isActive: e.target.checked });
                                                            }}
                                                        />
                                                        <div className="w-7 h-4 bg-gray-200 dark:bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-blue-600"></div>
                                                    </label>
                                                </div>
                                            </div>
                                            <div className="text-[11px] text-[var(--text-tertiary)] font-mono mt-0.5 flex items-center gap-1.5">
                                                <span className="bg-[var(--bg-tertiary)] px-1.5 py-0.2 rounded border border-[var(--border-primary)] text-[10px]">ID</span> 
                                                <span className="truncate max-w-[120px] md:max-w-none">{product.id}</span>
                                            </div>
                                            <div className="text-xs font-bold text-blue-600 mt-1 flex flex-wrap items-center gap-2 md:gap-3">
                                                <span>銷售原價：<span className="font-mono text-sm text-[var(--text-primary)] font-bold">${product.single_price || '-'}</span></span>
                                                <span className="h-3 w-[1px] bg-slate-300 dark:bg-slate-700 hidden sm:inline" />
                                                <span>庫存成本(進價)：<span className="font-mono text-sm text-amber-600">${product.price || '-'}</span></span>
                                                <span className="h-3 w-[1px] bg-slate-300 dark:bg-slate-700 hidden sm:inline" />
                                                <span>當前庫存：<span className={`font-mono text-sm ${ (stockMap[product.name] || 0) > 0 ? 'text-emerald-600 font-extrabold' : 'text-slate-400' }`}>{stockMap[product.name] || 0}</span></span>
                                                
                                                {/* 📅 有效日期 + 儲存狀態 */}
                                                <span className="h-3 w-[1px] bg-slate-300 dark:bg-slate-700 hidden sm:inline" />
                                                <span className="inline-flex flex-wrap items-center gap-1.5 text-[var(--text-secondary)] font-medium max-w-full" onClick={(e) => e.stopPropagation()}>
                                                    <span className="whitespace-nowrap shrink-0">有效日期：</span>
                                                    <input
                                                        type="date"
                                                        className="input-field text-[11px] sm:text-xs px-1.5 py-0.5 w-[125px] sm:w-[132px] font-semibold bg-[var(--bg-primary)] border-[var(--border-primary)] rounded-lg text-[var(--text-primary)] shrink-0"
                                                        value={product.expiryDate || ''}
                                                        onChange={(e) => {
                                                            const val = e.target.value || '';
                                                            handleFieldChange(product.id, 'expiryDate', val);
                                                            handleSaveProduct(product.id, { isActive: product.isActive, expiryDate: val });
                                                        }}
                                                    />
                                                    {product.expiryDate && (
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                handleFieldChange(product.id, 'expiryDate', '');
                                                                handleSaveProduct(product.id, { expiryDate: '' });
                                                            }}
                                                            className="text-[10px] text-rose-500 hover:text-rose-700 font-bold px-1 rounded hover:bg-rose-50 cursor-pointer whitespace-nowrap shrink-0"
                                                            title="清除日期 (設為無日期)"
                                                        >
                                                            ✕ 清除
                                                        </button>
                                                    )}

                                                    {/* 自動儲存狀態 */}
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
                                                </span>

                                                {product.maxTotalQty !== null && product.maxTotalQty !== undefined && (
                                                    <>
                                                        <span className="h-3 w-[1px] bg-slate-300 dark:bg-slate-700 hidden sm:inline" />
                                                        <span className="text-purple-600 dark:text-purple-400 font-extrabold">活動限額：<span className="font-mono text-sm">{product.soldQty || 0} / {product.maxTotalQty}</span> (剩餘 {Math.max(0, Number(product.maxTotalQty) - Number(product.soldQty || 0))})</span>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* 展開的詳細欄位 (頁籤分類分流) */}
                                    {isExpanded && (() => {
                                        const currentTab = activeTabs[product.id] || 'basic';
                                        const setTab = (tabName) => setActiveTabs(prev => ({ ...prev, [product.id]: tabName }));

                                        return (
                                            <div className="p-4 sm:p-5 border-t border-[var(--border-primary)]/40 flex flex-col gap-4 animate-slide-down bg-[var(--bg-secondary)]/30" onClick={(e) => e.stopPropagation()}>
                                                {/* 📍 頁籤分類列 (Tab Bar) */}
                                                <div className="flex items-center gap-1.5 p-1 bg-[var(--bg-tertiary)] rounded-xl border border-[var(--border-primary)] overflow-x-auto no-scrollbar">
                                                    <button
                                                        type="button"
                                                        onClick={() => setTab('basic')}
                                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
                                                            currentTab === 'basic'
                                                                ? 'bg-[var(--bg-secondary)] text-blue-600 dark:text-blue-400 shadow-xs border border-blue-500/20'
                                                                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                                                        }`}
                                                    >
                                                        📌 基本規格與價格
                                                    </button>

                                                    <button
                                                        type="button"
                                                        onClick={() => setTab('promo')}
                                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
                                                            currentTab === 'promo'
                                                                ? 'bg-[var(--bg-secondary)] text-emerald-600 dark:text-emerald-400 shadow-xs border border-emerald-500/20'
                                                                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                                                        }`}
                                                    >
                                                        🎁 活動與多規格
                                                    </button>

                                                    <button
                                                        type="button"
                                                        onClick={() => setTab('community')}
                                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
                                                            currentTab === 'community'
                                                                ? 'bg-[var(--bg-secondary)] text-purple-600 dark:text-purple-400 shadow-xs border border-purple-500/20'
                                                                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                                                        }`}
                                                    >
                                                        🏠 開放社區與配額
                                                    </button>

                                                    <button
                                                        type="button"
                                                        onClick={() => setTab('pos')}
                                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
                                                            currentTab === 'pos'
                                                                ? 'bg-[var(--bg-secondary)] text-indigo-600 dark:text-indigo-400 shadow-xs border border-indigo-500/20'
                                                                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                                                        }`}
                                                    >
                                                        🏪 門市 POS 設定
                                                    </button>

                                                    <button
                                                        type="button"
                                                        onClick={() => setTab('ai')}
                                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
                                                            currentTab === 'ai'
                                                                ? 'bg-[var(--bg-secondary)] text-amber-600 dark:text-amber-400 shadow-xs border border-amber-500/20'
                                                                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                                                        }`}
                                                    >
                                                        🤖 AI 補貨參數
                                                    </button>
                                                </div>

                                                {/* ------------------------------------------------------------- */}
                                                {/* 📌 TAB 1：基本規格與價格 */}
                                                {/* ------------------------------------------------------------- */}
                                                {currentTab === 'basic' && (
                                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-xs animate-fade-in">
                                                        {/* 圖片網址 */}
                                                        <div className="flex flex-col gap-1.5 bg-[var(--bg-tertiary)]/30 p-3 rounded-xl border border-[var(--border-primary)]/50">
                                                            <span className="text-[10px] uppercase font-extrabold text-[var(--text-secondary)] tracking-wider">圖片網址</span>
                                                            <input
                                                                type="text"
                                                                className="input-field text-xs p-2"
                                                                placeholder="輸入圖片網址 https://..."
                                                                value={product.imageUrl || ''}
                                                                onChange={(e) => handleFieldChange(product.id, 'imageUrl', e.target.value)}
                                                                onBlur={(e) => handleSaveProduct(product.id, { imageUrl: e.target.value })}
                                                            />
                                                        </div>

                                                        {/* 商品容量 / 規格 */}
                                                        <div className="flex flex-col gap-1.5 bg-[var(--bg-tertiary)]/30 p-3 rounded-xl border border-[var(--border-primary)]/50">
                                                            <span className="text-[10px] uppercase font-extrabold text-[var(--text-secondary)] tracking-wider">容量 / 規格</span>
                                                            <input
                                                                type="text"
                                                                className="input-field text-xs p-2 font-bold"
                                                                placeholder="例：936ml、360g、6入/盒"
                                                                value={product.capacity || ''}
                                                                onChange={(e) => handleFieldChange(product.id, 'capacity', e.target.value)}
                                                                onBlur={(e) => handleSaveProduct(product.id, { capacity: e.target.value })}
                                                            />
                                                        </div>

                                                        {/* 商品分類 */}
                                                        <div className="flex flex-col gap-1.5 bg-[var(--bg-tertiary)]/30 p-3 rounded-xl border border-[var(--border-primary)]/50">
                                                            <span className="text-[10px] uppercase font-extrabold text-[var(--text-secondary)] tracking-wider">商品分類</span>
                                                            <input
                                                                type="text"
                                                                className="input-field text-xs p-2"
                                                                placeholder="例：乳飲品、燕麥系列"
                                                                value={product.category || ''}
                                                                onChange={(e) => handleFieldChange(product.id, 'category', e.target.value)}
                                                                onBlur={(e) => handleSaveProduct(product.id, { category: e.target.value })}
                                                            />
                                                        </div>

                                                        {/* 庫存成本 (進價) */}
                                                        <div className="flex flex-col gap-1.5 bg-[var(--bg-tertiary)]/30 p-3 rounded-xl border border-[var(--border-primary)]/50">
                                                            <span className="text-[10px] uppercase font-extrabold text-[var(--text-secondary)] tracking-wider">庫存成本 (進價)</span>
                                                            <div className="relative">
                                                                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] font-bold font-mono text-xs">$</span>
                                                                <input
                                                                    type="number"
                                                                    className="input-field text-xs pl-6 p-2 w-full font-mono font-bold"
                                                                    placeholder="進價成本"
                                                                    value={product.price || ''}
                                                                    onChange={(e) => handleFieldChange(product.id, 'price', e.target.value !== '' ? Number(e.target.value) : '')}
                                                                    onBlur={(e) => handleSaveProduct(product.id, { price: e.target.value !== '' ? Number(e.target.value) : '' })}
                                                                />
                                                            </div>
                                                        </div>

                                                        {/* 銷售原價 */}
                                                        <div className="flex flex-col gap-1.5 bg-[var(--bg-tertiary)]/30 p-3 rounded-xl border border-[var(--border-primary)]/50">
                                                            <span className="text-[10px] uppercase font-extrabold text-[var(--text-secondary)] tracking-wider">銷售原價</span>
                                                            <div className="relative">
                                                                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] font-bold font-mono text-xs">$</span>
                                                                <input
                                                                    type="number"
                                                                    className="input-field text-xs pl-6 p-2 w-full font-mono font-bold"
                                                                    placeholder="銷售原價"
                                                                    value={product.single_price || ''}
                                                                    onChange={(e) => handleFieldChange(product.id, 'single_price', e.target.value !== '' ? Number(e.target.value) : '')}
                                                                    onBlur={(e) => handleSaveProduct(product.id, { single_price: e.target.value !== '' ? Number(e.target.value) : '' })}
                                                                />
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* ------------------------------------------------------------- */}
                                                {/* 🎁 TAB 2：活動與多規格 */}
                                                {/* ------------------------------------------------------------- */}
                                                {currentTab === 'promo' && (
                                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-xs animate-fade-in">
                                                        {/* 多規格口味 */}
                                                        <div className="flex flex-col gap-2 bg-[var(--bg-tertiary)]/30 p-3 rounded-xl border border-[var(--border-primary)]/50">
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
                                                                    <div className="w-8 h-4 bg-gray-200 dark:bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-blue-500"></div>
                                                                </label>
                                                            </div>
                                                            <input
                                                                type="text"
                                                                className="input-field text-xs p-2"
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
                                                        <div className="flex flex-col gap-2 bg-[var(--bg-tertiary)]/30 p-3 rounded-xl border border-[var(--border-primary)]/50">
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
                                                                    <div className="w-8 h-4 bg-gray-200 dark:bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-blue-500"></div>
                                                                </label>
                                                            </div>
                                                            <input
                                                                type="number"
                                                                className="input-field text-xs p-2 mt-auto font-mono"
                                                                placeholder="捆裝數量，例：4 (四入一組)"
                                                                disabled={!product.isBundle}
                                                                value={product.bundleSize === '' || product.bundleSize === undefined || product.bundleSize === null ? '' : product.bundleSize}
                                                                onChange={(e) => handleFieldChange(product.id, 'bundleSize', e.target.value !== '' ? Number(e.target.value) : '')}
                                                                onBlur={(e) => handleSaveProduct(product.id, { bundleSize: e.target.value !== '' ? Number(e.target.value) : 1 })}
                                                            />
                                                        </div>

                                                        {/* 最大販售上限 (活動總限量) */}
                                                        <div className="flex flex-col gap-2 bg-[var(--bg-tertiary)]/30 p-3 rounded-xl border border-[var(--border-primary)]/50">
                                                            <span className="text-[10px] uppercase font-extrabold text-[var(--text-secondary)] tracking-wider">活動總限量上限</span>
                                                            <input
                                                                type="number"
                                                                min="1"
                                                                className="input-field text-xs p-2 mt-auto font-mono"
                                                                placeholder="例：100 (留空代表無上限)"
                                                                value={product.maxTotalQty === '' || product.maxTotalQty === undefined || product.maxTotalQty === null ? '' : product.maxTotalQty}
                                                                onChange={(e) => handleFieldChange(product.id, 'maxTotalQty', e.target.value !== '' ? Number(e.target.value) : '')}
                                                                onBlur={(e) => {
                                                                    const newQty = e.target.value !== '' ? Number(e.target.value) : null;
                                                                    if (newQty === null) {
                                                                        handleFieldChange(product.id, 'allowedCommunityIds', []);
                                                                    }
                                                                    handleSaveProduct(product.id, {
                                                                        maxTotalQty: newQty,
                                                                        allowedCommunityIds: newQty === null ? [] : (product.allowedCommunityIds || [])
                                                                    });
                                                                }}
                                                            />
                                                        </div>

                                                        {/* 滿件特惠 (階梯組合價) */}
                                                        <div className="lg:col-span-4 flex flex-col gap-2.5 bg-[var(--bg-tertiary)]/30 p-3 rounded-xl border border-[var(--border-primary)]/50">
                                                            <div className="flex justify-between items-center">
                                                                <span className="text-[10px] uppercase font-extrabold text-[var(--text-secondary)] tracking-wider">滿件特惠設定</span>
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
                                                                    <div className="w-8 h-4 bg-gray-200 dark:bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-blue-500"></div>
                                                                </label>
                                                            </div>

                                                            <div className={`flex flex-col gap-1 ${!product.has_volume_pricing ? 'opacity-40 pointer-events-none select-none' : ''}`}>
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-xs text-[var(--text-secondary)] whitespace-nowrap font-bold">滿</span>
                                                                    <input
                                                                        type="number"
                                                                        className="input-field text-xs p-2 w-20 text-center font-mono font-bold"
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
                                                                    <span className="text-xs text-[var(--text-secondary)] whitespace-nowrap font-bold">件，優惠總價 共 $</span>
                                                                    <div className="relative flex-1 max-w-[180px]">
                                                                        <input
                                                                            type="number"
                                                                            className="input-field text-xs p-2 w-full font-mono font-bold"
                                                                            placeholder="組合特價"
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
                                                )}

                                                {/* ------------------------------------------------------------- */}
                                                {/* 🏠 TAB 3：開放社區與配額 */}
                                                {/* ------------------------------------------------------------- */}
                                                {currentTab === 'community' && (
                                                    <div className="flex flex-col gap-4 text-xs animate-fade-in">
                                                        {/* 開放社區白名單 */}
                                                        {communities.length > 0 && (() => {
                                                            const hiddenBuildings = (() => {
                                                                try {
                                                                    const saved = localStorage.getItem('admin_hidden_buildings');
                                                                    return saved ? JSON.parse(saved) : [];
                                                                } catch (e) {
                                                                    return [];
                                                                }
                                                            })();

                                                            const visibleCommunities = communities.filter(c => {
                                                                const cid = c.communityId || c.CommunityId;
                                                                const cname = c.communityName || c.CommunityName;
                                                                if (c.status && c.status !== 'ACTIVE') return false;
                                                                if (hiddenBuildings.includes(cname) || hiddenBuildings.includes(cid)) return false;
                                                                return true;
                                                            });

                                                            if (visibleCommunities.length === 0) return <div className="text-[var(--text-tertiary)] py-4 text-center">無可用社區清單</div>;

                                                            const quotas = product.communityQuotas || {};

                                                            return (
                                                                <>
                                                                    {/* 開放社區白名單 */}
                                                                    <div className="flex flex-col gap-2 bg-[var(--bg-tertiary)]/30 p-3.5 rounded-xl border border-purple-400/30">
                                                                        <div className="flex justify-between items-center">
                                                                            <span className="text-[10px] uppercase font-extrabold text-purple-500 tracking-wider">🏠 開放社區（未選擇代表全區開放）</span>
                                                                            {(product.allowedCommunityIds || []).length > 0 && (
                                                                                <button
                                                                                    className="text-[10px] text-red-400 hover:text-red-600 font-bold cursor-pointer"
                                                                                    onClick={() => {
                                                                                        handleFieldChange(product.id, 'allowedCommunityIds', []);
                                                                                        handleSaveProduct(product.id, { allowedCommunityIds: [] });
                                                                                    }}
                                                                                >
                                                                                    清除全部
                                                                                </button>
                                                                            )}
                                                                        </div>
                                                                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-40 overflow-y-auto pr-1">
                                                                            {visibleCommunities.map(c => {
                                                                                const ids = product.allowedCommunityIds || [];
                                                                                const cid = c.communityId || c.CommunityId;
                                                                                const cname = c.communityName || c.CommunityName;
                                                                                const checked = ids.includes(cid) || ids.includes(cname);
                                                                                return (
                                                                                    <label key={cid || cname} className="flex items-center gap-2 cursor-pointer group p-1 rounded hover:bg-[var(--bg-tertiary)]">
                                                                                        <input
                                                                                            type="checkbox"
                                                                                            checked={checked}
                                                                                            className="w-3.5 h-3.5 accent-purple-500 cursor-pointer"
                                                                                            onChange={(e) => {
                                                                                                const next = new Set(ids);
                                                                                                if (e.target.checked) {
                                                                                                    next.add(cid);
                                                                                                } else {
                                                                                                    next.delete(cid);
                                                                                                    next.delete(cname);
                                                                                                }
                                                                                                const newIds = [...next];
                                                                                                handleFieldChange(product.id, 'allowedCommunityIds', newIds);
                                                                                                handleSaveProduct(product.id, { allowedCommunityIds: newIds });
                                                                                            }}
                                                                                        />
                                                                                        <span className="text-xs text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors truncate">{cname}</span>
                                                                                    </label>
                                                                                );
                                                                            })}
                                                                        </div>
                                                                    </div>

                                                                    {/* 社區獨家限量配額 */}
                                                                    <div className="flex flex-col gap-2.5 bg-gradient-to-r from-amber-500/5 via-purple-500/5 to-amber-500/5 p-3.5 rounded-xl border border-amber-400/30">
                                                                        <div className="flex justify-between items-center">
                                                                            <span className="text-xs uppercase font-extrabold text-amber-600 dark:text-amber-400 tracking-wider flex items-center gap-1.5">
                                                                                🔥 社區獨家搶購配額 (未填寫代表不設上限)
                                                                            </span>
                                                                            {Object.keys(quotas).length > 0 && (
                                                                                <button
                                                                                    className="text-[10px] text-red-400 hover:text-red-600 font-bold cursor-pointer"
                                                                                    onClick={() => {
                                                                                        handleFieldChange(product.id, 'communityQuotas', {});
                                                                                        handleSaveProduct(product.id, { communityQuotas: {} });
                                                                                    }}
                                                                                >
                                                                                    清除所有社區配額
                                                                                </button>
                                                                            )}
                                                                        </div>
                                                                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 max-h-56 overflow-y-auto pr-1">
                                                                            {visibleCommunities.map(c => {
                                                                                const cid = c.communityId || c.CommunityId;
                                                                                const cname = c.communityName || c.CommunityName;
                                                                                const qObj = quotas[cid] || quotas[cname] || {};
                                                                                const maxQtyVal = qObj.maxQty !== undefined && qObj.maxQty !== null ? qObj.maxQty : '';
                                                                                const soldQtyVal = qObj.soldQty || 0;

                                                                                return (
                                                                                    <div key={cid || cname} className="flex flex-col gap-1 p-2 bg-[var(--bg-secondary)] border border-[var(--border-primary)]/70 rounded-lg shadow-2xs">
                                                                                        <div className="flex justify-between items-center">
                                                                                            <span className="text-xs font-bold text-[var(--text-primary)] truncate">{cname}</span>
                                                                                            {maxQtyVal !== '' && (
                                                                                                <span className="text-[10px] text-purple-600 dark:text-purple-400 font-bold shrink-0">
                                                                                                    已售 {soldQtyVal}
                                                                                                </span>
                                                                                            )}
                                                                                        </div>
                                                                                        <input
                                                                                            type="number"
                                                                                            min="1"
                                                                                            placeholder="無限制"
                                                                                            className="input-field text-xs p-1.5 w-full font-mono mt-0.5"
                                                                                            value={maxQtyVal}
                                                                                            onChange={(e) => {
                                                                                                const val = e.target.value !== '' ? Number(e.target.value) : '';
                                                                                                const nextQuotas = { ...(product.communityQuotas || {}) };
                                                                                                if (val === '' || val === null) {
                                                                                                    delete nextQuotas[cid];
                                                                                                    delete nextQuotas[cname];
                                                                                                } else {
                                                                                                    nextQuotas[cid] = {
                                                                                                        maxQty: Number(val),
                                                                                                        soldQty: soldQtyVal
                                                                                                    };
                                                                                                }
                                                                                                handleFieldChange(product.id, 'communityQuotas', nextQuotas);
                                                                                            }}
                                                                                            onBlur={() => {
                                                                                                handleSaveProduct(product.id, { communityQuotas: product.communityQuotas || {} });
                                                                                            }}
                                                                                        />
                                                                                    </div>
                                                                                );
                                                                            })}
                                                                        </div>
                                                                    </div>
                                                                </>
                                                            );
                                                        })()}
                                                    </div>
                                                )}

                                                {/* ------------------------------------------------------------- */}
                                                {/* 🏪 TAB 5：門市 POS 設定 */}
                                                {/* ------------------------------------------------------------- */}
                                                {currentTab === 'pos' && (
                                                    <div className="bg-[var(--bg-primary)] rounded-2xl p-4 md:p-5 border border-[var(--border-primary)] text-xs flex flex-col gap-5 animate-fade-in shadow-inner">
                                                        <div className="flex items-center gap-2 pb-3 border-b border-[var(--border-primary)]/50">
                                                            <div className="p-1.5 bg-indigo-500/10 rounded-lg text-indigo-600 dark:text-indigo-400">
                                                                <Store size={18} />
                                                            </div>
                                                            <span className="text-sm font-extrabold text-indigo-600 dark:text-indigo-400 tracking-wider">門市 POS 獨立設定</span>
                                                            <div className="flex-1"></div>
                                                            <div className="flex items-center gap-2 bg-[var(--bg-tertiary)] px-3 py-1.5 rounded-lg border border-[var(--border-primary)]">
                                                                <span className={`text-xs font-bold whitespace-nowrap ${product.posSettings?.isActive !== false ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'}`}>
                                                                    {product.posSettings?.isActive !== false ? '✅ POS 已啟用' : '❌ POS 已停用'}
                                                                </span>
                                                                <label className="relative inline-flex items-center cursor-pointer">
                                                                    <input
                                                                        type="checkbox"
                                                                        className="sr-only peer"
                                                                        checked={product.posSettings?.isActive !== false}
                                                                        onChange={(e) => {
                                                                            const val = e.target.checked;
                                                                            const currentSettings = product.posSettings || {};
                                                                            const newSettings = { ...currentSettings, isActive: val };
                                                                            handleFieldChange(product.id, 'posSettings', newSettings);
                                                                            handleSaveProduct(product.id, { posSettings: newSettings });
                                                                        }}
                                                                    />
                                                                    <div className="w-8 h-4.5 bg-gray-200 dark:bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-indigo-600"></div>
                                                                </label>
                                                            </div>
                                                        </div>

                                                        {product.posSettings?.isActive !== false && (
                                                            <>
                                                                {/* 條碼管理區塊 */}
                                                                <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] p-4 rounded-xl shadow-xs">
                                                                    <div className="flex items-center justify-between mb-3">
                                                                        <div className="flex items-center gap-1.5">
                                                                            <Barcode size={16} className="text-slate-600 dark:text-slate-400" />
                                                                            <span className="font-bold text-sm text-[var(--text-primary)]">國際條碼管理 (支援多組)</span>
                                                                        </div>
                                                                        <div className="text-[10px] font-bold px-2 py-1 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-md flex items-center gap-1">
                                                                            <Zap size={10} />
                                                                            游標點擊下方輸入框，即可使用掃碼槍連續掃入
                                                                        </div>
                                                                    </div>
                                                                    
                                                                    <div className="flex flex-wrap gap-2 mb-3">
                                                                        {(product.barcodes || []).map((b, idx) => (
                                                                            <div key={idx} className="flex items-center gap-1 bg-[var(--bg-tertiary)] border border-[var(--border-primary)] pl-2 pr-1 py-1 rounded-lg shadow-2xs group">
                                                                                <span className="font-mono text-xs font-bold text-[var(--text-secondary)]">{typeof b === 'object' ? b.barcode : b}</span>
                                                                                <button 
                                                                                    type="button"
                                                                                    onClick={() => {
                                                                                        const newBarcodes = (product.barcodes || []).filter((_, i) => i !== idx);
                                                                                        handleFieldChange(product.id, 'barcodes', newBarcodes);
                                                                                        handleSaveProduct(product.id, { barcodes: newBarcodes });
                                                                                    }}
                                                                                    className="p-1 rounded hover:bg-rose-500/10 text-slate-400 hover:text-rose-500 transition-colors"
                                                                                    title="移除此條碼"
                                                                                >
                                                                                    <X size={12} />
                                                                                </button>
                                                                            </div>
                                                                        ))}
                                                                    </div>

                                                                    <div className="flex items-center gap-2">
                                                                        <div className="relative flex-1 max-w-sm">
                                                                            <input
                                                                                type="text"
                                                                                className="input-field w-full pl-9 font-mono font-bold text-sm"
                                                                                placeholder="在此刷入新條碼，或手動輸入後按 Enter"
                                                                                onKeyDown={(e) => {
                                                                                    if (e.key === 'Enter') {
                                                                                        const val = e.target.value.trim();
                                                                                        if (val) {
                                                                                            const currentBarcodes = product.barcodes || [];
                                                                                            const currentValues = currentBarcodes.map(b => typeof b === 'object' ? b.barcode : b);
                                                                                            if (!currentValues.includes(val)) {
                                                                                                const newBarcodes = [...currentBarcodes, val];
                                                                                                handleFieldChange(product.id, 'barcodes', newBarcodes);
                                                                                                handleSaveProduct(product.id, { barcodes: newBarcodes });
                                                                                            }
                                                                                            e.target.value = '';
                                                                                        }
                                                                                    }
                                                                                }}
                                                                            />
                                                                            <ScanLine size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </>
                                                        )}
                                                    </div>
                                                )}

                                                {/* ------------------------------------------------------------- */}
                                                {/* 🤖 TAB 6：AI 補貨參數 */}
                                                {/* ------------------------------------------------------------- */}
                                                {currentTab === 'ai' && (
                                                    <div className="bg-[var(--bg-primary)] rounded-2xl p-4 border border-[var(--border-primary)] text-xs flex flex-col gap-4 animate-fade-in shadow-inner">
                                                        <div className="flex items-center gap-1.5 pb-2 border-b border-[var(--border-primary)]">
                                                            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                                                            <span className="text-xs uppercase font-extrabold text-amber-600 dark:text-amber-400 tracking-wider">🤖 AI 領貨補貨進階配置參數</span>
                                                        </div>

                                                        <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
                                                            {/* AI 包裝與發貨階梯 */}
                                                            <div className="flex flex-col gap-2">
                                                                <span className="text-xs font-bold text-[var(--text-primary)]">📦 發貨包裝與階梯</span>
                                                                <div className="grid grid-cols-2 gap-2">
                                                                    <div className="flex flex-col gap-1">
                                                                        <span className="text-[11px] text-[var(--text-secondary)] font-medium">整箱包裝數</span>
                                                                        <input
                                                                            type="number"
                                                                            className="input-field text-xs p-2 font-mono"
                                                                            placeholder="例：24"
                                                                            value={product.packSize === '' || product.packSize === undefined || product.packSize === null ? '' : product.packSize}
                                                                            onChange={(e) => handleFieldChange(product.id, 'packSize', e.target.value !== '' ? Number(e.target.value) : '')}
                                                                            onBlur={(e) => handleSaveProduct(product.id, { packSize: e.target.value !== '' ? Number(e.target.value) : 1 })}
                                                                        />
                                                                    </div>
                                                                    <div className="flex flex-col gap-1">
                                                                        <span className="text-[11px] text-[var(--text-secondary)] font-medium">發貨階梯 (逗號分隔)</span>
                                                                        <input
                                                                            type="text"
                                                                            className="input-field text-xs p-2 font-mono"
                                                                            placeholder="例：24, 48"
                                                                            value={Array.isArray(product.dispatchSteps) ? product.dispatchSteps.join(', ') : product.dispatchSteps || ''}
                                                                            onChange={(e) => handleFieldChange(product.id, 'dispatchSteps', e.target.value)}
                                                                            onBlur={(e) => handleSaveProduct(product.id, { dispatchSteps: e.target.value })}
                                                                        />
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            {/* 直覺停領門檻 (高對比亮色主題) */}
                                                            <div className="flex flex-col gap-2">
                                                                <span className="text-xs font-extrabold text-rose-700 flex items-center gap-1">🛑 直覺停領門檻</span>
                                                                <div className="flex flex-col gap-1">
                                                                    <span className="text-[11px] text-slate-600 font-bold">身上有此數量即不領 (例: 5)</span>
                                                                    <input
                                                                        type="number"
                                                                        className="w-full bg-white text-slate-900 border-2 border-rose-400 focus:border-rose-600 focus:ring-2 focus:ring-rose-200 text-xs p-2 text-center font-mono font-black shadow-sm rounded-lg"
                                                                        placeholder="例：5 (身上有5即不領)"
                                                                        value={product.stopPickupThreshold === '' || product.stopPickupThreshold === undefined || product.stopPickupThreshold === null ? '' : product.stopPickupThreshold}
                                                                        onChange={(e) => handleFieldChange(product.id, 'stopPickupThreshold', e.target.value !== '' ? Number(e.target.value) : '')}
                                                                        onBlur={(e) => handleSaveProduct(product.id, { stopPickupThreshold: e.target.value !== '' ? Number(e.target.value) : null })}
                                                                    />
                                                                </div>
                                                            </div>

                                                            {/* 進位門檻與上限 */}
                                                            <div className="flex flex-col gap-2">
                                                                <span className="text-xs font-bold text-[var(--text-primary)]">⚖️ 進位門檻與數量上限</span>
                                                                <div className="grid grid-cols-2 gap-2">
                                                                    <div className="flex flex-col gap-1">
                                                                        <span className="text-[11px] text-[var(--text-secondary)] font-medium">門檻 (尾數多於此即進箱)</span>
                                                                        <input
                                                                            type="number"
                                                                            className="input-field text-xs p-2 text-center font-mono"
                                                                            placeholder="例：5"
                                                                            value={product.roundThreshold === '' || product.roundThreshold === undefined || product.roundThreshold === null ? '' : product.roundThreshold}
                                                                            onChange={(e) => handleFieldChange(product.id, 'roundThreshold', e.target.value !== '' ? Number(e.target.value) : '')}
                                                                            onBlur={(e) => handleSaveProduct(product.id, { roundThreshold: e.target.value !== '' ? Number(e.target.value) : null })}
                                                                        />
                                                                    </div>
                                                                    <div className="flex flex-col gap-1">
                                                                        <span className="text-[11px] text-[var(--text-secondary)] font-medium">最大建議量 (0為無限制)</span>
                                                                        <input
                                                                            type="number"
                                                                            className="input-field text-xs p-2 text-center font-mono"
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
                                                                    <span className="text-xs font-bold text-[var(--text-primary)]">🧠 智慧散貨抑制</span>
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
                                                                        <div className="w-8 h-4 bg-gray-200 dark:bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-blue-600"></div>
                                                                    </label>
                                                                </div>
                                                                <p className="text-[11px] text-[var(--text-secondary)] font-medium leading-relaxed mt-1">
                                                                    啟用後，若預估需求過低，AI 會自動將領貨量歸零，避免出車只為領少量散貨。
                                                                </p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })()}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* ⚠️ 商品效期過期預警與即時下架 Modal 彈窗 (高對比明亮主題 + 清除日期功能) */}
            {showExpiryModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full border border-slate-200 overflow-hidden flex flex-col max-h-[85vh]">
                        {/* Header */}
                        <div className="bg-gradient-to-r from-rose-500 to-amber-500 p-4 md:p-5 text-white flex items-center justify-between shrink-0">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 bg-white/20 rounded-2xl backdrop-blur-xs">
                                    <AlertTriangle className="w-6 h-6 text-white animate-bounce" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-black tracking-wide flex items-center gap-2">
                                        商品效期預警通知
                                        <span className="text-xs bg-white text-rose-600 px-2.5 py-0.5 rounded-full font-black shadow-2xs">
                                            {expiringProducts.length} 項低於 7 天
                                        </span>
                                    </h3>
                                    <p className="text-xs text-rose-100 font-medium mt-0.5">
                                        以下商品即將到期或已過期，請及時評估促銷、清空日期或切換網購下架。
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={handleCloseExpiryModal}
                                className="text-white/80 hover:text-white p-1.5 rounded-xl hover:bg-white/10 transition-all cursor-pointer"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Product List */}
                        <div className="p-4 md:p-5 overflow-y-auto flex-1 divide-y divide-slate-100 space-y-3 bg-white">
                            {expiringProducts.map((product) => {
                                const daysLeft = getDaysLeft(product.expiryDate);
                                const currentStock = stockMap[product.name] || 0;
                                const isExpired = daysLeft !== null && daysLeft <= 0;

                                return (
                                    <div key={product.id} className="pt-3 first:pt-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 hover:bg-slate-100/70 p-3.5 rounded-2xl border border-slate-200/90 transition-all">
                                        <div className="flex items-center gap-3 min-w-0">
                                            {product.imageUrl ? (
                                                <img src={product.imageUrl} alt={product.name} className="w-12 h-12 rounded-xl object-cover border border-slate-200 shrink-0" />
                                            ) : (
                                                <div className="w-12 h-12 rounded-xl bg-slate-200 flex items-center justify-center shrink-0 text-slate-400">
                                                    <Package size={20} />
                                                </div>
                                            )}
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="font-black text-slate-800 text-sm truncate">{product.name}</span>
                                                    {product.category && (
                                                        <span className="text-[10px] font-bold bg-slate-200 text-slate-600 px-2 py-0.5 rounded-md">
                                                            {product.category}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-3 text-xs text-slate-500 font-medium mt-1">
                                                    <span>售價: <strong className="text-slate-800">${product.price || product.single_price || 0}</strong></span>
                                                    <span>當前庫存: <strong className="text-slate-800">{currentStock}</strong></span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Expiry Badge, Clear Date & Off-Shelf Toggle */}
                                        <div className="flex items-center justify-between sm:justify-end gap-2.5 border-t sm:border-t-0 border-slate-200/60 pt-2 sm:pt-0 shrink-0 flex-wrap">
                                            {/* Badge */}
                                            <div className="flex items-center gap-1">
                                                <Clock size={14} className={isExpired ? 'text-rose-600' : 'text-amber-600'} />
                                                <span className={`text-xs font-black px-2.5 py-1 rounded-xl border ${
                                                    isExpired
                                                        ? 'bg-rose-100 text-rose-700 border-rose-300'
                                                        : 'bg-amber-100 text-amber-800 border-amber-300'
                                                }`}>
                                                    {daysLeft < 0 ? `已過期 ${Math.abs(daysLeft)} 天` : daysLeft === 0 ? '今日到期' : `剩 ${daysLeft} 天到期`}
                                                </span>
                                            </div>

                                            {/* 清除日期按鈕 */}
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    handleFieldChange(product.id, 'expiryDate', '');
                                                    handleSaveProduct(product.id, { expiryDate: '' });
                                                }}
                                                className="px-2.5 py-1.5 text-xs font-bold text-slate-600 hover:text-rose-600 bg-white hover:bg-rose-50 border border-slate-200 hover:border-rose-200 rounded-xl transition-all cursor-pointer flex items-center gap-1 shrink-0 shadow-2xs group"
                                                title="清除此商品的有效日期"
                                            >
                                                <Trash2 size={13} className="text-slate-400 group-hover:text-rose-500" />
                                                清除日期
                                            </button>

                                            {/* Off Shelf Toggle */}
                                            <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-2xs">
                                                <label className="relative inline-flex items-center cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        className="sr-only peer"
                                                        checked={!!product.isActive}
                                                        onChange={(e) => {
                                                            const newActive = e.target.checked;
                                                            handleFieldChange(product.id, 'isActive', newActive);
                                                            handleSaveProduct(product.id, { isActive: newActive });
                                                        }}
                                                    />
                                                    <div className="w-8 h-4 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-emerald-600"></div>
                                                </label>
                                                <span className={`text-xs font-bold ${product.isActive ? 'text-emerald-600' : 'text-slate-400'}`}>
                                                    {product.isActive ? '🌐 網購上架' : '🚫 已下架'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Footer */}
                        <div className="bg-slate-50 p-4 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
                            <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    checked={dontRemindToday}
                                    onChange={(e) => setDontRemindToday(e.target.checked)}
                                    className="w-4 h-4 rounded-md border-slate-300 text-rose-600 focus:ring-rose-500 cursor-pointer"
                                />
                                📅 當日不再提醒
                            </label>
                            <button
                                type="button"
                                onClick={handleCloseExpiryModal}
                                className="w-full sm:w-auto px-6 py-2 bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-700 hover:to-amber-700 text-white font-black text-xs rounded-xl shadow-md transition-all cursor-pointer"
                            >
                                我知道了 / 關閉通知
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
