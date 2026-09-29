import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Package, Search, RefreshCw, Save, Image, Edit2, ChevronDown, ChevronUp, Check, AlertCircle, Store, Barcode, DollarSign, TrendingUp, Zap, X, ScanLine, AlertTriangle, Clock, ShieldAlert, Trash2, Link2, Copy } from 'lucide-react';
import { callGAS } from '../utils/api';
import { copyToClipboard } from '../utils/clipboard';

export default function ProductManagementPage({ user, apiUrl }) {
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [tempFlavorChoices, setTempFlavorChoices] = useState({}); // { [productId]: string }
    const [expandedIds, setExpandedIds] = useState(new Set()); // 撅閖������ ID
    const [savingStatus, setSavingStatus] = useState({}); // { [productId]: 'saving' | 'saved' | 'error' }
    const [lastError, setLastError] = useState({}); // { [productId]: string }
    const [stockMap, setStockMap] = useState({}); // { [productName]: number }
    const [stockFilter, setStockFilter] = useState('ALL'); // 'ALL' | 'HAS_STOCK' | 'NO_STOCK'
    const [communities, setCommunities] = useState([]); // [{ communityId, communityName }]
    const [activeTabs, setActiveTabs] = useState({}); // { [productId]: 'basic' | 'promo' | 'community' | 'ai' }

    // ���� 撠�惇���銝见鱓��� State ��������������������������������������������������������������������������������
    const [selectedProductIds, setSelectedProductIds] = useState(new Set());
    const [isSelectMode, setIsSelectMode] = useState(false); // 撠�惇����詨�璅∪� (暺墧��衤��漤＊蝷箸�獢�)
    const [showLinkModal, setShowLinkModal] = useState(false);
    const [activeModalProductId, setActiveModalProductId] = useState(''); // �桀��典�蝒𦯀葉閮剖������ ID
    const [modalProductConfigs, setModalProductConfigs] = useState({}); // { [productId]: { maxTotalQty, allowedCommunityIds, communityQuotas } }
    const [linkSelectedBuilding, setLinkSelectedBuilding] = useState('');
    const [linkCopied, setLinkCopied] = useState(false);
    const [isSavingLinkQuota, setIsSavingLinkQuota] = useState(false);
    const [isAllowedCommOpen, setIsAllowedCommOpen] = useState(false); // �𧢲𦆮蝷曉��条� (�鞱身�嗅�)
    const [isCommQuotaOpen, setIsCommQuotaOpen] = useState(false); // 蝷曉��漤��条� (�鞱身�嗅�)

    // 閮���航�蝷曉�皜�鱓 (�㘾膄銵峕錇����黸�讐冗��)
    const visibleCommunities = useMemo(() => {
        let hiddenBuildings = [];
        try {
            const saved = localStorage.getItem('admin_hidden_buildings');
            if (saved) hiddenBuildings = JSON.parse(saved);
        } catch (_) {}

        return communities.filter(c => {
            const cid = c.communityId || c.CommunityId;
            const cname = String(c.communityName || c.CommunityName || '').trim();
            if (c.status && c.status !== 'ACTIVE') return false;
            if (hiddenBuildings.includes(cname) || hiddenBuildings.includes(cid)) return false;

            if (!['蝺帋�銝见鱓', '銝��祆袇摰�', '銝��祉鍂��', '銝羓�銝见鱓', '銝��砍虜��', '撣豢��嗅睸'].includes(cname)) {
                const cleanName = cname.replace(/^(�啣�撣�擃㗛�撣��啁�|�箇�)/, '').trim();
                if (cleanName.endsWith('��') && !cleanName.includes('憭扳�') && !cleanName.includes('蝷曉�') && !cleanName.includes('�臬�') && !cleanName.includes('�𠰴�') && !cleanName.includes('撅梯�') && !cleanName.includes('憭批�')) {
                    return false;
                }
            }
            return true;
        });
    }, [communities]);

    // ���� ����鞱郎敶�� (雿擧䲰 7 憭�) State ������������������������������������������������������������
    const [showExpiryModal, setShowExpiryModal] = useState(false);
    const [dontRemindToday, setDontRemindToday] = useState(false);

    // 閮��頝嗪𣪧����拚�憭拇彍
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

    // 蝭拚��箸��㗇��煺��潛��� 7 憭拍����
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
                
                // �嘥��硋藁�唾撓�交���麱摮睃�銝�
                const initialTemp = {};
                productsData.forEach(p => {
                    initialTemp[p.id] = Array.isArray(p.flavor_choices) ? p.flavor_choices.join(', ') : '';
                });
                setTempFlavorChoices(initialTemp);
            }

            // 閮��摨怠�撠滨�銵�
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
            alert('頛匧����憭望�: ' + error.message);
        } finally {
            setLoading(false);
        }
    }, [apiUrl, user.token]);

    useEffect(() => {
        if (user?.token) {
            fetchProducts();
            // �峕��匧��见�憭扳� (getBuildingSettings) ��冗��皜�鱓 (getCommunities)嚗𣬚Ⅱ靽肽��屸��条恣����100% �峕郊
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

    // �嗅�����亙��𣂷��劐��� 7 憭拇��笔����嚗諹䌊�閗歲�粹�霅血�蝒� (�亦訜�交𧊋鋡恍�����齿���)
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

    // 撅閖������
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

    // �芸��峕艶摮䀹�嚗䔶�敶�枂 Alert 敶梢𣳽擃娪�
    const handleSaveProduct = async (id, updatedProductFields = {}) => {
        const currentProduct = products.find(p => p.id === id);
        if (!currentProduct) return;

        // 蝡见朖憟㛖鍂靽格㺿�單𧋦�� state嚗䔶蒂璅躰��脣�銝�
        const mergedProduct = { ...currentProduct, ...updatedProductFields };
        setSavingStatus(prev => ({ ...prev, [id]: 'saving' }));
        setLastError(prev => {
            const next = { ...prev };
            delete next[id];
            return next;
        });

        try {
            // 敺墧麱摮睃�銝脖葉閫����㭠���
            const rawStr = tempFlavorChoices[id] || '';
            const parsedFlavors = rawStr.split(/[,嚗䀉/).map(s => s.trim()).filter(Boolean);

            // 閫���潸疏�擧０
            let parsedSteps = [];
            if (typeof mergedProduct.dispatchSteps === 'string') {
                parsedSteps = mergedProduct.dispatchSteps.split(/[,嚗䀉/).map(s => Number(s.trim())).filter(n => !isNaN(n));
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
                barcodes: mergedProduct.barcodes || [],
                isPurchasable: mergedProduct.isPurchasable,
                isDiscontinued: mergedProduct.isDiscontinued
            }, user.token);
            
            if (res && res.error) {
                throw new Error(res.error);
            }
            
            // �脣��𣂼�嚗峕��� _dirty
            setProducts(prev => prev.map(p => p.id === id ? { 
                ...p, 
                ...updatedProductFields,
                flavor_choices: parsedFlavors, 
                dispatchSteps: parsedSteps,
                _dirty: false 
            } : p));
            
            setSavingStatus(prev => ({ ...prev, [id]: 'saved' }));
            
            // 2.5 蝘鍦�瘛∪枂��歇�脣��滚���
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
        const isDiscontinued = p.isDiscontinued === true || p.isDiscontinued === 'true';

        if (stockFilter === 'ONLINE') {
            if (!isOnline || isDiscontinued) return false;
        } else if (stockFilter === 'OFFLINE') {
            if (isOnline || isDiscontinued) return false;
        } else if (stockFilter === 'HAS_STOCK') {
            const qty = stockMap[p.name] || 0;
            if (qty <= 0 || isDiscontinued) return false;
        } else if (stockFilter === 'NO_STOCK') {
            const qty = stockMap[p.name] || 0;
            if (qty > 0 || isDiscontinued) return false;
        } else if (stockFilter === 'DISCONTINUED') {
            if (!isDiscontinued) return false;
        } else if (stockFilter === 'ALL') {
            if (isDiscontinued) return false;
        }

        return true;
    });

    // ���� 撠�惇�𣂼��������閧��賢� ����������������������������������������������������������������������������
    const toggleSelectProduct = (productId) => {
        setSelectedProductIds(prev => {
            const next = new Set(prev);
            if (next.has(productId)) {
                next.delete(productId);
            } else {
                next.add(productId);
            }
            return next;
        });
    };

    const toggleSelectAll = () => {
        if (selectedProductIds.size === filtered.length) {
            setSelectedProductIds(new Set());
        } else {
            setSelectedProductIds(new Set(filtered.map(p => p.id)));
        }
    };

    const handleOpenLinkModal = () => {
        if (selectedProductIds.size === 0) return;
        
        const initialConfigs = {};
        selectedProductIds.forEach(id => {
            const p = products.find(item => item.id === id);
            if (p) {
                const quotas = {};
                const qObj = p.communityQuotas || {};
                Object.entries(qObj).forEach(([k, v]) => {
                    if (v && v.maxQty !== undefined && v.maxQty !== null) {
                        quotas[k] = v.maxQty;
                    }
                });
                initialConfigs[id] = {
                    maxTotalQty: (p.maxTotalQty !== undefined && p.maxTotalQty !== null && p.maxTotalQty !== '') ? p.maxTotalQty : '',
                    allowedCommunityIds: Array.isArray(p.allowedCommunityIds) ? [...p.allowedCommunityIds] : [],
                    communityQuotas: quotas
                };
            }
        });
        setModalProductConfigs(initialConfigs);
        const firstId = Array.from(selectedProductIds)[0];
        setActiveModalProductId(firstId);

        setShowLinkModal(true);
        setIsAllowedCommOpen(false);
        setIsCommQuotaOpen(false);
        setLinkCopied(false);
    };

    // �湔鰵�桀��詨������身摰� (瘣餃�蝮賡��粹�����曄冗����冗���漤�)
    const updateActiveProductConfig = (key, val) => {
        if (!activeModalProductId) return;
        setModalProductConfigs(prev => ({
            ...prev,
            [activeModalProductId]: {
                ...(prev[activeModalProductId] || { maxTotalQty: '', allowedCommunityIds: [], communityQuotas: {} }),
                [key]: val
            }
        }));
    };

    // 銝��萄��桀������身摰𡁜��刻秐���匧歇�詨���
    const handleApplyConfigToAll = () => {
        if (!activeModalProductId) return;
        const cur = modalProductConfigs[activeModalProductId];
        if (!cur) return;
        setModalProductConfigs(prev => {
            const next = { ...prev };
            selectedProductIds.forEach(id => {
                next[id] = {
                    maxTotalQty: cur.maxTotalQty,
                    allowedCommunityIds: [...(cur.allowedCommunityIds || [])],
                    communityQuotas: { ...(cur.communityQuotas || {}) }
                };
            });
            return next;
        });
        alert('撌脣��桀������暑�閧蜇�见枂�譌����曄冗����冗���漤�憟㛖鍂�單��匧歇�詨����');
    };

    // �Ｙ�撠�惇�𣂼�銝见鱓��� (��葆����滨迂嚗䔶��滩身摰𡁏�鈭粹�鞈� :limit)
    const generatedLiffUrl = useMemo(() => {
        if (selectedProductIds.size === 0) return '';
        const LIFF_ID = import.meta.env.VITE_LIFF_ID || '2010308873-ur2zL2cc';
        const names = [];
        selectedProductIds.forEach(id => {
            const p = products.find(item => item.id === id);
            if (!p) return;
            const name = p.name ? p.name.trim() : p.id;
            names.push(name);
        });
        if (names.length === 0) return '';

        let url = `https://liff.line.me/${LIFF_ID}?products=${encodeURIComponent(names.join(','))}`;
        if (linkSelectedBuilding && linkSelectedBuilding.trim()) {
            url += `&building=${encodeURIComponent(linkSelectedBuilding.trim())}`;
        }
        return url;
    }, [selectedProductIds, products, linkSelectedBuilding]);

    const handleCopyDedicatedLink = async () => {
        if (!generatedLiffUrl) return;

        // 1. �券��𦠜��Ｘ�����瓐�𣬚洵銝����蝡见朖�瑁�銴�ˊ�㵪��踹�鋡恍��峕郊隢𧢲�撱園�撠舘稲�讛汗�典ế摰� gesture �擧��峕�蝯訫�鞎潛倏摮睃�嚗�
        const copyOk = await copyToClipboard(generatedLiffUrl);
        if (copyOk) {
            setLinkCopied(true);
            setTimeout(() => setLinkCopied(false), 2500);
        } else {
            alert('銴�ˊ憭望�嚗諹��见��詨�銝𧢲䲮蝬脣�銴�ˊ');
        }

        // 2. �峕郊撠��������见ê̌���峕暑�閧蜇�见枂�譌�溻���屸��曄冗���滩��𣬚冗���典振�嗉頃�漤��滚神�亥��坔澈
        setIsSavingLinkQuota(true);
        try {
            const savePromises = [];
            selectedProductIds.forEach(id => {
                const p = products.find(item => item.id === id);
                if (!p) return;

                const cfg = modalProductConfigs[id] || {};
                const maxVal = cfg.maxTotalQty;
                const newMaxTotal = (maxVal !== '' && maxVal !== undefined && maxVal !== null) ? Number(maxVal) : null;
                const allowedIds = cfg.allowedCommunityIds || [];

                const nextQuotas = {};
                const curQuotas = cfg.communityQuotas || {};
                Object.entries(curQuotas).forEach(([commKey, val]) => {
                    if (val !== '' && val !== null && val !== undefined && !isNaN(Number(val))) {
                        const existingSold = p.communityQuotas?.[commKey]?.soldQty || 0;
                        nextQuotas[commKey] = {
                            maxQty: Number(val),
                            soldQty: existingSold
                        };
                    }
                });

                handleFieldChange(id, 'maxTotalQty', newMaxTotal);
                handleFieldChange(id, 'allowedCommunityIds', allowedIds);
                handleFieldChange(id, 'communityQuotas', nextQuotas);
                savePromises.push(handleSaveProduct(id, {
                    maxTotalQty: newMaxTotal,
                    allowedCommunityIds: allowedIds,
                    communityQuotas: nextQuotas
                }));
            });

            if (savePromises.length > 0) {
                await Promise.all(savePromises);
            }
        } catch (err) {
            console.error('�脣�蝷曉����憿滚仃��:', err);
            alert('�脣�蝷曉����憿滚仃��: ' + err.message);
        } finally {
            setIsSavingLinkQuota(false);
        }
    };

    const activeModalProduct = useMemo(() => {
        if (!activeModalProductId) {
            if (selectedProductIds.size > 0) {
                const firstId = Array.from(selectedProductIds)[0];
                return products.find(p => p.id === firstId) || null;
            }
            return null;
        }
        return products.find(p => p.id === activeModalProductId) || null;
    }, [activeModalProductId, selectedProductIds, products]);

    const activeModalConfig = useMemo(() => {
        const pId = activeModalProduct?.id;
        if (!pId || !modalProductConfigs[pId]) {
            return { maxTotalQty: '', allowedCommunityIds: [], communityQuotas: {} };
        }
        return modalProductConfigs[pId];
    }, [activeModalProduct, modalProductConfigs]);

    const activeSelectedCommCount = useMemo(() => {
        const ids = activeModalConfig.allowedCommunityIds || [];
        if (ids.length === 0) return 0;
        return visibleCommunities.filter(c => {
            const cid = c.communityId || c.CommunityId;
            const cname = c.communityName || c.CommunityName;
            return ids.includes(cid) || ids.includes(cname);
        }).length;
    }, [activeModalConfig.allowedCommunityIds, visibleCommunities]);

    return (
        <div className="max-w-6xl mx-auto h-[calc(100vh-6rem)] flex flex-col p-4 gap-4">
            {/* Header Area */}
            <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center bg-[var(--bg-secondary)] p-4 rounded-xl border border-[var(--border-primary)] shadow-sm gap-3">
                <h2 className="text-xl md:text-2xl font-bold flex items-center gap-2 text-[var(--text-primary)]">
                    <Package className="text-blue-600" />
                    ���撅祆��
                </h2>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full sm:w-auto">
                    {/* Style A Custom Dropdown Selector */}
                    <div className="relative w-full sm:w-52">
                        <Package size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                        <select
                            value={stockFilter}
                            onChange={(e) => setStockFilter(e.target.value)}
                            className="w-full appearance-none pl-9 pr-8 py-2 text-xs font-bold rounded-xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] text-[var(--text-primary)] focus:outline-none focus:border-blue-500 hover:border-blue-300 transition-all cursor-pointer shadow-sm"
                        >
                            <option value="ALL">�𣑐 鞎拙睸銝剖��� (�鞱身)</option>
                            <option value="ONLINE">�叚 撌脩雯鞈潔���</option>
                            <option value="OFFLINE">�𣞁 撌脩雯鞈潔���</option>
                            <option value="HAS_STOCK">�叚 �芰��匧澈摮�</option>
                            <option value="NO_STOCK">�𣞁 �芰��∪澈摮�</option>
                            <option value="DISCONTINUED">�麱 撌脣���/�𦦵𤩎���</option>
                            <option value="ALL_WITH_DISCONTINUED">��儭� �券���� (�怠���)</option>
                        </select>
                        <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    </div>

                    <div className="flex items-center gap-2 flex-1 w-full sm:w-auto">
                        <div className="relative flex-1 sm:w-64">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" size={16} />
                            <input
                                type="text"
                                placeholder="�𨅯�����滨迂�𦎾D..."
                                className="input-field pl-9 py-2 text-xs w-full"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>
                        <button 
                            type="button"
                            onClick={() => {
                                setIsSelectMode(prev => {
                                    if (prev) {
                                        setSelectedProductIds(new Set());
                                    }
                                    return !prev;
                                });
                            }}
                            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer border shadow-2xs ${
                                isSelectMode
                                    ? 'bg-blue-600 text-white border-blue-600 shadow-blue-500/25'
                                    : 'bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border-[var(--border-primary)]'
                            }`}
                            title={isSelectMode ? "�𣈯��詨�璅∪�" : "暺墧��衤��詨�撠�惇������"}
                        >
                            <Link2 size={15} className={isSelectMode ? 'text-white' : 'text-blue-600'} />
                            <span>{isSelectMode ? '蝯鞉��詨�' : '撠�惇����詨�'}</span>
                        </button>
                        <button onClick={fetchProducts} className="btn-secondary p-2 rounded-xl shrink-0" title="�齿鰵�渡�">
                            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                        </button>
                    </div>
                </div>
            </div>

            {/* 撠�惇����詨�撌亙��� */}
            {(isSelectMode || selectedProductIds.size > 0) && (
                <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 bg-gradient-to-r from-blue-500/15 via-indigo-500/10 to-blue-500/5 border border-blue-500/30 rounded-2xl shadow-sm animate-in fade-in duration-150 shrink-0">
                    <div className="flex items-center gap-2.5">
                        <span className="text-xs font-bold text-blue-700 dark:text-blue-300">
                            撌脤��� <span className="text-sm font-black text-blue-600 dark:text-blue-400 font-mono">{selectedProductIds.size}</span> �����
                        </span>
                        <span className="text-slate-300 dark:text-slate-700">|</span>
                        <button
                            type="button"
                            onClick={toggleSelectAll}
                            className="text-xs text-[var(--text-secondary)] hover:text-blue-600 font-medium cursor-pointer"
                        >
                            {selectedProductIds.size === filtered.length ? '�𡝗��券�' : '�券�蝭拚�蝯鞉�'}
                        </button>
                        <button
                            type="button"
                            onClick={() => setSelectedProductIds(new Set())}
                            className="text-xs text-rose-500 hover:text-rose-600 font-medium cursor-pointer ml-1"
                        >
                            皜�膄
                        </button>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => {
                                setIsSelectMode(false);
                                setSelectedProductIds(new Set());
                            }}
                            className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)] font-bold cursor-pointer px-2.5 py-1.5 rounded-xl hover:bg-[var(--bg-tertiary)] transition-colors"
                        >
                            �� 蝯鞉��詨�
                        </button>
                        <button
                            type="button"
                            disabled={selectedProductIds.size === 0}
                            onClick={handleOpenLinkModal}
                            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 active:scale-95 text-white text-xs font-extrabold shadow-md shadow-blue-500/20 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <Link2 size={15} />
                            <span>�Ｙ�������銝见鱓���</span>
                        </button>
                    </div>
                </div>
            )}

            {/* Product List */}
            <div className="flex-1 overflow-y-auto pb-6">
                {loading && products.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-3 text-[var(--text-secondary)]">
                        <RefreshCw className="animate-spin text-blue-500" size={36} />
                        <span>頛匧�銝哨�隢讠���...</span>
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="text-center py-20 text-[var(--text-secondary)] bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-primary)] shadow-sm">
                        �∪������
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
                                    {/* 1. ���璅䠷�嚗帋蜓�𤥁��箸𧋦鞈��嚗���𦠜㟲撘萄㨃����𥕦���/�条�嚗� */}
                                    <div 
                                        onClick={() => toggleExpand(product.id)}
                                        className="flex items-center gap-3 md:gap-4 p-4 md:p-5 hover:bg-[var(--bg-tertiary)]/20 transition-all rounded-t-2xl cursor-pointer select-none"
                                    >
                                        {/* �暸��孵� (暺鮋�撠�惇����詨�璅∪����憿舐內) */}
                                        {(isSelectMode || selectedProductIds.has(product.id)) && (
                                            <button 
                                                type="button"
                                                className="flex items-center justify-center p-1 -ml-1 cursor-pointer shrink-0 rounded-lg hover:bg-blue-50/80 dark:hover:bg-slate-800 transition-all animate-in fade-in zoom-in-95 duration-150"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    toggleSelectProduct(product.id);
                                                }}
                                                title={selectedProductIds.has(product.id) ? "�𡝗��詨�" : "�詨�甇文���"}
                                            >
                                                <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transiti                                         {/* �滨迂�䳢D */}
                                        <div className="flex flex-col min-w-0 flex-1">
                                            {/* 蝚砌�銵䕘�����滨迂嚗���湧＊蝷綽� */}
                                            <div className="font-extrabold text-base md:text-lg text-[var(--text-primary)] leading-snug break-words">
                                                {product.name}
                                            </div>

                                            {/* 蝚砌�銵䕘��滢��厰�蝢� */}
                                            <div className="flex flex-wrap items-center gap-1.5 mt-1" onClick={(e) => e.stopPropagation()}>
                                                {/* �𨅯睸���𧢲��� */}
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const newDiscontinued = !product.isDiscontinued;
                                                        handleFieldChange(product.id, 'isDiscontinued', newDiscontinued);
                                                        if (newDiscontinued) {
                                                            handleFieldChange(product.id, 'isActive', false);
                                                            handleFieldChange(product.id, 'isPurchasable', false);
                                                            handleSaveProduct(product.id, { isDiscontinued: true, isActive: false, isPurchasable: false });
                                                        } else {
                                                            handleSaveProduct(product.id, { isDiscontinued: false });
                                                        }
                                                    }}
                                                    className={`px-1.5 py-0.5 rounded-lg border text-[10px] font-bold transition-all flex items-center gap-0.5 whitespace-nowrap ${
                                                        product.isDiscontinued
                                                            ? 'bg-rose-500/10 text-rose-600 border-rose-200 dark:border-rose-800'
                                                            : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border-[var(--border-primary)] hover:border-amber-300'
                                                    }`}
                                                >
                                                    {product.isDiscontinued ? '�麱 撌脣���' : '�麱 �𨅯睸'}
                                                </button>

                                                {/* 蝬脰頃銝𦠜沲�钅� */}
                                                <div className="flex items-center gap-1 bg-[var(--bg-tertiary)] px-1.5 py-0.5 rounded-lg border border-[var(--border-primary)] shadow-2xs">
                                                    <span className={`text-[10px] font-bold whitespace-nowrap ${product.isActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>
                                                        {product.isActive ? '�� 銝𦠜沲' : '�� 銝𧢲沲'}
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

                                                {/* 摰匧��芷膄�厰� */}
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const qty = stockMap[product.name] || 0;
                                                        if (qty > 0) {
                                                            alert(`�𣂼��冽��鉝�穃�����${product.name}�滨𤌍�滢��匧澈摮� ${qty} 隞嗚��n�箇Ⅱ靽嗪�敺�鞎∪����脤啹摮睃董�桀�朣𠺪�隢见��園��𨳍�𦩒�� 璅躰��𨅯睸�誩朖�臬�蝟餌絞摰匧��梯�嚗𣬚����芷膄�豢�嚗�);
                                                        } else {
                                                            if (confirm(`�鞟Ⅱ隤漤黸��/�𨅯睸�烐糓�衣Ⅱ摰𡁜������${product.name}�齿�閮条��𨅯睸�梯�嚗鬮)) {
                                                                handleFieldChange(product.id, 'isDiscontinued', true);
                                                                handleFieldChange(product.id, 'isActive', false);
                                                                handleFieldChange(product.id, 'isPurchasable', false);
                                                                handleSaveProduct(product.id, { isDiscontinued: true, isActive: false, isPurchasable: false });
                                                            }
                                                        }
                                                    }}
                                                    className="p-1 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/20 rounded-md transition-all"
                                                    title="�芷膄 / �𨅯睸�梯�"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>

                                            {/* ID嚗��璈��憿舐內嚗� */}
                                            <div className="hidden md:flex text-[11px] text-[var(--text-tertiary)] font-mono mt-1 items-center gap-1.5">
                                                <span className="bg-[var(--bg-tertiary)] px-1.5 py-0.2 rounded border border-[var(--border-primary)] text-[10px]">ID</span>
                                                <span className="truncate">{product.id}</span>啹摮睃董�桀�朣𠺪�隢见��園��𨳍�𦩒�� 璅躰��𨅯睸�誩朖�臬�蝟餌絞摰匧��梯�嚗𣬚����芷膄�豢�嚗�);
                                                            } else {
                                                                if (confirm(`�鞟Ⅱ隤漤黸��/�𨅯睸�烐糓�衣Ⅱ摰𡁜������${product.name}�齿�閮条��𨅯睸�梯�嚗鬮)) {
                                                                    handleFieldChange(product.id, 'isDiscontinued', true);
                                                                    handleFieldChange(product.id, 'isActive', false);
                                                                    handleFieldChange(product.id, 'isPurchasable', false);
                                                                    handleSaveProduct(product.id, { isDiscontinued: true, isActive: false, isPurchasable: false });
                                                                }
                                                            }
                                                        }}
                                                        className="p-1 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/20 rounded-md transition-all"
                                                        title="�芷膄 / �𨅯睸�梯�"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="hidden md:flex text-[11px] text-[var(--text-tertiary)] font-mono mt-1 items-center gap-1.5">
                                                <span className="bg-[var(--bg-tertiary)] px-1.5 py-0.2 rounded border border-[var(--border-primary)] text-[10px]">ID</span> 
                                                <span className="truncate max-w-none">{product.id}</span>
                                            </div>
                                            {/* �寞聢��澈摮塩�����𠯫�麄���摮条��页��𧢲����銵峕��圈＊蝷綽� */}
                                            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-bold">
                                                <span className="text-blue-600">�瑕睸嚗�<span className="font-mono text-[var(--text-primary)]">${product.single_price || '-'}</span></span>
                                                <span className="text-amber-600">�脣�嚗�<span className="font-mono">${product.price || '-'}</span></span>
                                                <span className="text-[var(--text-secondary)]">摨怠�嚗�<span className={`font-mono ${ (stockMap[product.name] || 0) > 0 ? 'text-emerald-600 font-extrabold' : 'text-slate-400' }`}>{stockMap[product.name] || 0}</span></span>
                                                {product.maxTotalQty !== null && product.maxTotalQty !== undefined && (
                                                    <span className="text-purple-600 dark:text-purple-400 font-extrabold">�鞾�嚗�<span className="font-mono">{product.soldQty || 0}/{product.maxTotalQty}</span></span>
                                                )}
                                                {/* �㗇��交� */}
                                                <span className="inline-flex flex-wrap items-center gap-1 text-[var(--text-secondary)] font-medium" onClick={(e) => e.stopPropagation()}>
                                                    <span className="whitespace-nowrap shrink-0">�㗇��交�嚗�</span>
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
                                                            title="皜�膄�交�"
                                                        >��</button>
                                                    )}
                                                    {status === 'saving' && (
                                                        <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400 font-bold text-[10px] bg-blue-500/10 px-2 py-0.5 rounded-full">
                                                            <RefreshCw size={10} className="animate-spin" /> �脣�銝�
                                                        </span>
                                                    )}
                                                    {status === 'saved' && (
                                                        <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-bold text-[10px] bg-emerald-500/10 px-2 py-0.5 rounded-full animate-fade-in">
                                                            <Check size={10} /> 撌脣�摮�
                                                        </span>
                                                    )}
                                                    {status === 'error' && (
                                                        <span className="flex items-center gap-1 text-rose-600 dark:text-rose-400 font-bold text-[10px] bg-rose-500/10 px-2 py-0.5 rounded-full" title={lastError[product.id]}>
                                                            <AlertCircle size={10} /> 憭望�
                                                        </span>
                                                    )}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* 撅閖���底蝝唳�雿� (��惜������) */}
                                    {isExpanded && (() => {
                                        const currentTab = activeTabs[product.id] || 'basic';
                                        const setTab = (tabName) => setActiveTabs(prev => ({ ...prev, [product.id]: tabName }));

                                        return (
                                            <div className="p-4 sm:p-5 border-t border-[var(--border-primary)]/40 flex flex-col gap-4 animate-slide-down bg-[var(--bg-secondary)]/30" onClick={(e) => e.stopPropagation()}>
                                                {/* �� ��惜����� (Tab Bar) */}
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
                                                        �� �箸𧋦閬𤩺聢�����
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
                                                        �� 瘣餃����閬𤩺聢
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
                                                        �� �𧢲𦆮蝷曉����憿�
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
                                                        �蘨 ��撣� POS 閮剖�
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
                                                        �� AI 鋆𡏭疏��彍
                                                    </button>
                                                </div>

                                                {/* ------------------------------------------------------------- */}
                                                {/* �� TAB 1嚗𡁜抅�祈��潸��寞聢 */}
                                                {/* ------------------------------------------------------------- */}
                                                {currentTab === 'basic' && (
                                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-xs animate-fade-in">
                                                        {/* �𣇉�蝬脣� */}
                                                        <div className="flex flex-col gap-1.5 bg-[var(--bg-tertiary)]/30 p-3 rounded-xl border border-[var(--border-primary)]/50">
                                                            <span className="text-[10px] uppercase font-extrabold text-[var(--text-secondary)] tracking-wider">�𣇉�蝬脣�</span>
                                                            <input
                                                                type="text"
                                                                className="input-field text-xs p-2"
                                                                placeholder="頛詨��𣇉�蝬脣� https://..."
                                                                value={product.imageUrl || ''}
                                                                onChange={(e) => handleFieldChange(product.id, 'imageUrl', e.target.value)}
                                                                onBlur={(e) => handleSaveProduct(product.id, { imageUrl: e.target.value })}
                                                            />
                                                        </div>

                                                        {/* ���摰寥� / 閬𤩺聢 */}
                                                        <div className="flex flex-col gap-1.5 bg-[var(--bg-tertiary)]/30 p-3 rounded-xl border border-[var(--border-primary)]/50">
                                                            <span className="text-[10px] uppercase font-extrabold text-[var(--text-secondary)] tracking-wider">摰寥� / 閬𤩺聢</span>
                                                            <input
                                                                type="text"
                                                                className="input-field text-xs p-2 font-bold"
                                                                placeholder="靘页�936ml��360g��6��/��"
                                                                value={product.capacity || ''}
                                                                onChange={(e) => handleFieldChange(product.id, 'capacity', e.target.value)}
                                                                onBlur={(e) => handleSaveProduct(product.id, { capacity: e.target.value })}
                                                            />
                                                        </div>

                                                        {/* ������ */}
                                                        <div className="flex flex-col gap-1.5 bg-[var(--bg-tertiary)]/30 p-3 rounded-xl border border-[var(--border-primary)]/50">
                                                            <span className="text-[10px] uppercase font-extrabold text-[var(--text-secondary)] tracking-wider">������</span>
                                                            <input
                                                                type="text"
                                                                className="input-field text-xs p-2"
                                                                placeholder="靘页�銋喲ㄡ�����暻亦頂��"
                                                                value={product.category || ''}
                                                                onChange={(e) => handleFieldChange(product.id, 'category', e.target.value)}
                                                                onBlur={(e) => handleSaveProduct(product.id, { category: e.target.value })}
                                                            />
                                                        </div>

                                                        {/* 摨怠��鞉𧋦 (�脣�) */}
                                                        <div className="flex flex-col gap-1.5 bg-[var(--bg-tertiary)]/30 p-3 rounded-xl border border-[var(--border-primary)]/50">
                                                            <span className="text-[10px] uppercase font-extrabold text-[var(--text-secondary)] tracking-wider">摨怠��鞉𧋦 (�脣�)</span>
                                                            <div className="relative">
                                                                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] font-bold font-mono text-xs">$</span>
                                                                <input
                                                                    type="number"
                                                                    className="input-field text-xs pl-6 p-2 w-full font-mono font-bold"
                                                                    placeholder="�脣��鞉𧋦"
                                                                    value={product.price || ''}
                                                                    onChange={(e) => handleFieldChange(product.id, 'price', e.target.value !== '' ? Number(e.target.value) : '')}
                                                                    onBlur={(e) => handleSaveProduct(product.id, { price: e.target.value !== '' ? Number(e.target.value) : '' })}
                                                                />
                                                            </div>
                                                        </div>

                                                        {/* �瑕睸�笔� */}
                                                        <div className="flex flex-col gap-1.5 bg-[var(--bg-tertiary)]/30 p-3 rounded-xl border border-[var(--border-primary)]/50">
                                                            <span className="text-[10px] uppercase font-extrabold text-[var(--text-secondary)] tracking-wider">�瑕睸�笔�</span>
                                                            <div className="relative">
                                                                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] font-bold font-mono text-xs">$</span>
                                                                <input
                                                                    type="number"
                                                                    className="input-field text-xs pl-6 p-2 w-full font-mono font-bold"
                                                                    placeholder="�瑕睸�笔�"
                                                                    value={product.single_price || ''}
                                                                    onChange={(e) => handleFieldChange(product.id, 'single_price', e.target.value !== '' ? Number(e.target.value) : '')}
                                                                    onBlur={(e) => handleSaveProduct(product.id, { single_price: e.target.value !== '' ? Number(e.target.value) : '' })}
                                                                />
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* ------------------------------------------------------------- */}
                                                {/* �� TAB 2嚗𡁏暑�閗�憭朞��� */}
                                                {/* ------------------------------------------------------------- */}
                                                {currentTab === 'promo' && (
                                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-xs animate-fade-in">
                                                        {/* 憭朞��澆藁�� */}
                                                        <div className="flex flex-col gap-2 bg-[var(--bg-tertiary)]/30 p-3 rounded-xl border border-[var(--border-primary)]/50">
                                                            <div className="flex justify-between items-center">
                                                                <span className="text-[10px] uppercase font-extrabold text-[var(--text-secondary)] tracking-wider">憭朞��澆藁��</span>
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
                                                                placeholder="��㭠�賊�嚗䔶誑�𡑒����嚗䔶�嚗𡁜���, 撌批���"
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

                                                        {/* ���閬𤩺聢閮剖� */}
                                                        <div className="flex flex-col gap-2 bg-[var(--bg-tertiary)]/30 p-3 rounded-xl border border-[var(--border-primary)]/50">
                                                            <div className="flex justify-between items-center">
                                                                <span className="text-[10px] uppercase font-extrabold text-[var(--text-secondary)] tracking-wider">���閬𤩺聢</span>
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
                                                                placeholder="����賊�嚗䔶�嚗�4 (�𥕦�銝�蝯�)"
                                                                disabled={!product.isBundle}
                                                                value={product.bundleSize === '' || product.bundleSize === undefined || product.bundleSize === null ? '' : product.bundleSize}
                                                                onChange={(e) => handleFieldChange(product.id, 'bundleSize', e.target.value !== '' ? Number(e.target.value) : '')}
                                                                onBlur={(e) => handleSaveProduct(product.id, { bundleSize: e.target.value !== '' ? Number(e.target.value) : 1 })}
                                                            />
                                                        </div>

                                                        {/* ��憭扯痔�桐��� (瘣餃�蝮賡���) */}
                                                        <div className="flex flex-col gap-2 bg-[var(--bg-tertiary)]/30 p-3 rounded-xl border border-[var(--border-primary)]/50">
                                                            <span className="text-[10px] uppercase font-extrabold text-[var(--text-secondary)] tracking-wider">瘣餃�蝮賡��譍���</span>
                                                            <input
                                                                type="number"
                                                                min="1"
                                                                className="input-field text-xs p-2 mt-auto font-mono"
                                                                placeholder="靘页�100 (�嗵征隞�”�∩���)"
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

                                                        {/* 皛蹂辣�寞� (�擧０蝯����) */}
                                                        <div className="lg:col-span-4 flex flex-col gap-2.5 bg-[var(--bg-tertiary)]/30 p-3 rounded-xl border border-[var(--border-primary)]/50">
                                                            <div className="flex justify-between items-center">
                                                                <span className="text-[10px] uppercase font-extrabold text-[var(--text-secondary)] tracking-wider">皛蹂辣�寞�閮剖�</span>
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

                                                            {(() => {
                                                                let s = product.volume_pricing_settings;
                                                                if (typeof s === 'string') {
                                                                    try { s = JSON.parse(s); } catch (e) {}
                                                                }
                                                                const rawTiers = Array.isArray(s?.tiers) && s.tiers.length > 0
                                                                    ? s.tiers
                                                                    : (s?.target_quantity ? [{ target_quantity: s.target_quantity, package_price: s.package_price }] : [{ target_quantity: '', package_price: '' }]);

                                                                const updateTiers = (newTiers) => {
                                                                    const sorted = [...newTiers].sort((a, b) => Number(a.target_quantity || 0) - Number(b.target_quantity || 0));
                                                                    const first = sorted[0] || {};
                                                                    const baseObj = (typeof product.volume_pricing_settings === 'object' && product.volume_pricing_settings) ? product.volume_pricing_settings : (s || {});
                                                                    const newSettings = {
                                                                        ...baseObj,
                                                                        target_quantity: first.target_quantity !== '' && first.target_quantity !== undefined ? Number(first.target_quantity) : 0,
                                                                        package_price: first.package_price !== '' && first.package_price !== undefined ? Number(first.package_price) : 0,
                                                                        tiers: sorted.map(t => ({
                                                                            target_quantity: t.target_quantity !== '' ? Number(t.target_quantity) : '',
                                                                            package_price: t.package_price !== '' ? Number(t.package_price) : ''
                                                                        }))
                                                                    };
                                                                    handleFieldChange(product.id, 'volume_pricing_settings', newSettings);
                                                                    handleSaveProduct(product.id, { volume_pricing_settings: newSettings });
                                                                };

                                                                return (
                                                                    <div className={`flex flex-col gap-2 ${!product.has_volume_pricing ? 'opacity-40 pointer-events-none select-none' : ''}`}>
                                                                        {rawTiers.map((tier, idx) => (
                                                                            <div key={idx} className="flex items-center gap-2">
                                                                                <span className="text-xs text-[var(--text-secondary)] whitespace-nowrap font-bold">皛�</span>
                                                                                <input
                                                                                    type="number"
                                                                                    className="input-field text-xs p-2 w-20 text-center font-mono font-bold"
                                                                                    placeholder="隞�"
                                                                                    disabled={!product.has_volume_pricing}
                                                                                    value={tier.target_quantity ?? ''}
                                                                                    onChange={(e) => {
                                                                                        const next = [...rawTiers];
                                                                                        next[idx] = { ...next[idx], target_quantity: e.target.value !== '' ? Number(e.target.value) : '' };
                                                                                        handleFieldChange(product.id, 'volume_pricing_settings', { ...(product.volume_pricing_settings || {}), tiers: next });
                                                                                    }}
                                                                                    onBlur={() => updateTiers(rawTiers)}
                                                                                />
                                                                                <span className="text-xs text-[var(--text-secondary)] whitespace-nowrap font-bold">隞塚��芣�蝮賢� �� $</span>
                                                                                <div className="relative flex-1 max-w-[140px]">
                                                                                    <input
                                                                                        type="number"
                                                                                        className="input-field text-xs p-2 w-full font-mono font-bold"
                                                                                        placeholder="蝯���孵�"
                                                                                        disabled={!product.has_volume_pricing}
                                                                                        value={tier.package_price ?? ''}
                                                                                        onChange={(e) => {
                                                                                            const next = [...rawTiers];
                                                                                            next[idx] = { ...next[idx], package_price: e.target.value !== '' ? Number(e.target.value) : '' };
                                                                                            handleFieldChange(product.id, 'volume_pricing_settings', { ...(product.volume_pricing_settings || {}), tiers: next });
                                                                                        }}
                                                                                        onBlur={() => updateTiers(rawTiers)}
                                                                                    />
                                                                                </div>
                                                                                {rawTiers.length > 1 && (
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={() => {
                                                                                            const next = rawTiers.filter((_, i) => i !== idx);
                                                                                            updateTiers(next);
                                                                                        }}
                                                                                        className="p-1 rounded-md text-rose-500 hover:bg-rose-500/10 transition-colors"
                                                                                        title="�芷膄甇日�璇�"
                                                                                    >
                                                                                        <Trash2 size={14} />
                                                                                    </button>
                                                                                )}
                                                                            </div>
                                                                        ))}
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => {
                                                                                const next = [...rawTiers, { target_quantity: '', package_price: '' }];
                                                                                handleFieldChange(product.id, 'volume_pricing_settings', { ...(product.volume_pricing_settings || {}), tiers: next });
                                                                            }}
                                                                            className="self-start text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 mt-1"
                                                                        >
                                                                            �� �啣��湧��芣��擧０ (靘�: 皛�24隞� $400)
                                                                        </button>
                                                                    </div>
                                                                );
                                                            })()}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* ------------------------------------------------------------- */}
                                                {/* �� TAB 3嚗𡁻��曄冗�����憿� */}
                                                {/* ------------------------------------------------------------- */}
                                                {currentTab === 'community' && (
                                                    <div className="flex flex-col gap-4 text-xs animate-fade-in">
                                                        {/* �𧢲𦆮蝷曉��賢��� */}
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
                                                                const cname = String(c.communityName || c.CommunityName || '').trim();
                                                                if (c.status && c.status !== 'ACTIVE') return false;
                                                                if (hiddenBuildings.includes(cname) || hiddenBuildings.includes(cid)) return false;

                                                                // ��噶�𢠃��曄冗��鋆∠�蝝磰��踹��梯�韏瑚� (憒�蝱�堒�隞�噸����蝱�堒�摰𡁜�)嚗��靽萘�撖阡�蝷曉�憭扳����𣬚�銝𠹺��柴��
                                                                if (!['蝺帋�銝见鱓', '銝��祆袇摰�', '銝��祉鍂��', '銝羓�銝见鱓', '銝��砍虜��', '撣豢��嗅睸'].includes(cname)) {
                                                                    const cleanName = cname.replace(/^(�啣�撣�擃㗛�撣��啁�|�箇�)/, '').trim();
                                                                    if (cleanName.endsWith('��') && !cleanName.includes('憭扳�') && !cleanName.includes('蝷曉�') && !cleanName.includes('�臬�') && !cleanName.includes('�𠰴�') && !cleanName.includes('撅梯�') && !cleanName.includes('憭批�')) {
                                                                        return false;
                                                                    }
                                                                }
                                                                return true;
                                                            });

                                                            if (visibleCommunities.length === 0) return <div className="text-[var(--text-tertiary)] py-4 text-center">�∪虾�函冗��皜�鱓</div>;

                                                            const quotas = product.communityQuotas || {};

                                                            return (
                                                                <>
                                                                    {/* �𧢲𦆮蝷曉��賢��� */}
                                                                    <div className="flex flex-col gap-2 bg-[var(--bg-tertiary)]/30 p-3.5 rounded-xl border border-purple-400/30">
                                                                        <div className="flex justify-between items-center">
                                                                            <span className="text-[10px] uppercase font-extrabold text-purple-500 tracking-wider">�� �𧢲𦆮蝷曉�嚗�𧊋�豢�隞�”�典��𧢲𦆮嚗�㗲�詻�𣬚�銝𠹺��柴�滢誨銵券��暹��㕑��踹���袇摰ｇ�</span>
                                                                            {(product.allowedCommunityIds || []).length > 0 && (
                                                                                <button
                                                                                    className="text-[10px] text-red-400 hover:text-red-600 font-bold cursor-pointer"
                                                                                    onClick={() => {
                                                                                        handleFieldChange(product.id, 'allowedCommunityIds', []);
                                                                                        handleSaveProduct(product.id, { allowedCommunityIds: [] });
                                                                                    }}
                                                                                >
                                                                                    皜�膄�券�
                                                                                </button>
                                                                            )}
                                                                        </div>
                                                                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-40 overflow-y-auto pr-1">
                                                                            {visibleCommunities.map(c => {
                                                                                const ids = product.allowedCommunityIds || [];
                                                                                const cid = c.communityId || c.CommunityId;
                                                                                const cname = c.communityName || c.CommunityName;
                                                                                const checked = ids.includes(cid) || ids.includes(cname);
                                                                                const isOnlineAll = cname === '蝺帋�銝见鱓';
                                                                                return (
                                                                                    <label key={cid || cname} className={`flex items-center gap-2 cursor-pointer group p-1.5 rounded transition-all ${isOnlineAll ? 'bg-purple-500/10 border border-purple-500/30 col-span-full' : 'hover:bg-[var(--bg-tertiary)]'}`}>
                                                                                        <input
                                                                                            type="checkbox"
                                                                                            checked={checked}
                                                                                            className="w-3.5 h-3.5 accent-purple-500 cursor-pointer"
                                                                                            onChange={(e) => {
                                                                                                const next = new Set(ids);
                                                                                                if (e.target.checked) {
                                                                                                    if (cid) next.add(cid);
                                                                                                    if (cname) next.add(cname);
                                                                                                } else {
                                                                                                    if (cid) next.delete(cid);
                                                                                                    if (cname) next.delete(cname);
                                                                                                }
                                                                                                const newIds = [...next];
                                                                                                handleFieldChange(product.id, 'allowedCommunityIds', newIds);
                                                                                                handleSaveProduct(product.id, { allowedCommunityIds: newIds });
                                                                                            }}
                                                                                        />
                                                                                        <span className={`text-xs font-bold ${isOnlineAll ? 'text-purple-600 dark:text-purple-400 font-extrabold' : 'text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]'} truncate`}>
                                                                                            {isOnlineAll ? '�� 蝺帋�銝见鱓 (�芸���鉄���㕑��踹���袇摰�)' : cname}
                                                                                        </span>
                                                                                    </label>
                                                                                );
                                                                            })}
                                                                        </div>
                                                                    </div>

                                                                    {/* 蝷曉��典振�鞾��漤� */}
                                                                    <div className="flex flex-col gap-2.5 bg-gradient-to-r from-amber-500/5 via-purple-500/5 to-amber-500/5 p-3.5 rounded-xl border border-amber-400/30">
                                                                        <div className="flex justify-between items-center">
                                                                            <span className="text-xs uppercase font-extrabold text-amber-600 dark:text-amber-400 tracking-wider flex items-center gap-1.5">
                                                                                �𤣳 蝷曉��典振�嗉頃�漤� (�芸‵撖思誨銵其�閮凋���)
                                                                            </span>
                                                                            {Object.keys(quotas).length > 0 && (
                                                                                <button
                                                                                    className="text-[10px] text-red-400 hover:text-red-600 font-bold cursor-pointer"
                                                                                    onClick={() => {
                                                                                        handleFieldChange(product.id, 'communityQuotas', {});
                                                                                        handleSaveProduct(product.id, { communityQuotas: {} });
                                                                                    }}
                                                                                >
                                                                                    皜�膄���厩冗���漤�
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
                                                                                                    撌脣睸 {soldQtyVal}
                                                                                                </span>
                                                                                            )}
                                                                                        </div>
                                                                                        <input
                                                                                            type="number"
                                                                                            min="1"
                                                                                            placeholder="�⊿���"
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
                                                                                                handleSaveProduct(product.id, { communityQuotas: nextQuotas });
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
                                                {/* �蘨 TAB 5嚗𡁻�撣� POS 閮剖� */}
                                                {/* ------------------------------------------------------------- */}
                                                {currentTab === 'pos' && (
                                                    <div className="bg-[var(--bg-primary)] rounded-2xl p-4 md:p-5 border border-[var(--border-primary)] text-xs flex flex-col gap-5 animate-fade-in shadow-inner">
                                                        <div className="flex items-center gap-2 pb-3 border-b border-[var(--border-primary)]/50">
                                                            <div className="p-1.5 bg-indigo-500/10 rounded-lg text-indigo-600 dark:text-indigo-400">
                                                                <Store size={18} />
                                                            </div>
                                                            <span className="text-sm font-extrabold text-indigo-600 dark:text-indigo-400 tracking-wider">��撣� POS �函�閮剖�</span>
                                                            <div className="flex-1"></div>
                                                            <div className="flex items-center gap-2 bg-[var(--bg-tertiary)] px-3 py-1.5 rounded-lg border border-[var(--border-primary)]">
                                                                <span className={`text-xs font-bold whitespace-nowrap ${product.posSettings?.isActive !== false ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'}`}>
                                                                    {product.posSettings?.isActive !== false ? '�� POS 撌脣���' : '�� POS 撌脣���'}
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
                                                                {/* 璇萘Ⅳ蝞∠���憛� */}
                                                                <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] p-4 rounded-xl shadow-xs">
                                                                    <div className="flex items-center justify-between mb-3">
                                                                        <div className="flex items-center gap-1.5">
                                                                            <Barcode size={16} className="text-slate-600 dark:text-slate-400" />
                                                                            <span className="font-bold text-sm text-[var(--text-primary)]">�钅�璇萘Ⅳ蝞∠� (�舀螱憭𡁶�)</span>
                                                                        </div>
                                                                        <div className="text-[10px] font-bold px-2 py-1 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-md flex items-center gap-1">
                                                                            <Zap size={10} />
                                                                            皜豢�暺墧�銝𧢲䲮頛詨�獢���喳虾雿輻鍂��Ⅳ瑽漤������
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
                                                                                    title="蝘駁膄甇斗�蝣�"
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
                                                                                placeholder="�冽迨�瑕��唳�蝣潘��𡝗��閗撓�亙��� Enter"
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
                                                {/* �� TAB 6嚗鋫I 鋆𡏭疏��彍 */}
                                                {/* ------------------------------------------------------------- */}
                                                {currentTab === 'ai' && (
                                                    <div className="bg-[var(--bg-primary)] rounded-2xl p-4 border border-[var(--border-primary)] text-xs flex flex-col gap-4 animate-fade-in shadow-inner">
                                                        <div className="flex items-center gap-1.5 pb-2 border-b border-[var(--border-primary)]">
                                                            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                                                            <span className="text-xs uppercase font-extrabold text-amber-600 dark:text-amber-400 tracking-wider">�� AI �䁅疏鋆𡏭疏�脤��滨蔭��彍</span>
                                                        </div>

                                                        <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
                                                            {/* AI �����䔄鞎券�璇� */}
                                                            <div className="flex flex-col gap-2">
                                                                <span className="text-xs font-bold text-[var(--text-primary)]">�𣑐 �潸疏������璇�</span>
                                                                <div className="grid grid-cols-2 gap-2">
                                                                    <div className="flex flex-col gap-1">
                                                                        <span className="text-[11px] text-[var(--text-secondary)] font-medium">�渡拳�����</span>
                                                                        <input
                                                                            type="number"
                                                                            className="input-field text-xs p-2 font-mono"
                                                                            placeholder="靘页�24"
                                                                            value={product.packSize === '' || product.packSize === undefined || product.packSize === null ? '' : product.packSize}
                                                                            onChange={(e) => handleFieldChange(product.id, 'packSize', e.target.value !== '' ? Number(e.target.value) : '')}
                                                                            onBlur={(e) => handleSaveProduct(product.id, { packSize: e.target.value !== '' ? Number(e.target.value) : 1 })}
                                                                        />
                                                                    </div>
                                                                    <div className="flex flex-col gap-1">
                                                                        <span className="text-[11px] text-[var(--text-secondary)] font-medium">�潸疏�擧０ (�𡑒����)</span>
                                                                        <input
                                                                            type="text"
                                                                            className="input-field text-xs p-2 font-mono"
                                                                            placeholder="靘页�24, 48"
                                                                            value={Array.isArray(product.dispatchSteps) ? product.dispatchSteps.join(', ') : product.dispatchSteps || ''}
                                                                            onChange={(e) => handleFieldChange(product.id, 'dispatchSteps', e.target.value)}
                                                                            onBlur={(e) => handleSaveProduct(product.id, { dispatchSteps: e.target.value })}
                                                                        />
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            {/* �渲死�𣈯���瑼� (擃睃�瘥𥪯漁�脖蜓憿�) */}
                                                            <div className="flex flex-col gap-2">
                                                                <span className="text-xs font-extrabold text-rose-700 flex items-center gap-1">�� �渲死�𣈯���瑼�</span>
                                                                <div className="flex flex-col gap-1">
                                                                    <span className="text-[11px] text-slate-600 font-bold">頨思��㗇迨�賊��喃��� (靘�: 5)</span>
                                                                    <input
                                                                        type="number"
                                                                        className="w-full bg-white text-slate-900 border-2 border-rose-400 focus:border-rose-600 focus:ring-2 focus:ring-rose-200 text-xs p-2 text-center font-mono font-black shadow-sm rounded-lg"
                                                                        placeholder="靘页�5 (頨思���5�喃���)"
                                                                        value={product.stopPickupThreshold === '' || product.stopPickupThreshold === undefined || product.stopPickupThreshold === null ? '' : product.stopPickupThreshold}
                                                                        onChange={(e) => handleFieldChange(product.id, 'stopPickupThreshold', e.target.value !== '' ? Number(e.target.value) : '')}
                                                                        onBlur={(e) => handleSaveProduct(product.id, { stopPickupThreshold: e.target.value !== '' ? Number(e.target.value) : null })}
                                                                    />
                                                                </div>
                                                            </div>

                                                            {/* �脖���瑼餉�銝𢠃� */}
                                                            <div className="flex flex-col gap-2">
                                                                <span className="text-xs font-bold text-[var(--text-primary)]">�吔� �脖���瑼餉��賊�銝𢠃�</span>
                                                                <div className="grid grid-cols-2 gap-2">
                                                                    <div className="flex flex-col gap-1">
                                                                        <span className="text-[11px] text-[var(--text-secondary)] font-medium">��瑼� (撠暹彍憭𡁏䲰甇文朖�脩拳)</span>
                                                                        <input
                                                                            type="number"
                                                                            className="input-field text-xs p-2 text-center font-mono"
                                                                            placeholder="靘页�5"
                                                                            value={product.roundThreshold === '' || product.roundThreshold === undefined || product.roundThreshold === null ? '' : product.roundThreshold}
                                                                            onChange={(e) => handleFieldChange(product.id, 'roundThreshold', e.target.value !== '' ? Number(e.target.value) : '')}
                                                                            onBlur={(e) => handleSaveProduct(product.id, { roundThreshold: e.target.value !== '' ? Number(e.target.value) : null })}
                                                                        />
                                                                    </div>
                                                                    <div className="flex flex-col gap-1">
                                                                        <span className="text-[11px] text-[var(--text-secondary)] font-medium">��憭批遣霅圈� (0�箇��𣂼�)</span>
                                                                        <input
                                                                            type="number"
                                                                            className="input-field text-xs p-2 text-center font-mono"
                                                                            placeholder="��"
                                                                            value={product.maxSuggestion === '' || product.maxSuggestion === undefined || product.maxSuggestion === null || product.maxSuggestion === 0 ? '' : product.maxSuggestion}
                                                                            onChange={(e) => handleFieldChange(product.id, 'maxSuggestion', e.target.value !== '' ? Number(e.target.value) : '')}
                                                                            onBlur={(e) => handleSaveProduct(product.id, { maxSuggestion: e.target.value !== '' ? Number(e.target.value) : 0 })}
                                                                        />
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            {/* �箸��䁅疏�穃� */}
                                                            <div className="flex flex-col gap-2 md:pl-4 md:border-l border-[var(--border-primary)]/50">
                                                                <div className="flex justify-between items-center">
                                                                    <span className="text-xs font-bold text-[var(--text-primary)]">�� �箸���疏�穃�</span>
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
                                                                    �毺鍂敺䕘��仿�隡圈�瘙��雿𠬍�AI ��䌊�訫��䁅疏�𤩺飛�塚��踹��箄��芰��睃��𤩺袇鞎具��
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

            {/* �� �Ｙ�������撠�惇銝见鱓��� Modal */}
            {showLinkModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
                    <div className="bg-[var(--bg-secondary)] w-full max-w-2xl rounded-3xl p-5 md:p-6 shadow-2xl border border-[var(--border-primary)] flex flex-col gap-4 animate-in zoom-in-95 duration-200 max-h-[90vh]">
                        {/* 璅䠷� */}
                        <div className="flex items-center justify-between pb-3 border-b border-[var(--border-primary)]">
                            <h3 className="text-base font-extrabold text-[var(--text-primary)] flex items-center gap-2">
                                <Link2 size={18} className="text-blue-600" />
                                �Ｙ�������撠�惇銝见鱓���
                            </h3>
                            <button
                                onClick={() => setShowLinkModal(false)}
                                className="p-1.5 rounded-xl text-[var(--text-tertiary)] hover:bg-[var(--bg-tertiary)] transition-all cursor-pointer"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <div className="overflow-y-auto space-y-4 pr-1 max-h-[58vh]">
                            {/* ��������惜 (�暸� 2 ��誑銝𦠜�憿舐內) */}
                            {selectedProductIds.size > 1 && (
                                <div className="flex flex-col gap-2 p-2.5 rounded-2xl bg-[var(--bg-tertiary)]/30 border border-[var(--border-primary)]">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[11px] font-extrabold text-[var(--text-secondary)] flex items-center gap-1.5">
                                            <span>�㴓 ��������䌊閮剖� ({selectedProductIds.size} ��)</span>
                                        </span>
                                        <button
                                            type="button"
                                            onClick={handleApplyConfigToAll}
                                            className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 flex items-center gap-1 cursor-pointer bg-indigo-500/10 hover:bg-indigo-500/15 px-2.5 py-1 rounded-xl border border-indigo-500/20 transition-all active:scale-95"
                                            title="撠�𤌍�滚����瘣餃�蝮賡��粹�����曄冗�����憿滚��刻秐���匧㗲�詨���"
                                        >
                                            <span>�� �峕郊甇方身摰朞秐�嗡����</span>
                                        </button>
                                    </div>
                                    <div className="flex items-center gap-2 overflow-x-auto pb-1">
                                        {Array.from(selectedProductIds).map(id => {
                                            const p = products.find(item => item.id === id);
                                            if (!p) return null;
                                            const isCurrent = (activeModalProduct?.id === id);
                                            const cfg = modalProductConfigs[id] || {};
                                            const commCount = visibleCommunities.filter(c => {
                                                const cid = c.communityId || c.CommunityId;
                                                const cname = c.communityName || c.CommunityName;
                                                return (cfg.allowedCommunityIds || []).includes(cid) || (cfg.allowedCommunityIds || []).includes(cname);
                                            }).length;
                                            const quotaCount = Object.keys(cfg.communityQuotas || {}).length;

                                            return (
                                                <button
                                                    key={id}
                                                    type="button"
                                                    onClick={() => setActiveModalProductId(id)}
                                                    className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer border ${
                                                        isCurrent
                                                            ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-500/25'
                                                            : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] border-[var(--border-primary)] hover:border-blue-400/60'
                                                    }`}
                                                >
                                                    {p.imageUrl ? (
                                                        <img src={p.imageUrl} alt="" className="w-5 h-5 rounded-lg object-cover" />
                                                    ) : (
                                                        <Package size={14} />
                                                    )}
                                                    <span className="truncate max-w-[130px]">{p.name}</span>
                                                    <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-mono ${
                                                        isCurrent ? 'bg-white/20 text-white' : 'bg-[var(--bg-tertiary)] text-[var(--text-tertiary)]'
                                                    }`}>
                                                        {commCount > 0 ? `${commCount}��` : '�券�'}
                                                        {quotaCount > 0 ? `繚${quotaCount}�漤�` : ''}
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* 1. �嗅������暑�閧蜇�见枂�讛��箸𧋦鞈�� */}
                            {activeModalProduct && (
                                <div className="flex flex-col gap-2">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-extrabold text-[var(--text-primary)] flex items-center gap-1.5">
                                            <span>�𣑐 閮剖����嚗�</span>
                                            <span className="text-blue-600 dark:text-blue-400 underline underline-offset-2">{activeModalProduct.name}</span>
                                        </span>
                                    </div>

                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3 rounded-2xl bg-[var(--bg-tertiary)]/50 border border-[var(--border-primary)] text-xs">
                                        <div className="flex items-center gap-2.5 min-w-0">
                                            {activeModalProduct.imageUrl ? (
                                                <img src={activeModalProduct.imageUrl} alt={activeModalProduct.name} className="w-10 h-10 rounded-xl object-cover shrink-0" />
                                            ) : (
                                                <div className="w-10 h-10 rounded-xl bg-[var(--bg-tertiary)] flex items-center justify-center shrink-0">
                                                    <Package size={18} className="text-[var(--text-tertiary)]" />
                                                </div>
                                            )}
                                            <div className="min-w-0 flex-1">
                                                <div className="font-bold text-[var(--text-primary)] truncate text-sm">{activeModalProduct.name}</div>
                                                <div className="text-[11px] text-[var(--text-tertiary)] flex items-center gap-2 mt-0.5">
                                                    <span>�暹�摨怠�嚗㝯stockMap[activeModalProduct.name] ?? 0}</span>
                                                    {activeModalProduct.maxTotalQty !== null && activeModalProduct.maxTotalQty !== undefined && (
                                                        <span className="text-purple-600 dark:text-purple-400 font-bold">
                                                            �桀�撌脣睸 {activeModalProduct.soldQty || 0} / 銝𢠃� {activeModalProduct.maxTotalQty}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0 bg-[var(--bg-secondary)] px-3 py-1.5 rounded-xl border border-[var(--border-primary)]">
                                            <span className="text-[11px] font-bold text-purple-700 dark:text-purple-300">�� 瘣餃�蝮賡��粹�嚗�</span>
                                            <div className="flex items-center gap-1">
                                                <input
                                                    type="number"
                                                    min="1"
                                                    max="9999"
                                                    placeholder="銝漤�"
                                                    value={activeModalConfig.maxTotalQty ?? ''}
                                                    onChange={(e) => {
                                                        const val = e.target.value;
                                                        updateActiveProductConfig('maxTotalQty', val);
                                                    }}
                                                    className="w-16 px-1.5 py-0.5 text-center font-bold text-xs rounded-lg border border-[var(--border-primary)] bg-[var(--bg-tertiary)] text-[var(--text-primary)] focus:outline-none focus:border-purple-500 font-mono"
                                                />
                                                <span className="text-[10px] text-[var(--text-tertiary)]">隞�</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* 2. �𧢲𦆮蝷曉�嚗�𧊋�豢�隞�”�典��𧢲𦆮嚗�㗲�詻�𣬚�銝𠹺��柴�滢誨銵券��暹��㕑��踹���袇摰ｇ� - �舀𤣰�� */}
                            <div className="rounded-2xl bg-[var(--bg-tertiary)]/40 border border-[var(--border-primary)] overflow-hidden transition-all">
                                <div 
                                    className="flex justify-between items-center p-3.5 cursor-pointer hover:bg-[var(--bg-tertiary)]/60 select-none transition-colors"
                                    onClick={() => setIsAllowedCommOpen(prev => !prev)}
                                >
                                    <div className="flex items-center gap-2 min-w-0">
                                        <span className="text-[11px] uppercase font-extrabold text-purple-600 dark:text-purple-400 tracking-wider truncate">
                                            �� �𧢲𦆮蝷曉�嚗�𧊋�豢�隞�”�典��𧢲𦆮嚗�㗲�詻�𣬚�銝𠹺��柴�滢誨銵券��暹��㕑��踹���袇摰ｇ�
                                        </span>
                                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 font-bold shrink-0">
                                            {activeSelectedCommCount > 0
                                                ? `撌脤� ${activeSelectedCommCount} 蝷曉�`
                                                : '�典��𧢲𦆮 (�鞱身)'}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        {isAllowedCommOpen && activeSelectedCommCount > 0 && (
                                            <button
                                                type="button"
                                                className="text-[10px] text-red-400 hover:text-red-600 font-bold cursor-pointer mr-1"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    updateActiveProductConfig('allowedCommunityIds', []);
                                                }}
                                            >
                                                皜�膄�券�
                                            </button>
                                        )}
                                        {isAllowedCommOpen ? (
                                            <ChevronUp size={16} className="text-purple-600 dark:text-purple-400" />
                                        ) : (
                                            <ChevronDown size={16} className="text-[var(--text-tertiary)]" />
                                        )}
                                    </div>
                                </div>
                                
                                {isAllowedCommOpen && (
                                    <div className="p-3.5 pt-0 border-t border-[var(--border-primary)]/50 space-y-2 animate-in fade-in duration-150">
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto pr-1 pt-2">
                                            {visibleCommunities.map(c => {
                                                const cid = c.communityId || c.CommunityId;
                                                const cname = c.communityName || c.CommunityName;
                                                const checked = (activeModalConfig.allowedCommunityIds || []).includes(cid) || (activeModalConfig.allowedCommunityIds || []).includes(cname);
                                                const isOnlineAll = cname === '蝺帋�銝见鱓';
                                                return (
                                                    <label
                                                        key={cid || cname}
                                                        className={`flex items-center gap-2 cursor-pointer group p-1.5 rounded-xl transition-all ${
                                                            isOnlineAll
                                                                ? 'bg-purple-500/10 border border-purple-500/30 col-span-full'
                                                                : 'hover:bg-[var(--bg-secondary)] border border-transparent'
                                                        }`}
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            checked={checked}
                                                            onChange={(e) => {
                                                                const next = new Set(activeModalConfig.allowedCommunityIds || []);
                                                                if (e.target.checked) {
                                                                    if (cid) next.add(cid);
                                                                    if (cname) next.add(cname);
                                                                } else {
                                                                    if (cid) next.delete(cid);
                                                                    if (cname) next.delete(cname);
                                                                }
                                                                updateActiveProductConfig('allowedCommunityIds', [...next]);
                                                            }}
                                                            className="w-3.5 h-3.5 accent-purple-500 cursor-pointer"
                                                        />
                                                        <span className={`text-xs font-bold ${isOnlineAll ? 'text-purple-600 dark:text-purple-400 font-extrabold' : 'text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]'} truncate`}>
                                                            {isOnlineAll ? '�� 蝺帋�銝见鱓 (�芸���鉄���㕑��踹���袇摰�)' : cname}
                                                        </span>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* 3. 蝷曉��典振�嗉頃�漤� (�芸‵撖思誨銵其�閮凋���) - �舀𤣰�� */}
                            <div className="rounded-2xl bg-gradient-to-r from-amber-500/5 via-purple-500/5 to-amber-500/5 border border-amber-400/30 overflow-hidden transition-all">
                                <div 
                                    className="flex justify-between items-center p-3.5 cursor-pointer hover:bg-amber-500/10 select-none transition-colors"
                                    onClick={() => setIsCommQuotaOpen(prev => !prev)}
                                >
                                    <div className="flex items-center gap-2 min-w-0">
                                        <span className="text-xs uppercase font-extrabold text-amber-600 dark:text-amber-400 tracking-wider flex items-center gap-1.5 truncate">
                                            �𤣳 蝷曉��典振�嗉頃�漤� (�芸‵撖思誨銵其�閮凋���)
                                        </span>
                                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 font-bold shrink-0">
                                            {Object.keys(activeModalConfig.communityQuotas || {}).length > 0
                                                ? `撌脰身 ${Object.keys(activeModalConfig.communityQuotas).length} 蝷曉��漤�`
                                                : '銝滩身�� (�鞱身)'}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        {isCommQuotaOpen && Object.keys(activeModalConfig.communityQuotas || {}).length > 0 && (
                                            <button
                                                type="button"
                                                className="text-[10px] text-red-400 hover:text-red-600 font-bold cursor-pointer mr-1"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    updateActiveProductConfig('communityQuotas', {});
                                                }}
                                            >
                                                皜�膄���厩冗���漤�
                                            </button>
                                        )}
                                        {isCommQuotaOpen ? (
                                            <ChevronUp size={16} className="text-amber-600 dark:text-amber-400" />
                                        ) : (
                                            <ChevronDown size={16} className="text-amber-600 dark:text-amber-400" />
                                        )}
                                    </div>
                                </div>

                                {isCommQuotaOpen && (
                                    <div className="p-3.5 pt-0 border-t border-amber-400/20 space-y-2 animate-in fade-in duration-150">
                                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 max-h-48 overflow-y-auto pr-1 pt-2">
                                            {visibleCommunities.map(c => {
                                                const cid = c.communityId || c.CommunityId;
                                                const cname = c.communityName || c.CommunityName;
                                                const curQuotas = activeModalConfig.communityQuotas || {};
                                                const maxQtyVal = curQuotas[cname] !== undefined ? curQuotas[cname] : (curQuotas[cid] ?? '');

                                                return (
                                                    <div key={cid || cname} className="flex flex-col gap-1 p-2 bg-[var(--bg-secondary)] border border-[var(--border-primary)]/70 rounded-xl shadow-2xs">
                                                        <span className="text-xs font-bold text-[var(--text-primary)] truncate">{cname}</span>
                                                        <div className="flex items-center gap-1">
                                                            <input
                                                                type="number"
                                                                min="1"
                                                                placeholder="�⊿���"
                                                                className="input-field text-xs p-1.5 w-full font-mono"
                                                                value={maxQtyVal}
                                                                onChange={(e) => {
                                                                    const val = e.target.value !== '' ? Number(e.target.value) : '';
                                                                    const next = { ...(activeModalConfig.communityQuotas || {}) };
                                                                    if (val === '' || val === null) {
                                                                        delete next[cname];
                                                                        delete next[cid];
                                                                    } else {
                                                                        next[cname] = val;
                                                                    }
                                                                    updateActiveProductConfig('communityQuotas', next);
                                                                }}
                                                            />
                                                            <span className="text-[10px] text-[var(--text-tertiary)] shrink-0">隞�</span>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* 4. ���憭扳�/蝷曉� (�詨‵嚗�葆�仿���蝬脣���彍) */}
                            <div className="flex items-center gap-2 pt-1">
                                <span className="text-xs font-bold text-[var(--text-secondary)] whitespace-nowrap">蝬��撠�惇���憭扳�嚗�</span>
                                <select
                                    value={linkSelectedBuilding}
                                    onChange={(e) => setLinkSelectedBuilding(e.target.value)}
                                    className="flex-1 py-1.5 px-3 text-xs rounded-xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] text-[var(--text-primary)] focus:outline-none focus:border-blue-500 cursor-pointer"
                                >
                                    <option value="">銝��祉�銝𦠜袇摰� (�鞱身)</option>
                                    {visibleCommunities.map(c => {
                                        const cname = c.communityName || c.CommunityName;
                                        return (
                                            <option key={c.communityId || c.CommunityId} value={cname}>
                                                {cname}
                                            </option>
                                        );
                                    })}
                                </select>
                            </div>
                        </div>

                        {/* ����鞱汗���雿𨀣��� */}
                        <div className="pt-2 flex flex-col gap-2.5 border-t border-[var(--border-primary)]">
                            <input
                                type="text"
                                readOnly
                                value={generatedLiffUrl}
                                className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-[var(--border-primary)] bg-[var(--bg-tertiary)] text-[var(--text-secondary)] select-all"
                                onClick={(e) => e.target.select()}
                            />
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    disabled={isSavingLinkQuota}
                                    onClick={handleCopyDedicatedLink}
                                    className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 active:scale-95 text-white text-xs font-bold transition-all shadow-md shadow-blue-500/20 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                                >
                                    {isSavingLinkQuota ? (
                                        <>
                                            <RefreshCw size={16} className="animate-spin" />
                                            <span>�脣��漤���身摰帋葉...</span>
                                        </>
                                    ) : linkCopied ? (
                                        <>
                                            <Check size={16} className="text-emerald-300" />
                                            <span>�� 撌脣�摮䁅身摰帋蒂銴�ˊ撠�惇���嚗�</span>
                                        </>
                                    ) : (
                                        <>
                                            <Copy size={16} />
                                            <span>�脣�閮剖�銝西�鋆賢�撅祇���</span>
                                        </>
                                    )}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setShowLinkModal(false)}
                                    className="py-2.5 px-4 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-xs font-bold cursor-pointer"
                                >
                                    �𣈯�
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* �𩤃� �������擧��鞱郎��朖����� Modal 敶�� (擃睃�瘥娍�鈭桐蜓憿� + 皜�膄�交��蠘�) */}
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
                                        �������鞱郎�𡁶䰻
                                        <span className="text-xs bg-white text-rose-600 px-2.5 py-0.5 rounded-full font-black shadow-2xs">
                                            {expiringProducts.length} ����� 7 憭�
                                        </span>
                                    </h3>
                                    <p className="text-xs text-rose-100 font-medium mt-0.5">
                                        隞乩�����喳��唳��硋歇�擧�嚗諹��𦠜�閰蓥摯靽�啹���蝛箸𠯫������蝬脰頃銝𧢲沲��
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
                                                    <span>�桀�: <strong className="text-slate-800">${product.price || product.single_price || 0}</strong></span>
                                                    <span>�嗅�摨怠�: <strong className="text-slate-800">{currentStock}</strong></span>
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
                                                    {daysLeft < 0 ? `撌脤��� ${Math.abs(daysLeft)} 憭奈 : daysLeft === 0 ? '隞𦠜𠯫�唳�' : `�� ${daysLeft} 憭拙��鬮}
                                                </span>
                                            </div>

                                            {/* 皜�膄�交��厰� */}
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    handleFieldChange(product.id, 'expiryDate', '');
                                                    handleSaveProduct(product.id, { expiryDate: '' });
                                                }}
                                                className="px-2.5 py-1.5 text-xs font-bold text-slate-600 hover:text-rose-600 bg-white hover:bg-rose-50 border border-slate-200 hover:border-rose-200 rounded-xl transition-all cursor-pointer flex items-center gap-1 shrink-0 shadow-2xs group"
                                                title="皜�膄甇文�����㗇��交�"
                                            >
                                                <Trash2 size={13} className="text-slate-400 group-hover:text-rose-500" />
                                                皜�膄�交�
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
                                                    {product.isActive ? '�� 蝬脰頃銝𦠜沲' : '�麱 撌脖���'}
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
                                �� �嗆𠯫銝滚��鞾�
                            </label>
                            <button
                                type="button"
                                onClick={handleCloseExpiryModal}
                                className="w-full sm:w-auto px-6 py-2 bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-700 hover:to-amber-700 text-white font-black text-xs rounded-xl shadow-md transition-all cursor-pointer"
                            >
                                �𤑳䰻�㮖� / �𣈯��𡁶䰻
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
