import React, { useState, useEffect } from 'react';
import {
    MapPin, CheckCircle2, ShieldCheck, Clock, PackageCheck, AlertCircle,
    UserCheck, ChevronRight, RefreshCw, Lock, Unlock, ShoppingBag, EyeOff, Eye
} from 'lucide-react';
import { callApi } from '../utils/api';
import { safeLocalStorage } from '../utils/storage';

export default function DeliveryBoardPage({ apiUrl, buildingName: propBuilding, token }) {
    const [buildingData, setBuildingData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [pickedUpState, setPickedUpState] = useState({}); // { key: boolean }
    const [unlockedState, setUnlockedState] = useState({}); // { key: boolean }
    const [pinInput, setPinInput] = useState({}); // { key: string }
    const [selectedPhoto, setSelectedPhoto] = useState(null);

    // 解析網址參數 (building or token)
    const params = new URLSearchParams(window.location.search);
    const targetBuilding = propBuilding || params.get('building') || params.get('b') || '柳營奇美醫院';

    const fetchBoardData = async () => {
        setLoading(true);
        setError(null);
        try {
            const apiTarget = apiUrl || (typeof window !== 'undefined' && window.GAS_API_URL) || '/api';
            const res = await callApi(apiTarget, 'getDeliveryBoardData', { buildingName: targetBuilding, token }).catch(() => null);

            if (res && res.success && res.building) {
                setBuildingData(res.building);
            } else {
                // 從相應近期的待處理訂單模擬建構大樓資料
                const cachedOrders = safeLocalStorage.getItem('pending_orders');
                let allOrders = cachedOrders ? JSON.parse(cachedOrders) : [];
                
                const filtered = allOrders.filter(o => {
                    const bStr = String(o.groupName || o.buildingName || o.sourceGroup || o.deliveryAddress || '');
                    return bStr.includes(targetBuilding) || targetBuilding.includes(bStr) || targetBuilding === '全部';
                });
                
                const photo = safeLocalStorage.getItem(`photo_${targetBuilding}`) || null;

                setBuildingData({
                    buildingName: targetBuilding,
                    address: filtered[0]?.deliveryAddress || targetBuilding,
                    deliveredAt: new Date().toLocaleString('zh-TW'),
                    photoBase64: photo,
                    orders: filtered
                });
            }

            // 讀取個人領取與解鎖快取
            const localPicked = safeLocalStorage.getItem(`picked_up_${targetBuilding}`);
            if (localPicked) setPickedUpState(JSON.parse(localPicked));

            const localUnlocked = safeLocalStorage.getItem(`unlocked_${targetBuilding}`);
            if (localUnlocked) setUnlockedState(JSON.parse(localUnlocked));

        } catch (err) {
            console.error('[DeliveryBoard] Fetch error:', err);
            setError('暫時無法載入當前領貨看板，請稍後重試。');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchBoardData();
    }, [targetBuilding]);

    // 姓名去識別化防護遮蔽 (如：許涵茵 -> 許○茵)
    const maskName = (name) => {
        if (!name) return '顧客';
        const str = String(name).trim();
        if (str.length <= 1) return str;
        if (str.length === 2) return str[0] + '○';
        return str[0] + '○' + str.slice(2);
    };

    // 多重智慧驗證解鎖 (支援：團員自己手機末3碼 / 主訂人手機末3碼 / 團員自己姓名末字)
    const handleVerifyPin = (key, phoneNum, recipientName, mainPhoneNum) => {
        const inputVal = (pinInput[key] || '').trim();
        if (!inputVal) {
            alert('請輸入解鎖驗證碼（電話末3碼或您的姓名末字）');
            return;
        }

        const phone1 = String(phoneNum || '').replace(/\D/g, '').slice(-3);
        const phone2 = String(mainPhoneNum || '').replace(/\D/g, '').slice(-3);
        const nameStr = String(recipientName || '').trim();

        const matchPhone1 = phone1 && inputVal === phone1;
        const matchPhone2 = phone2 && inputVal === phone2;
        const matchName = nameStr && (nameStr.endsWith(inputVal) || inputVal === nameStr.slice(-1));

        if (!matchPhone1 && !matchPhone2 && !matchName) {
            alert(`❌ 驗證不相符 (您輸入: ${inputVal})\n請輸入您的手機末3碼、主訂人電話末3碼、或您姓名的最後一個字。`);
            return;
        }

        // 解鎖成功 (只在本機快取解鎖明細)
        const nextUnlocked = { ...unlockedState, [key]: true };
        setUnlockedState(nextUnlocked);
        safeLocalStorage.setItem(`unlocked_${targetBuilding}`, JSON.stringify(nextUnlocked));
    };

    // 點擊我已領取
    const togglePickedUp = (key) => {
        const next = { ...pickedUpState, [key]: !pickedUpState[key] };
        setPickedUpState(next);
        safeLocalStorage.setItem(`picked_up_${targetBuilding}`, JSON.stringify(next));
    };

    return (
        <div className="min-h-screen bg-slate-100 text-slate-900 pb-20 font-sans">
            {/* Header Banner - 鮮明綠色標頭 */}
            <div className="bg-gradient-to-r from-emerald-600 to-teal-700 text-white px-4 py-5 shadow-md">
                <div className="max-w-xl mx-auto space-y-2">
                    <div className="flex items-center justify-between">
                        <span className="text-[11px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-white/20 backdrop-blur border border-white/30 text-white">
                            米立微 鮮乳團購 ‧ 領貨實時看板
                        </span>
                        <button onClick={fetchBoardData} className="p-1.5 text-white/90 hover:text-white bg-white/10 rounded-lg active:scale-95 transition-all">
                            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                        </button>
                    </div>
                    <h1 className="text-xl font-black tracking-tight text-white flex items-center gap-2">
                        📍 {buildingData?.buildingName || targetBuilding}
                    </h1>
                    <p className="text-xs text-emerald-100 flex items-center gap-1.5 font-bold">
                        <MapPin size={14} /> {buildingData?.address || '自取點櫃檯'}
                    </p>
                </div>
            </div>

            <div className="max-w-xl mx-auto p-4 space-y-4">
                {/* 隱私聲明卡片 */}
                <div className="bg-emerald-50 border border-emerald-300 rounded-2xl p-3.5 text-xs text-emerald-900 font-bold flex items-center gap-2.5 shadow-2xs">
                    <ShieldCheck size={22} className="shrink-0 text-emerald-600" />
                    <span>本看板防護生效中：明細預設隱藏。團員請輸入電話末3碼或自己「姓名末字」解鎖明細與劃記。</span>
                </div>

                {loading ? (
                    <div className="py-16 text-center space-y-3 text-slate-500 font-bold">
                        <RefreshCw size={36} className="animate-spin mx-auto text-emerald-600" />
                        <p className="text-sm">正在為您載入今日領貨看板...</p>
                    </div>
                ) : !buildingData || !buildingData.orders || buildingData.orders.length === 0 ? (
                    <div className="py-16 text-center bg-white rounded-2xl border border-slate-200 p-6 space-y-3 shadow-sm">
                        <AlertCircle size={44} className="mx-auto text-amber-500" />
                        <h3 className="text-base font-black text-slate-800">目前無此大樓之待領取訂單</h3>
                        <p className="text-xs text-slate-500 font-medium">請確認大樓名稱是否正確，或聯繫管理員或客服詢問。</p>
                    </div>
                ) : (
                    <>
                        {/* 司機放妥實景照片卡片 */}
                        {buildingData.photoBase64 && (
                            <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-2.5 shadow-sm">
                                <h3 className="text-xs font-black text-slate-600 uppercase tracking-wider flex items-center justify-between">
                                    <span>📸 司機現場放妥照片存證</span>
                                    <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">司機已放妥自取點</span>
                                </h3>
                                <div className="relative rounded-xl overflow-hidden cursor-pointer group border border-slate-200" onClick={() => setSelectedPhoto(buildingData.photoBase64)}>
                                    <img src={buildingData.photoBase64} alt="放妥照片" className="w-full h-48 object-cover group-hover:scale-105 transition-transform duration-300" />
                                    <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                        <span className="bg-slate-900/90 text-white text-xs px-3 py-1.5 rounded-full font-bold shadow-md">點擊放大觀看現場放置處</span>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* 團員訂單對帳清單 */}
                        <div className="space-y-3">
                            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 px-1">
                                👥 團員領貨對帳與劃記 (共 {buildingData.orders.length} 筆主訂單)
                            </h3>

                            {buildingData.orders.map((order, oIdx) => {
                                const mainKey = `ord_${order.orderId || oIdx}`;
                                const isMainUnlocked = !!unlockedState[mainKey];
                                const isMainPicked = !!pickedUpState[mainKey];

                                return (
                                    <div key={oIdx} className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3 shadow-md">
                                        {/* 訂單標頭 */}
                                        <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                                            <div className="flex items-center gap-2">
                                                <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 text-xs font-black flex items-center justify-center font-mono border border-emerald-200">
                                                    {oIdx + 1}
                                                </span>
                                                <div>
                                                    <h4 className="text-base font-black text-slate-900 flex items-center gap-1.5">
                                                        👤 {maskName(order.customerName)}
                                                        {order.lineDisplayName && <span className="text-xs font-bold text-slate-400">[{order.lineDisplayName}]</span>}
                                                    </h4>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2">
                                                <span className="text-base font-black text-emerald-700 font-mono">
                                                    ${order.totalAmount}
                                                </span>
                                                {/* 若該主訂單無個別團員分配，主訂人亦需解鎖後點選劃記 */}
                                                {(!order.recipients || order.recipients.length === 0) && (
                                                    isMainUnlocked ? (
                                                        <button
                                                            onClick={() => togglePickedUp(mainKey)}
                                                            className={`px-3 py-1 rounded-lg text-xs font-black flex items-center gap-1 transition-all active:scale-95 shadow-2xs ${
                                                                isMainPicked
                                                                    ? 'bg-emerald-600 text-white shadow-emerald-600/30'
                                                                    : 'bg-white text-slate-800 border border-slate-300 hover:bg-slate-100'
                                                            }`}
                                                        >
                                                            <CheckCircle2 size={14} />
                                                            {isMainPicked ? '已領取' : '我已領取'}
                                                        </button>
                                                    ) : null
                                                )}
                                            </div>
                                        </div>

                                        {/* 無團員時，主訂單品項解鎖輸入與展示 */}
                                        {(!order.recipients || order.recipients.length === 0) && (
                                            <div className="space-y-2">
                                                {isMainUnlocked ? (
                                                    <div className="bg-slate-50 rounded-xl p-3 space-y-1.5 border border-slate-200">
                                                        <div className="text-xs font-bold text-slate-500 mb-1">📦 訂購明細：</div>
                                                        {(order.items || []).map((item, iIdx) => (
                                                            <div key={iIdx} className="flex justify-between items-center text-xs text-slate-800 font-bold">
                                                                <span>{item.productName}</span>
                                                                <span className="font-black font-mono text-slate-900">x{item.qty}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center justify-between bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-xs">
                                                        <div className="flex items-center gap-1.5 text-slate-600 font-bold">
                                                            <EyeOff size={15} className="text-slate-400" />
                                                            <span>明細已隱藏，請解鎖：</span>
                                                        </div>
                                                        <div className="flex items-center gap-1.5">
                                                            <input
                                                                type="text"
                                                                placeholder="末3碼/末字"
                                                                value={pinInput[mainKey] || ''}
                                                                onChange={(e) => setPinInput({ ...pinInput, [mainKey]: e.target.value })}
                                                                className="w-20 px-2 py-1 text-xs font-black border border-slate-300 rounded text-center bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                                            />
                                                            <button
                                                                onClick={() => handleVerifyPin(mainKey, order.phone || order.customerPhone, order.customerName, order.phone)}
                                                                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-black active:scale-95 shadow-2xs"
                                                            >
                                                                解鎖
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* 團員代訂分配細項 */}
                                        {order.recipients && order.recipients.length > 0 && (
                                            <div className="space-y-2 pt-2 border-t border-slate-100">
                                                <div className="text-xs font-bold text-slate-600 flex items-center gap-1">
                                                    <UserCheck size={14} className="text-blue-600" />
                                                    👥 團員代訂分配明細 (輸入電話末3碼或自己姓名末字解鎖)：
                                                </div>
                                                <div className="space-y-2">
                                                    {order.recipients.map((r, rIdx) => {
                                                        const pKey = `${order.orderId || oIdx}_r_${rIdx}`;
                                                        const isUnlocked = !!unlockedState[pKey];
                                                        const isPicked = !!pickedUpState[pKey];
                                                        const rTotal = (r.items || []).reduce((sum, ri) => sum + (Number(ri.subtotal) || 0), 0);

                                                        return (
                                                            <div
                                                                key={rIdx}
                                                                className={`p-3 rounded-xl border transition-all space-y-2 ${
                                                                    isPicked
                                                                        ? 'bg-emerald-50/90 border-emerald-300 opacity-90'
                                                                        : 'bg-slate-50 border-slate-200'
                                                                }`}
                                                            >
                                                                <div className="flex items-center justify-between">
                                                                    <span className="text-sm font-black text-slate-900 flex items-center gap-1.5">
                                                                        👤 {maskName(r.recipientName)}
                                                                        <span className="text-emerald-700 font-mono text-xs">（小計 ${rTotal}）</span>
                                                                    </span>

                                                                    {isUnlocked ? (
                                                                        <button
                                                                            onClick={() => togglePickedUp(pKey)}
                                                                            className={`px-3.5 py-1.5 rounded-lg text-xs font-black flex items-center gap-1 transition-all active:scale-95 shadow-2xs ${
                                                                                isPicked
                                                                                    ? 'bg-emerald-600 text-white shadow-emerald-600/30'
                                                                                    : 'bg-white text-slate-800 border border-slate-300 shadow-xs hover:bg-slate-100'
                                                                            }`}
                                                                        >
                                                                            <CheckCircle2 size={14} />
                                                                            {isPicked ? '已領取' : '我已領取'}
                                                                        </button>
                                                                    ) : (
                                                                        <span className="text-[11px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 flex items-center gap-1">
                                                                            <Lock size={12} /> 未驗證
                                                                        </span>
                                                                    )}
                                                                </div>

                                                                {/* 判定解鎖狀態：已解鎖才展示明細，未解鎖顯示驗證輸入框 */}
                                                                {isUnlocked ? (
                                                                    <div className="space-y-1 pl-3 border-l-2 border-emerald-500 pt-1">
                                                                        {(r.items || []).map((ri, riIdx) => (
                                                                            <div key={riIdx} className="flex justify-between text-xs text-slate-800 font-bold">
                                                                                <span>{ri.productName}</span>
                                                                                <span className="font-mono font-black text-slate-900">x{ri.qty} = ${ri.subtotal || 0}</span>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                ) : (
                                                                    <div className="flex items-center justify-between bg-white p-2 rounded-lg border border-slate-200 shadow-2xs">
                                                                        <div className="flex items-center gap-1.5 text-slate-600 text-xs font-bold">
                                                                            <Lock size={13} className="text-slate-400 shrink-0" />
                                                                            <span>解鎖輸入末3碼/名字末字：</span>
                                                                        </div>
                                                                        <div className="flex items-center gap-1.5">
                                                                            <input
                                                                                type="text"
                                                                                placeholder="末3碼/末字"
                                                                                value={pinInput[pKey] || ''}
                                                                                onChange={(e) => setPinInput({ ...pinInput, [pKey]: e.target.value })}
                                                                                className="w-20 px-2 py-1 text-xs font-black border border-slate-300 rounded text-center focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                                                            />
                                                                            <button
                                                                                onClick={() => handleVerifyPin(pKey, r.phone, r.recipientName, order.phone || order.customerPhone)}
                                                                                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-black shrink-0 active:scale-95 shadow-2xs"
                                                                            >
                                                                                解鎖
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </>
                )}
            </div>

            {/* Modal: 放大看照片 */}
            {selectedPhoto && (
                <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4" onClick={() => setSelectedPhoto(null)}>
                    <div className="relative max-w-2xl w-full space-y-3">
                        <img src={selectedPhoto} alt="放妥照片放大" className="w-full max-h-[80vh] object-contain rounded-xl shadow-2xl" />
                        <div className="text-center text-white text-xs font-bold">點擊任意處關閉照片</div>
                    </div>
                </div>
            )}
        </div>
    );
}
