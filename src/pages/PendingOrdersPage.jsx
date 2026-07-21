import React, { useState, useEffect, useCallback } from 'react';
import { Package, ClipboardList, Eye, Edit, Trash2, CheckCircle, RefreshCw, X, User, Users, Phone, MapPin, FileText, Plus, Minus, Save, Calendar, Clock, Check, Search, Copy, PackageSearch, ChevronDown, ChevronUp } from 'lucide-react';
import { callGAS } from '../utils/api';

export default function PendingOrdersPage({ user, apiUrl }) {
    const [orders, setOrders] = useState([]);
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('PENDING'); // 'PENDING' | 'CONFIRMED'
    const [groupBindings, setGroupBindings] = useState({});
    const [selectedBuilding, setSelectedBuilding] = useState('全部');
    const [copied, setCopied] = useState(false);
    const [detailCopied, setDetailCopied] = useState(false);
    const [clientDetailCopied, setClientDetailCopied] = useState(false);
    const [newGroupNames, setNewGroupNames] = useState({});
    const [isBinding, setIsBinding] = useState(false);

    // 編輯 Modal
    const [showEditModal, setShowEditModal] = useState(false);
    const [editingOrder, setEditingOrder] = useState(null);
    const [isSaving, setIsSaving] = useState(false);

    // 搜尋與篩選
    const [searchTerm, setSearchTerm] = useState('');
    const [productSearchTerm, setProductSearchTerm] = useState('');
    const [expandedOrderIds, setExpandedOrderIds] = useState(new Set());
    const [dateFilter, setDateFilter] = useState(''); // 出貨日期篩選
    const [dateModalOrder, setDateModalOrder] = useState(null); // 設定出貨日期的目標訂單
    const [dateModalValue, setDateModalValue] = useState('');
    const [isSavingDate, setIsSavingDate] = useState(false);

    // 批次與大樓功能狀態
    const [selectedOrderIds, setSelectedOrderIds] = useState([]);
    const [isBatchProcessing, setIsBatchProcessing] = useState(false);
    const [batchMessage, setBatchMessage] = useState('');
    const [buildings, setBuildings] = useState([]);
    const [buildingSettingsList, setBuildingSettingsList] = useState([]);

    const fetchOrders = useCallback(async () => {
        setLoading(true);
        try {
            const data = await callGAS(apiUrl, 'getPendingOrders', { status: activeTab }, user.token);
            if (Array.isArray(data)) {
                setOrders(data);
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

    // 當切換到特定大樓時，自動在背景導入今日定期配，實現「全自動無感體驗」
    useEffect(() => {
        if (user?.token && activeTab === 'PENDING' && selectedBuilding && selectedBuilding !== '全部') {
            const autoImport = async () => {
                try {
                    const res = await callGAS(apiUrl, 'generateSubscriptionOrders', {
                        building: selectedBuilding
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

        const confirmMsg = `確定要導入大樓【${selectedBuilding}】今天的定期配/月訂鮮奶訂單嗎？\n系統會自動篩選出今天（星期幾）需送貨的住戶，並自動防重複（已導入過的不會重複導入）。`;
        if (!window.confirm(confirmMsg)) return;

        setLoading(true);
        try {
            const res = await callGAS(apiUrl, 'generateSubscriptionOrders', {
                building: selectedBuilding
            }, user.token);
            
            if (res && res.error) {
                throw new Error(res.error);
            }
            
            alert(res.message || `定期配導入成功！共導入 ${res.count} 筆訂單。`);
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
                        productTotals[pid] = {
                            productId: pid,
                            productName: ri.productName,
                            unitPrice: Number(ri.price),
                            qty: 0,
                            remark: ""
                        };
                    }
                    productTotals[pid].qty += Number(ri.qty) || 0;
                });
            }
        });

        const newItems = Object.values(productTotals).map((item) => {
            const subtotal = calculateItemSubtotal(item.productId, item.qty);
            const prod = products.find(p => p.id === item.productId);
            const displayPrice = prod ? (Number(prod.single_price) || Number(prod.price)) : item.unitPrice;
            
            return {
                productId: item.productId,
                productName: item.productName,
                unitPrice: displayPrice,
                qty: item.qty,
                subtotal: subtotal,
                remark: item.remark || ""
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

    const handleAddRecipientInModal = (name) => {
        const trimmed = name?.trim();
        if (!trimmed) return;
        
        if (editingOrder.recipients.some(r => r.recipientName === trimmed)) {
            alert("該成員已在此訂單中");
            return;
        }

        const newRecipient = {
            recipientId: 'temp-' + Math.random().toString(36).substring(2, 9),
            recipientName: trimmed,
            note: "",
            items: []
        };

        updateRecipientsState([...editingOrder.recipients, newRecipient]);
    };

    const handleAddRecipientItemInModal = (recipientId, productId) => {
        const prod = products.find(p => p.id === productId);
        if (!prod) return;

        const nextRecipients = editingOrder.recipients.map(r => {
            if (r.recipientId === recipientId) {
                if (r.items.some(ri => ri.productId === productId)) {
                    return r;
                }
                const newItem = {
                    id: 'temp-item-' + Math.random().toString(36).substring(2, 9),
                    recipientId,
                    productId,
                    productName: prod.name,
                    qty: 1,
                    price: Number(prod.single_price) || Number(prod.price)
                };
                return {
                    ...r,
                    items: [...r.items, newItem]
                };
            }
            return r;
        });

        updateRecipientsState(nextRecipients);
    };

    const calculateItemSubtotal = (productId, qty) => {
        const prod = products.find(p => p.id === productId);
        if (!prod) return 0;
        
        const singlePrice = Number(prod.single_price) || Number(prod.price);
        if (prod.has_volume_pricing && prod.volume_pricing_settings) {
            const targetQty = Number(prod.volume_pricing_settings.target_quantity);
            const packagePrice = Number(prod.volume_pricing_settings.package_price);
            
            const groupCount = Math.floor(qty / targetQty);
            const remainderCount = qty % targetQty;
            return (groupCount * packagePrice) + (remainderCount * singlePrice);
        } else {
            return singlePrice * qty;
        }
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

        setEditingOrder(prev => {
            const existing = prev.items.find(item => item.productId === productId);
            let newItems = [];
            if (existing) {
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
                newItems = [
                    ...prev.items,
                    {
                        productId: prod.id,
                        productName: prod.name,
                        unitPrice: subtotal,
                        qty: 1,
                        subtotal: subtotal,
                        remark: ''
                    }
                ];
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

    const computeOrderTotals = useCallback((order, settingsList = [], groupBindingsMap = {}) => {
        if (!order || !order.items) return { productTotal: 0, shippingFee: 0, totalAmount: 0 };
        const productTotal = order.items.reduce((sum, item) =>
            sum + (Number(item.unitPrice || 0) * Number(item.qty || 0)), 0);

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

        return {
            productTotal,
            shippingFee: fee,
            totalAmount: productTotal + fee
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

    const handleSaveDateModal = async () => {
        if (!dateModalOrder) return;
        setIsSavingDate(true);
        try {
            const res = await callGAS(apiUrl, 'updatePendingOrder', {
                orderId: dateModalOrder.orderId,
                expectedDeliveryDate: dateModalValue
            }, user.token);
            if (res.success) {
                setOrders(prev => prev.map(o => o.orderId === dateModalOrder.orderId ? { ...o, expectedDeliveryDate: dateModalValue } : o));
                setDateModalOrder(null);
            } else {
                alert('設定出貨日期失敗: ' + (res.message || '未知錯誤'));
            }
        } catch (error) {
            console.error('Save expected delivery date failed:', error);
            alert('設定出貨日期失敗: ' + error.message);
        } finally {
            setIsSavingDate(false);
        }
    };

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
            const boundBuildingName = groupBindings[order.sourceGroup] || order.sourceGroup || '';

            const matchesAddress = addr.startsWith(selectedBuilding);
            const matchesGroup = boundBuildingName === selectedBuilding;
            if (!matchesAddress && !matchesGroup) {
                return false;
            }
        }

        // 預計出貨/配送日篩選
        if (dateFilter && String(order.expectedDeliveryDate || '') !== dateFilter) {
            return false;
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

        // 商品名稱特化搜尋
        if (productSearchTerm) {
            const pSearch = productSearchTerm.toLowerCase().trim();
            const hasMatchingProductInItems = order.items?.some(item =>
                String(item.productName || '').toLowerCase().includes(pSearch) ||
                String(item.productId || '').toLowerCase().includes(pSearch)
            );
            const hasMatchingProductInRecipients = order.recipients?.some(r =>
                r.items?.some(ri =>
                    String(ri.productName || '').toLowerCase().includes(pSearch) ||
                    String(ri.productId || '').toLowerCase().includes(pSearch)
                )
            );
            if (!hasMatchingProductInItems && !hasMatchingProductInRecipients) {
                return false;
            }
        }

        return true;
    });

    // 排序：同大樓排在一起，大樓相同則依時間新到舊排序
    const sortedFilteredOrders = React.useMemo(() => {
        return [...filteredOrders].sort((a, b) => {
            const getBuildingName = (order) => {
                const boundName = groupBindings[order.sourceGroup];
                if (boundName) return boundName;
                const addr = String(order.deliveryAddress || '').trim();
                const matched = Object.values(groupBindings).find(bName => addr.startsWith(bName));
                return matched || '一般散客';
            };
            const bA = getBuildingName(a);
            const bB = getBuildingName(b);
            const comp = bA.localeCompare(bB, 'zh-Hant');
            if (comp !== 0) return comp;
            // 相同大樓則依時間新到舊
            return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
        });
    }, [filteredOrders, groupBindings]);

    // 商品特化搜尋小卡片統計數據
    const productSearchSummary = React.useMemo(() => {
        if (!productSearchTerm.trim()) return null;
        const pSearch = productSearchTerm.toLowerCase().trim();
        let totalMatchQty = 0;
        let matchingOrdersCount = 0;

        sortedFilteredOrders.forEach(order => {
            let orderMatchingQty = 0;

            if (order.items && order.items.length > 0) {
                order.items.forEach(item => {
                    if (
                        String(item.productName || '').toLowerCase().includes(pSearch) ||
                        String(item.productId || '').toLowerCase().includes(pSearch)
                    ) {
                        orderMatchingQty += (Number(item.qty) || 0);
                    }
                });
            } else if (order.recipients && order.recipients.length > 0) {
                order.recipients.forEach(r => {
                    r.items?.forEach(ri => {
                        if (
                            String(ri.productName || '').toLowerCase().includes(pSearch) ||
                            String(ri.productId || '').toLowerCase().includes(pSearch)
                        ) {
                            orderMatchingQty += (Number(ri.qty) || 0);
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
            totalMatchQty
        };
    }, [sortedFilteredOrders, productSearchTerm]);

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
    const handleCopyText = (text, typeLabel) => {
        if (!text) return;
        navigator.clipboard.writeText(text)
            .then(() => {
                alert(`${typeLabel}已複製：${text}`);
            })
            .catch(err => {
                console.error('Copy failed:', err);
            });
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

    const handleCopyShipmentSummary = () => {
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

        navigator.clipboard.writeText(textToCopy)
            .then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
            })
            .catch(err => {
                console.error('Failed to copy text: ', err);
                const textArea = document.createElement('textarea');
                textArea.value = textToCopy;
                textArea.style.position = 'fixed';
                document.body.appendChild(textArea);
                textArea.focus();
                textArea.select();
                try {
                    document.execCommand('copy');
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                } catch (e) {
                    alert('複製失敗，請手動複製：\n\n' + textToCopy);
                }
                document.body.removeChild(textArea);
            });
    };

    const handleCopyDetailSummary = () => {
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
            const groupName = groupBindings[order.sourceGroup] || order.sourceGroup || '未知群組';
            const lineNameStr = order.lineDisplayName ? ` [LINE: ${order.lineDisplayName}]` : '';
            lines.push(`${idx + 1}. ${order.customerName}${lineNameStr} (${order.customerPhone})`);
            lines.push(`   群組/大樓：${groupName}`);
            if (order.deliveryAddress) {
                lines.push(`   地址/自取：${order.deliveryAddress}`);
            }
            
            lines.push('   訂購品項：');
            order.items.forEach(item => {
                const prod = products.find(p => p.id === item.productId || p.name === item.productName || p.name === item.productId);
                const isBundle = prod ? prod.isBundle : false;
                const bundleSize = prod ? prod.bundleSize : 1;
                const unitStr = isBundle ? `組 (共 ${item.qty * bundleSize} 瓶)` : '瓶';
                const remarkStr = item.remark ? ` (${item.remark})` : '';
                lines.push(`   - ${item.productName} x ${item.qty} ${unitStr}${remarkStr}`);
            });
            
            lines.push(`   合計金額：$${order.totalAmount}`);
            if (order.note) {
                lines.push(`   訂單備註：${order.note}`);
            }
            lines.push('----------------------------------------');
        });

        const textToCopy = lines.join('\n');

        navigator.clipboard.writeText(textToCopy)
            .then(() => {
                setDetailCopied(true);
                setTimeout(() => setDetailCopied(false), 2000);
            })
            .catch(err => {
                console.error('Failed to copy text: ', err);
                const textArea = document.createElement('textarea');
                textArea.value = textToCopy;
                textArea.style.position = 'fixed';
                document.body.appendChild(textArea);
                textArea.focus();
                textArea.select();
                try {
                    document.execCommand('copy');
                    setDetailCopied(true);
                    setTimeout(() => setDetailCopied(false), 2000);
                } catch (e) {
                    alert('複製失敗，請手動複製：\n\n' + textToCopy);
                }
                document.body.removeChild(textArea);
            });
    };

    const handleCopyClientDetailSummary = () => {
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
        lines.push(`📋 物流分貨明細 (客戶) (${selectedBuilding === '全部' ? '全部大樓' : selectedBuilding})${isSelectedStr}`);
        lines.push(`彙整時間：${new Date().toLocaleString('zh-TW')}`);
        lines.push(`訂單總數：${finalOrders.length} 筆`);
        lines.push('----------------------------------------');

        finalOrders.forEach((order, idx) => {
            const groupName = groupBindings[order.sourceGroup] || order.sourceGroup || '未知群組';
            const lineNameStr = order.lineDisplayName ? ` [LINE: ${order.lineDisplayName}]` : '';
            lines.push(`${idx + 1}. ${order.customerName}${lineNameStr}`);
            lines.push(`   群組/大樓：${groupName}`);
            if (order.deliveryAddress) {
                lines.push(`   地址/自取：${order.deliveryAddress}`);
            }
            
            lines.push('   訂購品項：');
            order.items.forEach(item => {
                const prod = products.find(p => p.id === item.productId || p.name === item.productName || p.name === item.productId);
                const isBundle = prod ? prod.isBundle : false;
                const bundleSize = prod ? prod.bundleSize : 1;
                const unitStr = isBundle ? `組 (共 ${item.qty * bundleSize} 瓶)` : '瓶';
                const remarkStr = item.remark ? ` (${item.remark})` : '';
                lines.push(`   - ${item.productName} x ${item.qty} ${unitStr}${remarkStr}`);
            });
            
            lines.push(`   合計金額：$${order.totalAmount}`);
            lines.push('----------------------------------------');
        });

        const textToCopy = lines.join('\n');

        navigator.clipboard.writeText(textToCopy)
            .then(() => {
                setClientDetailCopied(true);
                setTimeout(() => setClientDetailCopied(false), 2000);
            })
            .catch(err => {
                console.error('Failed to copy text: ', err);
                const textArea = document.createElement('textarea');
                textArea.value = textToCopy;
                textArea.style.position = 'fixed';
                document.body.appendChild(textArea);
                textArea.focus();
                textArea.select();
                try {
                    document.execCommand('copy');
                    setClientDetailCopied(true);
                    setTimeout(() => setClientDetailCopied(false), 2000);
                } catch (e) {
                    alert('複製失敗，請手動複製：\n\n' + textToCopy);
                }
                document.body.removeChild(textArea);
            });
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
            {/* Header Area */}
            <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center bg-[var(--bg-secondary)] p-4 rounded-xl border border-[var(--border-primary)] shadow-sm gap-4">
                <h2 className="text-xl md:text-2xl font-bold flex items-center gap-2 text-[var(--text-primary)]">
                    <ClipboardList className="text-blue-600" />
                    訂單審核
                </h2>

                {/* 篩選與搜尋 */}
                <div className="flex flex-wrap md:flex-nowrap gap-2 w-full md:w-auto items-center">
                    {/* 大樓篩選選單 */}
                    <select
                        className="input-field text-sm py-2 px-3 bg-[var(--bg-secondary)] border-[var(--border-primary)] rounded-lg font-bold text-[var(--text-primary)] focus:outline-none w-full md:w-48"
                        value={selectedBuilding}
                        onChange={(e) => setSelectedBuilding(e.target.value)}
                    >
                        <option value="全部">全部社區大樓</option>
                        {allAvailableBuildings.map(bname => (
                            <option key={bname} value={bname}>{bname}</option>
                        ))}
                    </select>

                    <div className="relative flex-1 md:flex-none">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" size={18} />
                        <input
                            type="text"
                            placeholder="搜尋編號、姓名、電話、金額..."
                            className="input-field pl-10 w-full md:w-60"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>

                    {/* 商品名稱特化查詢 */}
                    <div className="relative flex-1 md:flex-none">
                        <PackageSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-500" size={18} />
                        <input
                            type="text"
                            placeholder="🔍 查詢商品 (如: 崙背1L)..."
                            className="input-field pl-10 pr-8 w-full md:w-64 border-emerald-500/40 focus:border-emerald-500"
                            value={productSearchTerm}
                            onChange={(e) => setProductSearchTerm(e.target.value)}
                        />
                        {productSearchTerm && (
                            <button
                                type="button"
                                onClick={() => setProductSearchTerm('')}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                                title="清空商品搜尋"
                            >
                                <X size={14} />
                            </button>
                        )}
                    </div>

                    {/* 預計出貨日篩選 */}
                    <div className="relative flex-1 md:flex-none flex items-center">
                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-600 dark:text-emerald-400" size={18} />
                        <input
                            type="date"
                            className="input-field pl-10 pr-8 w-full md:w-48 text-sm font-bold border-emerald-500/40 focus:border-emerald-500"
                            value={dateFilter}
                            onChange={(e) => setDateFilter(e.target.value)}
                            title="篩選預計出貨日"
                        />
                        {dateFilter && (
                            <button
                                type="button"
                                onClick={() => setDateFilter('')}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                                title="清空出貨日篩選"
                            >
                                <X size={14} />
                            </button>
                        )}
                    </div>

                    <button onClick={fetchOrders} className="btn-secondary p-2 whitespace-nowrap" title="重新整理">
                        <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
                    </button>
                    {activeTab === 'PENDING' && (
                        <button
                            onClick={handleImportSubscriptions}
                            className="bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-xs px-4.5 py-2.5 rounded-xl shadow-lg shadow-amber-500/10 flex items-center gap-1.5 transition-all whitespace-nowrap"
                            title="導入今日定期配計畫到此大樓"
                        >
                            <Calendar size={16} />
                            ⚡ 導入今日定期配
                        </button>
                    )}
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
                <div className="grid grid-cols-3 gap-3">
                    <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-3.5 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
                        <span className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">訂單總筆數</span>
                        <span className="text-xl font-extrabold text-[var(--text-primary)] mt-1">{summaryStats.ordersCount} <span className="text-xs font-medium text-[var(--text-tertiary)]">筆</span></span>
                    </div>
                    <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-3.5 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
                        <span className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">{activeTab === 'UNPAID' ? '未付款商品數量' : '待出貨數量'}</span>
                        <span className="text-xl font-extrabold text-blue-600 mt-1">{summaryStats.totalQty} <span className="text-xs font-medium text-[var(--text-tertiary)]">瓶/件</span></span>
                    </div>
                    <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-3.5 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
                        <span className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">{activeTab === 'UNPAID' ? '未付款總金額' : '待出貨總金額'}</span>
                        <span className="text-xl font-extrabold text-emerald-600 mt-1">${summaryStats.totalAmount.toLocaleString()}</span>
                    </div>
                </div>
            )}

            {/* 商品專屬查詢統計小卡片 */}
            {productSearchSummary && (
                <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-300 dark:border-emerald-700/50 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm animate-in fade-in duration-200">
                    <div className="flex items-center gap-3">
                        <div className="p-3 bg-emerald-600 text-white rounded-xl shadow-sm">
                            <PackageSearch size={24} />
                        </div>
                        <div>
                            <div className="text-xs font-bold text-emerald-800 dark:text-emerald-300">
                                📦 商品查詢統計：「<span className="font-extrabold underline">{productSearchSummary.keyword}</span>」
                            </div>
                            <div className="text-sm font-semibold text-emerald-700 dark:text-emerald-400 mt-0.5">
                                含有此商品的訂單共 <span className="font-extrabold font-mono text-base">{productSearchSummary.matchingOrdersCount}</span> 筆
                            </div>
                        </div>
                    </div>
                    <div className="text-right bg-white dark:bg-slate-900 px-5 py-2.5 rounded-xl border border-emerald-200 dark:border-emerald-800 shadow-sm flex items-center justify-between sm:block">
                        <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300 block">該商品訂購數量總計</span>
                        <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400 font-mono">
                            {productSearchSummary.totalMatchQty} <span className="text-xs font-normal">瓶/件</span>
                        </span>
                    </div>
                </div>
            )}

            {/* 批次操作列 (限待確認與未付款 tab 下) */}
            {(activeTab === 'PENDING' || activeTab === 'UNPAID') && sortedFilteredOrders.length > 0 && (
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
                            全選本頁面{activeTab === 'UNPAID' ? '未付款' : '待審核'}訂單
                        </label>
                        <span className="text-xs text-[var(--text-tertiary)] ml-1">
                            (已選取 {selectedOrderIds.length} 筆)
                        </span>
                    </div>
                    {selectedOrderIds.length > 0 && (
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={handleBatchDelete}
                                className="py-1.5 px-4 text-xs font-bold rounded-lg bg-rose-600 hover:bg-rose-700 active:scale-95 transition-transform text-white shadow-sm flex items-center gap-1"
                            >
                                <Trash2 size={14} /> 批次刪除 ({selectedOrderIds.length})
                            </button>
                            <button
                                type="button"
                                onClick={handleBatchConfirmPayment}
                                className="py-1.5 px-4 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 active:scale-95 transition-transform text-white shadow-sm flex items-center gap-1"
                            >
                                <CheckCircle size={14} /> 批次確認收款 ({selectedOrderIds.length})
                            </button>
                            <button
                                type="button"
                                onClick={handleBatchConfirm}
                                className="btn-primary py-1.5 px-4 text-xs font-bold bg-blue-600 hover:bg-blue-700 border-none shadow-sm active:scale-95 transition-transform flex items-center gap-1"
                            >
                                <CheckCircle size={14} /> 批次確認出貨 ({selectedOrderIds.length})
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* Tabs */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between border-b border-[var(--border-primary)] pb-1 gap-2">
                <div className="flex gap-2">
                    <button
                        onClick={() => { setActiveTab('PENDING'); }}
                        className={`px-5 py-2.5 font-bold text-sm transition-colors border-b-2 ${activeTab === 'PENDING'
                                ? 'border-blue-500 text-blue-600'
                                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                            }`}
                    >
                        待確認訂單 (PENDING)
                    </button>
                    <button
                        onClick={() => { setActiveTab('CONFIRMED'); }}
                        className={`px-5 py-2.5 font-bold text-sm transition-colors border-b-2 ${activeTab === 'CONFIRMED'
                                ? 'border-blue-500 text-blue-600'
                                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                            }`}
                    >
                        已出貨/確認訂單 (CONFIRMED)
                    </button>
                    <button
                        onClick={() => { setActiveTab('UNPAID'); }}
                        className={`px-5 py-2.5 font-bold text-sm transition-colors border-b-2 ${activeTab === 'UNPAID'
                                ? 'border-amber-500 text-amber-600'
                                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                            }`}
                    >
                        未付款訂單 (UNPAID)
                    </button>
                </div>

                <div className="flex gap-2 flex-wrap sm:flex-nowrap">
                    <button
                        type="button"
                        onClick={handleExpandAll}
                        className="py-1.5 px-3 text-xs font-bold rounded-lg flex items-center gap-1 shadow-sm active:scale-95 transition-all duration-200 border bg-[var(--bg-secondary)] hover:bg-[var(--bg-hover)] border-[var(--border-primary)] text-[var(--text-primary)] whitespace-nowrap"
                        title="展開所有訂單詳情"
                    >
                        <ChevronDown size={14} /> <span>全部展開</span>
                    </button>
                    <button
                        type="button"
                        onClick={handleCollapseAll}
                        className="py-1.5 px-3 text-xs font-bold rounded-lg flex items-center gap-1 shadow-sm active:scale-95 transition-all duration-200 border bg-[var(--bg-secondary)] hover:bg-[var(--bg-hover)] border-[var(--border-primary)] text-[var(--text-primary)] whitespace-nowrap"
                        title="折疊所有訂單"
                    >
                        <ChevronUp size={14} /> <span>全部折疊</span>
                    </button>
                    <button
                        type="button"
                        onClick={handleCopyShipmentSummary}
                        className={`py-1.5 px-3 text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-sm active:scale-95 transition-all duration-200 border whitespace-nowrap ${copied 
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
                        className={`py-1.5 px-3 text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-sm active:scale-95 transition-all duration-200 border whitespace-nowrap ${detailCopied 
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
                        className={`py-1.5 px-3 text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-sm active:scale-95 transition-all duration-200 border whitespace-nowrap ${clientDetailCopied 
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
                                <div key={order.orderId} className="bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-primary)] shadow-sm hover:border-blue-500/40 hover:shadow-md transition-all duration-200 overflow-hidden flex flex-col">
                                    {/* 頂部 Summary 列 (標頭) - 點擊可折疊/展開 */}
                                    <div 
                                        onClick={() => toggleExpandOrder(order.orderId)}
                                        className="p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-3 cursor-pointer hover:bg-[var(--bg-hover)] transition-colors select-none"
                                    >
                                        <div className="flex items-center gap-3 min-w-0 flex-1">
                                            {(activeTab === 'PENDING' || activeTab === 'UNPAID') && (
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
                                            )}
                                            <div className="flex flex-col min-w-0 flex-1">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="font-mono font-bold text-base md:text-lg text-[var(--text-primary)]">{order.orderId}</span>
                                                    <span className="font-extrabold text-[var(--text-primary)] text-sm md:text-base flex items-center gap-1">
                                                        <User size={15} className="text-[var(--text-tertiary)]" />
                                                        {order.customerName}
                                                    </span>
                                                    {(() => {
                                                        const knownNames = Array.from(new Set([...buildings, ...Object.values(groupBindings)])).filter(Boolean);
                                                        const addr = String(order.deliveryAddress || '').trim();
                                                        const matchedAddrBuilding = knownNames.find(name => name && addr.startsWith(name));
                                                        const displayGroup = matchedAddrBuilding || groupBindings[order.sourceGroup] || order.sourceGroup;
                                                        if (!displayGroup) return null;
                                                        return (
                                                            <span className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs px-2 py-0.5 rounded font-bold border border-slate-200 dark:border-slate-700">
                                                                {displayGroup}
                                                            </span>
                                                        );
                                                    })()}
                                                </div>
                                                
                                                {/* 簡化版商品與地址預覽 */}
                                                <div className="text-xs text-[var(--text-secondary)] mt-1.5 flex items-center gap-2 flex-wrap">
                                                    <span className="text-blue-600 dark:text-blue-400 font-bold truncate max-w-md">
                                                        📦 {order.items?.map(it => `${it.productName} x${it.qty}`).join('、 ') || '無商品'}
                                                    </span>
                                                    {order.deliveryAddress && (
                                                        <span className="text-[var(--text-tertiary)] truncate max-w-xs">
                                                            📍 {order.deliveryAddress}
                                                        </span>
                                                    )}
                                                    {order.createdAt && (
                                                        <span className="text-[var(--text-tertiary)] flex items-center gap-1 font-mono">
                                                            🕒 {new Date(order.createdAt).toLocaleString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                                        </span>
                                                    )}
                                                    {order.expectedDeliveryDate && (
                                                        <span
                                                            onClick={(e) => handleOpenDateModal(order, e)}
                                                            className="bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 font-bold px-2 py-0.5 rounded-md flex items-center gap-1 cursor-pointer hover:bg-emerald-200 border border-emerald-300 dark:border-emerald-700 transition-colors"
                                                            title="點擊修改預計配送日"
                                                        >
                                                            <Calendar size={13} />
                                                            出貨日: {order.expectedDeliveryDate}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-3 flex-shrink-0 justify-between md:justify-end">
                                            <div className="flex items-center gap-2">
                                                <span className="font-mono font-extrabold text-base md:text-lg text-emerald-600 dark:text-emerald-400">
                                                    ${computeOrderTotals(order, buildingSettingsList, groupBindings).totalAmount}
                                                </span>
                                                {order.paymentStatus !== 'off' && order.paymentStatus !== '已付款' && order.paymentStatus !== '已入帳' ? (
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleQuickConfirmPayment(order);
                                                        }}
                                                        className="text-xs px-2.5 py-1 font-bold rounded bg-white hover:bg-emerald-50 text-emerald-600 border border-emerald-200 shadow-sm flex items-center gap-0.5"
                                                        title="一鍵標記為已付款"
                                                    >
                                                        <Check size={12} /> 確認收款
                                                    </button>
                                                ) : (
                                                    <span className={`inline-block text-xs px-2 py-0.5 rounded font-extrabold border ${
                                                        order.status === 'PENDING' ? 'bg-white text-blue-600 border-blue-200' : 'bg-white text-emerald-600 border-emerald-200'
                                                    }`}>
                                                        {order.status === 'PENDING' ? '待出貨' : '已出貨'}
                                                    </span>
                                                )}
                                                <button
                                                    type="button"
                                                    onClick={(e) => handleOpenDateModal(order, e)}
                                                    className={`text-xs px-2.5 py-1 font-bold rounded shadow-sm flex items-center gap-1 transition-all ${
                                                        order.expectedDeliveryDate
                                                            ? 'bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-700'
                                                            : 'bg-amber-500 hover:bg-amber-600 text-white border border-amber-600'
                                                    }`}
                                                    title="設定/修改預計出貨與配送日期"
                                                >
                                                    <Calendar size={13} />
                                                    {order.expectedDeliveryDate ? `${order.expectedDeliveryDate} 配送` : '預定出貨日'}
                                                </button>
                                            </div>

                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    toggleExpandOrder(order.orderId);
                                                }}
                                                className={`py-1 px-3 text-xs font-bold rounded-lg border transition-all flex items-center gap-1 ${
                                                    isExpanded 
                                                        ? 'bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-950/40 dark:border-blue-800' 
                                                        : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border-[var(--border-primary)] hover:bg-[var(--bg-hover)]'
                                                }`}
                                            >
                                                {isExpanded ? (
                                                    <>
                                                        <span>折疊</span>
                                                        <ChevronUp size={14} />
                                                    </>
                                                ) : (
                                                    <>
                                                        <span>展開</span>
                                                        <ChevronDown size={14} />
                                                    </>
                                                )}
                                            </button>
                                        </div>
                                    </div>

                                    {/* 展開後的詳細內容區塊 */}
                                    {isExpanded && (
                                        <div className="p-6 pt-3 border-t border-[var(--border-primary)] bg-[var(--bg-secondary)] flex flex-col justify-between flex-1 animate-in fade-in duration-150">
                                            <div>
                                                {/* Client Details */}
                                                <div className="space-y-2.5 text-base mb-4">
                                                    <div className="flex flex-wrap items-center gap-2.5 text-[var(--text-primary)] text-base md:text-lg">
                                                        <User size={18} className="text-[var(--text-tertiary)] flex-shrink-0" />
                                                        <span className="font-extrabold">{order.customerName}</span>
                                                        {order.lineDisplayName && (
                                                            <span className="text-xs text-slate-500 bg-white border border-slate-200 px-2 py-0.5 rounded font-medium">
                                                                LINE: {order.lineDisplayName}
                                                            </span>
                                                        )}
                                                        {(() => {
                                                            const knownNames = Array.from(new Set([...buildings, ...Object.values(groupBindings)])).filter(Boolean);
                                                            const addr = String(order.deliveryAddress || '').trim();
                                                            const matchedAddrBuilding = knownNames.find(name => name && addr.startsWith(name));
                                                            const displayGroup = matchedAddrBuilding || groupBindings[order.sourceGroup] || order.sourceGroup;
                                                            if (!displayGroup) return null;
                                                            return (
                                                                <span className="bg-white text-slate-600 text-xs px-2 py-0.5 rounded flex items-center gap-1 font-bold border border-slate-200">
                                                                    {displayGroup}
                                                                    {groupBindings[order.sourceGroup] && groupBindings[order.sourceGroup] !== displayGroup && (
                                                                        <span className="opacity-60 text-[10px] font-mono font-medium">({order.sourceGroup})</span>
                                                                    )}
                                                                </span>
                                                            );
                                                        })()}
                                                    </div>
                                                    
                                                    {/* 付款方式與狀態標籤 */}
                                                    {order.paymentMethod && (
                                                        <div className="flex flex-wrap items-center gap-2 py-1">
                                                            <span className={`inline-block text-xs px-2.5 py-0.5 rounded font-extrabold border uppercase tracking-wider ${
                                                                order.paymentMethod === '轉帳' 
                                                                    ? 'bg-indigo-50 text-indigo-600 border-indigo-200' 
                                                                    : order.paymentMethod === 'LINE Pay'
                                                                    ? 'bg-blue-50 text-blue-600 border-blue-200'
                                                                    : order.paymentMethod === '現金'
                                                                    ? 'bg-sky-50 text-sky-700 border-sky-200'
                                                                    : 'bg-white text-slate-700 border-slate-200'
                                                            }`}>
                                                                💳 {order.paymentMethod}
                                                            </span>
                                                            {order.transferLastFive && (
                                                                <span className="text-xs text-slate-500 dark:text-slate-400 font-mono bg-transparent px-1">
                                                                    (末五碼：{order.transferLastFive})
                                                                </span>
                                                            )}
                                                            {order.paymentStatus && (
                                                                <span className={`inline-block text-xs px-2 py-0.5 rounded font-black border ${
                                                                    order.paymentStatus === '已付款' || order.paymentStatus === '已入帳'
                                                                        ? 'bg-white text-emerald-600 border-emerald-200'
                                                                        : 'bg-white text-rose-600 border-rose-200'
                                                                }`}>
                                                                    {order.paymentStatus}
                                                                </span>
                                                            )}
                                                        </div>
                                                    )}

                                                    <div className="flex items-center gap-2 text-[var(--text-secondary)] text-base md:text-lg">
                                                        <Phone size={18} className="text-[var(--text-tertiary)]" />
                                                        <span className="font-semibold">{order.customerPhone}</span>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleCopyText(order.customerPhone, '電話')}
                                                            className="p-1 hover:bg-[var(--bg-hover)] rounded text-[var(--text-tertiary)] hover:text-blue-500 transition-colors"
                                                            title="複製電話"
                                                        >
                                                            <Copy size={13} />
                                                        </button>
                                                    </div>
                                                    {order.deliveryAddress && (
                                                        <div className="flex items-center gap-2 text-[var(--text-secondary)] text-base md:text-lg">
                                                            <MapPin size={18} className="text-[var(--text-tertiary)] animate-pulse" />
                                                            <span className="break-all font-semibold">{order.deliveryAddress}</span>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleCopyText(order.deliveryAddress, '地址')}
                                                                className="p-1 hover:bg-[var(--bg-hover)] rounded text-[var(--text-tertiary)] hover:text-blue-500 transition-colors"
                                                                title="複製地址"
                                                            >
                                                                <Copy size={13} />
                                                            </button>
                                                        </div>
                                                    )}
                                                    {order.createdAt && (
                                                        <div className="flex items-center gap-2 text-[var(--text-secondary)] text-base md:text-lg">
                                                            <Clock size={18} className="text-[var(--text-tertiary)]" />
                                                            <span className="font-semibold">下單時間：<span className="font-mono text-blue-600 dark:text-blue-400">{new Date(order.createdAt).toLocaleString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span></span>
                                                        </div>
                                                    )}
                                                    <div className="flex items-center gap-2 text-[var(--text-secondary)] text-base md:text-lg">
                                                        <Calendar size={18} className="text-emerald-600 dark:text-emerald-400" />
                                                        <span className="font-semibold">
                                                            預計出貨/配送：
                                                            {order.expectedDeliveryDate ? (
                                                                <span className="font-mono font-extrabold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-0.5 rounded border border-emerald-300 dark:border-emerald-700 ml-1">
                                                                    {order.expectedDeliveryDate}
                                                                </span>
                                                            ) : (
                                                                <span className="text-[var(--text-tertiary)] italic ml-1">尚未設定</span>
                                                            )}
                                                        </span>
                                                        <button
                                                            type="button"
                                                            onClick={(e) => handleOpenDateModal(order, e)}
                                                            className="text-xs px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded shadow-sm ml-2 transition-transform active:scale-95"
                                                        >
                                                            修改日期
                                                        </button>
                                                    </div>
                                                    {order.note && (
                                                        <div className="flex items-start gap-2 bg-[var(--bg-tertiary)] p-3 rounded-lg border border-[var(--border-primary)] text-sm md:text-base text-[var(--text-secondary)]">
                                                            <FileText size={16} className="text-[var(--text-tertiary)] mt-0.5 flex-shrink-0" />
                                                            <span className="italic font-medium">"{order.note}"</span>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Items List */}
                                                <div className="bg-[var(--bg-tertiary)] rounded-lg p-4 border border-[var(--border-primary)] mb-4 shadow-inner">
                                                    <div className="text-xs md:text-sm uppercase font-bold text-[var(--text-tertiary)] mb-2.5 tracking-wider">訂單商品明細</div>
                                                    <div className="divide-y divide-[var(--border-primary)] divide-dashed space-y-3">
                                                        {order.items.map((item, idx) => (
                                                            <div key={idx} className="flex flex-col pt-2.5 first:pt-0">
                                                                {(() => {
                                                                    const prod = products.find(p => p.id === item.productId || p.name === item.productName || p.name === item.productId);
                                                                    const isBundle = prod ? prod.isBundle : false;
                                                                    const bundleSize = prod ? prod.bundleSize : 1;
                                                                    return (
                                                                        <div className="flex justify-between items-center text-base md:text-lg">
                                                                            <div className="flex items-center gap-2">
                                                                                <span className="font-extrabold text-[var(--text-primary)]">
                                                                                    {item.productName}
                                                                                    {isBundle && <span className="text-[10px] font-extrabold text-amber-600 bg-amber-500/10 px-1.5 py-0.5 rounded-md ml-1.5">捆裝 {bundleSize}入</span>}
                                                                                </span>
                                                                                <span className="text-sm md:text-base text-blue-600 dark:text-blue-400 font-black">
                                                                                    x {item.qty} {isBundle ? '組' : '瓶'}
                                                                                </span>
                                                                            </div>
                                                                            <span className="font-mono font-bold text-[var(--text-secondary)]">${item.subtotal}</span>
                                                                        </div>
                                                                    );
                                                                })()}
                                                                {item.remark && (
                                                                    <div className="text-xs md:text-sm text-blue-600 dark:text-blue-400 font-bold mt-1 ml-1">
                                                                        {item.remark}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                    {(() => {
                                                        const totals = computeOrderTotals(order, buildingSettingsList, groupBindings);
                                                        if (totals.shippingFee <= 0) return null;
                                                        return (
                                                            <div className="flex justify-between items-center text-sm pt-2 border-t border-dashed border-[var(--border-primary)] text-amber-600 dark:text-amber-400 font-bold">
                                                                <span>🚚 外送運費</span>
                                                                <span className="font-mono">+${totals.shippingFee}</span>
                                                            </div>
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
                                                                    const recipientTotal = r.items.reduce((sum, ri) => sum + (Number(ri.qty) * Number(ri.price)), 0);
                                                                    return (
                                                                        <div key={rIdx} className="bg-[var(--bg-secondary)] p-3 rounded-lg border border-[var(--border-primary)]">
                                                                            <div className="flex justify-between items-center text-sm font-bold text-[var(--text-primary)]">
                                                                                <span>👤 {r.recipientName}</span>
                                                                                <span className="text-blue-600 font-mono">${recipientTotal} 元</span>
                                                                            </div>
                                                                            <div className="pl-3 mt-1.5 space-y-0.5 text-xs text-[var(--text-secondary)]">
                                                                                {r.items.map((ri, riIdx) => (
                                                                                    <div key={riIdx} className="flex justify-between items-center font-mono">
                                                                                        <span>{ri.productName} x{ri.qty}</span>
                                                                                        <span>${ri.qty * ri.price}</span>
                                                                                    </div>
                                                                                ))}
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
                                            const rTotal = r.items ? r.items.reduce((sum, ri) => sum + (ri.qty * ri.price), 0) : 0;
                                            return (
                                                <div key={r.recipientId || rIdx} className="bg-[var(--bg-tertiary)] rounded-xl border border-[var(--border-primary)] p-4 space-y-3">
                                                    <div className="flex justify-between items-center border-b border-[var(--border-primary)] pb-2">
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-extrabold text-[var(--text-primary)] text-sm">👤 {r.recipientName}</span>
                                                            <span className="text-xs text-[var(--text-tertiary)] font-mono">(${rTotal} 元)</span>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            {/* 新增商品到此成員 */}
                                                            <select
                                                                className="input-field text-[11px] py-0.5 px-2 bg-[var(--bg-secondary)] border-[var(--border-primary)] rounded-md max-w-[150px]"
                                                                defaultValue=""
                                                                onChange={(e) => {
                                                                    if (e.target.value) {
                                                                        handleAddRecipientItemInModal(r.recipientId, e.target.value);
                                                                        e.target.value = "";
                                                                    }
                                                                }}
                                                            >
                                                                <option value="" disabled>+ 新增商品</option>
                                                                {products.map(p => (
                                                                    <option key={p.id} value={p.id}>{p.name}</option>
                                                                ))}
                                                            </select>
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
                                                                <div key={ri.id || riIdx} className="flex justify-between items-center pl-2 text-xs">
                                                                    <span className="text-[var(--text-secondary)] font-medium">{ri.productName}</span>
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
                                                                        <span className="w-12 text-right font-mono text-[var(--text-secondary)]">${ri.qty * ri.price}</span>
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

                                        {/* 新增商品選單 */}
                                        <div className="flex gap-1.5 items-center">
                                            <select
                                                id="add-item-select"
                                                className="input-field text-xs py-1.5 px-2 bg-[var(--bg-tertiary)] border-[var(--border-primary)] rounded-lg max-w-[180px]"
                                                defaultValue=""
                                                onChange={(e) => {
                                                    if (e.target.value) {
                                                        handleAddItem(e.target.value);
                                                        e.target.value = ""; // 重設選單
                                                    }
                                                }}
                                            >
                                                <option value="" disabled>-- 新增商品到訂單 --</option>
                                                {products.map(p => (
                                                    <option key={p.id} value={p.id}>
                                                        {p.name} (${p.single_price || p.price})
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>

                                    <div className="divide-y divide-[var(--border-primary)] bg-[var(--bg-tertiary)] rounded-xl border border-[var(--border-primary)] overflow-hidden">
                                        {editingOrder.items.length === 0 ? (
                                            <div className="p-4 text-center text-xs text-[var(--text-secondary)]">訂單目前沒有任何商品</div>
                                        ) : (
                                            editingOrder.items.map((item, idx) => (
                                                <div key={idx} className="flex justify-between items-center p-3 text-sm hover:bg-[var(--bg-hover)]">
                                                    <div className="flex-1 mr-4">
                                                        <div className="font-bold text-[var(--text-primary)]">{item.productName}</div>
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
                                            <div className="flex justify-between items-center mt-4 p-3 bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded-xl font-bold text-base">
                                                <div className="flex flex-col">
                                                    <span className="text-[var(--text-primary)] font-bold">訂單合計</span>
                                                    <span className="text-xs text-[var(--text-secondary)] font-normal">
                                                        商品 ${totals.productTotal} + 運費 ${totals.shippingFee} {totals.shippingFee === 0 ? '(免運)' : ''}
                                                    </span>
                                                </div>
                                                <span className="text-blue-600 font-mono text-xl">${totals.totalAmount}</span>
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
                            <button type="button" onClick={() => setDateModalOrder(null)} className="hover:bg-emerald-700 p-1 rounded-lg">
                                <X size={18} />
                            </button>
                        </div>
                        <div className="p-5 space-y-4">
                            <div className="text-sm font-semibold text-[var(--text-secondary)]">
                                訂單：<span className="font-mono text-[var(--text-primary)] font-extrabold">{dateModalOrder.orderId}</span> ({dateModalOrder.customerName})
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-1.5">
                                    選擇預計出貨日期
                                </label>
                                <input
                                    type="date"
                                    className="input-field w-full text-base font-bold py-2.5 px-3 border-emerald-500 focus:ring-emerald-500"
                                    value={dateModalValue}
                                    onChange={(e) => setDateModalValue(e.target.value)}
                                />
                            </div>
                            <div>
                                <span className="block text-xs font-bold text-[var(--text-tertiary)] mb-1.5">快速選擇：</span>
                                <div className="flex flex-wrap gap-2">
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
                                            className={`text-xs px-3 py-1.5 rounded-lg font-bold border transition-colors ${
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
                                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-5 py-2 text-xs rounded-xl shadow flex items-center gap-1.5"
                                disabled={isSavingDate}
                            >
                                <Save size={14} />
                                {isSavingDate ? '儲存中...' : '確定儲存'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
