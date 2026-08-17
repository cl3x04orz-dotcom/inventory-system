import React, { useState, useEffect, useCallback } from 'react';
import { Package, ClipboardList, Eye, Edit, Trash2, CheckCircle, RefreshCw, X, User, Users, Phone, MapPin, FileText, Plus, Minus, Save, Calendar, Clock, Check, Search, Copy, PackageSearch, ChevronDown, ChevronUp, Building2, CreditCard } from 'lucide-react';
import { callGAS } from '../utils/api';
import { copyToClipboard } from '../utils/clipboard';

// --- 🎨 口味備註解析與格式化輔助函數 ---
const parseRemarkToFlavorMap = (remarkStr, flavorChoices = [], currentTotalQty = 0) => {
    const map = {};
    if (!remarkStr) {
        if (flavorChoices.length > 0 && currentTotalQty > 0) {
            map[flavorChoices[0]] = currentTotalQty;
        }
        return map;
    }
    const clean = String(remarkStr).replace(/【口味備註：(.*?)】/, '$1').trim();
    if (!clean) {
        if (flavorChoices.length > 0 && currentTotalQty > 0) {
            map[flavorChoices[0]] = currentTotalQty;
        }
        return map;
    }
    const parts = clean.split(/[,，;；]/).map(s => s.trim()).filter(Boolean);
    parts.forEach(part => {
        const m = part.match(/^(.+?)[xX*](\d+)$/);
        if (m) {
            const f = m[1].trim();
            const q = parseInt(m[2], 10) || 0;
            if (f && q > 0) {
                map[f] = (map[f] || 0) + q;
            }
        } else if (flavorChoices.includes(part)) {
            map[part] = (map[part] || 0) + 1;
        }
    });
    if (Object.keys(map).length === 0 && flavorChoices.length > 0 && currentTotalQty > 0) {
        map[flavorChoices[0]] = currentTotalQty;
    }
    return map;
};

const formatFlavorMapToRemark = (flavorMap = {}) => {
    const entries = Object.entries(flavorMap).filter(([_, qty]) => Number(qty) > 0);
    if (entries.length === 0) return '';
    const str = entries.map(([flavor, qty]) => `${flavor}x${qty}`).join(', ');
    return `【口味備註：${str}】`;
};

const calculateTotalQtyFromFlavorMap = (flavorMap = {}) => {
    return Object.values(flavorMap).reduce((sum, q) => sum + (Number(q) || 0), 0);
};

const stripTrailingQty = (str) => {
    if (!str) return '';
    const trimmed = String(str).trim();
    if (/[,，+]/.test(trimmed)) {
        return trimmed;
    }
    return trimmed.replace(/x1$/i, '').trim();
};

const SearchableProductSelect = ({ products = [], onSelect, placeholder = "-- 新增商品 --", className = "" }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');

    const filteredProducts = React.useMemo(() => {
        if (!search.trim()) return products;
        const q = search.toLowerCase().trim();
        return products.filter(p => 
            (p.name && p.name.toLowerCase().includes(q)) || 
            (p.id && p.id.toLowerCase().includes(q))
        );
    }, [products, search]);

    return (
        <div className={`relative inline-block text-left ${className}`}>
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-1.5 text-xs py-1.5 px-3 bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] border border-[var(--border-primary)] rounded-lg font-bold text-[var(--text-primary)] shadow-sm transition-all active:scale-95"
            >
                <Plus size={14} className="text-blue-500" />
                <span>{placeholder}</span>
                <ChevronDown size={13} className={`text-[var(--text-secondary)] transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
                <>
                    <div 
                        className="fixed inset-0 z-[110]" 
                        onClick={() => { setIsOpen(false); setSearch(''); }} 
                    />
                    <div className="absolute right-0 top-full mt-1.5 w-64 md:w-72 bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl shadow-2xl z-[120] p-2 animate-in fade-in slide-in-from-top-2 duration-150">
                        <div className="relative mb-2">
                            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
                            <input
                                type="text"
                                autoFocus
                                placeholder="搜尋商品名稱或編號..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="w-full pl-8 pr-2 py-1.5 text-xs bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded-lg text-[var(--text-primary)] focus:ring-2 focus:ring-blue-500 focus:outline-none"
                            />
                        </div>
                        <div className="max-h-56 overflow-y-auto space-y-1 divide-y divide-[var(--border-primary)]/40">
                            {filteredProducts.length === 0 ? (
                                <div className="p-3 text-center text-xs text-[var(--text-secondary)]">
                                    找不到符合的商品
                                </div>
                            ) : (
                                filteredProducts.map(p => (
                                    <button
                                        key={p.id}
                                        type="button"
                                        onClick={() => {
                                            onSelect(p.id);
                                            setIsOpen(false);
                                            setSearch('');
                                        }}
                                        className="w-full text-left p-2 hover:bg-blue-50 dark:hover:bg-blue-950/40 rounded-lg flex justify-between items-center transition-colors group"
                                    >
                                        <div className="min-w-0 pr-2">
                                            <div className="text-xs font-bold text-[var(--text-primary)] group-hover:text-blue-600 truncate">
                                                {p.name}
                                            </div>
                                            <div className="text-[10px] text-[var(--text-secondary)] font-mono">
                                                {p.id}
                                            </div>
                                        </div>
                                        <span className="text-xs font-mono font-bold text-blue-600 shrink-0">
                                            ${p.single_price || p.price}
                                        </span>
                                    </button>
                                ))
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

const formatCleanProductNameAndFlavor = (rawProductName, rawRemark, qty) => {
    let pName = String(rawProductName || '').trim();
    let rem = String(rawRemark || '').trim();

    // 先全區尋找是否有 【口味備註：...】 或 【...】
    let innerFlavor = '';
    const combinedStr = `${pName} ${rem}`;

    if (combinedStr.includes('【口味備註：')) {
        const match = combinedStr.match(/【口味備註：(.*?)】/);
        if (match && match[1]) innerFlavor = match[1].trim();
    } else if (combinedStr.includes('【') && combinedStr.includes('】')) {
        const match = combinedStr.match(/【(.*?)】/);
        if (match && match[1]) innerFlavor = match[1].trim();
    } else if (rem && rem !== '贈品') {
        innerFlavor = rem;
    }

    if (innerFlavor) {
        innerFlavor = stripTrailingQty(innerFlavor);
        innerFlavor = innerFlavor.replace(/【?口味備註：?/g, '').replace(/】/g, '').trim();
    }

    // 乾淨的主要商品名稱 (剔除括號與【...】及隨後的冗餘文字)
    let cleanBaseName = pName
        .split('【')[0]
        .split('(')[0]
        .replace(/x\d+$/i, '')
        .trim();

    if (!cleanBaseName) cleanBaseName = pName;

    const flavorBracket = innerFlavor ? `【${innerFlavor}】` : '';
    const qtyStr = qty != null ? `x${qty}` : '';

    return {
        cleanBaseName,
        innerFlavor,
        flavorBracket,
        pNameDisplay: `${cleanBaseName}${flavorBracket}`,
        fullDisplay: `${cleanBaseName}${flavorBracket}${qtyStr}`
    };
};

const formatDetailItemLine = (item, prod) => {
    const isBundle = prod ? prod.isBundle : false;
    const bundleSize = prod ? prod.bundleSize : 1;
    const unitStr = isBundle ? `組 (共 ${item.qty * bundleSize} 瓶)` : '瓶';

    const formatted = formatCleanProductNameAndFlavor(item.productName || item.productId, item.remark, item.qty);

    return `   - ${formatted.cleanBaseName} x ${item.qty} ${unitStr}${formatted.flavorBracket}`;
};

export default function PendingOrdersPage({ user, apiUrl }) {
    const [orders, setOrders] = useState([]);
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('PENDING'); // 'PENDING' | 'CONFIRMED'
    const [groupBindings, setGroupBindings] = useState({});
    const [selectedBuilding, setSelectedBuilding] = useState('全部');
    const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('全部');
    const [copied, setCopied] = useState(false);
    const [detailCopied, setDetailCopied] = useState(false);
    const [clientDetailCopied, setClientDetailCopied] = useState(false);
    const [newGroupNames, setNewGroupNames] = useState({});
    const [isBinding, setIsBinding] = useState(false);

    // 編輯 Modal
    const [showEditModal, setShowEditModal] = useState(false);
    const [editingOrder, setEditingOrder] = useState(null);
    const [isSaving, setIsSaving] = useState(false);
    const [adminFlavorModal, setAdminFlavorModal] = useState(null); // { type: 'ORDER_ITEM' | 'RECIPIENT_ITEM', itemIdx?, recipientId?, productId, productName, flavorChoices, tempFlavors: { [flavor]: qty } }

    // 搜尋與篩選
    const [searchTerm, setSearchTerm] = useState('');
    const [productSearchTerm, setProductSearchTerm] = useState('');
    const [isExactProductMatch, setIsExactProductMatch] = useState(false); // 🎯 精確全名相符切換 (避免「禾香優格」被「禾香優格飲」誤觸發)
    const [showProductAutocomplete, setShowProductAutocomplete] = useState(false); // 🔍 打字自動浮出商品與口味選單
    const [expandedOrderIds, setExpandedOrderIds] = useState(new Set());
    const [dateFilter, setDateFilter] = useState(''); // 出貨日期篩選
    const [startDate, setStartDate] = useState('');   // 起始日期篩選
    const [endDate, setEndDate] = useState('');       // 結束日期篩選
    const [dateModalOrder, setDateModalOrder] = useState(null); // 設定出貨日期的目標訂單
    const [dateModalValue, setDateModalValue] = useState('');
    const [isSavingDate, setIsSavingDate] = useState(false);

    // 取得相對天數的 YYYY-MM-DD 日期字串 (用於日期搜尋快捷按鍵)
    const getRelativeDateStr = useCallback((offsetDays) => {
        const d = new Date();
        d.setDate(d.getDate() + offsetDays);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const dateNum = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${dateNum}`;
    }, []);

    // 批次與大樓功能狀態
    const [selectedOrderIds, setSelectedOrderIds] = useState([]);
    const [isBatchProcessing, setIsBatchProcessing] = useState(false);
    const [batchMessage, setBatchMessage] = useState('');
    const [buildings, setBuildings] = useState([]);
    const [buildingSettingsList, setBuildingSettingsList] = useState([]);

    const calculateItemSubtotal = useCallback((productId, qty, fallbackPrice = 0) => {
        const prod = products.find(p => p.id === productId || p.name === productId);
        if (!prod) {
            return (Number(fallbackPrice) || 0) * (Number(qty) || 0);
        }
        const singlePrice = Number(prod.single_price) || Number(prod.price) || Number(fallbackPrice) || 0;
        // 多組促銷：買X送Y
        if (Array.isArray(prod.promotions) && prod.promotions.length > 0) {
            let bestFree = 0;
            for (const promo of prod.promotions) {
                const bx = Number(promo.buyX);
                const gy = Number(promo.getY);
                if (bx > 0 && gy > 0) {
                    const free = Math.floor(qty / (bx + gy)) * gy;
                    if (free > bestFree) bestFree = free;
                }
            }
            return singlePrice * (qty - bestFree);
        }
        // 多件優惠 (階梯組合價 - 多階梯貪婪演算法)
        if (prod.has_volume_pricing && prod.volume_pricing_settings) {
            let settings = prod.volume_pricing_settings;
            if (typeof settings === 'string') {
                try { settings = JSON.parse(settings); } catch (e) {}
            }
            let tiers = [];
            if (settings && Array.isArray(settings.tiers) && settings.tiers.length > 0) {
                tiers = settings.tiers
                    .map(t => ({ target_quantity: Number(t.target_quantity || 0), package_price: Number(t.package_price || 0) }))
                    .filter(t => t.target_quantity > 0 && t.package_price > 0);
            } else if (settings && Number(settings.target_quantity) > 0 && Number(settings.package_price) > 0) {
                tiers = [{ target_quantity: Number(settings.target_quantity), package_price: Number(settings.package_price) }];
            }
            tiers.sort((a, b) => b.target_quantity - a.target_quantity);

            if (tiers.length > 0) {
                let remaining = qty;
                let total = 0;
                for (const tier of tiers) {
                    if (remaining >= tier.target_quantity) {
                        const count = Math.floor(remaining / tier.target_quantity);
                        total += count * tier.package_price;
                        remaining %= tier.target_quantity;
                    }
                }
                total += remaining * singlePrice;
                return total;
            }
        }
        return singlePrice * qty;
    }, [products]);

    const normalizeOrder = useCallback((order) => {
        if (!order || !order.items) return order;
        const hasRecipients = order.recipients && Array.isArray(order.recipients) && order.recipients.length > 0;
        
        const normalizedRecipients = hasRecipients ? order.recipients.map(r => ({
            ...r,
            items: (r.items || []).map(ri => {
                const isGift = Boolean(
                    ri.isGift ||
                    Number(ri.price) === 0 ||
                    Number(ri.unitPrice) === 0 ||
                    (ri.remark && String(ri.remark).includes('贈品')) ||
                    (ri.productName && String(ri.productName).includes('贈品'))
                );
                const prod = products.find(p => p.id === ri.productId || p.name === ri.productName || p.name === ri.productId);
                // 🛡️ 歷史快照保護：若有原始小計則保留，避免隨新促銷活動變動歷史訂單金額
                const hasOriginalSubtotal = ri.subtotal !== undefined && ri.subtotal !== null && !isNaN(Number(ri.subtotal));
                const sub = isGift ? 0 : (hasOriginalSubtotal ? Number(ri.subtotal) : calculateItemSubtotal(ri.productId || ri.productName, ri.qty, ri.price ?? ri.unitPrice));
                return {
                    ...ri,
                    price: isGift ? 0 : (ri.price ?? ri.unitPrice),
                    unitPrice: isGift ? 0 : (ri.unitPrice ?? ri.price),
                    subtotal: isGift ? 0 : (Number(sub) || 0)
                };
            })
        })) : order.recipients;

        const normalizedItems = order.items.map(item => {
            const isGift = Boolean(
                item.isGift ||
                Number(item.unitPrice) === 0 ||
                Number(item.price) === 0 ||
                (item.remark && String(item.remark).includes('贈品')) ||
                (item.productName && String(item.productName).includes('贈品'))
            );
            const prod = products.find(p => p.id === item.productId || p.name === item.productName || p.name === item.productId);
            let sub = isGift ? 0 : item.subtotal;
            if (!isGift) {
                // 🛡️ 歷史快照保護：若歷史訂單已有寫入的小計 (item.subtotal)，優先保留快照，避免受日後新活動影響！
                if (sub == null || isNaN(Number(sub))) {
                    sub = calculateItemSubtotal(item.productId, item.qty, item.unitPrice);
                }
            }

            let finalRemark = item.remark || '';
            if (hasRecipients && prod && prod.has_flavor_attributes) {
                const flavorMap = {};
                const rawRemarks = [];
                normalizedRecipients.forEach(r => {
                    (r.items || []).forEach(ri => {
                        if (ri.productId === item.productId || ri.productName === item.productName) {
                            const remStr = ri.remark || '';
                            if (remStr) {
                                const cleanRemark = remStr.replace(/【口味備註：(.*?)】/, '$1');
                                cleanRemark.split(/[,，\s+]/).forEach(part => {
                                    const match = part.trim().match(/^\(?([^\s*x:：)]+)\)?\s*[*xX:：]\s*(\d+)$/);
                                    if (match) {
                                        const fName = match[1];
                                        const fQty = Number(match[2]);
                                        if (fName && fQty > 0) {
                                            flavorMap[fName] = (flavorMap[fName] || 0) + fQty;
                                        }
                                    } else if (part.trim() && !part.trim().includes('口味備註')) {
                                        if (!rawRemarks.includes(part.trim())) rawRemarks.push(part.trim());
                                    }
                                });
                            }
                        }
                    });
                });
                if (Object.keys(flavorMap).length > 0) {
                    const fParts = Object.entries(flavorMap).map(([k, v]) => `${k}x${v}`);
                    if (rawRemarks.length > 0) fParts.push(...rawRemarks);
                    finalRemark = `【口味備註：${fParts.join(', ')}】`;
                }
            }

            return {
                ...item,
                unitPrice: isGift ? 0 : (item.unitPrice ?? (prod ? (Number(prod.single_price) || Number(prod.price)) : 0)),
                subtotal: isGift ? 0 : (Number(sub) || 0),
                remark: finalRemark
            };
        });

        return {
            ...order,
            recipients: normalizedRecipients,
            items: normalizedItems,
            totalAmount: normalizedItems.reduce((s, it) => s + (Number(it.subtotal) || 0), 0) + Number(order.shippingFee || 0)
        };
    }, [products, calculateItemSubtotal]);

    const fetchOrders = useCallback(async () => {
        setLoading(true);
        try {
            const data = await callGAS(apiUrl, 'getPendingOrders', { status: activeTab }, user.token);
            if (Array.isArray(data)) {
                setOrders(data.map(order => normalizeOrder(order)));
            }
        } catch (error) {
            console.error('Failed to fetch orders:', error);
            alert('載入訂單失敗: ' + error.message);
        } finally {
            setLoading(false);
        }
    }, [apiUrl, user.token, activeTab]);

    const fetchProducts = useCallback(async () => {
        try {
            const data = await callGAS(apiUrl, 'getProducts', {}, user.token);
            if (Array.isArray(data)) {
                setProducts(data);
            }
        } catch (error) {
            console.error('Failed to fetch products:', error);
        }
    }, [apiUrl, user.token]);

    const fetchGroupBindings = useCallback(async () => {
        try {
            const data = await callGAS(apiUrl, 'getGroupBindings', {}, user.token);
            if (data && typeof data === 'object') {
                setGroupBindings(data);
            }
        } catch (error) {
            console.error('Failed to fetch group bindings:', error);
        }
    }, [apiUrl, user.token]);

    const fetchBuildings = useCallback(async () => {
        try {
            const data = await callGAS(apiUrl, 'getBuildingSettings', {}, user.token);
            if (Array.isArray(data)) {
                setBuildingSettingsList(data);
                const names = data.map(b => b.building).filter(Boolean);
                // 去重
                setBuildings(Array.from(new Set(names)));
            }
        } catch (error) {
            console.error('Failed to fetch buildings settings:', error);
        }
    }, [apiUrl, user.token]);
 
     useEffect(() => {
         if (user?.token) {
             fetchOrders();
             fetchProducts();
             fetchGroupBindings();
             fetchBuildings();
         }
     }, [user.token, activeTab, fetchOrders, fetchProducts, fetchGroupBindings, fetchBuildings]);

    // 進到訂單審核或切換大樓時，自動在背景掃描並導入全站全大樓本週定期配，實現「100% 全自動無感零點擊體驗」
    useEffect(() => {
        if (user?.token && activeTab === 'PENDING') {
            const autoImport = async () => {
                try {
                    const res = await callGAS(apiUrl, 'generateSubscriptionOrders', {
                        building: selectedBuilding || '全部',
                        importWeek: true
                    }, user.token);
                    
                    if (res && res.success && res.count > 0) {
                        fetchOrders();
                    }
                } catch (error) {
                    console.error('Auto import subscriptions failed:', error);
                }
            };
            autoImport();
        }
    }, [selectedBuilding, activeTab, user.token, apiUrl, fetchOrders]);

    const handleConfirmOrder = async (orderId) => {
        if (!window.confirm(`確定要將訂單 ${orderId} 確認出貨嗎？\n此動作會正式扣減商品庫存，並寫入銷售紀錄！`)) {
            return;
        }

        setLoading(true);
        try {
            const res = await callGAS(apiUrl, 'confirmPendingOrder', { orderId }, user.token);
            if (res && res.error) {
                throw new Error(res.error);
            }
            alert('訂單確認出貨成功，庫存已扣減！');
            fetchOrders();
        } catch (error) {
            alert('確認出貨失敗: ' + error.message);
            setLoading(false);
        }
    };

    const handleDeleteOrder = async (orderId) => {
        if (!window.confirm(`確定要【刪除】訂單 ${orderId} 嗎？\n此動作無法復原，通常用於客人誤按送出的情況。`)) return;
        setLoading(true);
        try {
            const res = await callGAS(apiUrl, 'deletePendingOrder', { orderId }, user.token);
            if (res?.error) throw new Error(res.error);
            fetchOrders();
        } catch (error) {
            alert('刪除失敗: ' + error.message);
            setLoading(false);
        }
    };

    const handleImportSubscriptions = async () => {
        if (selectedBuilding === '全部') {
            alert('請先在左側選單中選擇特定大樓社區（不可為「全部社區大樓」），再進行定期配導入！');
            return;
        }

        const confirmMsg = `確定要手動掃描與導入大樓【${selectedBuilding}】本週（週一至週日）的定期配/月訂鮮奶訂單嗎？\n系統會自動對應各日期的配單，並自動防重複（已導入過的不會重複）。`;
        if (!window.confirm(confirmMsg)) return;

        setLoading(true);
        try {
            const res = await callGAS(apiUrl, 'generateSubscriptionOrders', {
                building: selectedBuilding,
                importWeek: true
            }, user.token);
            
            if (res && res.error) {
                throw new Error(res.error);
            }
            
            alert(res.message || `定期配本週自動導入完成！共處理新增 ${res.count} 筆訂單。`);
            fetchOrders();
        } catch (error) {
            console.error('Failed to import subscriptions:', error);
            alert('導入定期配失敗: ' + error.message);
            setLoading(false);
        }
    };

    const handleOpenEdit = (order) => {
        const knownNames = Array.from(new Set([...buildings, ...Object.values(groupBindings)])).filter(Boolean);
        const addr = order.deliveryAddress || '';
        const matchedAddrBuilding = knownNames.find(name => name && addr.startsWith(name));

        const displayGroup = matchedAddrBuilding || groupBindings[order.sourceGroup] || order.sourceGroup || '';
        // 深拷貝 order 的 items 和 recipients，以免直接污染狀態
        setEditingOrder({
            ...order,
            sourceGroup: displayGroup,
            initialSourceGroup: displayGroup,
            rawSourceGroup: order.sourceGroup,
            items: order.items.map(item => ({ ...item })),
            recipients: order.recipients ? order.recipients.map(r => ({
                ...r,
                items: r.items.map(ri => ({ ...ri }))
            })) : []
        });
        setShowEditModal(true);
    };

    const handleEditFieldChange = (field, value) => {
        setEditingOrder(prev => {
            const updated = { ...prev, [field]: value };
            const knownNames = Array.from(new Set([...buildings, ...Object.values(groupBindings)])).filter(Boolean);

            if (field === 'sourceGroup') {
                const newGroup = value || '';
                const currentAddr = prev.deliveryAddress || '';
                const origGroup = prev.initialSourceGroup || prev.sourceGroup || '';
                
                if (newGroup) {
                    let matchPrefix = '';
                    if (origGroup && currentAddr.startsWith(origGroup)) {
                        matchPrefix = origGroup;
                    } else if (prev.sourceGroup && currentAddr.startsWith(prev.sourceGroup)) {
                        matchPrefix = prev.sourceGroup;
                    } else {
                        const matched = knownNames.find(name => name && currentAddr.startsWith(name));
                        if (matched) matchPrefix = matched;
                    }

                    if (matchPrefix) {
                        updated.deliveryAddress = currentAddr.replace(matchPrefix, newGroup);
                    } else if (!currentAddr) {
                        updated.deliveryAddress = newGroup;
                    } else if (currentAddr.startsWith(' - ')) {
                        updated.deliveryAddress = `${newGroup}${currentAddr}`;
                    } else if (!currentAddr.startsWith(newGroup)) {
                        updated.deliveryAddress = `${newGroup} - ${currentAddr}`;
                    }
                } else {
                    let matchPrefix = '';
                    if (origGroup && currentAddr.startsWith(origGroup)) matchPrefix = origGroup;
                    else if (prev.sourceGroup && currentAddr.startsWith(prev.sourceGroup)) matchPrefix = prev.sourceGroup;
                    else {
                        const matched = knownNames.find(name => name && currentAddr.startsWith(name));
                        if (matched) matchPrefix = matched;
                    }
                    if (matchPrefix) {
                        updated.deliveryAddress = currentAddr.replace(matchPrefix, '').replace(/^(\s*-\s*)/, '').trim();
                    }
                }
            } else if (field === 'deliveryAddress') {
                const newAddr = value || '';
                if (newAddr) {
                    const matchedBuilding = knownNames.find(name => name && newAddr.startsWith(name));
                    if (matchedBuilding) {
                        updated.sourceGroup = matchedBuilding;
                    }
                }
            }
            return updated;
        });
    };

    // 💡 團員分配雙軌狀態同步邏輯
    const syncRecipientsToItems = (newRecipients) => {
        const productTotals = {};
        
        newRecipients.forEach(r => {
            if (r.items) {
                r.items.forEach(ri => {
                    const pid = ri.productId;
                    if (!productTotals[pid]) {
                        const origItem = editingOrder?.items?.find(it => it.productId === pid);
                        productTotals[pid] = {
                            productId: pid,
                            productName: ri.productName,
                            unitPrice: Number(ri.price),
                            qty: 0,
                            remark: ri.remark || origItem?.remark || "",
                            flavorMap: {},
                            rawRemarks: []
                        };
                    }
                    if (ri.remark) {
                        const cleanRemark = ri.remark.replace(/【口味備註：(.*?)】/, '$1');
                        cleanRemark.split(/[,，\s+]/).forEach(part => {
                            const match = part.trim().match(/^\(?([^\s*x:：)]+)\)?\s*[*xX:：]\s*(\d+)$/);
                            if (match) {
                                const fName = match[1];
                                const fQty = Number(match[2]);
                                if (fName && fQty > 0) {
                                    productTotals[pid].flavorMap[fName] = (productTotals[pid].flavorMap[fName] || 0) + fQty;
                                }
                            } else if (part.trim() && !part.trim().includes('口味備註')) {
                                if (!productTotals[pid].rawRemarks.includes(part.trim())) productTotals[pid].rawRemarks.push(part.trim());
                            }
                        });
                    }
                    productTotals[pid].qty += Number(ri.qty) || 0;
                });
            }
        });

        const newItems = Object.values(productTotals).map((item) => {
            const subtotal = calculateItemSubtotal(item.productId, item.qty);
            const prod = products.find(p => p.id === item.productId);
            const displayPrice = prod ? (Number(prod.single_price) || Number(prod.price)) : item.unitPrice;
            
            let finalRemark = item.remark || "";
            if (item.flavorMap && Object.keys(item.flavorMap).length > 0) {
                const fParts = Object.entries(item.flavorMap).map(([k, v]) => `${k}x${v}`);
                if (item.rawRemarks && item.rawRemarks.length > 0) fParts.push(...item.rawRemarks);
                finalRemark = `【口味備註：${fParts.join(', ')}】`;
            }

            return {
                productId: item.productId,
                productName: item.productName,
                unitPrice: displayPrice,
                qty: item.qty,
                subtotal: subtotal,
                remark: finalRemark
            };
        }).filter(it => it.qty > 0);

        const newTotalAmount = newItems.reduce((sum, it) => sum + it.subtotal, 0);

        return {
            items: newItems,
            totalAmount: newTotalAmount
        };
    };

    const updateRecipientsState = (nextRecipients) => {
        const { items, totalAmount } = syncRecipientsToItems(nextRecipients);
        setEditingOrder(prev => ({
            ...prev,
            recipients: nextRecipients,
            items,
            totalAmount
        }));
    };

    const handleRecipientQtyChange = (recipientId, productId, newQty) => {
        const qty = Math.max(0, parseInt(newQty) || 0);
        const nextRecipients = editingOrder.recipients.map(r => {
            if (r.recipientId === recipientId) {
                const nextItems = r.items.map(ri => {
                    if (ri.productId === productId) {
                        return { ...ri, qty };
                    }
                    return ri;
                }).filter(ri => ri.qty > 0);
                return { ...r, items: nextItems };
            }
            return r;
        });
        updateRecipientsState(nextRecipients);
    };

    const handleRemoveRecipientItem = (recipientId, productId) => {
        const nextRecipients = editingOrder.recipients.map(r => {
            if (r.recipientId === recipientId) {
                return {
                    ...r,
                    items: r.items.filter(ri => ri.productId !== productId)
                };
            }
            return r;
        });
        updateRecipientsState(nextRecipients);
    };

    const handleRemoveRecipient = (recipientId) => {
        const nextRecipients = editingOrder.recipients.filter(r => r.recipientId !== recipientId);
        updateRecipientsState(nextRecipients);
    };

    const handleAddRecipientInModal = (newRecipientName) => {
        const trimmed = newRecipientName.trim();
        if (!trimmed) return;
        if (editingOrder.recipients.some(r => r.recipientName === trimmed)) {
            alert('此姓名已被新增！');
            return;
        }

        const newRecipient = {
            id: 'temp-' + Math.random().toString(36).substring(2, 9),
            recipientId: 'temp-' + Math.random().toString(36).substring(2, 9),
            recipientName: trimmed,
            note: '',
            items: []
        };

        updateRecipientsState([...editingOrder.recipients, newRecipient]);
    };
    const handleAddRecipient = handleAddRecipientInModal;

    const handleAddRecipientItemInModal = (recipientId, productId) => {
        const prod = products.find(p => p.id === productId);
        if (!prod) return;

        const hasFlavors = prod.has_flavor_attributes && Array.isArray(prod.flavor_choices) && prod.flavor_choices.length > 0;

        const nextRecipients = editingOrder.recipients.map(r => {
            if (r.recipientId === recipientId) {
                const existingRi = r.items.find(ri => ri.productId === productId);
                if (existingRi) {
                    if (hasFlavors) {
                        setAdminFlavorModal({
                            type: 'RECIPIENT_ITEM',
                            recipientId,
                            productId: prod.id,
                            productName: prod.name,
                            flavorChoices: prod.flavor_choices,
                            tempFlavors: parseRemarkToFlavorMap(existingRi.remark, prod.flavor_choices, existingRi.qty)
                        });
                    }
                    return r;
                }
                const initialRemark = hasFlavors ? formatFlavorMapToRemark({ [prod.flavor_choices[0]]: 1 }) : '';
                const newItem = {
                    id: 'temp-item-' + Math.random().toString(36).substring(2, 9),
                    recipientId,
                    productId,
                    productName: prod.name,
                    qty: 1,
                    price: Number(prod.single_price) || Number(prod.price),
                    remark: initialRemark
                };
                if (hasFlavors) {
                    setTimeout(() => {
                        setAdminFlavorModal({
                            type: 'RECIPIENT_ITEM',
                            recipientId,
                            productId: prod.id,
                            productName: prod.name,
                            flavorChoices: prod.flavor_choices,
                            tempFlavors: { [prod.flavor_choices[0]]: 1 }
                        });
                    }, 50);
                }
                return {
                    ...r,
                    items: [...r.items, newItem]
                };
            }
            return r;
        });

        updateRecipientsState(nextRecipients);
    };


    const handleUpdateModalFlavorQty = (flavor, delta) => {
        if (!adminFlavorModal) return;
        const current = adminFlavorModal.tempFlavors[flavor] || 0;
        const nextVal = Math.max(0, current + delta);
        setAdminFlavorModal(prev => ({
            ...prev,
            tempFlavors: { ...prev.tempFlavors, [flavor]: nextVal }
        }));
    };

    const handleSetModalFlavorQty = (flavor, valStr) => {
        if (!adminFlavorModal) return;
        const nextVal = Math.max(0, parseInt(valStr, 10) || 0);
        setAdminFlavorModal(prev => ({
            ...prev,
            tempFlavors: { ...prev.tempFlavors, [flavor]: nextVal }
        }));
    };

    const handleConfirmAdminFlavor = () => {
        if (!adminFlavorModal) return;
        const newTotalQty = calculateTotalQtyFromFlavorMap(adminFlavorModal.tempFlavors);
        if (newTotalQty === 0 && !window.confirm('數量計算為 0，確定將此商品數量歸零 / 刪除嗎？')) {
            return;
        }
        const newRemark = formatFlavorMapToRemark(adminFlavorModal.tempFlavors);

        if (adminFlavorModal.type === 'ORDER_ITEM') {
            setEditingOrder(prev => {
                const newItems = prev.items.map((item, idx) => {
                    if ((adminFlavorModal.itemIdx !== undefined && idx === adminFlavorModal.itemIdx) || item.productId === adminFlavorModal.productId) {
                        const subtotal = calculateItemSubtotal(item.productId, newTotalQty);
                        const avgPrice = newTotalQty > 0 ? (subtotal / newTotalQty) : item.unitPrice;
                        return {
                            ...item,
                            qty: newTotalQty,
                            unitPrice: avgPrice,
                            subtotal: subtotal,
                            remark: newRemark
                        };
                    }
                    return item;
                }).filter(it => it.qty > 0);
                return {
                    ...prev,
                    items: newItems,
                    totalAmount: newItems.reduce((sum, it) => sum + it.subtotal, 0)
                };
            });
        } else if (adminFlavorModal.type === 'RECIPIENT_ITEM') {
            const nextRecipients = editingOrder.recipients.map(r => {
                if (r.recipientId === adminFlavorModal.recipientId) {
                    const nextItems = r.items.map(ri => {
                        if (ri.productId === adminFlavorModal.productId) {
                            return {
                                ...ri,
                                qty: newTotalQty,
                                remark: newRemark
                            };
                        }
                        return ri;
                    }).filter(ri => ri.qty > 0);
                    return { ...r, items: nextItems };
                }
                return r;
            });
            updateRecipientsState(nextRecipients);
        }
        setAdminFlavorModal(null);
    };

    const handleItemQtyChange = (productId, qty) => {
        setEditingOrder(prev => {
            const newItems = prev.items.map(item => {
                if (item.productId === productId) {
                    const newQty = Math.max(0, Number(qty) || 0);
                    const subtotal = calculateItemSubtotal(productId, newQty);
                    const avgPrice = newQty > 0 ? (subtotal / newQty) : item.unitPrice;
                    return {
                        ...item,
                        qty: newQty,
                        unitPrice: avgPrice,
                        subtotal: subtotal
                    };
                }
                return item;
            }).filter(item => item.qty > 0);

            const total = newItems.reduce((sum, item) => sum + item.subtotal, 0);
            return {
                ...prev,
                items: newItems,
                totalAmount: total
            };
        });
    };

    const handleRemoveItem = (productId) => {
        setEditingOrder(prev => {
            const newItems = prev.items.filter(item => item.productId !== productId);
            const total = newItems.reduce((sum, item) => sum + item.subtotal, 0);
            return {
                ...prev,
                items: newItems,
                totalAmount: total
            };
        });
    };

    const handleAddItem = (productId) => {
        const prod = products.find(p => p.id === productId);
        if (!prod) return;

        const hasFlavors = prod.has_flavor_attributes && Array.isArray(prod.flavor_choices) && prod.flavor_choices.length > 0;

        setEditingOrder(prev => {
            const existing = prev.items.find(item => item.productId === productId);
            let newItems = [];
            if (existing) {
                if (hasFlavors) {
                    setAdminFlavorModal({
                        type: 'ORDER_ITEM',
                        productId: prod.id,
                        productName: prod.name,
                        flavorChoices: prod.flavor_choices,
                        tempFlavors: parseRemarkToFlavorMap(existing.remark, prod.flavor_choices, existing.qty)
                    });
                    return prev;
                }
                newItems = prev.items.map(item => {
                    if (item.productId === productId) {
                        const newQty = item.qty + 1;
                        const subtotal = calculateItemSubtotal(productId, newQty);
                        const avgPrice = newQty > 0 ? (subtotal / newQty) : item.unitPrice;
                        return {
                            ...item,
                            qty: newQty,
                            unitPrice: avgPrice,
                            subtotal: subtotal
                        };
                    }
                    return item;
                });
            } else {
                const subtotal = calculateItemSubtotal(productId, 1);
                const initialRemark = hasFlavors ? formatFlavorMapToRemark({ [prod.flavor_choices[0]]: 1 }) : '';
                newItems = [
                    ...prev.items,
                    {
                        productId: prod.id,
                        productName: prod.name,
                        unitPrice: subtotal,
                        qty: 1,
                        subtotal: subtotal,
                        remark: initialRemark
                    }
                ];
                if (hasFlavors) {
                    setTimeout(() => {
                        setAdminFlavorModal({
                            type: 'ORDER_ITEM',
                            productId: prod.id,
                            productName: prod.name,
                            flavorChoices: prod.flavor_choices,
                            tempFlavors: { [prod.flavor_choices[0]]: 1 }
                        });
                    }, 50);
                }
            }

            const total = newItems.reduce((sum, item) => sum + item.subtotal, 0);
            return {
                ...prev,
                items: newItems,
                totalAmount: total
            };
        });
    };

    const DEFAULT_DELIVERY_AREAS = [
        { name: '台南市永康區', fee: 80, min: 300 },
        { name: '台南市東區', fee: 80, min: 300 },
        { name: '台南市北區', fee: 80, min: 300 },
        { name: '台南市中西區', fee: 80, min: 300 },
        { name: '台南市安平區', fee: 80, min: 300 },
        { name: '台南市南區', fee: 80, min: 300 },
        { name: '台南市安南區', fee: 80, min: 300 },
        { name: '台南市仁德區', fee: 80, min: 400 },
        { name: '台南市歸仁區', fee: 80, min: 400 },
        { name: '台南市新化區', fee: 80, min: 400 },
        { name: '台南市新市區', fee: 80, min: 400 },
        { name: '台南市善化區', fee: 150, min: 500 },
        { name: '台南市安定區', fee: 150, min: 500 },
        { name: '台南市麻豆區', fee: 150, min: 800 },
        { name: '台南市佳里區', fee: 150, min: 800 },
        { name: '台南市西港區', fee: 150, min: 800 },
        { name: '台南市下營區', fee: 150, min: 800 },
        { name: '台南市六甲區', fee: 150, min: 800 },
        { name: '台南市官田區', fee: 150, min: 800 },
        { name: '台南市七股區', fee: 150, min: 800 },
        { name: '台南市新營區', fee: 200, min: 1000 },
        { name: '台南市鹽水區', fee: 200, min: 1000 },
        { name: '台南市柳營區', fee: 200, min: 1000 },
        { name: '台南市後壁區', fee: 200, min: 1000 },
        { name: '台南市學甲區', fee: 200, min: 1000 },
        { name: '台南市將軍區', fee: 200, min: 1000 },
        { name: '台南市北門區', fee: 200, min: 1000 },
        { name: '台南市大內區', fee: 200, min: 1000 },
        { name: '台南市山上區', fee: 200, min: 1000 },
        { name: '台南市龍崎區', fee: 200, min: 1000 },
        { name: '台南市關廟區', fee: 200, min: 1000 },
        { name: '台南市玉井區', fee: 250, min: 1200 },
        { name: '台南市楠西區', fee: 250, min: 1200 },
        { name: '台南市左鎮區', fee: 250, min: 1200 },
        { name: '台南市南化區', fee: 250, min: 1200 },
        { name: '台南市白河區', fee: 250, min: 1200 },
        { name: '台南市東山區', fee: 250, min: 1200 },
        { name: '高雄市茄萣區', fee: 150, min: 800 },
        { name: '高雄市湖內區', fee: 150, min: 800 },
        { name: '高雄市路竹區', fee: 200, min: 1000 }
    ];

    const getDisplayGroupName = useCallback((order, settingsList = [], groupBindingsMap = {}) => {
        if (!order) return '未知群組';
        const addrRaw = String(order.deliveryAddress || '').trim();
        const knownNames = Array.from(new Set([
            ...buildings,
            ...settingsList.map(s => s.building),
            ...Object.values(groupBindingsMap)
        ])).filter(Boolean);
        const matchedAddrBuilding = knownNames.find(name => name && addrRaw.startsWith(name));
        return matchedAddrBuilding || groupBindingsMap[order.sourceGroup] || order.sourceGroup || '未知群組';
    }, [buildings]);

    const computeOrderTotals = useCallback((rawOrder, settingsList = [], groupBindingsMap = {}) => {
        if (!rawOrder || !rawOrder.items) return { productTotal: 0, shippingFee: 0, totalAmount: 0 };
        const order = normalizeOrder(rawOrder);
        const productTotal = order.items.reduce((sum, item) => sum + Number(item.subtotal || 0), 0);

        const addrRaw = String(order.deliveryAddress || '').trim();
        const knownNames = Array.from(new Set([...settingsList.map(s => s.building), ...Object.values(groupBindingsMap)])).filter(Boolean);
        const matchedAddrBuilding = knownNames.find(name => name && addrRaw.startsWith(name));
        const displayGroup = matchedAddrBuilding || groupBindingsMap[order.sourceGroup] || order.sourceGroup || '';
        const isGeneralUser = !displayGroup || displayGroup === '一般散客' || displayGroup === '線上下單';

        let fee = 0;
        if (!isGeneralUser) {
            fee = 0; // 團購社區訂單一律免運
        } else {
            const addr = String(order.deliveryAddress || '').trim();
            const getCleanName = (str) => String(str || '').replace(/^(台南市|高雄市|台灣|臺灣)/, '').replace(/^線上下單\s*-\s*/, '').trim();
            const addrClean = getCleanName(addr);

            // 合併後端設定與預設 37 個行政區運費規則
            const combinedSettings = [
                ...settingsList,
                ...DEFAULT_DELIVERY_AREAS.map(a => ({
                    building: a.name,
                    default_free_shipping: false,
                    free_shipping_min: a.min,
                    shipping_fee: a.fee
                }))
            ];

            const sortedSettings = combinedSettings.sort((a, b) => (b.building?.length || 0) - (a.building?.length || 0));
            const matchedSetting = sortedSettings.find(s => {
                if (!s.building) return false;
                const bClean = getCleanName(s.building);
                if (!bClean) return false;
                return addrClean.includes(bClean) || bClean.includes(addrClean);
            });

            const defaultMatch = DEFAULT_DELIVERY_AREAS.find(a => {
                if (!a.name) return false;
                const bClean = getCleanName(a.name);
                return bClean && (addrClean.includes(bClean) || bClean.includes(addrClean));
            });

            if (matchedSetting) {
                if (matchedSetting.default_free_shipping) {
                    fee = 0;
                } else {
                    let min = Number(matchedSetting.free_shipping_min) || 0;
                    let settingFee = Number(matchedSetting.shipping_fee) || 0;
                    // 若資料庫設定中的運費與門檻皆未設定 (為 0)，且預設 37 個行政區表有明確規範 (如台南市永康區 300元免運/80元運費) 時，優先採用行政區標準
                    if (min === 0 && settingFee === 0 && defaultMatch) {
                        min = defaultMatch.min;
                        settingFee = defaultMatch.fee;
                    }
                    if (min > 0 && productTotal >= min) {
                        fee = 0;
                    } else {
                        fee = settingFee;
                    }
                }
            } else if (order.shippingFee !== undefined && Number(order.shippingFee) > 0) {
                fee = Number(order.shippingFee);
            } else if (defaultMatch) {
                const min = defaultMatch.min;
                const settingFee = defaultMatch.fee;
                if (min > 0 && productTotal >= min) {
                    fee = 0;
                } else {
                    fee = settingFee;
                }
            } else {
                fee = 150; // 線上下單未比對到已知行政區時預設運費 (絕非 0 元免運)
            }
        }

        const rMatch = String(order.note || '').match(/【滿額折抵\s*-\$?(\d+)/);
        const rewardDiscount = rMatch ? Number(rMatch[1]) : (Number(order.rewardDiscountAmount) || 0);
        const netProductTotal = Math.max(0, productTotal - rewardDiscount);

        return {
            productTotal,
            rewardDiscount,
            shippingFee: fee,
            totalAmount: netProductTotal + fee
        };
    }, []);

    const handleSaveOrderEdit = async (e) => {
        e.preventDefault();
        if (editingOrder.items.length === 0) {
            alert('訂單商品明細不可為空');
            return;
        }

        setIsSaving(true);
        try {
            // 1. 若該訂單原始為 LINE 群組 ID，同步將最新社區名稱寫回群組對照表 (groupBindings)
            const rawGrp = editingOrder.rawSourceGroup;
            if (rawGrp && editingOrder.sourceGroup) {
                const isBoundKey = groupBindings[rawGrp] !== undefined || rawGrp.startsWith('c') || rawGrp.includes('-');
                if (isBoundKey && editingOrder.sourceGroup !== groupBindings[rawGrp]) {
                    try {
                        await callGAS(apiUrl, 'saveGroupBinding', {
                            groupId: rawGrp,
                            groupName: editingOrder.sourceGroup
                        }, user.token);
                        setGroupBindings(prev => ({ ...prev, [rawGrp]: editingOrder.sourceGroup }));
                    } catch (gErr) {
                        console.warn('Failed to update group binding mapping:', gErr);
                    }
                }
            }

            // 2. 計算最新運費與總額 (傳入 buildingSettingsList 以精確比對行政區外送規則，如「台南市永康區」)
            const calculatedTotals = computeOrderTotals(editingOrder, buildingSettingsList, groupBindings);

            // 3. 更新訂單內容
            const res = await callGAS(apiUrl, 'updatePendingOrder', {
                orderId: editingOrder.orderId,
                customerName: editingOrder.customerName,
                customerPhone: editingOrder.customerPhone,
                deliveryAddress: editingOrder.deliveryAddress,
                sourceGroup: editingOrder.sourceGroup,
                note: editingOrder.note,
                items: editingOrder.items,
                paymentMethod: editingOrder.paymentMethod,
                transferLastFive: editingOrder.transferLastFive,
                paymentStatus: editingOrder.paymentStatus,
                recipients: editingOrder.recipients,
                shippingFee: calculatedTotals.shippingFee,
                totalAmount: calculatedTotals.totalAmount
            }, user.token);

            if (res && res.error) {
                throw new Error(res.error);
            }

            alert('訂單修改成功');
            setShowEditModal(false);
            await fetchGroupBindings();
            await fetchOrders();
        } catch (error) {
            alert('修改失敗: ' + error.message);
        } finally {
            setIsSaving(false);
        }
    };

    const handleOpenDateModal = (order, e) => {
        if (e) e.stopPropagation();
        setDateModalOrder(order);
        setDateModalValue(order.expectedDeliveryDate || '');
    };

    const handleBatchSetDeliveryDate = () => {
        if (selectedOrderIds.length === 0) return;
        setDateModalOrder({
            isBatch: true,
            orderIds: [...selectedOrderIds],
            customerName: `選取的 ${selectedOrderIds.length} 筆訂單`
        });
        setDateModalValue('');
    };

    const handleSaveDateModal = async () => {
        if (!dateModalOrder) return;
        setIsSavingDate(true);
        try {
            if (dateModalOrder.isBatch) {
                const res = await callGAS(apiUrl, 'batchSetDeliveryDates', {
                    orderIds: dateModalOrder.orderIds,
                    expectedDeliveryDate: dateModalValue
                }, user.token);
                if (res && (res.success || !res.error)) {
                    const targetIds = dateModalOrder.orderIds;
                    setOrders(prev => prev.map(o => targetIds.includes(o.orderId) ? { ...o, expectedDeliveryDate: dateModalValue } : o));
                    setDateModalOrder(null);
                    setSelectedOrderIds([]);
                    alert(`✅ 已成功將 ${targetIds.length} 筆選取訂單的預計配送日設定為：${dateModalValue || '未指定(已清除)'}`);
                } else {
                    alert('批次設定預計配送日失敗: ' + (res?.message || res?.error || '未知錯誤'));
                }
            } else {
                const res = await callGAS(apiUrl, 'updatePendingOrder', {
                    orderId: dateModalOrder.orderId,
                    expectedDeliveryDate: dateModalValue
                }, user.token);
                if (res && (res.success || !res.error)) {
                    setOrders(prev => prev.map(o => o.orderId === dateModalOrder.orderId ? { ...o, expectedDeliveryDate: dateModalValue } : o));
                    setDateModalOrder(null);
                } else {
                    alert('設定出貨日期失敗: ' + (res?.message || res?.error || '未知錯誤'));
                }
            }
        } catch (error) {
            console.error('Save expected delivery date failed:', error);
            alert('設定出貨日期失敗: ' + error.message);
        } finally {
            setIsSavingDate(false);
        }
    };

    // 智慧拆算品項與多關鍵字 (如 "禾香優格飲 藍莓") 口味數量 (組件層級共用函式)
    const extractMatchedQtyFromItem = React.useCallback((item, searchTerm, isExact) => {
        if (!item) return 0;
        const totalQty = Number(item.qty) || 0;
        if (!searchTerm || !searchTerm.trim()) return totalQty;

        const nameStr = String(item.productName || '').toLowerCase().trim();
        const idStr = String(item.productId || '').toLowerCase().trim();
        const remarkStr = String(item.remark || '').toLowerCase().trim();

        // 徹底清除半形/全形/中括號內容、逗號號贅字、數量標記 (x1, x2, *1) 與殘留括號，精確還原基礎商品名稱
        const getBaseProductName = (fullName) => {
            if (!fullName) return '';
            return String(fullName)
                .split(/[,，]/)[0]                  // 遇到逗號直接截取前半段主品名 (如 "植物優格, 橘瓣蘆薈" -> "植物優格")
                .replace(/\s*\([\s\S]*?\)/g, '')   // 移除半形括號內容 ( ... )
                .replace(/\s*（[\s\S]*?）/g, '')   // 移除全形括號內容 （ ... ）
                .replace(/\s*【[\s\S]*?】/g, '')   // 移除中括號內容 【 ... 】
                .replace(/\s*\[[\s\S]*?\]/g, '')   // 移除方括號內容 [ ... ]
                .replace(/[xX*×]\s*\d+/g, '')       // 移除 x1, x2 數量標記
                .replace(/[\(\（\[【\)\］】\]]/g, '') // 徹底掃除殘留括號
                .trim();
        };
        const baseNameStr = getBaseProductName(nameStr).toLowerCase().trim();

        const keywords = searchTerm.toLowerCase().trim().split(/\s+/).filter(Boolean);

        // 智慧主品項邊界比對：判斷名稱是否等於 kw，或者以 kw 開頭且後續接非文字分隔符 (如空格、連字號、斜線、括號)
        const isExactProductSeriesMatch = (str, kw) => {
            if (!str || !kw) return false;
            if (str === kw) return true;
            if (str.startsWith(kw)) {
                const nextChar = str.slice(kw.length, kw.length + 1);
                // 若後續字元為空或標點符號/空格，即為同系列品項 (如 "禾香優格飲-藍莓" 比對 "禾香優格飲")
                // 但若後續字元為中文字 (如 "禾香優格飲" 比對 "禾香優格")，則回傳 false 避免跨品項混淆
                return !nextChar || /[\s\-_/\(\（\[【\)\］】\]:\：,，]/.test(nextChar);
            }
            return false;
        };

        const matchesAllKeywords = keywords.every(kw => {
            if (isExact) {
                return isExactProductSeriesMatch(nameStr, kw) ||
                       isExactProductSeriesMatch(baseNameStr, kw) ||
                       idStr === kw ||
                       remarkStr.includes(kw);
            }
            return nameStr.includes(kw) || idStr.includes(kw) || remarkStr.includes(kw);
        });

        if (!matchesAllKeywords) return 0;

        let flavorKeyword = keywords.find(kw => remarkStr.includes(kw) && !baseNameStr.includes(kw));
        if (!flavorKeyword) {
            flavorKeyword = keywords.find(kw => remarkStr.includes(kw));
        }

        if (flavorKeyword && remarkStr) {
            const parts = remarkStr.split(/[,，;\s]+/);
            let parsedFlavorQty = 0;
            let foundMatch = false;

            parts.forEach(part => {
                if (part.includes(flavorKeyword)) {
                    foundMatch = true;
                    const qtyMatch = part.match(/[xX*×]\s*(\d+)/);
                    if (qtyMatch) {
                        parsedFlavorQty += Number(qtyMatch[1]) || 0;
                    } else {
                        parsedFlavorQty += 1;
                    }
                }
            });

            if (foundMatch && parsedFlavorQty > 0) {
                return Math.min(parsedFlavorQty, totalQty);
            }
        }

        return totalQty;
    }, []);

    // 自動聚合所有出現過的大樓/社區（包含大樓設定、群組綁定與訂單地址開頭，如「柳營奇美」）
    const allAvailableBuildings = React.useMemo(() => {
        const set = new Set();
        buildings.forEach(b => b && set.add(b));
        Object.values(groupBindings).forEach(b => b && set.add(b));
        orders.forEach(o => {
            if (o.sourceGroup && o.sourceGroup !== '一般散客') {
                const mapped = groupBindings[o.sourceGroup] || o.sourceGroup;
                set.add(mapped);
            }
            if (o.deliveryAddress) {
                const knownNames = Array.from(set);
                const matched = knownNames.find(n => n && o.deliveryAddress.startsWith(n));
                if (matched) {
                    set.add(matched);
                } else {
                    const parts = o.deliveryAddress.split(/\s*-\s*/);
                    if (parts.length > 1 && parts[0].length < 20) {
                        set.add(parts[0].trim());
                    }
                }
            }
        });
        return Array.from(set).filter(Boolean);
    }, [buildings, groupBindings, orders]);

    // 依據歷史與現有訂單動態整理付款方式選項
    const allAvailablePaymentMethods = React.useMemo(() => {
        const set = new Set();
        orders.forEach(o => {
            const pm = String(o.paymentMethod || '').trim();
            if (pm) set.add(pm);
        });
        ['轉帳', '現金', '奶包金扣抵', '滿額消費折抵', 'LINE Pay'].forEach(m => set.add(m));
        return Array.from(set).filter(Boolean);
    }, [orders]);

    const filteredOrders = orders.filter(order => {
        // 未付款分頁雙重防護過濾
        if (activeTab === 'UNPAID') {
            const ps = String(order.paymentStatus || '').trim();
            if (ps === '已付款' || ps === '已入帳' || ps.includes('已付款') || ps.includes('已入帳')) {
                return false;
            }
        }

        // 大樓篩選
        if (selectedBuilding !== '全部') {
            const addr = String(order.deliveryAddress || '').trim();
            const displayGrp = getDisplayGroupName(order, buildingSettingsList, groupBindings);

            const matchesAddress = addr.startsWith(selectedBuilding);
            const matchesGroup = displayGrp === selectedBuilding;
            if (!matchesAddress && !matchesGroup) {
                return false;
            }
        }

        // 付款方式篩選
        if (selectedPaymentMethod !== '全部') {
            const orderPm = String(order.paymentMethod || '').trim();
            if (selectedPaymentMethod === '未指定') {
                if (orderPm !== '' && orderPm !== '未指定') return false;
            } else if (orderPm !== selectedPaymentMethod && !orderPm.includes(selectedPaymentMethod)) {
                return false;
            }
        }

        // 預計出貨/配送日篩選 (100% 嚴格僅比對 expectedDeliveryDate)
        if (dateFilter && String(order.expectedDeliveryDate || '') !== dateFilter) {
            return false;
        }

        // 起迄日期區間篩選 (100% 嚴格僅比對已確認配送日 expectedDeliveryDate)
        // 當設定了日期區間篩選時，未確認/未指定配送日的訂單一律不呈現，確保 8/13 的搜尋結果中 100% 只有 8/13 配送日的訂單
        if (startDate || endDate) {
            const expDate = String(order.expectedDeliveryDate || '').trim();
            if (!expDate) {
                return false; // 未指定/未確認配送日，在日期搜尋時直接隱藏！
            }
            if (startDate && expDate < startDate) {
                return false;
            }
            if (endDate && expDate > endDate) {
                return false;
            }
        }

        // 一般文字與金額搜尋（編號、姓名、電話、地址、群組、轉帳金額、對帳後五碼）
        if (searchTerm) {
            const search = searchTerm.toLowerCase().trim();
            const cleanNumberSearch = search.replace(/[$$,,元]/g, '').trim();
            const totals = computeOrderTotals(order, buildingSettingsList, groupBindings);
            const orderTotalStr = String(totals.totalAmount ?? order.totalAmount ?? '');
            const matchesGeneral = (
                String(order.orderId || '').toLowerCase().includes(search) ||
                String(order.customerName || '').toLowerCase().includes(search) ||
                String(order.customerPhone || '').toLowerCase().includes(search) ||
                String(order.deliveryAddress || '').toLowerCase().includes(search) ||
                String(order.sourceGroup || '').toLowerCase().includes(search) ||
                String(order.transferLastFive || '').toLowerCase().includes(search) ||
                orderTotalStr.includes(search) ||
                (cleanNumberSearch !== '' && orderTotalStr.includes(cleanNumberSearch))
            );
            if (!matchesGeneral) return false;
        }

        // 商品名稱特化與口味備註搜尋 (支援空格切分多關鍵字與精確全名相符)
        if (productSearchTerm) {
            const hasMatchingProductInItems = order.items?.some(item =>
                extractMatchedQtyFromItem(item, productSearchTerm, isExactProductMatch) > 0
            );
            const hasMatchingProductInRecipients = order.recipients?.some(r =>
                r.items?.some(ri => extractMatchedQtyFromItem(ri, productSearchTerm, isExactProductMatch) > 0)
            );
            if (!hasMatchingProductInItems && !hasMatchingProductInRecipients) {
                return false;
            }
        }

        return true;
    });

    // 排序：嚴格依下單時間排序（最新的在最上面，最舊的在最下面）
    const sortedFilteredOrders = React.useMemo(() => {
        return filteredOrders.map(order => normalizeOrder(order)).sort((a, b) => {
            const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            if (timeA !== timeB && !isNaN(timeA) && !isNaN(timeB)) {
                return timeB - timeA; // 時間由新到舊
            }
            // 若時間相同或缺失，依訂單編號（包含時間戳）降序排序
            return String(b.orderId || '').localeCompare(String(a.orderId || ''));
        });
    }, [filteredOrders, normalizeOrder]);

    // 組合 [主商品名稱] + [空格] + [口味] 下拉選單 (例如 "植物優格", "植物優格 草莓", "植物優格 橘子")
    const uniqueProductNames = React.useMemo(() => {
        if (!orders || orders.length === 0) return [];
        const namesSet = new Set();

        const processItem = (item) => {
            if (!item || !item.productName) return;
            const rawName = String(item.productName);

            // 1. 強效過濾並截取主商品名稱 (絕不包含 "口味備註"、":"、"："、逗號、括號與 x1)
            const cleanBase = rawName
                .split(/[,，:\：]/)[0]
                .replace(/\s*\([\s\S]*?\)/g, '')
                .replace(/\s*（[\s\S]*?）/g, '')
                .replace(/\s*【[\s\S]*?】/g, '')
                .replace(/\s*\[[\s\S]*?\]/g, '')
                .replace(/口味備註[\s\S]*$/gi, '') // 強制斬斷 口味備註 之後的一切
                .replace(/[xX*×]\s*\d+/g, '')
                .replace(/[\(\（\[【\)\］】\]]/g, '')
                .trim();

            if (!cleanBase) return;
            namesSet.add(cleanBase);

            // 2. 提取純口味單字 (絕不包含 "口味備註" 贅字與長句子)
            const remarkStr = String(item.remark || item.productName || '');
            if (remarkStr) {
                // 砍掉 口味備註： 並替括號為空格
                const targetContent = remarkStr
                    .replace(/^.*【?口味備註：?\s*/i, '')
                    .replace(/【|】|\(|\)|（|）/g, ' ');

                // 依據逗號、分號、空格拆分成獨立口味單字
                const parts = targetContent.split(/[,，;\s]+/);
                parts.forEach(part => {
                    const flavorName = part
                        .replace(/[xX*×]\s*\d+.*$/, '') // 去除 x1 數量
                        .replace(/[\:\：,\(（【\)\］】\]]/g, '')
                        .trim();

                    // 排除非口味的屬性詞 (如：無糖, 原味, 罐, 盒...)
                    const isInvalidWord = [
                        '無糖', '微糖', '半糖', '全糖', '少糖', '原味', '無添加', '口味備註', '備註',
                        '大', '小', '中', '盒', '罐', '瓶', '包', '組', '件', '入', '箱'
                    ].some(w => flavorName === w || flavorName.includes('備註') || flavorName.includes('糖'));

                    // 條件：必須是不含 "口味備註"/無糖等屬性詞、長度介於 1~8 字、非主品名、且非純數字的純口味
                    if (
                        flavorName &&
                        flavorName.length >= 1 &&
                        flavorName.length <= 8 &&
                        !isInvalidWord &&
                        !flavorName.includes('：') &&
                        !flavorName.includes(':') &&
                        !/^\d+$/.test(flavorName) &&
                        flavorName !== cleanBase &&
                        !cleanBase.includes(flavorName)
                    ) {
                        namesSet.add(`${cleanBase} ${flavorName}`);
                    }
                });
            }
        };

        orders.forEach(order => {
            order.items?.forEach(processItem);
            order.recipients?.forEach(r => r.items?.forEach(processItem));
        });

        // 最後過濾：防護網，100% 確保全站選單中絕不出現 "口味備註" 或 "無糖" 等單字
        return Array.from(namesSet)
            .filter(name => !name.endsWith('無糖') && !name.includes('口味備註') && !name.includes('備註：'))
            .sort((a, b) => a.localeCompare(b, 'zh-TW'));
    }, [orders]);

    // 關鍵字即時符合的商品/口味下拉選項 (輸入如 "禾香" 自動帶出 "禾香優格飲"、"禾香優格飲 藍莓"...)
    const matchingAutocompleteList = React.useMemo(() => {
        if (!productSearchTerm.trim() || uniqueProductNames.length === 0) return [];
        const keywords = productSearchTerm.toLowerCase().trim().split(/\s+/).filter(Boolean);
        return uniqueProductNames.filter(pName => {
            const pNameLower = pName.toLowerCase();
            return keywords.every(kw => pNameLower.includes(kw));
        }).slice(0, 30);
    }, [uniqueProductNames, productSearchTerm]);

    // 商品特化搜尋小卡片統計數據 (支援空格多關鍵字與口味瓶數拆算)
    const productSearchSummary = React.useMemo(() => {
        if (!productSearchTerm.trim()) return null;
        let totalMatchQty = 0;
        let matchingOrdersCount = 0;

        sortedFilteredOrders.forEach(order => {
            let orderMatchingQty = 0;

            if (order.items && order.items.length > 0) {
                order.items.forEach(item => {
                    const mQty = extractMatchedQtyFromItem(item, productSearchTerm, isExactProductMatch);
                    if (mQty > 0) {
                        orderMatchingQty += mQty;
                    }
                });
            } else if (order.recipients && order.recipients.length > 0) {
                order.recipients.forEach(r => {
                    r.items?.forEach(ri => {
                        const mQty = extractMatchedQtyFromItem(ri, productSearchTerm, isExactProductMatch);
                        if (mQty > 0) {
                            orderMatchingQty += mQty;
                        }
                    });
                });
            }

            if (orderMatchingQty > 0) {
                matchingOrdersCount++;
                totalMatchQty += orderMatchingQty;
            }
        });

        return {
            keyword: productSearchTerm.trim(),
            matchingOrdersCount,
            totalMatchQty,
            isExact: isExactProductMatch
        };
    }, [sortedFilteredOrders, productSearchTerm, isExactProductMatch]);

    // 折疊與展開操作
    const toggleExpandOrder = (orderId) => {
        setExpandedOrderIds(prev => {
            const next = new Set(prev);
            if (next.has(orderId)) {
                next.delete(orderId);
            } else {
                next.add(orderId);
            }
            return next;
        });
    };

    const handleExpandAll = () => {
        const allIds = new Set(sortedFilteredOrders.map(o => o.orderId));
        setExpandedOrderIds(allIds);
    };

    const handleCollapseAll = () => {
        setExpandedOrderIds(new Set());
    };

    // 數據加總統計 (Summary Panel)
    const summaryStats = React.useMemo(() => {
        let totalAmount = 0;
        let totalQty = 0;
        sortedFilteredOrders.forEach(o => {
            totalAmount += (Number(o.totalAmount) || 0);
            o.items?.forEach(i => {
                totalQty += (Number(i.qty) || 0);
            });
        });
        return {
            ordersCount: sortedFilteredOrders.length,
            totalQty,
            totalAmount
        };
    }, [sortedFilteredOrders]);

    // 一鍵複製小工具
    const handleCopyText = async (text, typeLabel) => {
        if (!text) return;
        const ok = await copyToClipboard(text);
        if (ok) {
            alert(`${typeLabel}已複製：${text}`);
        } else {
            alert(`複製失敗，請手動複製：\n${text}`);
        }
    };

    // 一鍵標記已付款快捷功能
    const handleQuickConfirmPayment = async (order) => {
        if (!window.confirm(`確定要將訂單 ${order.orderId} 標記為【已付款】嗎？`)) {
            return;
        }

        setLoading(true);
        try {
            const res = await callGAS(apiUrl, 'updatePendingOrder', {
                orderId: order.orderId,
                paymentStatus: '已付款'
            }, user.token);

            if (res && res.error) {
                throw new Error(res.error);
            }

            alert('已成功將訂單標記為已付款！');
            fetchOrders();
        } catch (error) {
            alert('更新付款狀態失敗: ' + error.message);
            setLoading(false);
        }
    };

    const calculateFreeQtyFromTotal = useCallback((productId, qty) => {
        const prod = products.find(p => p.id === productId || p.name === productId);
        if (!prod || !Array.isArray(prod.promotions) || prod.promotions.length === 0) return 0;
        let bestFree = 0;
        for (const promo of prod.promotions) {
            const bx = Number(promo.buyX);
            const gy = Number(promo.getY);
            if (bx > 0 && gy > 0) {
                const free = Math.floor(qty / (bx + gy)) * gy;
                if (free > bestFree) bestFree = free;
            }
        }
        return bestFree;
    }, [products]);

    // 批次確認付款/收款邏輯
    const handleBatchConfirmPayment = async () => {
        if (selectedOrderIds.length === 0) return;
        if (!window.confirm(`確定要將這 ${selectedOrderIds.length} 筆選取的訂單全部標記為【已付款】嗎？`)) {
            return;
        }

        setIsBatchProcessing(true);
        setLoading(true);
        setBatchMessage(`正在更新 ${selectedOrderIds.length} 筆訂單的付款狀態...`);
        
        try {
            const res = await callGAS(apiUrl, 'batchConfirmPayments', { 
                orderIds: selectedOrderIds 
            }, user.token);
            if (res && res.error) {
                throw new Error(res.error);
            }
            alert(`批次確認收款執行完畢！共更新 ${selectedOrderIds.length} 筆訂單。`);
        } catch (err) {
            alert(`批次收款失敗: ${err.message}`);
        } finally {
            setSelectedOrderIds([]);
            setIsBatchProcessing(false);
            setBatchMessage('');
            fetchOrders();
        }
    };

    // 批次確認出貨邏輯
    const handleBatchConfirm = async () => {
        if (selectedOrderIds.length === 0) return;
        if (!window.confirm(`確定要將這 ${selectedOrderIds.length} 筆選取的訂單全部【確認出貨】嗎？\n此操作會扣減庫存並寫入銷售紀錄！`)) {
            return;
        }

        setIsBatchProcessing(true);
        setLoading(true);
        setBatchMessage(`正在出貨 ${selectedOrderIds.length} 筆訂單...`);
        
        try {
            const res = await callGAS(apiUrl, 'batchConfirmPendingOrders', { 
                orderIds: selectedOrderIds 
            }, user.token);
            if (res && res.error) {
                throw new Error(res.error);
            }
            alert(`批次出貨執行完畢！共出貨 ${selectedOrderIds.length} 筆訂單，庫存已扣減！`);
        } catch (err) {
            alert(`批次出貨失敗: ${err.message}`);
        } finally {
            setSelectedOrderIds([]);
            setIsBatchProcessing(false);
            setBatchMessage('');
            fetchOrders();
        }
    };

    // 批次刪除邏輯
    const handleBatchDelete = async () => {
        if (selectedOrderIds.length === 0) return;
        if (!window.confirm(`確定要將這 ${selectedOrderIds.length} 筆選取的訂單全部【刪除】嗎？\n此動作無法復原，請小心操作！`)) {
            return;
        }

        setIsBatchProcessing(true);
        setLoading(true);
        setBatchMessage(`正在刪除 ${selectedOrderIds.length} 筆訂單...`);

        try {
            const res = await callGAS(apiUrl, 'batchDeletePendingOrders', { 
                orderIds: selectedOrderIds 
            }, user.token);
            if (res && res.error) {
                throw new Error(res.error);
            }
            alert(`批次刪除執行完畢！共刪除 ${selectedOrderIds.length} 筆訂單。`);
        } catch (err) {
            alert(`批次刪除失敗: ${err.message}`);
        } finally {
            setSelectedOrderIds([]);
            setIsBatchProcessing(false);
            setBatchMessage('');
            fetchOrders();
        }
    };

    const handleToggleSelectAll = () => {
        if (selectedOrderIds.length === sortedFilteredOrders.length) {
            setSelectedOrderIds([]);
        } else {
            setSelectedOrderIds(sortedFilteredOrders.map(o => o.orderId));
        }
    };

    const handleToggleSelectOrder = (orderId) => {
        setSelectedOrderIds(prev => {
            if (prev.includes(orderId)) {
                return prev.filter(id => id !== orderId);
            } else {
                return [...prev, orderId];
            }
        });
    };

    const formatDate = (isoString) => {
        if (!isoString) return '-';
        const d = new Date(isoString);
        if (isNaN(d.getTime())) return isoString;
        return d.toLocaleString('zh-TW', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const handleCopyShipmentSummary = async () => {
        const targetOrders = selectedOrderIds.length > 0
            ? sortedFilteredOrders.filter(o => selectedOrderIds.includes(o.orderId))
            : sortedFilteredOrders;
        const finalOrders = targetOrders.length > 0 ? targetOrders : sortedFilteredOrders;

        if (finalOrders.length === 0) {
            alert('目前沒有訂單可彙整');
            return;
        }

        const summary = {};
        finalOrders.forEach(order => {
            order.items.forEach(item => {
                if (!summary[item.productId]) {
                    summary[item.productId] = {
                        productName: item.productName,
                        totalQty: 0,
                        remarks: []
                    };
                }
                summary[item.productId].totalQty += Number(item.qty) || 0;
                if (item.remark && String(item.remark).trim()) {
                    summary[item.productId].remarks.push(String(item.remark).trim());
                }
            });
        });

        const lines = [];
        Object.values(summary).forEach(item => {
            lines.push(item.productName);
            if (item.remarks.length > 0) {
                lines.push(`【口味備註：${item.remarks.join(', ')}】`);
            }
            const prod = products.find(p => p.id === item.productId || p.name === item.productName || p.name === item.productId);
            const isBundle = prod ? prod.isBundle : false;
            const bundleSize = prod ? prod.bundleSize : 1;
            if (isBundle) {
                lines.push(`x${item.totalQty} 組 (共 ${item.totalQty * bundleSize} 瓶)`);
            } else {
                lines.push(`x${item.totalQty}`);
            }
        });

        const textToCopy = lines.join('\n');

        const ok = await copyToClipboard(textToCopy);
        if (ok) {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } else {
            alert('複製失敗，請手動複製：\n\n' + textToCopy);
        }
    };

    const handleCopyDetailSummary = async () => {
        const targetOrders = selectedOrderIds.length > 0
            ? sortedFilteredOrders.filter(o => selectedOrderIds.includes(o.orderId))
            : sortedFilteredOrders;
        const finalOrders = targetOrders.length > 0 ? targetOrders : sortedFilteredOrders;

        if (finalOrders.length === 0) {
            alert('目前沒有訂單可彙整');
            return;
        }

        const lines = [];
        const isSelectedStr = selectedOrderIds.length > 0 && finalOrders.length === targetOrders.length ? ` (已選取 ${finalOrders.length} 筆)` : '';
        lines.push(`📋 物流分貨明細 (${selectedBuilding === '全部' ? '全部大樓' : selectedBuilding})${isSelectedStr}`);
        lines.push(`彙整時間：${new Date().toLocaleString('zh-TW')}`);
        lines.push(`訂單總數：${finalOrders.length} 筆`);
        lines.push('----------------------------------------');

        finalOrders.forEach((order, idx) => {
            const groupName = getDisplayGroupName(order, buildingSettingsList, groupBindings);
            const lineNameStr = order.lineDisplayName ? ` [LINE: ${order.lineDisplayName}]` : '';
            lines.push(`${idx + 1}. ${order.customerName}${lineNameStr} (${order.customerPhone})`);
            lines.push(`   群組/大樓：${groupName}`);
            if (order.deliveryAddress) {
                lines.push(`   地址/自取：${order.deliveryAddress}`);
            }
            
            lines.push('   訂購品項：');
            order.items.forEach(item => {
                const prod = products.find(p => p.id === item.productId || p.name === item.productName || p.name === item.productId);
                lines.push(formatDetailItemLine(item, prod));
            });

            // 團員代訂分配明細
            if (order.recipients && order.recipients.length > 0) {
                lines.push('   👥 團員分配：');
                order.recipients.forEach(r => {
                    const rTotal = r.items.reduce((sum, ri) => sum + (ri.subtotal != null && ri.subtotal !== undefined ? Number(ri.subtotal) : 0), 0);
                    lines.push(`      👤 ${r.recipientName}（$${rTotal}）`);
                    r.items.forEach(ri => {
                        const formatted = formatCleanProductNameAndFlavor(ri.productName, ri.remark, null);
                        const prod = products.find(p => p.id === ri.productId || p.name === formatted.cleanBaseName);
                        const isBundle = prod ? prod.isBundle : false;
                        const bundleSize = prod ? prod.bundleSize : 1;
                        const unitStr = isBundle ? `組 (共 ${ri.qty * bundleSize} 瓶)` : '瓶';

                        const sub = ri.subtotal != null && ri.subtotal !== undefined ? Number(ri.subtotal) : 0;
                        lines.push(`         - ${formatted.pNameDisplay} x${ri.qty} ${unitStr} = $${sub}`);
                    });
                });
            }

            lines.push(`   合計金額：$${order.totalAmount}`);
            if (order.note) {
                lines.push(`   訂單備註：${order.note}`);
            }
            lines.push('----------------------------------------');
        });

        const textToCopy = lines.join('\n');

        const ok = await copyToClipboard(textToCopy);
        if (ok) {
            setDetailCopied(true);
            setTimeout(() => setDetailCopied(false), 2000);
        } else {
            alert('複製失敗，請手動複製：\n\n' + textToCopy);
        }
    };

    const handleCopyClientDetailSummary = async () => {
        const targetOrders = selectedOrderIds.length > 0
            ? sortedFilteredOrders.filter(o => selectedOrderIds.includes(o.orderId))
            : sortedFilteredOrders;
        const finalOrders = targetOrders.length > 0 ? targetOrders : sortedFilteredOrders;

        if (finalOrders.length === 0) {
            alert('目前沒有訂單可彙整');
            return;
        }

        const lines = [];
        const isSelectedStr = selectedOrderIds.length > 0 && finalOrders.length === targetOrders.length ? ` (已選取 ${finalOrders.length} 筆)` : '';
        lines.push(`📱 顧客對帳清單 (${selectedBuilding === '全部' ? '全部大樓' : selectedBuilding})${isSelectedStr}`);
        lines.push(`彙整時間：${new Date().toLocaleString('zh-TW')}`);
        lines.push(`訂單總數：${finalOrders.length} 筆`);
        lines.push('----------------------------------------');

        finalOrders.forEach((order, idx) => {
            const groupName = getDisplayGroupName(order, buildingSettingsList, groupBindings);
            const lineNameStr = order.lineDisplayName ? ` [LINE: ${order.lineDisplayName}]` : '';
            lines.push(`${idx + 1}. ${order.customerName}${lineNameStr}`);
            lines.push(`   群組/大樓：${groupName}`);
            if (order.deliveryAddress) {
                lines.push(`   地址/自取：${order.deliveryAddress}`);
            }
            
            lines.push('   訂購品項：');
            order.items.forEach(item => {
                const prod = products.find(p => p.id === item.productId || p.name === item.productName || p.name === item.productId);
                lines.push(formatDetailItemLine(item, prod));
            });

            lines.push(`   合計金額：$${order.totalAmount}`);
            lines.push('----------------------------------------');
        });

        const textToCopy = lines.join('\n');

        const ok = await copyToClipboard(textToCopy);
        if (ok) {
            setClientDetailCopied(true);
            setTimeout(() => setClientDetailCopied(false), 2000);
        } else {
            alert('複製失敗，請手動複製：\n\n' + textToCopy);
        }
    };

    const unnamedGroups = React.useMemo(() => {
        if (!orders || orders.length === 0) return [];
        const groups = new Set();
        orders.forEach(order => {
            if (order.sourceGroup && !groupBindings[order.sourceGroup]) {
                groups.add(order.sourceGroup);
            }
        });
        return Array.from(groups);
    }, [orders, groupBindings]);

    const handleBindGroup = async (groupId) => {
        const groupName = newGroupNames[groupId]?.trim();
        if (!groupName) {
            alert('請輸入大樓/社區真實名稱');
            return;
        }

        setIsBinding(true);
        try {
            const res = await callGAS(apiUrl, 'saveGroupBinding', {
                groupId,
                groupName
            }, user.token);

            if (res && res.error) {
                throw new Error(res.error);
            }

            alert(`群組「${groupId}」成功綁定為「${groupName}」！`);
            setNewGroupNames(prev => {
                const next = { ...prev };
                delete next[groupId];
                return next;
            });
            await fetchGroupBindings();
        } catch (error) {
            alert('綁定失敗: ' + error.message);
        } finally {
            setIsBinding(false);
        }
    };

    return (
        <div className="max-w-6xl mx-auto min-h-screen flex flex-col p-4 gap-4">
            {/* Header Area (設定 overflow-visible 與 z-30 確保下拉選單完全不被遮擋) */}
            <div className="bg-[var(--bg-secondary)] p-4 sm:p-5 rounded-2xl border border-[var(--border-primary)] shadow-sm space-y-3.5 relative z-30 overflow-visible">
                {/* 第一列：標題 + 刷新按鈕擺放至右上角 */}
                <div className="flex items-center justify-between gap-4">
                    <h2 className="text-xl md:text-2xl font-black flex items-center gap-2 text-[var(--text-primary)] whitespace-nowrap">
                        <ClipboardList className="text-blue-600 shrink-0" size={24} />
                        <span>訂單審核</span>
                    </h2>

                    {/* 右上角刷新按鈕 */}
                    <button 
                        onClick={fetchOrders} 
                        className="p-2 text-slate-500 hover:text-blue-600 hover:bg-[var(--bg-hover)] rounded-xl border border-[var(--border-primary)] transition-all shadow-2xs flex items-center gap-1 text-xs font-bold"
                        title="重新整理"
                    >
                        <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>

                {/* 第二列：統一框框樣式之篩選與搜尋工具欄 (解封 overflow-visible 允許大選單浮出) */}
                <div className="grid grid-cols-1 sm:flex sm:flex-wrap items-center gap-2.5 w-full max-w-full overflow-visible relative z-30">
                    {/* 大樓篩選選單 */}
                    <div className="relative w-full sm:w-48 shrink-0">
                        <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] pointer-events-none" size={16} />
                        <select
                            className="w-full text-xs md:text-sm py-2 pl-9 pr-8 bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-xl font-bold text-[var(--text-primary)] appearance-none focus:outline-none focus:border-blue-500 focus:bg-[var(--bg-secondary)] shadow-2xs transition-all cursor-pointer truncate"
                            value={selectedBuilding}
                            onChange={(e) => setSelectedBuilding(e.target.value)}
                        >
                            <option value="全部">全部社區大樓</option>
                            {allAvailableBuildings.map(bname => (
                                <option key={bname} value={bname}>{bname}</option>
                            ))}
                        </select>
                        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] pointer-events-none" size={15} />
                    </div>

                    {/* 付款方式篩選選單 */}
                    <div className="relative w-full sm:w-44 shrink-0">
                        <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] pointer-events-none" size={16} />
                        <select
                            className="w-full text-xs md:text-sm py-2 pl-9 pr-8 bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-xl font-bold text-[var(--text-primary)] appearance-none focus:outline-none focus:border-blue-500 focus:bg-[var(--bg-secondary)] shadow-2xs transition-all cursor-pointer truncate"
                            value={selectedPaymentMethod}
                            onChange={(e) => setSelectedPaymentMethod(e.target.value)}
                        >
                            <option value="全部">全部付款方式</option>
                            {allAvailablePaymentMethods.map(method => (
                                <option key={method} value={method}>{method}</option>
                            ))}
                        </select>
                        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] pointer-events-none" size={15} />
                    </div>

                    {/* 綜合搜尋 */}
                    <div className="relative w-full sm:flex-1 sm:min-w-[180px]">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" size={16} />
                        <input
                            type="text"
                            placeholder="搜尋編號、姓名、電話..."
                            className="w-full pl-9 pr-3 text-xs md:text-sm py-2 bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-xl font-medium text-[var(--text-primary)] focus:outline-none focus:border-blue-500 focus:bg-[var(--bg-secondary)] shadow-2xs transition-all"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>

                    {/* 商品名稱特化查詢與精確切換按鈕 */}
                    <div className="flex items-center gap-2 w-full sm:flex-1 sm:min-w-[240px] relative">
                        <div className="relative flex-1">
                            <PackageSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" size={16} />
                            <input
                                type="text"
                                placeholder="查詢商品 (如: 禾香優格)..."
                                className="w-full pl-9 pr-8 text-xs md:text-sm py-2 bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-xl font-medium text-[var(--text-primary)] focus:outline-none focus:border-blue-500 focus:bg-[var(--bg-secondary)] shadow-2xs transition-all"
                                value={productSearchTerm}
                                onFocus={() => setShowProductAutocomplete(true)}
                                onChange={(e) => {
                                    setProductSearchTerm(e.target.value);
                                    setShowProductAutocomplete(true);
                                }}
                            />
                            {productSearchTerm && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setProductSearchTerm('');
                                        setShowProductAutocomplete(false);
                                    }}
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                                    title="清空商品搜尋"
                                >
                                    <X size={14} />
                                </button>
                            )}
                        </div>

                        {/* 精確相符開關按鈕 */}
                        <button
                            type="button"
                            onClick={() => setIsExactProductMatch(!isExactProductMatch)}
                            className={`px-3 py-2 rounded-xl text-xs font-bold shrink-0 transition-all flex items-center gap-1 border h-[38px] active:scale-95 ${
                                isExactProductMatch
                                    ? "bg-emerald-600 text-white border-emerald-500 shadow-sm"
                                    : "bg-[var(--bg-primary)] text-[var(--text-secondary)] border-[var(--border-primary)] hover:border-slate-400"
                            }`}
                            title={isExactProductMatch ? "目前為【精確 OFF】模式，點擊切換為模糊包含搜尋" : "目前為【模糊包含】模式，點擊開啟【精確 ON】隔離搜尋"}
                        >
                            <span>{isExactProductMatch ? "精確 ON" : "精確 OFF"}</span>
                        </button>

                        {/* 🔍 打字關鍵字即時符合的商品與口味浮動下拉選單 (解封邊界 + 最高 z-[100] + 520px 大寬版大高度) */}
                        {showProductAutocomplete && matchingAutocompleteList.length > 0 && (
                            <div className="absolute left-0 right-0 sm:right-auto top-full mt-1.5 w-full sm:w-[520px] bg-white border-2 border-emerald-500 rounded-2xl shadow-2xl z-[100] overflow-hidden divide-y divide-emerald-100 animate-in fade-in duration-150 text-slate-900">
                                <div className="px-4 py-2.5 text-xs font-black text-emerald-950 bg-emerald-100 flex justify-between items-center border-b border-emerald-200">
                                    <span className="flex items-center gap-1">🔍 點擊即帶入並自動啟動【精確 ON】(共 {matchingAutocompleteList.length} 項)：</span>
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setShowProductAutocomplete(false);
                                        }}
                                        className="text-slate-500 hover:text-rose-600 p-0.5 cursor-pointer"
                                    >
                                        <X size={16} />
                                    </button>
                                </div>
                                <div className="max-h-[360px] md:max-h-[440px] overflow-y-auto bg-white">
                                    {matchingAutocompleteList.map((pName, pIdx) => (
                                        <button
                                            key={pIdx}
                                            type="button"
                                            className="w-full text-left px-4 py-3 text-xs md:text-sm font-extrabold text-slate-900 hover:bg-emerald-50 hover:text-emerald-700 transition-colors flex items-center justify-between border-b border-slate-100 last:border-b-0 cursor-pointer group bg-white"
                                            onClick={() => {
                                                setProductSearchTerm(pName);
                                                setIsExactProductMatch(true); // 點擊自動開啟精確模式！
                                                setShowProductAutocomplete(false);
                                            }}
                                        >
                                            <span className="truncate group-hover:underline text-slate-900 font-extrabold">{pName}</span>
                                            <span className="text-xs text-white bg-emerald-600 font-black shrink-0 ml-2 px-2.5 py-1 rounded-lg shadow-xs group-hover:bg-emerald-700">
                                                🎯 帶入精確過濾
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* 出貨/確認日期起迄區間與滿版依附快捷按鈕 (100% 填滿寬度與齊平對齊) */}
                    <div className="flex flex-col gap-1.5 w-full sm:flex-1 sm:min-w-[280px]">
                        {/* 上層：日期區間搜尋 (100% 滿版填滿，與上方搜尋框完美齊平) */}
                        <div className="flex items-center gap-2 w-full">
                            <div className="relative flex-1 min-w-0">
                                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] pointer-events-none" size={15} />
                                <input
                                    type="date"
                                    className="w-full box-border pl-9 pr-2 text-xs md:text-sm h-[38px] bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-xl font-bold text-[var(--text-primary)] focus:outline-none focus:border-blue-500 shadow-2xs transition-all cursor-pointer"
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                    title="選擇起始日期 (起)"
                                />
                            </div>
                            <span className="text-xs font-black text-slate-400 shrink-0">~</span>
                            <div className="relative flex-1 min-w-0">
                                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] pointer-events-none" size={15} />
                                <input
                                    type="date"
                                    className="w-full box-border pl-9 pr-2 text-xs md:text-sm h-[38px] bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-xl font-bold text-[var(--text-primary)] focus:outline-none focus:border-blue-500 shadow-2xs transition-all cursor-pointer"
                                    value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                    title="選擇結束日期 (迄)"
                                />
                            </div>
                        </div>

                        {/* 下層：快捷按鈕滿版均分填滿 (解決右側留白問題) */}
                        <div className="flex items-center gap-1.5 w-full pt-0.5">
                            <span className="text-xs font-bold text-[var(--text-tertiary)] shrink-0 whitespace-nowrap">快捷：</span>
                            <div className="grid grid-cols-4 gap-1.5 flex-1">
                                {[
                                    { label: '今天', offset: 0 },
                                    { label: '明天', offset: 1 },
                                    { label: '後天', offset: 2 },
                                    { label: '大後天', offset: 3 },
                                ].map((item) => {
                                    const targetDate = getRelativeDateStr(item.offset);
                                    const isActive = startDate === targetDate && endDate === targetDate;
                                    return (
                                        <button
                                            key={item.label}
                                            type="button"
                                            onClick={() => {
                                                if (isActive) {
                                                    setStartDate('');
                                                    setEndDate('');
                                                } else {
                                                    setStartDate(targetDate);
                                                    setEndDate(targetDate);
                                                }
                                            }}
                                            className={`w-full py-1 text-xs font-bold rounded-lg transition-all cursor-pointer border text-center truncate ${
                                                isActive
                                                    ? 'bg-emerald-600 border-emerald-600 text-white shadow-xs font-black'
                                                    : 'bg-[var(--bg-primary)] border-[var(--border-primary)] text-[var(--text-primary)] hover:bg-slate-200 dark:hover:bg-slate-700'
                                            }`}
                                        >
                                            {item.label}
                                        </button>
                                    );
                                })}
                            </div>
                            {(startDate || endDate) && (
                                <button
                                    type="button"
                                    onClick={() => { setStartDate(''); setEndDate(''); }}
                                    className="px-2 py-1 text-xs font-bold text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-all shrink-0 cursor-pointer whitespace-nowrap"
                                    title="清空日期選擇"
                                >
                                    清空
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* 批次處理中遮罩 */}
            {isBatchProcessing && (
                <div className="fixed inset-0 bg-white/30 backdrop-blur-md z-50 flex flex-col items-center justify-center animate-in fade-in duration-300">
                    <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4 shadow-lg"></div>
                    <p className="text-xl font-bold text-blue-900">{batchMessage}</p>
                </div>
            )}

            {/* 頂部數據加總面板 */}
            {sortedFilteredOrders.length > 0 && (
                <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
                    <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-2.5 sm:p-3.5 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
                        <span className="text-[10px] sm:text-xs font-bold text-[var(--text-secondary)] uppercase tracking-tight sm:tracking-wider whitespace-nowrap truncate block">訂單總筆數</span>
                        <span className="text-lg sm:text-xl font-extrabold text-[var(--text-primary)] mt-1">{summaryStats.ordersCount} <span className="text-xs font-medium text-[var(--text-tertiary)]">筆</span></span>
                    </div>
                    <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-2.5 sm:p-3.5 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
                        <span className="text-[10px] sm:text-xs font-bold text-[var(--text-secondary)] uppercase tracking-tight sm:tracking-wider whitespace-nowrap truncate block">{activeTab === 'UNPAID' ? '未付款商品數量' : activeTab === 'CONFIRMED' ? '已出貨數量' : '待出貨數量'}</span>
                        <span className="text-lg sm:text-xl font-extrabold text-blue-600 mt-1">{summaryStats.totalQty} <span className="text-xs font-medium text-[var(--text-tertiary)]">瓶/件</span></span>
                    </div>
                    <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-2.5 sm:p-3.5 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
                        <span className="text-[10px] sm:text-xs font-bold text-[var(--text-secondary)] uppercase tracking-tight sm:tracking-wider whitespace-nowrap truncate block">{activeTab === 'UNPAID' ? '未付款總金額' : activeTab === 'CONFIRMED' ? '已出貨總金額' : '待出貨總金額'}</span>
                        <span className="text-lg sm:text-xl font-extrabold text-emerald-600 mt-1">${summaryStats.totalAmount.toLocaleString()}</span>
                    </div>
                </div>
            )}

            {/* 商品專屬查詢統計小卡片 (明亮淺色主題，避免深色模式造成視效混亂) */}
            {productSearchSummary && (
                <div className="bg-emerald-50/90 border border-emerald-200/80 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm animate-in fade-in duration-200">
                    <div className="flex items-center gap-3">
                        <div className="p-3 bg-emerald-600 text-white rounded-xl shadow-sm shrink-0">
                            <PackageSearch size={24} />
                        </div>
                        <div>
                            <div className="text-xs font-bold text-emerald-900 flex items-center flex-wrap gap-2">
                                <span>📦 商品查詢統計：「<span className="font-extrabold underline text-emerald-950">{productSearchSummary.keyword}</span>」</span>
                                {productSearchSummary.isExact && (
                                    <span className="px-2 py-0.5 bg-emerald-600 text-white rounded-full text-[10px] font-bold shadow-xs">
                                        🎯 精確全名相符模式
                                    </span>
                                )}
                            </div>
                            <div className="text-sm font-semibold text-emerald-800 mt-0.5">
                                含有此商品的訂單共 <span className="font-extrabold font-mono text-base text-emerald-950">{productSearchSummary.matchingOrdersCount}</span> 筆
                            </div>
                        </div>
                    </div>
                    <div className="text-right bg-white px-5 py-2.5 rounded-xl border border-emerald-200 shadow-sm flex items-center justify-between sm:block shrink-0">
                        <span className="text-xs font-bold text-emerald-800 block">該商品訂購數量總計</span>
                        <span className="text-2xl font-black text-emerald-600 font-mono">
                            {productSearchSummary.totalMatchQty} <span className="text-xs font-normal text-emerald-800">瓶/件</span>
                        </span>
                    </div>
                </div>
            )}

            {/* 批次操作列 (適用全狀態 tab) */}
            {sortedFilteredOrders.length > 0 && (
                <div className="bg-slate-50 dark:bg-slate-900/10 border border-[var(--border-primary)] rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-inner">
                    <div className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            checked={selectedOrderIds.length === sortedFilteredOrders.length && sortedFilteredOrders.length > 0}
                            onChange={handleToggleSelectAll}
                            className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 cursor-pointer"
                            id="selectAllCheckbox"
                        />
                        <label htmlFor="selectAllCheckbox" className="text-sm font-bold text-[var(--text-secondary)] cursor-pointer select-none">
                            全選本頁面{activeTab === 'UNPAID' ? '未付款' : activeTab === 'CONFIRMED' ? '已出貨/確認' : '待審核'}訂單
                        </label>
                        <span className="text-xs text-[var(--text-tertiary)] ml-1">
                            (已選取 {selectedOrderIds.length} 筆)
                        </span>
                    </div>
                    {selectedOrderIds.length > 0 && (
                        <div className="flex gap-2 flex-wrap items-center">
                            <button
                                type="button"
                                onClick={handleBatchDelete}
                                className="py-1.5 px-3 text-xs font-bold rounded-lg bg-rose-600 hover:bg-rose-700 active:scale-95 transition-transform text-white shadow-sm flex items-center gap-1 cursor-pointer whitespace-nowrap"
                            >
                                <Trash2 size={14} /> 批次刪除 ({selectedOrderIds.length})
                            </button>
                            <button
                                type="button"
                                onClick={handleBatchSetDeliveryDate}
                                className="py-1.5 px-3 text-xs font-bold rounded-lg bg-amber-500 hover:bg-amber-600 active:scale-95 transition-transform text-white shadow-sm flex items-center gap-1 cursor-pointer whitespace-nowrap"
                                title="批次設定選取訂單的預計配送日"
                            >
                                <Calendar size={14} /> 🚚 批次設定配送日 ({selectedOrderIds.length})
                            </button>
                            <button
                                type="button"
                                onClick={handleBatchConfirmPayment}
                                className="py-1.5 px-3 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 active:scale-95 transition-transform text-white shadow-sm flex items-center gap-1 cursor-pointer whitespace-nowrap"
                            >
                                <CheckCircle size={14} /> 批次確認收款 ({selectedOrderIds.length})
                            </button>
                            <button
                                type="button"
                                onClick={handleBatchConfirm}
                                className="btn-primary py-1.5 px-3 text-xs font-bold bg-blue-600 hover:bg-blue-700 border-none shadow-sm active:scale-95 transition-transform flex items-center gap-1 cursor-pointer whitespace-nowrap"
                            >
                                <CheckCircle size={14} /> 批次確認出貨 ({selectedOrderIds.length})
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* Tabs & 右側操作按鈕列 (使用 overflow-x-auto 防止右側切邊跑版) */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between border-b border-[var(--border-primary)] pb-1.5 gap-2 w-full max-w-full">
                <div className="grid grid-cols-3 w-full sm:flex sm:w-auto items-center gap-1 sm:gap-2">
                    <button
                        onClick={() => { setActiveTab('PENDING'); setSelectedOrderIds([]); setStartDate(''); setEndDate(''); }}
                        className={`px-1 sm:px-4 py-2 font-bold text-xs sm:text-sm text-center transition-colors border-b-2 whitespace-nowrap ${activeTab === 'PENDING'
                                ? 'border-blue-500 text-blue-600'
                                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                            }`}
                    >
                        <span>待確認訂單</span><span className="hidden md:inline text-[11px] opacity-80"> (PENDING)</span>
                    </button>
                    <button
                        onClick={() => { 
                            setActiveTab('CONFIRMED'); 
                            setSelectedOrderIds([]); 
                            const today = new Date().toISOString().split('T')[0];
                            setStartDate(today);
                            setEndDate(today);
                        }}
                        className={`px-1 sm:px-4 py-2 font-bold text-xs sm:text-sm text-center transition-colors border-b-2 whitespace-nowrap ${activeTab === 'CONFIRMED'
                                ? 'border-blue-500 text-blue-600'
                                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                            }`}
                    >
                        <span>已出貨/確認</span><span className="hidden md:inline text-[11px] opacity-80"> (CONFIRMED)</span>
                    </button>
                    <button
                        onClick={() => { setActiveTab('UNPAID'); setSelectedOrderIds([]); setStartDate(''); setEndDate(''); }}
                        className={`px-1 sm:px-4 py-2 font-bold text-xs sm:text-sm text-center transition-colors border-b-2 whitespace-nowrap ${activeTab === 'UNPAID'
                                ? 'border-amber-500 text-amber-600'
                                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                            }`}
                    >
                        <span>未付款訂單</span><span className="hidden md:inline text-[11px] opacity-80"> (UNPAID)</span>
                    </button>
                </div>

                <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto max-w-full pb-1 pt-0.5 scrollbar-thin">
                    <button
                        type="button"
                        onClick={handleExpandAll}
                        className="py-1.5 px-2.5 sm:px-3 text-xs font-bold rounded-lg flex items-center gap-1 shadow-sm active:scale-95 transition-all duration-200 border bg-[var(--bg-secondary)] hover:bg-[var(--bg-hover)] border-[var(--border-primary)] text-[var(--text-primary)] whitespace-nowrap cursor-pointer shrink-0"
                        title="展開所有訂單詳情"
                    >
                        <ChevronDown size={14} /> <span>全部展開</span>
                    </button>
                    <button
                        type="button"
                        onClick={handleCollapseAll}
                        className="py-1.5 px-2.5 sm:px-3 text-xs font-bold rounded-lg flex items-center gap-1 shadow-sm active:scale-95 transition-all duration-200 border bg-[var(--bg-secondary)] hover:bg-[var(--bg-hover)] border-[var(--border-primary)] text-[var(--text-primary)] whitespace-nowrap cursor-pointer shrink-0"
                        title="折疊所有訂單"
                    >
                        <ChevronUp size={14} /> <span>全部折疊</span>
                    </button>
                    <button
                        type="button"
                        onClick={handleCopyShipmentSummary}
                        className={`py-1.5 px-2.5 sm:px-3 text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-sm active:scale-95 transition-all duration-200 border whitespace-nowrap cursor-pointer shrink-0 ${copied 
                            ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-transparent' 
                            : 'bg-[var(--bg-secondary)] hover:bg-[var(--bg-hover)] border-[var(--border-primary)] text-[var(--text-primary)]'
                        }`}
                        title={selectedOrderIds.length > 0 ? `複製選取的 ${selectedOrderIds.length} 筆訂單點貨總量` : "複製目前篩選的所有訂單點貨總量"}
                    >
                        <span>{copied ? '✅ 已複製點貨總量！' : selectedOrderIds.length > 0 ? `📦 複製點貨總量 (${selectedOrderIds.length})` : '📦 複製點貨總量'}</span>
                    </button>

                    <button
                        type="button"
                        onClick={handleCopyDetailSummary}
                        className={`py-1.5 px-2.5 sm:px-3 text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-sm active:scale-95 transition-all duration-200 border whitespace-nowrap cursor-pointer shrink-0 ${detailCopied 
                            ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-transparent' 
                            : 'bg-[var(--bg-secondary)] hover:bg-[var(--bg-hover)] border-[var(--border-primary)] text-[var(--text-primary)]'
                        }`}
                        title={selectedOrderIds.length > 0 ? `複製選取的 ${selectedOrderIds.length} 筆業務分貨明細` : "複製目前篩選的所有業務分貨明細"}
                    >
                        <span>{detailCopied ? '✅ 已複製分貨明細(業務)！' : selectedOrderIds.length > 0 ? `📋 複製分貨明細(業務) (${selectedOrderIds.length})` : '📋 複製分貨明細(業務)'}</span>
                    </button>

                    <button
                        type="button"
                        onClick={handleCopyClientDetailSummary}
                        className={`py-1.5 px-2.5 sm:px-3 text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-sm active:scale-95 transition-all duration-200 border whitespace-nowrap cursor-pointer shrink-0 ${clientDetailCopied 
                            ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-transparent' 
                            : 'bg-[var(--bg-secondary)] hover:bg-[var(--bg-hover)] border-[var(--border-primary)] text-[var(--text-primary)]'
                        }`}
                        title={selectedOrderIds.length > 0 ? `複製選取的 ${selectedOrderIds.length} 筆客戶分貨明細` : "複製目前篩選的所有客戶分貨明細"}
                    >
                        <span>{clientDetailCopied ? '✅ 已複製分貨明細(客戶)！' : selectedOrderIds.length > 0 ? `📋 複製分貨明細(客戶) (${selectedOrderIds.length})` : '📋 複製分貨明細(客戶)'}</span>
                    </button>
                </div>
            </div>

            {/* Orders Area */}
            <div className="flex-1 overflow-y-visible pb-24 mt-4">
                {loading && orders.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-3 text-[var(--text-secondary)]">
                        <RefreshCw className="animate-spin text-blue-500" size={36} />
                        <span>訂單資料讀取中...</span>
                    </div>
                ) : filteredOrders.length === 0 ? (
                    <div className="text-center py-20 text-[var(--text-secondary)] bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-primary)] shadow-sm">
                        沒有找到任何訂單。
                    </div>
                ) : (
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                        {sortedFilteredOrders.map(order => {
                            const isExpanded = expandedOrderIds.has(order.orderId);
                            return (
                                <div key={order.orderId} className="relative bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-primary)] shadow-sm hover:border-blue-500/40 hover:shadow-md transition-all duration-200 overflow-hidden flex flex-col">
                                    {/* 右上角紅底邊角標籤：極速辨識團員代訂單 */}
                                    {order.recipients && order.recipients.length > 0 && (
                                        <div 
                                            className="absolute top-0 right-0 z-10 bg-rose-600 text-white font-black text-[10px] sm:text-xs px-2.5 py-0.5 rounded-bl-lg rounded-tr-xl shadow-sm tracking-wider flex items-center gap-1 pointer-events-none"
                                            title={`含 ${order.recipients.length} 位團員代訂明細`}
                                        >
                                            代訂單 ({order.recipients.length}人)
                                        </div>
                                    )}

                                    {/* 頂部 Header & 完整訂單摘要 (收合狀態 = 100% 完整訂單摘要卡片，零視覺雜訊) */}
                                    <div 
                                        onClick={() => toggleExpandOrder(order.orderId)}
                                        className="p-4 sm:p-5 flex flex-col justify-between gap-2.5 cursor-pointer hover:bg-[var(--bg-hover)] transition-colors select-none"
                                    >
                                        {/* 第一列：顧客姓名 + 深灰總金額 + 灰底/藍觸發按鈕 [📦 商品明細 ∨] */}
                                        <div className="flex items-center justify-between gap-3 flex-wrap">
                                            <div className="flex items-center gap-3 min-w-0 flex-1">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedOrderIds.includes(order.orderId)}
                                                    onChange={(e) => {
                                                        e.stopPropagation();
                                                        handleToggleSelectOrder(order.orderId);
                                                    }}
                                                    onClick={(e) => e.stopPropagation()}
                                                    className="w-5 h-5 text-blue-600 rounded border-gray-300 focus:ring-blue-500 cursor-pointer flex-shrink-0"
                                                />
                                                <div className="flex flex-col min-w-0">
                                                    <span className="font-extrabold text-[var(--text-primary)] text-lg md:text-xl flex items-center gap-1.5 leading-tight">
                                                        <User size={18} className="text-slate-400 dark:text-slate-500 shrink-0" />
                                                        <span className="truncate">{order.customerName}</span>
                                                    </span>
                                                    <span className="font-mono text-xs text-[var(--text-tertiary)] font-medium mt-0.5">
                                                        #{order.orderId}
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2 shrink-0">
                                                <span className="font-mono font-black text-xl md:text-2xl text-blue-600 dark:text-blue-400">
                                                    ${computeOrderTotals(order, buildingSettingsList, groupBindings).totalAmount}
                                                </span>
                                            </div>
                                        </div>

                                        {/* 第二列：狀態 Badges 橫列 */}
                                        <div className="flex items-center gap-2 flex-wrap text-xs pt-0.5">
                                            {(() => {
                                                const knownNames = Array.from(new Set([...buildings, ...Object.values(groupBindings)])).filter(Boolean);
                                                const addr = String(order.deliveryAddress || '').trim();
                                                const matchedAddrBuilding = knownNames.find(name => name && addr.startsWith(name));
                                                const displayGroup = matchedAddrBuilding || groupBindings[order.sourceGroup] || order.sourceGroup;
                                                if (!displayGroup) return null;
                                                return (
                                                    <span className="bg-[var(--bg-tertiary)] text-[var(--text-secondary)] text-xs px-2.5 py-0.5 rounded-md font-bold border border-[var(--border-primary)] flex items-center gap-1">
                                                        🌐 {displayGroup}
                                                    </span>
                                                );
                                            })()}

                                            {order.paymentMethod && (
                                                <span className={`inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded font-bold border ${
                                                    order.paymentMethod === '滿額消費折抵' || order.paymentMethod === '滿額折抵'
                                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                        : order.paymentMethod === '奶包金扣抵'
                                                        ? 'bg-amber-50 text-amber-700 border-amber-200'
                                                        : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border-[var(--border-primary)]'
                                                }`}>
                                                    {order.paymentMethod === '滿額消費折抵' || order.paymentMethod === '滿額折抵' ? '🎁 滿額消費折抵' : order.paymentMethod === '奶包金扣抵' ? '💳 奶包金扣抵' : `💳 ${order.paymentMethod}`}
                                                </span>
                                            )}

                                            {/* 付款狀態 */}
                                            {order.paymentStatus !== 'off' && order.paymentStatus !== '已付款' && order.paymentStatus !== '已入帳' ? (
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleQuickConfirmPayment(order);
                                                    }}
                                                    className="text-xs px-2.5 py-1 font-extrabold rounded-lg bg-pink-50 hover:bg-pink-100 text-pink-600 border border-pink-200 shadow-2xs flex items-center gap-1.5 transition-all cursor-pointer"
                                                    title="點擊確認付款"
                                                >
                                                    <span className="w-2 h-2 rounded-full bg-pink-500 shrink-0 inline-block" />
                                                    <span>點擊確認付款</span>
                                                </button>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded font-bold bg-emerald-50 text-emerald-600 border border-emerald-200 shadow-2xs">
                                                    ✓ 已付款
                                                </span>
                                            )}

                                            {/* 預計配送日按鈕 (已有日期顯示配送日，尚未設定顯示『🚚 點擊確認配送日』框框) */}
                                            {order.expectedDeliveryDate ? (
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleOpenDateModal(order, e);
                                                    }}
                                                    className="bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold px-2.5 py-1 rounded-md flex items-center gap-1 cursor-pointer border border-blue-200 transition-colors shadow-2xs text-xs"
                                                    title="點擊修改預計配送日"
                                                >
                                                    🚚 {order.expectedDeliveryDate} 配送
                                                </button>
                                            ) : (
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleOpenDateModal(order, e);
                                                    }}
                                                    className="bg-amber-50 hover:bg-amber-100 text-amber-700 font-bold px-2.5 py-1 rounded-md flex items-center gap-1 cursor-pointer border border-amber-200 transition-colors text-xs shadow-2xs"
                                                    title="點擊確認預計配送日"
                                                >
                                                    🚚 點擊確認配送日
                                                </button>
                                            )}
                                        </div>

                                        {/* 第三列：物流通訊與下單時間 */}
                                        <div className="text-xs text-[var(--text-secondary)] mt-1 flex flex-col gap-1.5 border-t border-dashed border-[var(--border-primary)] pt-2.5">
                                            <div className="flex items-center gap-3 flex-wrap">
                                                <div className="flex items-center gap-1 font-semibold text-[var(--text-primary)]">
                                                    <Phone size={14} className="text-[var(--text-tertiary)]" />
                                                    <span>{order.customerPhone}</span>
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleCopyText(order.customerPhone, '電話');
                                                        }}
                                                        className="p-1 hover:bg-[var(--bg-hover)] rounded text-[var(--text-tertiary)] hover:text-blue-500 transition-colors"
                                                        title="複製電話"
                                                    >
                                                        <Copy size={12} />
                                                    </button>
                                                </div>

                                                {order.lineDisplayName && (
                                                    <span className="text-[11px] text-[var(--text-secondary)] bg-[var(--bg-tertiary)] px-2 py-0.5 rounded border border-[var(--border-primary)] font-medium">
                                                        LINE: {order.lineDisplayName}
                                                    </span>
                                                )}

                                                {order.createdAt && (
                                                    <span className="text-[var(--text-tertiary)] font-mono text-[11px] flex items-center gap-1 ml-auto">
                                                        🕒 {new Date(order.createdAt).toLocaleString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                                    </span>
                                                )}
                                            </div>

                                            {order.deliveryAddress && (
                                                <div className="flex items-start gap-1.5 text-[var(--text-secondary)] leading-normal">
                                                    <MapPin size={14} className="text-slate-400 dark:text-slate-500 shrink-0 mt-0.5" />
                                                    <span className="break-all font-semibold flex-1">{order.deliveryAddress}</span>
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleCopyText(order.deliveryAddress, '地址');
                                                        }}
                                                        className="p-1 hover:bg-[var(--bg-hover)] rounded text-slate-400 hover:text-blue-500 transition-colors shrink-0"
                                                        title="複製地址"
                                                    >
                                                        <Copy size={12} />
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* 展開後的 100% 新資訊專區：【📦 訂單商品與作業明細區塊】 (零重複資訊) */}
                                    {isExpanded && (
                                        <div className="p-5 border-t border-[var(--border-primary)] bg-[var(--bg-tertiary)]/50 flex flex-col justify-between flex-1 animate-in fade-in duration-150 space-y-4">
                                            <div>
                                                {/* 訂單備註 (若有) */}
                                                {order.note && (
                                                    <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-950/40 p-3 mb-4 rounded-xl border border-amber-200 dark:border-amber-800 text-sm text-amber-900 dark:text-amber-200">
                                                        <FileText size={16} className="text-amber-600 mt-0.5 shrink-0" />
                                                        <span className="font-semibold">訂單備註："{order.note}"</span>
                                                    </div>
                                                )}

                                                {/* 商品明細卡片 */}
                                            <div className="bg-[var(--bg-secondary)] rounded-xl p-4 border border-[var(--border-primary)] shadow-sm">
                                                <div className="flex items-center justify-between mb-3 pb-2 border-b border-[var(--border-primary)]">
                                                    <span className="text-xs font-extrabold uppercase text-[var(--text-tertiary)] tracking-wider flex items-center gap-1.5">
                                                        <Package size={15} className="text-blue-500" />
                                                        訂單商品明細 (共 {order.items?.reduce((sum, it) => sum + (Number(it.qty) || 0), 0) || 0} 件)
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={(e) => handleOpenDateModal(order, e)}
                                                        className="text-xs px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg shadow-2xs transition-all flex items-center gap-1"
                                                    >
                                                        <Calendar size={12} />
                                                        修改配送日
                                                    </button>
                                                </div>

                                                <div className="divide-y divide-[var(--border-primary)] divide-dashed space-y-3">
                                                    {order.items.map((item, idx) => {
                                                        const matchedQty = productSearchTerm.trim()
                                                            ? extractMatchedQtyFromItem(item, productSearchTerm, isExactProductMatch)
                                                            : 0;
                                                        const isHighlighted = matchedQty > 0;

                                                        return (
                                                        <div key={idx} className={`flex flex-col transition-all rounded-xl ${isHighlighted ? "bg-amber-500/15 border-l-4 border-l-amber-500 p-3 my-1.5" : "pt-2.5 first:pt-0"}`}>
                                                            {(() => {
                                                                const prod = products.find(p => p.id === item.productId || p.name === item.productName || p.name === item.productId);
                                                                const isBundle = prod ? prod.isBundle : false;
                                                                const bundleSize = prod ? prod.bundleSize : 1;
                                                                const freeQty = prod ? calculateFreeQtyFromTotal(prod.id, item.qty) : 0;
                                                                const paidQty = item.qty - freeQty;

                                                                const cleanName = String(item.productName || '')
                                                                     .replace(/\s*\(\s*【?口味備註：.*$/gi, '')
                                                                     .replace(/\s*【口味備註：.*$/gi, '')
                                                                     .replace(/\s*\([^)]*口味備註.*$/gi, '')
                                                                     .replace(/[)】\s]+$/g, '')
                                                                     .trim();

                                                                return (
                                                                    <div className="flex justify-between items-start text-sm md:text-base">
                                                                        <div className="flex flex-col gap-1">
                                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                                <span className="font-black text-[var(--text-primary)]">
                                                                                    {cleanName}
                                                                                    {isBundle && <span className="text-[10px] font-extrabold text-amber-600 bg-amber-500/10 px-1.5 py-0.5 rounded-md ml-1.5">捆裝 {bundleSize}入</span>}
                                                                                    {isHighlighted && (
                                                                                        <span className="px-1.5 py-0.5 bg-amber-500 text-white rounded text-[10px] font-bold ml-1.5 shadow-2xs">
                                                                                            🎯 搜尋目標 (符合 {matchedQty} 罐)
                                                                                        </span>
                                                                                    )}
                                                                                </span>
                                                                                <span className="text-xs md:text-sm text-blue-600 dark:text-blue-400 font-extrabold">
                                                                                    x {item.qty} {isBundle ? '組' : '瓶'}
                                                                                </span>
                                                                            </div>
                                                                            {freeQty > 0 && (
                                                                                <span className="text-xs font-bold text-emerald-600">
                                                                                    (付費: {paidQty}, 贈送: {freeQty})
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                        <span className="font-mono font-bold text-[var(--text-secondary)] mt-0.5">${item.subtotal}</span>
                                                                    </div>
                                                                );
                                                            })()}
                                                            {item.remark && (() => {
                                                                const rawTag = String(item.remark || '')
                                                                    .replace(/【?口味備註：?/g, '')
                                                                    .replace(/】/g, '')
                                                                    .trim();
                                                                const flavorTag = stripTrailingQty(rawTag);
                                                                if (!flavorTag) return null;
                                                                return (
                                                                    <div className="text-xs text-blue-600 dark:text-blue-400 font-bold mt-1 ml-1">
                                                                        【{flavorTag}】
                                                                    </div>
                                                                );
                                                            })()}
                                                        </div>
                                                    );
                                                })}
                                                </div>
                                                    {(() => {
                                                        const totals = computeOrderTotals(order, buildingSettingsList, groupBindings);
                                                        return (
                                                            <>
                                                                {totals.rewardDiscount > 0 && (
                                                                    <div className="flex justify-between items-center text-sm pt-2 border-t border-dashed border-[var(--border-primary)] text-emerald-600 dark:text-emerald-400 font-bold">
                                                                        <span>🎁 滿額自選折抵</span>
                                                                        <span className="font-mono">-${totals.rewardDiscount}</span>
                                                                    </div>
                                                                )}
                                                                {totals.shippingFee > 0 && (
                                                                    <div className="flex justify-between items-center text-sm pt-2 border-t border-dashed border-[var(--border-primary)] text-amber-600 dark:text-amber-400 font-bold">
                                                                        <span>🚚 外送運費</span>
                                                                        <span className="font-mono">+${totals.shippingFee}</span>
                                                                    </div>
                                                                )}
                                                            </>
                                                        );
                                                    })()}
                                                    <div className="flex justify-between items-center border-t border-[var(--border-primary)] mt-3.5 pt-2.5 font-bold text-lg md:text-xl">
                                                        <span className="text-[var(--text-primary)]">金額合計</span>
                                                        <span className="text-blue-600 dark:text-blue-400 font-mono font-extrabold">${computeOrderTotals(order, buildingSettingsList, groupBindings).totalAmount}</span>
                                                    </div>
                                                    {order.recipients && order.recipients.length > 0 && (
                                                        <div className="border-t border-[var(--border-primary)] mt-3.5 pt-3.5 space-y-2">
                                                            <div className="text-xs uppercase font-extrabold text-[var(--text-tertiary)] tracking-wider">👤 團員代訂分配明細</div>
                                                            <div className="space-y-2">
                                                                {order.recipients.map((r, rIdx) => {
                                                                    const recipientTotal = r.items.reduce((sum, ri) => sum + (ri.subtotal != null && ri.subtotal !== undefined ? Number(ri.subtotal) : calculateItemSubtotal(ri.productId, ri.qty, ri.price)), 0);
                                                                    return (
                                                                        <div key={rIdx} className="bg-[var(--bg-secondary)] p-3 rounded-lg border border-[var(--border-primary)]">
                                                                            <div className="flex justify-between items-center text-base font-extrabold text-[var(--text-primary)] border-b border-dashed border-[var(--border-primary)] pb-1 mb-1.5">
                                                                                <span>👤 {r.recipientName}</span>
                                                                                <span className="text-blue-600 font-mono text-base">${recipientTotal} 元</span>
                                                                            </div>
                                                                            <div className="pl-2 space-y-1 text-sm md:text-base text-[var(--text-secondary)]">
                                                                                {r.items.map((ri, riIdx) => {
                                                                                    const sub = calculateItemSubtotal(ri.productId || ri.productName, ri.qty, ri.price ?? ri.unitPrice);
                                                                                    const formatted = formatCleanProductNameAndFlavor(ri.productName, ri.remark, ri.qty);
                                                                                    const freeQty = calculateFreeQtyFromTotal(ri.productId, ri.qty);
                                                                                    const paidQty = ri.qty - freeQty;
                                                                                    const qtyDisplay = freeQty > 0 ? `x${ri.qty} (付費:${paidQty},送:${freeQty})` : `x${ri.qty}`;
                                                                                    return (
                                                                                        <div key={riIdx} className="flex justify-between items-start font-mono">
                                                                                            <span className="pr-2 text-[var(--text-secondary)] break-words leading-snug">
                                                                                                <span className="text-[var(--text-primary)] font-normal text-sm md:text-base">{formatted.pNameDisplay}</span> <span className="font-normal text-blue-600 dark:text-blue-400">{qtyDisplay}</span>
                                                                                            </span>
                                                                                            <span className="flex-shrink-0 font-normal text-[var(--text-primary)] mt-0.5 text-sm md:text-base">${sub}</span>
                                                                                        </div>
                                                                                    );
                                                                                })}
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Actions */}
                                            {order.status === 'PENDING' && (
                                                <div className="grid grid-cols-3 gap-3 border-t border-[var(--border-primary)] pt-4 mt-auto">
                                                    <button
                                                        onClick={() => handleDeleteOrder(order.orderId)}
                                                        className="col-span-1 py-3.5 text-sm flex items-center justify-center gap-1.5 rounded-lg border border-red-200 dark:border-red-800/30 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-all font-bold active:scale-95"
                                                    >
                                                        <Trash2 size={16} /> 刪除
                                                    </button>
                                                    <button
                                                        onClick={() => handleOpenEdit(order)}
                                                        className="btn-secondary py-3.5 text-sm flex items-center justify-center gap-1.5"
                                                    >
                                                        <Edit size={16} /> 修改
                                                    </button>
                                                    <button
                                                        onClick={() => handleConfirmOrder(order.orderId)}
                                                        className="btn-primary py-3.5 text-sm flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 border-none"
                                                    >
                                                        <CheckCircle size={16} /> 出貨
                                                    </button>
                                                </div>
                                            )}
                                            {order.status === 'CONFIRMED' && (
                                                <div className="border-t border-[var(--border-primary)] pt-4 mt-auto flex items-center gap-2 justify-center text-sm text-[var(--text-secondary)] font-bold">
                                                    <Check className="text-emerald-500" size={18} />
                                                    <span>已於 {formatDate(order.confirmedAt)} 由 {order.confirmedBy} 確認出貨</span>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* 編輯訂單 Modal */}
            {showEditModal && editingOrder && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
                    <form onSubmit={handleSaveOrderEdit} className="bg-[var(--bg-secondary)] rounded-2xl border border-[var(--border-primary)] shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
                        {/* Title */}
                        <div className="p-5 border-b border-[var(--border-primary)] flex justify-between items-center bg-[var(--bg-tertiary)]">
                            <h3 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2">
                                <Edit size={20} className="text-blue-500" />
                                修改訂單內容 ({editingOrder.orderId})
                            </h3>
                            <button type="button" onClick={() => setShowEditModal(false)} className="text-[var(--text-secondary)] hover:text-red-500 p-1.5 rounded-lg hover:bg-[var(--bg-hover)]">
                                <X size={18} />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-4">
                            {/* 客戶基本資料 */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-[var(--text-secondary)] flex items-center gap-1">
                                        <User size={13} /> 姓名
                                    </label>
                                    <input
                                        type="text"
                                        className="input-field w-full p-2 text-sm"
                                        value={editingOrder.customerName}
                                        onChange={(e) => handleEditFieldChange('customerName', e.target.value)}
                                        required
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-[var(--text-secondary)] flex items-center gap-1">
                                        <Phone size={13} /> 電話
                                    </label>
                                    <input
                                        type="text"
                                        className="input-field w-full p-2 text-sm"
                                        value={editingOrder.customerPhone}
                                        onChange={(e) => handleEditFieldChange('customerPhone', e.target.value)}
                                        required
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-[var(--text-secondary)] flex items-center gap-1">
                                        <MapPin size={13} /> 地址 / 自取
                                    </label>
                                    <input
                                        type="text"
                                        className="input-field w-full p-2 text-sm"
                                        value={editingOrder.deliveryAddress}
                                        onChange={(e) => handleEditFieldChange('deliveryAddress', e.target.value)}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-[var(--text-secondary)] flex items-center gap-1">
                                        <Users size={13} /> 來源群組 / 團購社群
                                    </label>
                                    <input
                                        type="text"
                                        list="source-group-options"
                                        className="input-field w-full p-2 text-sm font-bold text-blue-600 dark:text-blue-400"
                                        placeholder="例如：新營分局POLICE..."
                                        value={editingOrder.sourceGroup || ''}
                                        onChange={(e) => handleEditFieldChange('sourceGroup', e.target.value)}
                                    />
                                    <datalist id="source-group-options">
                                        {buildings.map(b => (
                                            <option key={b} value={b} />
                                        ))}
                                        {Object.entries(groupBindings).map(([gId, gName]) => (
                                            <option key={gId} value={gName} />
                                        ))}
                                    </datalist>
                                </div>
                            </div>

                            <div className="space-y-1">
                                <label className="text-xs font-bold text-[var(--text-secondary)] flex items-center gap-1">
                                    <FileText size={13} /> 備註
                                </label>
                                <textarea
                                    className="input-field w-full p-2 text-sm"
                                    rows="2"
                                    value={editingOrder.note}
                                    onChange={(e) => handleEditFieldChange('note', e.target.value)}
                                />
                            </div>

                            {/* 付款資訊調整 */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border-t border-[var(--border-primary)] pt-4">
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-[var(--text-secondary)]">付款方式</label>
                                    <select
                                        className="input-field w-full p-2 text-sm bg-[var(--bg-secondary)] border-[var(--border-primary)]"
                                        value={editingOrder.paymentMethod || ''}
                                        onChange={(e) => handleEditFieldChange('paymentMethod', e.target.value)}
                                    >
                                        <option value="現金">現金</option>
                                        <option value="轉帳">轉帳</option>
                                        <option value="LINE Pay">LINE Pay</option>
                                        <option value="">未指定</option>
                                    </select>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-[var(--text-secondary)]">轉帳後五碼</label>
                                    <input
                                        type="text"
                                        className="input-field w-full p-2 text-sm"
                                        value={editingOrder.transferLastFive || ''}
                                        placeholder="對帳後五碼"
                                        onChange={(e) => handleEditFieldChange('transferLastFive', e.target.value)}
                                        disabled={editingOrder.paymentMethod !== '轉帳'}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-[var(--text-secondary)]">對帳狀態</label>
                                    <select
                                        className="input-field w-full p-2 text-sm bg-[var(--bg-secondary)] border-[var(--border-primary)]"
                                        value={editingOrder.paymentStatus || ''}
                                        onChange={(e) => handleEditFieldChange('paymentStatus', e.target.value)}
                                    >
                                        <option value="未對帳">待對帳 / 未對帳</option>
                                        <option value="待確認">待確認</option>
                                        <option value="已付款">已付款 / 已入帳</option>
                                        <option value="貨到付款">貨到付款</option>
                                    </select>
                                </div>
                            </div>

                            {/* 商品細明修改 */}
                            {editingOrder.recipients && editingOrder.recipients.length > 0 ? (
                                <div className="border-t border-[var(--border-primary)] pt-4 space-y-4">
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                                            <Users size={16} className="text-blue-500" />
                                            👥 團購成員與代訂分配修改
                                        </span>
                                        {/* 新增團員 */}
                                        <div className="flex items-center gap-1.5">
                                            <input
                                                type="text"
                                                id="new-modal-recipient-name"
                                                placeholder="輸入成員姓名"
                                                className="input-field text-xs py-1.5 px-2 max-w-[120px]"
                                                onKeyDown={(e) => {
                                                    if (e.key === "Enter") {
                                                        e.preventDefault();
                                                        handleAddRecipientInModal(e.target.value);
                                                        e.target.value = "";
                                                    }
                                                }}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const input = document.getElementById("new-modal-recipient-name");
                                                    if (input && input.value) {
                                                        handleAddRecipientInModal(input.value);
                                                        input.value = "";
                                                    }
                                                }}
                                                className="btn-primary text-xs py-1.5 px-2 bg-blue-600 hover:bg-blue-700 border-none rounded-lg"
                                            >
                                                ➕ 新增團員
                                            </button>
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        {editingOrder.recipients.map((r, rIdx) => {
                                            const rTotal = r.items ? r.items.reduce((sum, ri) => sum + calculateItemSubtotal(ri.productId, ri.qty, ri.price), 0) : 0;
                                            return (
                                                <div key={r.recipientId || rIdx} className="bg-[var(--bg-tertiary)] rounded-xl border border-[var(--border-primary)] p-4 space-y-3">
                                                    <div className="flex justify-between items-center border-b border-[var(--border-primary)] pb-2">
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-extrabold text-[var(--text-primary)] text-sm">👤 {r.recipientName}</span>
                                                            <span className="text-xs text-[var(--text-tertiary)] font-mono">(${rTotal} 元)</span>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            {/* 新增商品到此成員 */}
                                                            <SearchableProductSelect
                                                                products={products}
                                                                placeholder="+ 新增商品"
                                                                onSelect={(productId) => handleAddRecipientItemInModal(r.recipientId, productId)}
                                                            />
                                                            {/* 刪除此成員 */}
                                                            <button
                                                                type="button"
                                                                onClick={() => handleRemoveRecipient(r.recipientId)}
                                                                className="text-red-500 hover:text-red-600 p-1 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-md"
                                                                title="刪除此成員"
                                                            >
                                                                <Trash2 size={14} />
                                                            </button>
                                                        </div>
                                                    </div>

                                                    <div className="space-y-2.5">
                                                        {(!r.items || r.items.length === 0) ? (
                                                            <div className="text-[11px] text-[var(--text-tertiary)] italic pl-2">尚未分配任何商品</div>
                                                        ) : (
                                                            r.items.map((ri, riIdx) => (
                                                                <div key={ri.id || riIdx} className="flex justify-between items-center pl-2 text-xs py-1">
                                                                    <div className="flex flex-col">
                                                                        <span className="text-[var(--text-secondary)] font-medium">{ri.productName}</span>
                                                                        {(() => {
                                                                            const pInfo = products.find(p => p.id === ri.productId);
                                                                            const hasFlavors = pInfo?.has_flavor_attributes && Array.isArray(pInfo.flavor_choices) && pInfo.flavor_choices.length > 0;
                                                                            if (!hasFlavors && !ri.remark?.includes('【口味備註：')) return null;
                                                                            return (
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => setAdminFlavorModal({
                                                                                        type: 'RECIPIENT_ITEM',
                                                                                        recipientId: r.recipientId,
                                                                                        productId: ri.productId,
                                                                                        productName: ri.productName,
                                                                                        flavorChoices: pInfo?.flavor_choices || [],
                                                                                        tempFlavors: parseRemarkToFlavorMap(ri.remark, pInfo?.flavor_choices || [], ri.qty)
                                                                                    })}
                                                                                    className="mt-0.5 inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold rounded bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-300 dark:border-amber-700/60 hover:bg-amber-200 w-fit cursor-pointer shadow-xs"
                                                                                    title="點擊配置口味與規格"
                                                                                >
                                                                                    <span>🎨 口味: {ri.remark ? ri.remark.replace(/【口味備註：(.*?)】/, '$1') : '點選設定'}</span>
                                                                                </button>
                                                                            );
                                                                        })()}
                                                                    </div>
                                                                    <div className="flex items-center gap-3">
                                                                        <div className="flex items-center gap-0.5 bg-[var(--bg-primary)] rounded-md p-0.5 border border-[var(--border-primary)]">
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => handleRecipientQtyChange(r.recipientId, ri.productId, ri.qty - 1)}
                                                                                className="w-5 h-5 flex items-center justify-center rounded text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
                                                                            >
                                                                                <Minus size={10} />
                                                                            </button>
                                                                            <input
                                                                                type="number"
                                                                                className="w-7 text-center font-bold font-mono text-[11px] bg-transparent border-none focus:outline-none"
                                                                                value={ri.qty}
                                                                                onChange={(e) => handleRecipientQtyChange(r.recipientId, ri.productId, e.target.value)}
                                                                                min="1"
                                                                            />
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => handleRecipientQtyChange(r.recipientId, ri.productId, ri.qty + 1)}
                                                                                className="w-5 h-5 flex items-center justify-center rounded text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
                                                                            >
                                                                                <Plus size={10} />
                                                                            </button>
                                                                        </div>
                                                                        <span className="w-12 text-right font-mono text-[var(--text-secondary)]">${calculateItemSubtotal(ri.productId, ri.qty, ri.price)}</span>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => handleRemoveRecipientItem(r.recipientId, ri.productId)}
                                                                            className="text-red-400 hover:text-red-500 p-0.5"
                                                                        >
                                                                            <X size={12} />
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            ))
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <div className="flex justify-between items-center p-3 bg-blue-50/50 dark:bg-blue-950/10 border border-blue-100 dark:border-blue-900/30 rounded-xl font-bold text-base">
                                        <span className="text-[var(--text-primary)]">團購應付總額</span>
                                        <span className="text-blue-600 font-mono">${editingOrder.totalAmount}</span>
                                    </div>
                                </div>
                            ) : (
                                <div className="border-t border-[var(--border-primary)] pt-4">
                                    <div className="flex justify-between items-center mb-3">
                                        <span className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                                            <Package size={16} className="text-blue-500" />
                                            訂單品項與數量
                                        </span>

                                        {/* 新增商品選單 (可搜尋) */}
                                        <SearchableProductSelect
                                            products={products}
                                            placeholder="新增商品到訂單"
                                            onSelect={(productId) => handleAddItem(productId)}
                                        />
                                    </div>

                                    <div className="divide-y divide-[var(--border-primary)] bg-[var(--bg-tertiary)] rounded-xl border border-[var(--border-primary)] overflow-hidden">
                                        {editingOrder.items.length === 0 ? (
                                            <div className="p-4 text-center text-xs text-[var(--text-secondary)]">訂單目前沒有任何商品</div>
                                        ) : (
                                            editingOrder.items.map((item, idx) => (
                                                <div key={idx} className="flex justify-between items-center p-3 text-sm hover:bg-[var(--bg-hover)]">
                                                    <div className="flex-1 mr-4">
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <span className="font-bold text-[var(--text-primary)]">{item.productName}</span>
                                                            {(() => {
                                                                const pInfo = products.find(p => p.id === item.productId);
                                                                const hasFlavors = pInfo?.has_flavor_attributes && Array.isArray(pInfo.flavor_choices) && pInfo.flavor_choices.length > 0;
                                                                if (!hasFlavors && !item.remark?.includes('【口味備註：')) return null;
                                                                return (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setAdminFlavorModal({
                                                                            type: 'ORDER_ITEM',
                                                                            itemIdx: idx,
                                                                            productId: item.productId,
                                                                            productName: item.productName,
                                                                            flavorChoices: pInfo?.flavor_choices || [],
                                                                            tempFlavors: parseRemarkToFlavorMap(item.remark, pInfo?.flavor_choices || [], item.qty)
                                                                        })}
                                                                        className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-bold rounded-md bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-300 dark:border-amber-700/60 hover:bg-amber-200 transition-colors cursor-pointer shadow-xs"
                                                                        title="點擊配置口味與規格"
                                                                    >
                                                                        <span>🎨 口味規格: {item.remark ? item.remark.replace(/【口味備註：(.*?)】/, '$1') : '點選設定'}</span>
                                                                    </button>
                                                                );
                                                            })()}
                                                        </div>
                                                        <div className="text-[10px] text-[var(--text-tertiary)] font-semibold mt-0.5">單價: ${item.unitPrice}</div>
                                                        <input
                                                            type="text"
                                                            placeholder="商品規格口味備註"
                                                            className="input-field text-xs p-1 w-full mt-1.5 border-dashed"
                                                            value={item.remark || ''}
                                                            onChange={(e) => {
                                                                    const val = e.target.value;
                                                                    setEditingOrder(prev => ({
                                                                        ...prev,
                                                                        items: prev.items.map((it, i) => i === idx ? { ...it, remark: val } : it)
                                                                    }));
                                                                }}
                                                        />
                                                    </div>

                                                    <div className="flex items-center gap-4">
                                                        {/* 數量調整 */}
                                                        <div className="flex items-center gap-1 bg-[var(--bg-primary)] rounded-lg p-0.5 border border-[var(--border-primary)]">
                                                            <button
                                                                type="button"
                                                                onClick={() => handleItemQtyChange(item.productId, item.qty - 1)}
                                                                className="w-6 h-6 flex items-center justify-center rounded-md text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
                                                            >
                                                                <Minus size={12} />
                                                            </button>
                                                            <input
                                                                type="number"
                                                                className="w-10 text-center font-bold font-mono text-xs bg-transparent border-none focus:outline-none"
                                                                value={item.qty}
                                                                onChange={(e) => handleItemQtyChange(item.productId, e.target.value)}
                                                                min="1"
                                                            />
                                                            <button
                                                                type="button"
                                                                onClick={() => handleItemQtyChange(item.productId, item.qty + 1)}
                                                                className="w-6 h-6 flex items-center justify-center rounded-md text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
                                                            >
                                                                <Plus size={12} />
                                                            </button>
                                                        </div>

                                                        <span className="w-16 text-right font-mono font-bold text-[var(--text-primary)]">${item.subtotal}</span>

                                                        {/* 刪除鈕 */}
                                                        <button
                                                            type="button"
                                                            onClick={() => handleRemoveItem(item.productId)}
                                                            className="text-red-500 hover:text-red-600 p-1 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-md"
                                                        >
                                                            <Trash2 size={15} />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>

                                    {(() => {
                                        const totals = computeOrderTotals(editingOrder, buildingSettingsList, groupBindings);
                                        return (
                                            <div className="mt-4 p-4 bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded-xl space-y-2 text-sm">
                                                <div className="flex justify-between text-[var(--text-secondary)] font-medium">
                                                    <span>商品金額</span>
                                                    <span className="font-mono">${totals.productTotal}</span>
                                                </div>
                                                {totals.rewardDiscount > 0 && (
                                                    <div className="flex justify-between text-emerald-600 dark:text-emerald-400 font-bold">
                                                        <span>🎁 滿額自選折抵</span>
                                                        <span className="font-mono">-${totals.rewardDiscount}</span>
                                                    </div>
                                                )}
                                                <div className="flex justify-between text-[var(--text-secondary)] font-medium">
                                                    <span>運費</span>
                                                    {totals.shippingFee > 0 ? (
                                                        <span className="font-mono">+${totals.shippingFee}</span>
                                                    ) : (
                                                        <span className="text-emerald-600 font-semibold">免運</span>
                                                    )}
                                                </div>
                                                <div className="pt-2 border-t border-[var(--border-primary)] flex justify-between items-center font-bold text-[var(--text-primary)] text-base">
                                                    <span>訂單合計</span>
                                                    <span className="text-blue-600 dark:text-blue-400 font-mono text-xl font-extrabold">${totals.totalAmount}</span>
                                                </div>
                                            </div>
                                        );
                                    })()}
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="p-4 bg-[var(--bg-secondary)] border-t border-[var(--border-primary)] flex gap-3 justify-end">
                            <button
                                type="button"
                                onClick={() => setShowEditModal(false)}
                                className="btn-secondary px-5 py-2.5 text-xs font-bold"
                                disabled={isSaving}
                            >
                                取消
                            </button>
                            <button
                                type="submit"
                                className="btn-primary px-5 py-2.5 text-xs font-bold flex items-center gap-1.5"
                                disabled={isSaving}
                            >
                                <Save size={15} />
                                {isSaving ? '保存中...' : '儲存修改'}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* 設定出貨/配送日期 Modal */}
            {dateModalOrder && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
                        <div className="p-4 bg-emerald-600 text-white flex justify-between items-center font-bold">
                            <span className="flex items-center gap-2">
                                <Calendar size={18} />
                                設定預計出貨/配送日
                            </span>
                            <button type="button" onClick={() => setDateModalOrder(null)} className="hover:bg-emerald-700 p-1 rounded-lg transition-colors">
                                <X size={18} />
                            </button>
                        </div>
                        <div className="p-4 sm:p-5 space-y-4 max-w-full overflow-hidden">
                            <div className="text-sm font-semibold text-[var(--text-secondary)] truncate">
                                訂單：<span className="font-mono text-[var(--text-primary)] font-extrabold">{dateModalOrder.orderId}</span> ({dateModalOrder.customerName})
                            </div>
                            <div className="w-full min-w-0 max-w-full overflow-hidden">
                                <label className="block text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-1.5">
                                    選擇預計出貨日期
                                </label>
                                <input
                                    type="date"
                                    className="input-field w-full max-w-full box-border min-w-0 text-base font-bold py-2.5 px-3 border-emerald-500 focus:ring-emerald-500 appearance-none"
                                    value={dateModalValue}
                                    onChange={(e) => setDateModalValue(e.target.value)}
                                />
                            </div>
                            <div className="w-full min-w-0 max-w-full overflow-hidden">
                                <span className="block text-xs font-bold text-[var(--text-tertiary)] mb-1.5">快速選擇：</span>
                                <div className="grid grid-cols-5 sm:flex sm:flex-wrap gap-1 sm:gap-2 w-full max-w-full">
                                    {[
                                        { label: '今天', date: new Date().toISOString().split('T')[0] },
                                        { label: '明天', date: new Date(Date.now() + 86400000).toISOString().split('T')[0] },
                                        { label: '後天', date: new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0] },
                                        { label: '大後天', date: new Date(Date.now() + 86400000 * 3).toISOString().split('T')[0] },
                                        { label: '清除日期', date: '' }
                                    ].map(btn => (
                                        <button
                                            key={btn.label}
                                            type="button"
                                            onClick={() => setDateModalValue(btn.date)}
                                            className={`text-[10px] sm:text-xs px-1 sm:px-3 py-1.5 rounded-lg font-bold border transition-colors text-center truncate ${
                                                dateModalValue === btn.date
                                                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                                                    : 'bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border-[var(--border-primary)]'
                                            }`}
                                        >
                                            {btn.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div className="p-4 bg-[var(--bg-secondary)] border-t border-[var(--border-primary)] flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => setDateModalOrder(null)}
                                className="btn-secondary px-4 py-2 text-xs font-bold"
                                disabled={isSavingDate}
                            >
                                取消
                            </button>
                            <button
                                type="button"
                                onClick={handleSaveDateModal}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-5 py-2 text-xs rounded-xl shadow flex items-center gap-1.5 active:scale-95 transition-all"
                                disabled={isSavingDate}
                            >
                                <Save size={14} />
                                {isSavingDate ? '儲存中...' : '確定儲存'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 🎨 後台專用：選擇與調整口味規格 Modal */}
            {adminFlavorModal && (
                <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-[var(--bg-primary)] rounded-2xl border border-[var(--border-primary)] shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="bg-gradient-to-r from-amber-500 to-orange-600 px-5 py-3.5 text-white flex justify-between items-center shadow-sm">
                            <span className="flex items-center gap-2 font-extrabold text-base">
                                <span>🎨 配置商品口味規格</span>
                            </span>
                            <button
                                type="button"
                                onClick={() => setAdminFlavorModal(null)}
                                className="hover:bg-black/20 p-1 rounded-lg transition-colors"
                            >
                                <X size={18} />
                            </button>
                        </div>
                        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
                            <div className="bg-[var(--bg-secondary)] p-3 rounded-xl border border-[var(--border-primary)]">
                                <div className="text-sm font-extrabold text-[var(--text-primary)] mb-1">
                                    📦 {adminFlavorModal.productName}
                                </div>
                                <div className="text-xs text-[var(--text-tertiary)]">
                                    請針對客戶追加或修改的規格，分配對應的口味數量：
                                </div>
                            </div>

                            <div className="space-y-2">
                                {adminFlavorModal.flavorChoices.map((flavor) => {
                                    const count = adminFlavorModal.tempFlavors[flavor] || 0;
                                    return (
                                        <div
                                            key={flavor}
                                            className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                                                count > 0
                                                    ? 'bg-amber-50/60 dark:bg-amber-950/20 border-amber-300 dark:border-amber-700/60 shadow-xs'
                                                    : 'bg-[var(--bg-secondary)] border-[var(--border-primary)] opacity-85 hover:opacity-100'
                                            }`}
                                        >
                                            <span className={`text-sm font-bold ${count > 0 ? 'text-amber-900 dark:text-amber-200' : 'text-[var(--text-primary)]'}`}>
                                                {flavor}
                                            </span>
                                            <div className="flex items-center gap-1.5">
                                                <button
                                                    type="button"
                                                    onClick={() => handleUpdateModalFlavorQty(flavor, -1)}
                                                    className="w-8 h-8 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-primary)] flex items-center justify-center font-bold text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] active:scale-95 transition-transform shadow-xs"
                                                >
                                                    <Minus size={14} />
                                                </button>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    max="99"
                                                    className="w-12 text-center font-mono font-extrabold text-sm py-1 rounded-lg border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-primary)] focus:ring-amber-500"
                                                    value={count}
                                                    onChange={(e) => handleSetModalFlavorQty(flavor, e.target.value)}
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => handleUpdateModalFlavorQty(flavor, 1)}
                                                    className="w-8 h-8 rounded-lg bg-amber-500 text-white flex items-center justify-center font-bold text-sm hover:bg-amber-600 active:scale-95 transition-transform shadow-xs"
                                                >
                                                    <Plus size={14} />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {(() => {
                                const totalQty = calculateTotalQtyFromFlavorMap(adminFlavorModal.tempFlavors);
                                const totalSubtotal = calculateItemSubtotal(adminFlavorModal.productId, totalQty);
                                return (
                                    <div className="p-3.5 bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-primary)] flex justify-between items-center text-sm font-extrabold">
                                        <div className="text-[var(--text-primary)] flex items-center gap-1.5">
                                            <span>選擇總計：</span>
                                            <span className="text-amber-600 dark:text-amber-400 font-mono text-base">{totalQty}</span>
                                            <span className="text-xs text-[var(--text-tertiary)] font-normal">件</span>
                                        </div>
                                        <div className="text-emerald-600 dark:text-emerald-400 font-mono text-base">
                                            ${totalSubtotal.toLocaleString()} 元
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>
                        <div className="p-4 bg-[var(--bg-secondary)] border-t border-[var(--border-primary)] flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => setAdminFlavorModal(null)}
                                className="btn-secondary px-4 py-2 text-xs font-bold"
                            >
                                取消
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirmAdminFlavor}
                                className="bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-bold px-5 py-2 text-xs rounded-xl shadow flex items-center gap-1.5 transition-all active:scale-95"
                            >
                                <Save size={14} />
                                確認儲存口味配置
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
