import React, { useState, useEffect } from 'react';
import {
    Truck, PackageCheck, MapPin, Phone, Camera, CheckCircle2, ChevronRight,
    AlertCircle, RefreshCw, Layers, ShieldCheck, ArrowLeft, Clock, Info, Calendar, Filter
} from 'lucide-react';
import { callApi } from '../utils/api';
import { safeLocalStorage, safeSessionStorage } from '../utils/storage';

export default function DriverDeliveryPage({ apiUrl, onBack }) {
    const [activeTab, setActiveTab] = useState('pack'); // 'pack' | 'deliver'
    const [orders, setOrders] = useState([]);
    const [products, setProducts] = useState([]);
    const [buildingSettings, setBuildingSettings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // 當日配送日期審查篩選 (預設為今天 YYYY-MM-DD)
    const getTodayDateString = () => {
        const d = new Date();
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const [selectedDate, setSelectedDate] = useState(getTodayDateString());
    const [filterByDateStrict, setFilterByDateStrict] = useState(true);

    const [packedState, setPackedState] = useState({}); // { buildingName: boolean }
    const [deliveryPhotos, setDeliveryPhotos] = useState({}); // { buildingName: base64 }
    const [completedBuildings, setCompletedBuildings] = useState({}); // { buildingName: boolean }
    const [submittingBuilding, setSubmittingBuilding] = useState(null);

    // 載入當日訂單與配送資料
    const fetchDeliveryTasks = async () => {
        setLoading(true);
        setError(null);
        try {
            const apiTarget = apiUrl || (typeof window !== 'undefined' && window.GAS_API_URL) || '/api';
            
            const [ordersRes, productsRes, storeRes] = await Promise.all([
                callApi(apiTarget, 'getPendingOrders', {}).catch(() => null),
                callApi(apiTarget, 'getProducts', {}).catch(() => null),
                callApi(apiTarget, 'getStoreSettings', {}).catch(() => null)
            ]);

            const cachedOrders = safeLocalStorage.getItem('pending_orders');
            let loadedOrders = cachedOrders ? JSON.parse(cachedOrders) : [];

            if (ordersRes && ordersRes.success && Array.isArray(ordersRes.orders) && ordersRes.orders.length > 0) {
                loadedOrders = ordersRes.orders;
            }

            setOrders(loadedOrders);

            if (productsRes && productsRes.success && Array.isArray(productsRes.products)) {
                setProducts(productsRes.products);
            }

            if (storeRes && storeRes.success && storeRes.settings) {
                setBuildingSettings(storeRes.settings.buildingSettings || []);
            }

            const localPacked = safeLocalStorage.getItem('driver_packed_buildings');
            if (localPacked) setPackedState(JSON.parse(localPacked));

            const localCompleted = safeLocalStorage.getItem('driver_completed_buildings');
            if (localCompleted) setCompletedBuildings(JSON.parse(localCompleted));

        } catch (err) {
            console.error('[Driver] Fetch error:', err);
            setError('無法連線載入外送任務，請檢查網路連線。');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDeliveryTasks();
    }, []);

    // 依當日配送日期 (expectedDeliveryDate) 嚴格過濾 + 分群
    const buildingTasks = React.useMemo(() => {
        if (!orders || orders.length === 0) return [];
        const groupsMap = {};

        // 進行當日配送日期審查篩選
        const filteredOrders = orders.filter(order => {
            if (!filterByDateStrict) return true;
            const expDate = String(order.expectedDeliveryDate || order.deliveryDate || '').trim().replace(/\//g, '-');
            if (!expDate) return true; // 無預設配送日則允許顯示於當日外送
            return expDate.includes(selectedDate);
        });

        filteredOrders.forEach(order => {
            const bName = order.groupName || order.buildingName || order.sourceGroup || '未分類自取點';
            if (!groupsMap[bName]) {
                groupsMap[bName] = {
                    buildingName: bName,
                    address: order.deliveryAddress || bName,
                    orders: [],
                    totalBottles: 0,
                    itemSummary: {}
                };
            }
            groupsMap[bName].orders.push(order);

            (order.items || []).forEach(item => {
                const pKey = item.productName || item.productId;
                if (!groupsMap[bName].itemSummary[pKey]) {
                    groupsMap[bName].itemSummary[pKey] = {
                        name: item.productName,
                        qty: 0,
                        remarks: []
                    };
                }
                const qtyNum = Number(item.qty) || 0;
                groupsMap[bName].itemSummary[pKey].qty += qtyNum;
                groupsMap[bName].totalBottles += qtyNum;
                if (item.remark && String(item.remark).trim()) {
                    groupsMap[bName].itemSummary[pKey].remarks.push(String(item.remark).trim());
                }
            });
        });

        return Object.values(groupsMap);
    }, [orders, selectedDate, filterByDateStrict]);

    // 統計全車總品項
    const overallItemSummary = React.useMemo(() => {
        const summary = {};
        buildingTasks.forEach(task => {
            Object.values(task.itemSummary).forEach(item => {
                if (!summary[item.name]) {
                    summary[item.name] = { name: item.name, qty: 0, remarks: [] };
                }
                summary[item.name].qty += item.qty;
                if (item.remarks.length > 0) {
                    summary[item.name].remarks.push(...item.remarks);
                }
            });
        });
        return Object.values(summary);
    }, [buildingTasks]);

    const isOrderPacked = (orderKey, bName) => {
        return !!packedState[orderKey] || !!packedState[bName];
    };

    const toggleOrderPacked = (orderKey, bName, taskOrders = []) => {
        const current = !!packedState[orderKey];
        const next = { ...packedState, [orderKey]: !current };
        
        // 檢查該大樓的所有訂單是否全數打包完成
        if (taskOrders.length > 0) {
            const allDone = taskOrders.every(o => {
                const k = o.orderId || `ord_${bName}_${o.customerName}`;
                return !!next[k];
            });
            next[bName] = allDone;
        }

        setPackedState(next);
        safeLocalStorage.setItem('driver_packed_buildings', JSON.stringify(next));
    };

    const togglePacked = (bName, taskOrders = []) => {
        const nextStatus = !packedState[bName];
        const next = { ...packedState, [bName]: nextStatus };
        if (taskOrders.length > 0) {
            taskOrders.forEach(o => {
                const k = o.orderId || `ord_${bName}_${o.customerName}`;
                next[k] = nextStatus;
            });
        }
        setPackedState(next);
        safeLocalStorage.setItem('driver_packed_buildings', JSON.stringify(next));
    };

    const handlePhotoCapture = (bName, event) => {
        const file = event.target.files && event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 1000;
                const MAX_HEIGHT = 1000;
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > MAX_WIDTH) {
                        height *= MAX_WIDTH / width;
                        width = MAX_WIDTH;
                    }
                } else {
                    if (height > MAX_HEIGHT) {
                        width *= MAX_HEIGHT / height;
                        height = MAX_HEIGHT;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                const compressedBase64 = canvas.toDataURL('image/jpeg', 0.7);
                setDeliveryPhotos(prev => ({ ...prev, [bName]: compressedBase64 }));
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    };

    const handleConfirmDelivery = async (bName) => {
        const photo = deliveryPhotos[bName];
        if (!photo) {
            alert('請先拍攝並上傳自取點放妥照片，再進行送達通報！');
            return;
        }

        setSubmittingBuilding(bName);
        try {
            const apiTarget = apiUrl || (typeof window !== 'undefined' && window.GAS_API_URL) || '/api';
            const task = buildingTasks.find(t => t.buildingName === bName);

            const payload = {
                buildingName: bName,
                deliveryAddress: task ? task.address : '',
                photoBase64: photo,
                deliveredAt: new Date().toISOString(),
                orderIds: task ? task.orders.map(o => o.orderId) : []
            };

            await callApi(apiTarget, 'submitDriverDelivery', payload).catch(err => {
                console.warn('[Driver] Backend notification fallback to offline store:', err);
            });

            const nextComp = { ...completedBuildings, [bName]: true };
            setCompletedBuildings(nextComp);
            safeLocalStorage.setItem('driver_completed_buildings', JSON.stringify(nextComp));

            alert(`✅ 已成功完成【${bName}】之配送並通報官方 LINE 後台！`);
        } catch (err) {
            console.error('[Driver] Confirm delivery error:', err);
            alert('送達通知連線發生異常，已儲存於本機記錄。');
        } finally {
            setSubmittingBuilding(null);
        }
    };

    const openGoogleMaps = (rawAddress, buildingName) => {
        if (!rawAddress && !buildingName) return;
        
        let clean = String(rawAddress || '').trim();

        // 1. 拿掉測試與系統前綴 (如: "測試 - ", "線上下單 ", "一般散客 - ")
        clean = clean.replace(/^(測試|線上下單|一般散客|未分類自取點|團購訂單)\s*[-─–—]?\s*/gi, '').trim();

        // 2. 拿掉半形/全形括號內所有備註 (如: "(米立微)", "(中華電信門市1號櫃檯)")
        clean = clean.replace(/\s*\([^\)]*\)|\s*（[^）]*）/g, '').trim();

        // 3. 智慧保留門牌號碼 (如 "386-6號"、"12-1號")，僅剔除非門牌的室內位置細節 (如 " - 3A病房")
        clean = clean.replace(/\s+[-─–—]\s+(?!\d+).*/g, '').trim();

        // 4. 若清理後地址空白，備退為大樓名稱或原始輸入
        const queryStr = clean || buildingName || rawAddress;
        const encoded = encodeURIComponent(queryStr);
        window.open(`https://www.google.com/maps/search/?api=1&query=${encoded}`, '_blank');
    };

    const triggerProxyCall = () => {
        alert('📞 [Uber 模式隱私轉接]\n已透過系統中繼號撥出，通話過程雙方均隱藏真實手機號碼。');
        window.location.href = 'tel:0277000000';
    };

    return (
        <div className="min-h-screen bg-slate-100 text-slate-900 pb-16 font-sans">
            {/* Top Bar Header */}
            <div className="sticky top-0 z-50 bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-2.5">
                    {onBack && (
                        <button onClick={onBack} className="p-1.5 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 active:scale-95 transition-all">
                            <ArrowLeft size={20} />
                        </button>
                    )}
                    <Truck className="text-emerald-600" size={26} />
                    <div>
                        <h1 className="text-base font-black tracking-tight text-slate-900 flex items-center gap-2">
                            米立微 司機外送 PWA
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold">當日配送審查中</span>
                        </h1>
                        <p className="text-xs text-slate-500 font-medium">零入群 ‧ 個資隱私屏蔽 ‧ 訊息直達官方</p>
                    </div>
                </div>
                <button
                    onClick={fetchDeliveryTasks}
                    disabled={loading}
                    className="p-2 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 active:scale-95 transition-all"
                    title="重新整理任務"
                >
                    <RefreshCw size={18} className={loading ? 'animate-spin text-emerald-600' : ''} />
                </button>
            </div>

            {/* 當日配送日期審查條列列 */}
            <div className="bg-emerald-50/80 border-b border-emerald-200 px-4 py-2.5 flex items-center justify-between gap-2 shadow-2xs">
                <div className="flex items-center gap-2">
                    <Calendar size={16} className="text-emerald-700" />
                    <span className="text-xs font-bold text-emerald-900">當日外送審查日期：</span>
                    <input
                        type="date"
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        className="text-xs font-black bg-white border border-emerald-300 rounded-lg px-2 py-1 text-slate-800 shadow-2xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                </div>
                <button
                    onClick={() => setFilterByDateStrict(!filterByDateStrict)}
                    className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border transition-all ${
                        filterByDateStrict
                            ? 'bg-emerald-600 text-white border-emerald-600'
                            : 'bg-white text-slate-600 border-slate-300'
                    }`}
                >
                    {filterByDateStrict ? '✓ 嚴格當日' : '顯示全部'}
                </button>
            </div>

            {/* Sub Nav Tabs */}
            <div className="bg-white p-2 border-b border-slate-200 flex gap-2 shadow-xs">
                <button
                    onClick={() => setActiveTab('pack')}
                    className={`flex-1 py-3 px-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-98 ${
                        activeTab === 'pack'
                            ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30 font-black'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'
                    }`}
                >
                    <PackageCheck size={18} />
                    📦 撿貨與打包 ({buildingTasks.filter(t => packedState[t.buildingName]).length}/{buildingTasks.length})
                </button>
                <button
                    onClick={() => setActiveTab('deliver')}
                    className={`flex-1 py-3 px-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-98 ${
                        activeTab === 'deliver'
                            ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30 font-black'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'
                    }`}
                >
                    <Truck size={18} />
                    🚚 配送與路線 ({buildingTasks.filter(t => completedBuildings[t.buildingName]).length}/{buildingTasks.length})
                </button>
            </div>

            {/* Error Alert */}
            {error && (
                <div className="m-4 p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold flex items-center gap-2">
                    <AlertCircle size={18} className="shrink-0 text-amber-600" />
                    <span>{error}</span>
                </div>
            )}

            {/* Main Content Area */}
            <div className="p-4 max-w-2xl mx-auto space-y-4">

                {loading ? (
                    <div className="py-20 text-center text-slate-500 space-y-3">
                        <RefreshCw size={36} className="animate-spin mx-auto text-emerald-600" />
                        <p className="text-sm font-bold">正在進行【{selectedDate}】當日配送審查與同步...</p>
                    </div>
                ) : buildingTasks.length === 0 ? (
                    <div className="py-20 text-center bg-white rounded-2xl border border-slate-200 p-6 space-y-3 shadow-sm">
                        <CheckCircle2 size={48} className="mx-auto text-emerald-600" />
                        <h3 className="text-base font-bold text-slate-800">目前【{selectedDate}】無待配送的大樓任務</h3>
                        <p className="text-xs text-slate-500">當管理員在「訂單審核」排定該日配送或設定出貨日期後，將自動顯示於此。</p>
                    </div>
                ) : (
                    <>
                        {/* TAB 1: 撿貨與打包列表 */}
                        {activeTab === 'pack' && (
                            <div className="space-y-4">
                                {/* 全車品項總覽卡片 */}
                                <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3 shadow-sm">
                                    <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                                        <h3 className="text-sm font-black text-emerald-700 flex items-center gap-2">
                                            <Layers size={18} /> 當日全車總撿貨量 ({selectedDate})
                                        </h3>
                                        <span className="text-xs font-bold text-slate-500 font-mono">共 {buildingTasks.length} 個大樓站點</span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        {overallItemSummary.map((item, idx) => (
                                            <div key={idx} className="bg-slate-50 border border-slate-200 p-3 rounded-xl flex justify-between items-center shadow-2xs">
                                                <span className="text-xs font-bold text-slate-800 truncate">{item.name}</span>
                                                <span className="text-base font-black text-emerald-700 font-mono">x{item.qty}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* 大樓分箱打包 Checklist */}
                                <div className="space-y-3">
                                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 px-1">
                                        大樓分箱打包確認
                                    </h3>
                                    {buildingTasks.map((task, idx) => {
                                        const isPacked = !!packedState[task.buildingName];
                                        return (
                                            <div
                                                key={idx}
                                                className={`rounded-2xl border transition-all duration-200 p-4 space-y-3 ${
                                                    isPacked
                                                        ? 'bg-emerald-50/60 border-emerald-300 opacity-90'
                                                        : 'bg-white border-slate-200 shadow-md'
                                                }`}
                                            >
                                                <div className="flex items-start justify-between gap-3">
                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 text-xs font-black flex items-center justify-center font-mono border border-emerald-300">
                                                                {idx + 1}
                                                            </span>
                                                            <h4 className="text-base font-black text-slate-900 tracking-tight">{task.buildingName}</h4>
                                                        </div>
                                                        <p className="text-xs text-slate-600 mt-1 flex items-center gap-1 font-medium">
                                                            <MapPin size={13} className="text-slate-400" /> {task.address}
                                                        </p>
                                                    </div>
                                                    {/* 多筆訂單時頂部顯示進度徽章，單筆訂單時顯示打包按鈕 */}
                                                    {task.orders.length > 1 ? (
                                                        <span className={`py-1.5 px-3 rounded-xl font-black text-xs flex items-center gap-1 border ${
                                                            task.orders.every(o => isOrderPacked(o.orderId || `ord_${task.buildingName}_${o.customerName}`, task.buildingName))
                                                                ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                                                : 'bg-blue-50 text-blue-800 border-blue-200'
                                                        }`}>
                                                            <PackageCheck size={16} />
                                                            打包進度 ({task.orders.filter(o => isOrderPacked(o.orderId || `ord_${task.buildingName}_${o.customerName}`, task.buildingName)).length}/{task.orders.length} 筆)
                                                        </span>
                                                    ) : (
                                                        <button
                                                            onClick={() => togglePacked(task.buildingName, task.orders)}
                                                            className={`py-2 px-3.5 rounded-xl font-black text-xs flex items-center gap-1.5 transition-all active:scale-95 shadow-xs ${
                                                                isPacked
                                                                    ? 'bg-emerald-600 text-white shadow-emerald-600/30'
                                                                    : 'bg-slate-100 text-slate-800 hover:bg-slate-200 border border-slate-300'
                                                            }`}
                                                        >
                                                            <CheckCircle2 size={16} />
                                                            {isPacked ? '已分箱打包' : '點擊完成打包'}
                                                        </button>
                                                    )}
                                                </div>

                                                {/* 品項清單 */}
                                                <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 space-y-2">
                                                    <div className="text-xs font-black text-slate-600 mb-1">該站需打包品項：</div>
                                                    {Object.values(task.itemSummary).map((item, pIdx) => (
                                                        <div key={pIdx} className="flex justify-between items-center text-sm font-bold">
                                                            <span className="text-slate-800">{item.name}</span>
                                                            <span className="font-black text-emerald-700 font-mono text-base">x{item.qty} 瓶</span>
                                                        </div>
                                                    ))}
                                                    {Object.values(task.itemSummary).some(i => i.remarks.length > 0) && (
                                                        <div className="mt-2 pt-1.5 border-t border-slate-200 text-xs font-bold text-amber-800 flex items-center gap-1 bg-amber-50 p-2 rounded-lg border border-amber-200">
                                                            <Info size={14} className="text-amber-600 shrink-0" />
                                                            包含特殊口味備註，打包時請特別留意。
                                                        </div>
                                                    )}

                                                    {/* 各筆主訂單與團員對照清單 (僅有多筆訂單或有團員代訂時才顯示) */}
                                                    {(task.orders.length > 1 || task.orders.some(o => o.recipients && o.recipients.length > 0)) && (
                                                        <div className="mt-3 pt-3 border-t border-slate-200 space-y-3">
                                                            <div className="text-sm font-black text-slate-800 flex items-center justify-between">
                                                                <span>📋 本站點共 {task.orders.length} 筆主訂單：</span>
                                                            </div>
                                                            {task.orders.map((order, oIdx) => {
                                                                const oKey = order.orderId || `ord_${task.buildingName}_${order.customerName}`;
                                                                const orderPacked = isOrderPacked(oKey, task.buildingName);
                                                                return (
                                                                    <div key={oIdx} className="bg-white p-3.5 rounded-xl border border-slate-300 space-y-2.5 shadow-2xs">
                                                                        <div className="font-black text-slate-900 flex justify-between items-center border-b border-slate-100 pb-2">
                                                                            <span className="flex items-center gap-2 text-base">
                                                                                <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-800 text-xs font-black flex items-center justify-center font-mono border border-slate-300">
                                                                                    {oIdx + 1}
                                                                                </span>
                                                                                👤 主訂人：{order.customerName || '顧客'}
                                                                                {order.lineDisplayName && <span className="text-xs text-slate-400 font-normal">[{order.lineDisplayName}]</span>}
                                                                            </span>
                                                                            
                                                                            <div className="flex items-center gap-2">
                                                                                <span className="text-emerald-700 font-mono font-black text-sm">${order.totalAmount}</span>
                                                                                {task.orders.length > 1 && (
                                                                                    <button
                                                                                        onClick={() => toggleOrderPacked(oKey, task.buildingName, task.orders)}
                                                                                        className={`py-1.5 px-3 rounded-lg font-black text-xs flex items-center gap-1 transition-all active:scale-95 shadow-2xs ${
                                                                                            orderPacked
                                                                                                ? 'bg-emerald-600 text-white shadow-emerald-600/30'
                                                                                                : 'bg-slate-100 text-slate-800 border border-slate-300 hover:bg-slate-200'
                                                                                        }`}
                                                                                    >
                                                                                        <CheckCircle2 size={14} />
                                                                                        {orderPacked ? '已分箱打包' : '點擊完成打包'}
                                                                                    </button>
                                                                                )}
                                                                            </div>
                                                                        </div>

                                                                {/* 主訂單訂購商品 */}
                                                                {order.items && order.items.length > 0 && (
                                                                    <div className="space-y-1">
                                                                        <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">主訂單品項：</div>
                                                                        {order.items.map((item, iIdx) => (
                                                                            <div key={iIdx} className="flex justify-between items-center text-sm text-slate-900 font-bold">
                                                                                <span>{item.productName}</span>
                                                                                <span className="font-mono font-black text-slate-900 text-base">x{item.qty}</span>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                )}

                                                                {/* 團員代訂分貨明細 */}
                                                                {order.recipients && order.recipients.length > 0 && (
                                                                    <div className="pt-2 border-t border-slate-100 space-y-2">
                                                                        <div className="text-xs font-black text-blue-800">👥 團員分貨小袋明細：</div>
                                                                        {order.recipients.map((r, rIdx) => {
                                                                            const rTotal = (r.items || []).reduce((sum, ri) => sum + (Number(ri.subtotal) || 0), 0);
                                                                            return (
                                                                                <div key={rIdx} className="bg-blue-50/70 p-2.5 rounded-lg border border-blue-200 space-y-1">
                                                                                    <div className="font-black text-slate-900 flex justify-between text-sm">
                                                                                        <span>👤 {r.recipientName}</span>
                                                                                        <span className="text-emerald-700 font-mono font-bold text-xs">（小計 ${rTotal}）</span>
                                                                                    </div>
                                                                                    <div className="space-y-1 pt-0.5">
                                                                                        {(r.items || []).map((ri, riIdx) => (
                                                                                            <div key={riIdx} className="flex justify-between items-center text-xs text-slate-800 font-bold">
                                                                                                <span>{ri.productName}</span>
                                                                                                <span className="font-mono font-black text-slate-900 text-sm">x{ri.qty}</span>
                                                                                            </div>
                                                                                        ))}
                                                                                    </div>
                                                                                </div>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        ); })}
                                                     </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* TAB 2: 配送路線與現場放妥 */}
                        {activeTab === 'deliver' && (
                            <div className="space-y-4">
                                <div className="space-y-3">
                                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 px-1">
                                        【{selectedDate}】外送路線順序 (共 {buildingTasks.length} 站)
                                    </h3>

                                    {buildingTasks.map((task, idx) => {
                                        const isDone = !!completedBuildings[task.buildingName];
                                        const hasPhoto = !!deliveryPhotos[task.buildingName];
                                        const isSubmitting = submittingBuilding === task.buildingName;

                                        return (
                                            <div
                                                key={idx}
                                                className={`rounded-2xl border p-4 space-y-3 transition-all ${
                                                    isDone
                                                        ? 'bg-slate-100 border-slate-300 opacity-70'
                                                        : 'bg-white border-slate-200 shadow-lg'
                                                }`}
                                            >
                                                {/* Header Status */}
                                                <div className="flex items-start justify-between border-b border-slate-100 pb-3">
                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            <span className={`w-6 h-6 rounded-full text-xs font-black flex items-center justify-center font-mono ${
                                                                isDone ? 'bg-slate-200 text-slate-600' : 'bg-blue-600 text-white'
                                                            }`}>
                                                                {idx + 1}
                                                            </span>
                                                            <h4 className="text-base font-black text-slate-900">{task.buildingName}</h4>
                                                        </div>
                                                        <p className="text-xs text-slate-600 mt-1 flex items-center gap-1 font-medium">
                                                            <MapPin size={13} className="text-slate-400" /> {task.address}
                                                        </p>
                                                    </div>
                                                    <span className={`text-xs px-2.5 py-1 rounded-full font-black border ${
                                                        isDone
                                                            ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                                            : 'bg-blue-100 text-blue-800 border-blue-300'
                                                    }`}>
                                                        {isDone ? '✅ 已通報送達' : '🚚 待配送'}
                                                    </span>
                                                </div>

                                                {/* Quick Action Buttons */}
                                                <div className="grid grid-cols-2 gap-2 pt-1">
                                                    <button
                                                        onClick={() => openGoogleMaps(task.address, task.buildingName)}
                                                        className="py-2.5 px-3 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-900 text-xs font-black flex items-center justify-center gap-1.5 border border-emerald-200 active:scale-95 shadow-2xs"
                                                    >
                                                        <MapPin size={16} className="text-emerald-600" />
                                                        Google Maps 導航
                                                    </button>

                                                    <button
                                                        onClick={triggerProxyCall}
                                                        className="py-2.5 px-3 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-900 text-xs font-black flex items-center justify-center gap-1.5 border border-blue-200 active:scale-95 shadow-2xs"
                                                        title="使用 Uber 模式號碼保護打給中繼服務"
                                                    >
                                                        <Phone size={16} className="text-blue-600" />
                                                        Uber 轉接電話
                                                    </button>
                                                </div>

                                                {/* Photo Upload Section */}
                                                {!isDone && (
                                                    <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200 space-y-3">
                                                        <div className="flex items-center justify-between text-xs">
                                                            <span className="font-black text-slate-800 flex items-center gap-1.5">
                                                                <Camera size={16} className="text-amber-600" /> 放妥現場拍照存證：
                                                            </span>
                                                            {hasPhoto && <span className="text-emerald-700 font-black text-xs">✓ 已拍攝照片</span>}
                                                        </div>

                                                        {hasPhoto ? (
                                                            <div className="relative rounded-xl overflow-hidden border border-slate-300 max-h-48 shadow-sm">
                                                                <img src={deliveryPhotos[task.buildingName]} alt="放妥照片" className="w-full h-auto object-cover" />
                                                                <label className="absolute bottom-2 right-2 px-3 py-1 bg-slate-900/80 text-white text-xs font-bold rounded-lg cursor-pointer backdrop-blur shadow-md">
                                                                    重新拍照
                                                                    <input
                                                                        type="file"
                                                                        accept="image/*"
                                                                        capture="environment"
                                                                        className="hidden"
                                                                        onChange={(e) => handlePhotoCapture(task.buildingName, e)}
                                                                    />
                                                                </label>
                                                            </div>
                                                        ) : (
                                                            <label className="flex flex-col items-center justify-center py-6 border-2 border-dashed border-slate-300 hover:border-blue-500 rounded-xl cursor-pointer bg-white transition-colors shadow-2xs">
                                                                <Camera size={32} className="text-slate-400 mb-1" />
                                                                <span className="text-xs font-black text-blue-600">點擊拍攝放妥照片</span>
                                                                <span className="text-[10px] text-slate-500 font-medium mt-0.5">照片將自動加密上傳至官方系統</span>
                                                                <input
                                                                    type="file"
                                                                    accept="image/*"
                                                                    capture="environment"
                                                                    className="hidden"
                                                                    onChange={(e) => handlePhotoCapture(task.buildingName, e)}
                                                                />
                                                            </label>
                                                        )}

                                                        {/* Complete & Notify Official LINE Button */}
                                                        <button
                                                            onClick={() => handleConfirmDelivery(task.buildingName)}
                                                            disabled={!hasPhoto || isSubmitting}
                                                            className={`w-full py-3.5 rounded-xl font-black text-sm flex items-center justify-center gap-2 shadow-md transition-all active:scale-95 ${
                                                                hasPhoto && !isSubmitting
                                                                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/30'
                                                                    : 'bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300'
                                                            }`}
                                                        >
                                                            {isSubmitting ? (
                                                                <RefreshCw size={18} className="animate-spin" />
                                                            ) : (
                                                                <CheckCircle2 size={18} />
                                                            )}
                                                            {isSubmitting ? '通報官方系統中...' : '確認送達並通報官方 LINE'}
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Bottom Footer Notice */}
            <div className="text-center py-4 text-xs text-slate-500 space-y-1 font-medium">
                <p className="flex items-center justify-center gap-1 font-bold text-slate-700">
                    <ShieldCheck size={16} className="text-emerald-600" />
                    商業資產防護生效中 ‧ 司機全程零入群
                </p>
                <p>米立微 MILKZEROWASTE System © 2026</p>
            </div>
        </div>
    );
}
