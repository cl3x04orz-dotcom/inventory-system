import React, { useState, useEffect, useCallback } from 'react';
import { Package, ClipboardList, Eye, Edit, Trash2, CheckCircle, RefreshCw, X, User, Users, Phone, MapPin, FileText, Plus, Minus, Save, Calendar, Check, Search, Copy } from 'lucide-react';
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

    // 批次與大樓功能狀態
    const [selectedOrderIds, setSelectedOrderIds] = useState([]);
    const [isBatchProcessing, setIsBatchProcessing] = useState(false);
    const [batchMessage, setBatchMessage] = useState('');
    const [buildings, setBuildings] = useState([]);

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
        // 深拷貝 order 的 items 和 recipients，以免直接污染狀態
        setEditingOrder({
            ...order,
            items: order.items.map(item => ({ ...item })),
            recipients: order.recipients ? order.recipients.map(r => ({
                ...r,
                items: r.items.map(ri => ({ ...ri }))
            })) : []
        });
        setShowEditModal(true);
    };

    const handleEditFieldChange = (field, value) => {
        setEditingOrder(prev => ({
            ...prev,
            [field]: value
        }));
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

    const handleSaveOrderEdit = async (e) => {
        e.preventDefault();
        if (editingOrder.items.length === 0) {
            alert('訂單商品明細不可為空');
            return;
        }

        setIsSaving(true);
        try {
            const res = await callGAS(apiUrl, 'updatePendingOrder', {
                orderId: editingOrder.orderId,
                customerName: editingOrder.customerName,
                customerPhone: editingOrder.customerPhone,
                deliveryAddress: editingOrder.deliveryAddress,
                note: editingOrder.note,
                items: editingOrder.items,
                paymentMethod: editingOrder.paymentMethod,
                transferLastFive: editingOrder.transferLastFive,
                paymentStatus: editingOrder.paymentStatus,
                recipients: editingOrder.recipients
            }, user.token);

            if (res && res.error) {
                throw new Error(res.error);
            }

            alert('訂單修改成功');
            setShowEditModal(false);
            fetchOrders();
        } catch (error) {
            alert('修改失敗: ' + error.message);
        } finally {
            setIsSaving(false);
        }
    };

    const filteredOrders = orders.filter(order => {
        // 大樓篩選
        if (selectedBuilding !== '全部') {
            const addr = String(order.deliveryAddress || '').trim();
            const boundBuildingName = groupBindings[order.sourceGroup];
            const matchesAddress = addr.startsWith(selectedBuilding);
            const matchesGroup = boundBuildingName === selectedBuilding;
            if (!matchesAddress && !matchesGroup) {
                return false;
            }
        }

        const search = searchTerm.toLowerCase();
        return (
            String(order.orderId || '').toLowerCase().includes(search) ||
            String(order.customerName || '').toLowerCase().includes(search) ||
            String(order.customerPhone || '').toLowerCase().includes(search) ||
            String(order.deliveryAddress || '').toLowerCase().includes(search) ||
            String(order.sourceGroup || '').toLowerCase().includes(search)
        );
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
        if (filteredOrders.length === 0) {
            alert('目前沒有訂單可彙整');
            return;
        }

        const summary = {};
        filteredOrders.forEach(order => {
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
        if (filteredOrders.length === 0) {
            alert('目前沒有訂單可彙整');
            return;
        }

        const lines = [];
        lines.push(`📋 物流分貨明細 (${selectedBuilding === '全部' ? '全部大樓' : selectedBuilding})`);
        lines.push(`彙整時間：${new Date().toLocaleString('zh-TW')}`);
        lines.push(`訂單總數：${filteredOrders.length} 筆`);
        lines.push('----------------------------------------');

        filteredOrders.forEach((order, idx) => {
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
        if (filteredOrders.length === 0) {
            alert('目前沒有訂單可彙整');
            return;
        }

        const lines = [];
        lines.push(`📋 物流分貨明細 (客戶) (${selectedBuilding === '全部' ? '全部大樓' : selectedBuilding})`);
        lines.push(`彙整時間：${new Date().toLocaleString('zh-TW')}`);
        lines.push(`訂單總數：${filteredOrders.length} 筆`);
        lines.push('----------------------------------------');

        filteredOrders.forEach((order, idx) => {
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
                        {buildings.map(bname => (
                            <option key={bname} value={bname}>{bname}</option>
                        ))}
                    </select>

                    <div className="relative flex-1 md:flex-none">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" size={18} />
                        <input
                            type="text"
                            placeholder="搜尋編號、姓名、電話、地址、群組..."
                            className="input-field pl-10 w-full md:w-80"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
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
                        <span className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">待出貨數量</span>
                        <span className="text-xl font-extrabold text-blue-600 mt-1">{summaryStats.totalQty} <span className="text-xs font-medium text-[var(--text-tertiary)]">瓶/件</span></span>
                    </div>
                    <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-3.5 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
                        <span className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">待出貨總金額</span>
                        <span className="text-xl font-extrabold text-emerald-600 mt-1">${summaryStats.totalAmount.toLocaleString()}</span>
                    </div>
                </div>
            )}

            {/* 批次操作列 (限待確認 tab 下) */}
            {activeTab === 'PENDING' && sortedFilteredOrders.length > 0 && (
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
                            全選本頁面待審核訂單
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
                </div>

                <div className="flex gap-2 flex-wrap sm:flex-nowrap">
                    <button
                        type="button"
                        onClick={handleCopyShipmentSummary}
                        className={`py-1.5 px-3 text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-sm active:scale-95 transition-all duration-200 border whitespace-nowrap ${copied 
                            ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-transparent' 
                            : 'bg-[var(--bg-secondary)] hover:bg-[var(--bg-hover)] border-[var(--border-primary)] text-[var(--text-primary)]'
                        }`}
                    >
                        <span>{copied ? '✅ 已複製點貨總量！' : '📦 複製點貨總量'}</span>
                    </button>

                    <button
                        type="button"
                        onClick={handleCopyDetailSummary}
                        className={`py-1.5 px-3 text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-sm active:scale-95 transition-all duration-200 border whitespace-nowrap ${detailCopied 
                            ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-transparent' 
                            : 'bg-[var(--bg-secondary)] hover:bg-[var(--bg-hover)] border-[var(--border-primary)] text-[var(--text-primary)]'
                        }`}
                    >
                        <span>{detailCopied ? '✅ 已複製分貨明細(業務)！' : '📋 複製分貨明細(業務)'}</span>
                    </button>

                    <button
                        type="button"
                        onClick={handleCopyClientDetailSummary}
                        className={`py-1.5 px-3 text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-sm active:scale-95 transition-all duration-200 border whitespace-nowrap ${clientDetailCopied 
                            ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-transparent' 
                            : 'bg-[var(--bg-secondary)] hover:bg-[var(--bg-hover)] border-[var(--border-primary)] text-[var(--text-primary)]'
                        }`}
                    >
                        <span>{clientDetailCopied ? '✅ 已複製分貨明細(客戶)！' : '📋 複製分貨明細(客戶)'}</span>
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
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                        {filteredOrders.map(order => (
                            <div key={order.orderId} className="bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-primary)] shadow-md p-6 flex flex-col justify-between hover:border-blue-500/30 hover:shadow-lg transition-all duration-200">
                                {/* Order Header */}
                                <div>
                                    <div className="flex justify-between items-center mb-4 pb-3 border-b border-[var(--border-primary)]">
                                        <div className="flex items-center gap-2">
                                            {activeTab === 'PENDING' && (
                                                <input
                                                    type="checkbox"
                                                    checked={selectedOrderIds.includes(order.orderId)}
                                                    onChange={() => handleToggleSelectOrder(order.orderId)}
                                                    className="w-5 h-5 text-blue-600 rounded border-gray-300 focus:ring-blue-500 cursor-pointer"
                                                />
                                            )}
                                            <div className="flex flex-col">
                                                <span className="font-mono font-bold text-lg md:text-xl text-[var(--text-primary)]">{order.orderId}</span>
                                                {order.createdAt && (
                                                    <span className="text-[11px] text-slate-400 font-medium mt-0.5">
                                                        ⏱️ {new Date(order.createdAt).toLocaleString('zh-TW', {
                                                            year: 'numeric',
                                                            month: '2-digit',
                                                            day: '2-digit',
                                                            hour: '2-digit',
                                                            minute: '2-digit',
                                                            hour12: false
                                                        })}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <div>
                                            {order.paymentStatus !== 'off' && order.paymentStatus !== '已付款' && order.paymentStatus !== '已入帳' ? (
                                                <button
                                                    type="button"
                                                    onClick={() => handleQuickConfirmPayment(order)}
                                                    className="text-xs px-2.5 py-1 font-bold rounded bg-white hover:bg-emerald-50 text-emerald-600 border border-emerald-200 hover:border-emerald-300 active:scale-95 transition-all shadow-sm flex items-center gap-0.5"
                                                    title="一鍵標記為已付款"
                                                >
                                                    <Check size={12} /> 確認收款
                                                </button>
                                            ) : (
                                                order.status === 'PENDING' ? (
                                                    <span className="inline-block text-xs px-2.5 py-1 rounded font-extrabold border bg-white text-blue-600 border-blue-200 uppercase tracking-wider">
                                                        待出貨
                                                    </span>
                                                ) : (
                                                    <span className="inline-block text-xs px-2.5 py-1 rounded font-extrabold border bg-white text-emerald-600 border-emerald-200 uppercase tracking-wider">
                                                        已出貨
                                                    </span>
                                                )
                                            )}
                                        </div>
                                    </div>

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
                                            {order.sourceGroup && (
                                                <span className="bg-white text-slate-600 text-xs px-2 py-0.5 rounded flex items-center gap-1 font-bold border border-slate-200">
                                                    {groupBindings[order.sourceGroup] || order.sourceGroup}
                                                    {groupBindings[order.sourceGroup] && (
                                                        <span className="opacity-60 text-[10px] font-mono font-medium">({order.sourceGroup})</span>
                                                    )}
                                                </span>
                                            )}
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
                                        <div className="flex justify-between items-center border-t border-[var(--border-primary)] mt-3.5 pt-2.5 font-bold text-lg md:text-xl">
                                            <span className="text-[var(--text-primary)]">金額合計</span>
                                            <span className="text-blue-600 dark:text-blue-400 font-mono font-extrabold">${order.totalAmount}</span>
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
                        ))}
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

                                    <div className="flex justify-between items-center mt-4 p-3 bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded-xl font-bold text-lg">
                                        <span className="text-[var(--text-primary)]">金額合計</span>
                                        <span className="text-blue-600 font-mono">${editingOrder.totalAmount}</span>
                                    </div>
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
        </div>
    );
}
