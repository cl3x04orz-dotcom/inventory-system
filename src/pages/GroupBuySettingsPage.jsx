import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link, Calendar, Clock, Copy, Save, Plus, Check, RefreshCw, Truck, Edit2, Trash2, ChevronUp, ChevronDown, StickyNote, Eye, EyeOff, Search, LayoutGrid, List, Gift, Sparkles, User, ShieldCheck, AlertTriangle } from 'lucide-react';
import { callGAS } from '../utils/api';
import { copyToClipboard } from '../utils/clipboard';

export default function GroupBuySettingsPage({ user, apiUrl }) {
    const [activeTab, setActiveTab] = useState('SCHEDULE'); // SCHEDULE | PROMOTION_LINK | PRICING_SHIPPING | DELIVERY_ZONES
    const [settings, setSettings] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selectedBuilding, setSelectedBuilding] = useState('');
    const [isAddingNew, setIsAddingNew] = useState(false);
    const [newBuildingName, setNewBuildingName] = useState('');
    const [buildingSearchTerm, setBuildingSearchTerm] = useState(''); // 大樓搜尋關鍵字
    const [deliveryAreaSearchTerm, setDeliveryAreaSearchTerm] = useState(''); // 散客外送區域搜尋關鍵字
    const [deliveryAreaViewMode, setDeliveryAreaViewMode] = useState('grid'); // 外送區域顯示模式 (grid/table)
    const [productSearchTerm, setProductSearchTerm] = useState(''); // 專屬定價商品搜尋關鍵字

    // 滿額折抵設定 state
    const [rewardMode, setRewardMode] = useState('OFF'); // OFF | TEST | ON
    const [rewardTestUserIds, setRewardTestUserIds] = useState('');
    const [rewardTierRules, setRewardTierRules] = useState([
        { spendMin: 5000, discount: 150 },
        { spendMin: 10000, discount: 350 },
        { spendMin: 15000, discount: 600 }
    ]);
    const [rewardLoading, setRewardLoading] = useState(false);
    const [rewardSaving, setRewardSaving] = useState(false);

    const fetchRewardConfig = useCallback(async () => {
        setRewardLoading(true);
        try {
            const res = await callGAS(apiUrl, 'getRewardConfig', {}, user?.token);
            if (res && res.success && res.config) {
                setRewardMode(res.config.mode || 'OFF');
                setRewardTestUserIds((res.config.testUserIds || []).join(', '));
                if (Array.isArray(res.config.tierRules) && res.config.tierRules.length > 0) {
                    setRewardTierRules(res.config.tierRules);
                }
            }
        } catch (e) {
            console.error('Failed to fetch reward config:', e);
        } finally {
            setRewardLoading(false);
        }
    }, [apiUrl, user]);
    
    // 隱藏/顯示大樓控制狀態 (持久化儲存在 localStorage)
    const [hiddenBuildings, setHiddenBuildings] = useState(() => {
        try {
            const saved = localStorage.getItem('admin_hidden_buildings');
            return saved ? JSON.parse(saved) : [];
        } catch (e) {
            return [];
        }
    });
    const [showHidden, setShowHidden] = useState(false); // 是否在列表中顯示已隱藏的項目

    const toggleHideBuilding = (bname) => {
        setHiddenBuildings(prev => {
            const next = prev.includes(bname) 
                ? prev.filter(b => b !== bname) 
                : [...prev, bname];
            localStorage.setItem('admin_hidden_buildings', JSON.stringify(next));
            return next;
        });
    };

    const hideAllDistricts = () => {
        const districtNames = settings
            .map(s => s.building)
            .filter(b => (b.startsWith('台南市') || b.startsWith('高雄市')) && b.endsWith('區'));
        
        setHiddenBuildings(prev => {
            const set = new Set([...prev, ...districtNames]);
            const next = Array.from(set);
            localStorage.setItem('admin_hidden_buildings', JSON.stringify(next));
            return next;
        });
    };

    // ── LINE 群組發文文案範本 state (依大樓個別記憶) ──────────────────
    const [customTemplates, setCustomTemplates] = useState(() => {
        try {
            const saved = localStorage.getItem('admin_line_templates');
            return saved ? JSON.parse(saved) : {};
        } catch (e) {
            return {};
        }
    });
    const [templateInputText, setTemplateInputText] = useState('');
    const templateTextareaRef = useRef(null);

    const insertTagAtCursor = (tag) => {
        const textarea = templateTextareaRef.current;
        if (!textarea) {
            setTemplateInputText(prev => prev + tag);
            return;
        }

        const start = textarea.selectionStart ?? templateInputText.length;
        const end = textarea.selectionEnd ?? templateInputText.length;

        const newText = templateInputText.substring(0, start) + tag + templateInputText.substring(end);
        setTemplateInputText(newText);

        setTimeout(() => {
            textarea.focus();
            textarea.setSelectionRange(start + tag.length, start + tag.length);
        }, 0);
    };

    const getDefaultTemplate = useCallback((bName, url) => {
        return `📢【${bName || '大樓名稱'}】本週團購開跑囉！🎉\n\n各位住戶鄰居大家好，本週團購專屬下單連結已開放：\n👉 點擊下單：${url || ''}\n\n🚚 預計配送時間：請依結單提示為準\n小提醒：下單後可直接選擇付款方式，有任何問題隨時在群組詢問小編喔！❤️`;
    }, []);

    const handleSaveTemplate = (bName, newText) => {
        if (!bName) return;
        setCustomTemplates(prev => {
            const next = { ...prev, [bName]: newText };
            localStorage.setItem('admin_line_templates', JSON.stringify(next));
            return next;
        });
        alert(`✅ 已成功儲存【${bName}】專屬 LINE 發文文案範本！`);
    };

    const handleResetTemplate = (bName) => {
        if (!bName) return;
        setCustomTemplates(prev => {
            const next = { ...prev };
            delete next[bName];
            localStorage.setItem('admin_line_templates', JSON.stringify(next));
            return next;
        });
        alert(`已重設【${bName}】的文案為預設範本。`);
    };

    // HTML5 date / time state
    const [startDate, setStartDate] = useState('');
    const [startTime, setStartTime] = useState('');
    const [endDate, setEndDate] = useState('');
    const [endTime, setEndTime] = useState('');
    
    // 自動開關團狀態
    const [isAuto, setIsAuto] = useState(false);
    const [autoOpenDay, setAutoOpenDay] = useState('');
    const [autoOpenTime, setAutoOpenTime] = useState('');
    const [autoCloseDay, setAutoCloseDay] = useState('');
    const [autoCloseTime, setAutoCloseTime] = useState('');
    
    const [isSaving, setIsSaving] = useState(false);
    const [copied, setCopied] = useState(false);
    const [adminNote, setAdminNote] = useState('');

    // 運費設定 state
    const [isFreeShipping, setIsFreeShipping] = useState(false);
    const [freeShippingMin, setFreeShippingMin] = useState('');
    const [shippingFee, setShippingFee] = useState('');
    const [isSavingShipping, setIsSavingShipping] = useState(false);

    // ── 外送區域管理 (散客專用) 狀態 ───────────────────────────────
    const [communities, setCommunities] = useState([]);
    const [loadingCommunities, setLoadingCommunities] = useState(false);
    const [isSavingArea, setIsSavingArea] = useState(false);
    const [editingAreaId, setEditingAreaId] = useState(''); // 空字串代表新增模式，有值代表編輯模式
    const [areaName, setAreaName] = useState('');
    const [areaFee, setAreaFee] = useState('');
    const [areaFreeMin, setAreaFreeMin] = useState('');
    const [areaFreeShipping, setAreaFreeShipping] = useState(false);

    const LIFF_ID = '2010308873-ur2zL2cc';
    
    // 專屬價格相關 state
    const [allProducts, setAllProducts] = useState([]);
    const [allPromotions, setAllPromotions] = useState([]);
    const [selectedCommunityId, setSelectedCommunityId] = useState('');
    const [customPrices, setCustomPrices] = useState({}); // { [productId]: { price, promotions: [{buyX, getY}], promoId } }
    const [loadingCustomPrices, setLoadingCustomPrices] = useState(false);
    const [savingPriceProductId, setSavingPriceProductId] = useState('');

    const fetchCustomPrices = useCallback(async (commId) => {
        if (!commId) {
            setCustomPrices({});
            return;
        }
        setLoadingCustomPrices(true);
        try {
            const data = await callGAS(apiUrl, 'getCommunityCustomPrices', { communityId: commId }, user.token);
            if (Array.isArray(data)) {
                const priceMap = {};
                data.forEach(cp => {
                    priceMap[cp.productId] = {
                        price: cp.customPrice,
                        promotions: cp.promotions || [],
                        promoId: cp.promoId || ''
                    };
                });
                setCustomPrices(priceMap);
            }
        } catch (error) {
            console.error('載入社區專屬價格失敗:', error);
        } finally {
            setLoadingCustomPrices(false);
        }
    }, [apiUrl, user.token]);

    const fetchAllProducts = useCallback(async () => {
        try {
            const [productsData, promotionsData] = await Promise.all([
                callGAS(apiUrl, 'getProducts', {}, user.token),
                callGAS(apiUrl, 'getPromotions', {}, user.token).catch(() => [])
            ]);
            
            if (Array.isArray(productsData)) {
                setAllProducts(productsData);
            }
            if (Array.isArray(promotionsData)) {
                setAllPromotions(promotionsData);
            }
        } catch (error) {
            console.error('載入商品與促銷清單失敗:', error);
        }
    }, [apiUrl, user.token]);

    const handleSaveCustomPrice = async (productId, itemData) => {
        if (!selectedCommunityId) return;
        setSavingPriceProductId(productId);

        const price = itemData?.price;
        const promotions = itemData?.promotions || [];
        const promoId = itemData?.promoId || '';

        try {
            const res = await callGAS(apiUrl, 'saveCommunityCustomPrice', {
                communityId: selectedCommunityId,
                productId,
                customPrice: (price !== undefined && price !== '') ? Number(price) : '',
                promotions,
                promoId
            }, user.token);
            if (res && res.error) throw new Error(res.error);
            
            if (res.deleted) {
                setCustomPrices(prev => {
                    const next = { ...prev };
                    delete next[productId];
                    return next;
                });
            } else {
                setCustomPrices(prev => ({
                    ...prev,
                    [productId]: {
                        price: (price !== undefined && price !== '') ? Number(price) : '',
                        promotions,
                        promoId
                    }
                }));
            }
        } catch (error) {
            console.error('儲存專屬售價與促銷失敗: ', error);
        } finally {
            setSavingPriceProductId('');
        }
    };


    const handleDeleteCustomPrice = async (productId) => {
        if (!selectedCommunityId) return;
        if (!window.confirm('確定要移除此商品的客製專屬售價，並恢復預設原價嗎？')) return;

        setSavingPriceProductId(productId);
        try {
            const res = await callGAS(apiUrl, 'deleteCommunityCustomPrice', {
                communityId: selectedCommunityId,
                productId
            }, user.token);
            if (res && res.error) throw new Error(res.error);
            
            // 更新本地 state
            setCustomPrices(prev => {
                const next = { ...prev };
                delete next[productId];
                return next;
            });
            alert('專屬售價已移除，恢復為商品預設原價。');
        } catch (error) {
            alert('移除專屬售價失敗: ' + error.message);
        } finally {
            setSavingPriceProductId('');
        }
    };

    const fetchSettings = useCallback(async () => {
        setLoading(true);
        try {
            const data = await callGAS(apiUrl, 'getBuildingSettings', {}, user.token);
            if (Array.isArray(data)) {
                setSettings(data);
                
                if (data.length > 0) {
                    // 預設選擇第一個
                    if (!selectedBuilding || selectedBuilding === '__new__') {
                        const first = data[0].building;
                        setSelectedBuilding(first);
                        updateFormFields(first, data);
                    }
                } else {
                    // 沒有資料 → 自動進入新增模式
                    setSelectedBuilding('__new__');
                    setIsAddingNew(true);
                }
            }
        } catch (error) {
            alert('載入大樓設定失敗: ' + error.message);
        } finally {
            setLoading(false);
        }
    }, [apiUrl, user.token, selectedBuilding]);

    useEffect(() => {
        if (user?.token) {
            fetchSettings();
            fetchCommunities();
            fetchAllProducts();
        }
    }, [user.token, fetchSettings, fetchAllProducts]);

    const fetchCommunities = async () => {
        setLoadingCommunities(true);
        try {
            const data = await callGAS(apiUrl, 'getCommunities', {}, user.token);
            if (Array.isArray(data)) {
                setCommunities(data);
            }
        } catch (error) {
            console.error('載入外送區域失敗:', error);
        } finally {
            setLoadingCommunities(false);
        }
    };

    const handleSaveArea = async (e) => {
        e.preventDefault();
        if (!areaName.trim()) {
            alert('請輸入外送區域名稱！');
            return;
        }

        setIsSavingArea(true);
        try {
            await callGAS(apiUrl, 'saveCommunityArea', {
                communityId: editingAreaId || undefined,
                communityName: areaName.trim(),
                defaultFreeShipping: areaFreeShipping,
                freeShippingMin: areaFreeShipping ? 0 : (Number(areaFreeMin) || 0),
                shippingFee: areaFreeShipping ? 0 : (Number(areaFee) || 0)
            }, user.token);

            // 清空表單
            setEditingAreaId('');
            setAreaName('');
            setAreaFee('');
            setAreaFreeMin('');
            setAreaFreeShipping(false);

            await fetchCommunities();
            alert('外送區域儲存成功！');
        } catch (error) {
            alert('儲存外送區域失敗: ' + error.message);
        } finally {
            setIsSavingArea(false);
        }
    };

    const handleDeleteArea = async (communityId, name) => {
        if (!window.confirm(`確定要刪除「${name}」外送區域嗎？`)) return;

        try {
            await callGAS(apiUrl, 'deleteCommunityArea', { communityId }, user.token);
            await fetchCommunities();
            alert('刪除成功！');
        } catch (error) {
            alert('刪除區域失敗: ' + error.message);
        }
    };

    const parseDateTime = (str) => {
        if (!str) return { date: '', time: '' };
        const parts = str.trim().split(' ');
        if (parts.length === 2) {
            const datePart = parts[0].replace(/\//g, '-'); // YYYY-MM-DD
            const timePart = parts[1]; // HH:mm
            return { date: datePart, time: timePart };
        }
        const d = new Date(str.replace(/\//g, '-'));
        if (!isNaN(d.getTime())) {
            const pad = n => String(n).padStart(2, '0');
            return {
                date: `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`,
                time: `${pad(d.getHours())}:${pad(d.getMinutes())}`
            };
        }
        return { date: '', time: '' };
    };

    const updateFormFields = (buildingName, currentSettings = settings) => {
        const found = currentSettings.find(s => s.building === buildingName);
        if (found) {
            const start = parseDateTime(found.start_time);
            setStartDate(start.date);
            setStartTime(start.time);
            
            const end = parseDateTime(found.end_time);
            setEndDate(end.date);
            setEndTime(end.time);

            // 自動設定
            setIsAuto(!!found.is_auto);
            setAutoOpenDay(found.auto_open_day !== undefined && found.auto_open_day !== '' ? String(found.auto_open_day) : '');
            setAutoOpenTime(found.auto_open_time || '');
            setAutoCloseDay(found.auto_close_day !== undefined && found.auto_close_day !== '' ? String(found.auto_close_day) : '');
            setAutoCloseTime(found.auto_close_time || '');

            // 運費設定
            setIsFreeShipping(!!found.default_free_shipping);
            setFreeShippingMin(found.free_shipping_min != null ? String(found.free_shipping_min) : '');
            setShippingFee(found.shipping_fee != null ? String(found.shipping_fee) : '');

            // 備注
            setAdminNote(found.admin_note || '');

            // 社區專屬價格相關
            const commId = found.community_id || '';
            setSelectedCommunityId(commId);
            fetchCustomPrices(commId);
        } else {
            setStartDate('');
            setStartTime('');
            setEndDate('');
            setEndTime('');

            setIsAuto(false);
            setAutoOpenDay('');
            setAutoOpenTime('');
            setAutoCloseDay('');
            setAutoCloseTime('');

            // 運費設定預設
            setIsFreeShipping(false);
            setFreeShippingMin('');
            setShippingFee('');

            // 備注預設
            setAdminNote('');

            // 社區專屬價格相關
            setSelectedCommunityId('');
            setCustomPrices({});
        }
    };

    const handleKeyDown = (e, nextId, prevId) => {
        if (e.key === 'Enter' || e.key === 'ArrowDown') {
            e.preventDefault();
            const nextEl = document.getElementById(nextId);
            if (nextEl) {
                nextEl.focus();
                // 避開 date/time 輸入框呼叫 select() 的 Web API 錯誤
                if (nextEl.type === 'text' && typeof nextEl.select === 'function') {
                    nextEl.select();
                }
            }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            const prevEl = document.getElementById(prevId);
            if (prevEl) {
                prevEl.focus();
                if (prevEl.type === 'text' && typeof prevEl.select === 'function') {
                    prevEl.select();
                }
            }
        }
    };

    const handleBuildingChange = (e) => {
        const val = e.target.value;
        setSelectedBuilding(val);
        if (val === '__new__') {
            setIsAddingNew(true);
            setNewBuildingName('');
            setStartDate('');
            setStartTime('');
            setEndDate('');
            setEndTime('');
            setIsAuto(false);
            setAutoOpenDay('');
            setAutoOpenTime('');
            setAutoCloseDay('');
            setAutoCloseTime('');
        } else {
            setIsAddingNew(false);
            updateFormFields(val);
        }
    };

    const combineDateTime = (date, time) => {
        if (!date) return '';
        const formattedDate = date.replace(/-/g, '/');
        const formattedTime = time || '00:00';
        return `${formattedDate} ${formattedTime}`;
    };

    const handleMoveBuilding = async (index, direction) => {
        const newSettings = [...settings];
        const targetIndex = index + direction;
        if (targetIndex < 0 || targetIndex >= newSettings.length) return;

        // swap
        [newSettings[index], newSettings[targetIndex]] = [newSettings[targetIndex], newSettings[index]];
        setSettings(newSettings);

        try {
            await callGAS(apiUrl, 'reorderBuildings', {
                buildings: newSettings.map(s => s.building)
            }, user.token);
        } catch (error) {
            alert('排序更新失敗: ' + error.message);
            await fetchSettings(); // rollback
        }
    };

    const handleDeleteClick = async (buildingName) => {
        if (!window.confirm(`確定要刪除「${buildingName}」大樓的所有開團設定與社區資料嗎？\n此動作無法還原！`)) return;
        
        try {
            const res = await callGAS(apiUrl, 'deleteBuildingSettings', { building: buildingName }, user.token);
            if (res && res.error) throw new Error(res.error);
            alert(`大樓「${buildingName}」已成功刪除！`);
            setSelectedBuilding('');
            await fetchSettings();
        } catch (error) {
            alert('刪除失敗: ' + error.message);
        }
    };

    const handleRenameClick = async (buildingName) => {
        const newName = window.prompt(`請輸入「${buildingName}」的新大樓名稱：`, buildingName);
        if (newName === null) return; // 取消
        const trimmed = newName.trim();
        if (!trimmed) {
            alert('大樓名稱不可為空！');
            return;
        }
        if (trimmed === buildingName) return;

        try {
            const res = await callGAS(apiUrl, 'renameBuildingSettings', { oldName: buildingName, newName: trimmed }, user.token);
            if (res && res.error) throw new Error(res.error);
            alert(`已成功將大樓名稱從「${buildingName}」修改為「${trimmed}」！`);
            setSelectedBuilding(trimmed);
            await fetchSettings();
        } catch (error) {
            alert('修改名稱失敗: ' + error.message);
        }
    };

    const handleSave = async () => {
        const targetBuilding = isAddingNew ? newBuildingName.trim() : selectedBuilding;
        if (!targetBuilding) {
            alert('請輸入或選擇大樓名稱！');
            return;
        }

        setIsSaving(true);
        try {
            const sDateTime = combineDateTime(startDate, startTime);
            const eDateTime = combineDateTime(endDate, endTime);

            const res = await callGAS(apiUrl, 'saveBuildingSettings', {
                building: targetBuilding,
                start_time: sDateTime,
                end_time: eDateTime,
                is_auto: isAuto,
                auto_open_day: autoOpenDay !== '' ? Number(autoOpenDay) : '',
                auto_open_time: autoOpenTime,
                auto_close_day: autoCloseDay !== '' ? Number(autoCloseDay) : '',
                auto_close_time: autoCloseTime,
                admin_note: adminNote.trim() || null,
            }, user.token);

            if (res && res.error) {
                throw new Error(res.error);
            }

            alert(`大樓「${targetBuilding}」設定儲存成功！`);
            setIsAddingNew(false);
            setSelectedBuilding(targetBuilding);
            
            // 重新讀取以刷新清單
            await fetchSettings();
        } catch (error) {
            alert('儲存失敗: ' + error.message);
        } finally {
            setIsSaving(false);
        }
    };

    // 儲存運費設定 (自動儲存)
    const handleSaveShipping = async (overrideState = {}) => {
        const targetBuilding = isAddingNew ? newBuildingName.trim() : selectedBuilding;
        if (!targetBuilding || targetBuilding === '__new__') return;

        const currentIsFree = overrideState.isFreeShipping !== undefined ? overrideState.isFreeShipping : isFreeShipping;
        const currentMin = overrideState.freeShippingMin !== undefined ? overrideState.freeShippingMin : freeShippingMin;
        const currentFee = overrideState.shippingFee !== undefined ? overrideState.shippingFee : shippingFee;

        setIsSavingShipping(true);
        try {
            const res = await callGAS(apiUrl, 'saveCommunityShipping', {
                building: targetBuilding,
                default_free_shipping: currentIsFree,
                free_shipping_min: currentIsFree ? 0 : (Number(currentMin) || 0),
                shipping_fee: currentIsFree ? 0 : (Number(currentFee) || 0),
            }, user.token);
            if (res && res.error) throw new Error(res.error);
            // 靜默儲存，不跳出 alert 或 fetchSettings
        } catch (error) {
            console.error('儲存運費設定失敗: ' + error.message);
        } finally {
            setIsSavingShipping(false);
        }
    };

    // 產生專屬 LIFF 網址
    const getGeneratedUrl = () => {
        const targetBuilding = isAddingNew ? newBuildingName.trim() : selectedBuilding;
        if (!targetBuilding) return '';
        // 預防中文字編碼問題，直接進行 URI 編碼
        return `https://liff.line.me/${LIFF_ID}?building=${encodeURIComponent(targetBuilding)}`;
    };

    const handleCopy = async () => {
        const url = getGeneratedUrl();
        if (!url) return;
        const ok = await copyToClipboard(url);
        if (ok) {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } else {
            alert('複製失敗，請手動複製：\n' + url);
        }
    };

    const activeUrl = getGeneratedUrl();

    useEffect(() => {
        if (selectedBuilding && selectedBuilding !== '__new__') {
            const custom = customTemplates[selectedBuilding];
            if (custom !== undefined) {
                setTemplateInputText(custom);
            } else {
                setTemplateInputText(getDefaultTemplate(selectedBuilding, activeUrl));
            }
        }
    }, [selectedBuilding, activeUrl, customTemplates, getDefaultTemplate]);

    return (
        <div className="max-w-6xl mx-auto min-h-screen flex flex-col p-4 gap-4 pb-24">
            {/* Header Area */}
            <div className="flex items-center justify-between bg-[var(--bg-secondary)] p-4 rounded-2xl border border-[var(--border-primary)] shadow-sm">
                <h2 className="text-xl md:text-2xl font-bold flex items-center gap-2 text-[var(--text-primary)]">
                    <Link className="text-blue-600" />
                    開團管理
                </h2>
                <button
                    onClick={fetchSettings}
                    disabled={loading}
                    className="p-2 text-[var(--text-secondary)] hover:text-blue-600 hover:bg-[var(--bg-tertiary)] rounded-xl transition-all cursor-pointer disabled:opacity-50"
                    title="重新整理"
                >
                    <RefreshCw className={loading ? "animate-spin text-blue-500" : ""} size={20} />
                </button>
            </div>

            {/* 4 大核心頁籤 (Tab Navigation Bar) */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 border-b border-[var(--border-primary)] scrollbar-none">
                <button
                    type="button"
                    onClick={() => setActiveTab('SCHEDULE')}
                    className={`px-4 py-2.5 rounded-xl font-extrabold text-xs md:text-sm flex items-center gap-2 transition-all whitespace-nowrap cursor-pointer ${
                        activeTab === 'SCHEDULE'
                            ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                            : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] border border-[var(--border-primary)]'
                    }`}
                >
                    <Calendar size={16} />
                    <span>📅 開團與時程控制</span>
                </button>

                <button
                    type="button"
                    onClick={() => setActiveTab('PROMOTION_LINK')}
                    className={`px-4 py-2.5 rounded-xl font-extrabold text-xs md:text-sm flex items-center gap-2 transition-all whitespace-nowrap cursor-pointer ${
                        activeTab === 'PROMOTION_LINK'
                            ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                            : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] border border-[var(--border-primary)]'
                    }`}
                >
                    <Link size={16} />
                    <span>🔗 下單網址與推廣</span>
                </button>

                <button
                    type="button"
                    onClick={() => setActiveTab('PRICING_SHIPPING')}
                    className={`px-4 py-2.5 rounded-xl font-extrabold text-xs md:text-sm flex items-center gap-2 transition-all whitespace-nowrap cursor-pointer ${
                        activeTab === 'PRICING_SHIPPING'
                            ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                            : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] border border-[var(--border-primary)]'
                    }`}
                >
                    <Truck size={16} />
                    <span>💰 專屬定價與運費</span>
                </button>

                <button
                    type="button"
                    onClick={() => setActiveTab('DELIVERY_ZONES')}
                    className={`px-4 py-2.5 rounded-xl font-extrabold text-xs md:text-sm flex items-center gap-2 transition-all whitespace-nowrap cursor-pointer ${
                        activeTab === 'DELIVERY_ZONES'
                            ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                            : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] border border-[var(--border-primary)]'
                    }`}
                >
                    <Truck size={16} />
                    <span>🛵 散客外送區域</span>
                </button>

                <button
                    type="button"
                    onClick={() => {
                        setActiveTab('REWARD_SETTINGS');
                        fetchRewardConfig();
                    }}
                    className={`px-4 py-2.5 rounded-xl font-extrabold text-xs md:text-sm flex items-center gap-2 transition-all whitespace-nowrap cursor-pointer ${
                        activeTab === 'REWARD_SETTINGS'
                            ? 'bg-emerald-600 text-white shadow-md shadow-emerald-500/20'
                            : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] border border-[var(--border-primary)]'
                    }`}
                >
                    <Gift size={16} />
                    <span>🎁 線上會員滿額折抵</span>
                </button>
            </div>

            {loading && settings.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center py-20 gap-3 text-[var(--text-secondary)]">
                    <RefreshCw className="animate-spin text-blue-500" size={36} />
                    <span>載入大樓時段設定中...</span>
                </div>
            ) : (
                <>
                    {/* 大樓專屬三大頁籤 (SCHEDULE / PROMOTION_LINK / PRICING_SHIPPING) */}
                    {activeTab !== 'DELIVERY_ZONES' && (
                        <div className="flex flex-col gap-5 pb-6">
                            {/* 🏢 大樓 / 社區 橫向左右滑動選擇器 */}
                            <div className="bg-[var(--bg-secondary)] p-4 rounded-2xl border border-[var(--border-primary)] shadow-sm space-y-3">
                                {/* 頂欄：標題、搜尋框與輔助按鈕 */}
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[var(--border-primary)] pb-2.5">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <h3 className="font-extrabold text-sm md:text-base text-[var(--text-primary)] flex items-center gap-1.5 whitespace-nowrap">
                                            <span className="flex items-center justify-center bg-blue-600 text-white rounded-full w-5 h-5 text-xs font-black">1</span>
                                            選擇大樓 / 社區
                                        </h3>
                                        <span className="text-xs text-[var(--text-tertiary)] hidden sm:inline">
                                            (← 左右滑動切換社區 →)
                                        </span>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        {/* 🔍 大樓搜尋框 */}
                                        <div className="relative min-w-[160px] sm:min-w-[200px]">
                                            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                            <input
                                                type="text"
                                                placeholder="搜尋大樓..."
                                                value={buildingSearchTerm}
                                                onChange={(e) => setBuildingSearchTerm(e.target.value)}
                                                className="w-full pl-7 pr-6 py-1 text-xs rounded-xl border border-[var(--border-primary)] bg-[var(--bg-tertiary)] text-[var(--text-primary)] focus:outline-none focus:border-blue-500 font-medium"
                                            />
                                            {buildingSearchTerm && (
                                                <button
                                                    type="button"
                                                    onClick={() => setBuildingSearchTerm('')}
                                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
                                                >
                                                    ✕
                                                </button>
                                            )}
                                        </div>

                                        {/* 隱藏 / 顯示按鈕 */}
                                        <button
                                            type="button"
                                            onClick={() => setShowHidden(prev => !prev)}
                                            className={`text-xs font-bold px-2.5 py-1 rounded-xl border transition-all flex items-center gap-1 cursor-pointer whitespace-nowrap ${
                                                showHidden 
                                                    ? 'bg-amber-500/10 text-amber-600 border-amber-500/30'
                                                    : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border-[var(--border-primary)] hover:bg-[var(--bg-hover)]'
                                            }`}
                                            title={showHidden ? '隱藏已關閉項目' : '顯示全數'}
                                        >
                                            {showHidden ? <Eye size={13} /> : <EyeOff size={13} />}
                                            <span>{showHidden ? '隱藏關閉' : `全數 (${hiddenBuildings.length})`}</span>
                                        </button>
                                    </div>
                                </div>

                                {/* ↔️ 大樓標籤列 (左右滑動) */}
                                <div className="flex items-center gap-2 overflow-x-auto pb-1.5 pt-0.5 scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-700">
                                    {/* + 新增大樓按鈕 */}
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setIsAddingNew(true);
                                            setSelectedBuilding('__new__');
                                            setNewBuildingName('');
                                            setStartDate('');
                                            setStartTime('');
                                            setEndDate('');
                                            setEndTime('');
                                            setIsAuto(false);
                                            setAutoOpenDay('');
                                            setAutoOpenTime('');
                                            setAutoCloseDay('');
                                            setAutoCloseTime('');
                                        }}
                                        className={`px-3 py-1.5 rounded-xl border-2 border-dashed flex items-center gap-1.5 shrink-0 transition-all font-bold text-xs cursor-pointer ${
                                            isAddingNew 
                                                ? 'bg-blue-600 border-blue-600 text-white shadow-sm' 
                                                : 'bg-blue-50 dark:bg-blue-950/30 border-blue-300 hover:border-blue-500 text-blue-600 dark:text-blue-400'
                                        }`}
                                    >
                                        <Plus size={14} />
                                        <span>新增大樓/社區</span>
                                    </button>

                                    {settings
                                        .filter(s => showHidden || !hiddenBuildings.includes(s.building))
                                        .filter(s => !buildingSearchTerm.trim() || s.building.toLowerCase().includes(buildingSearchTerm.trim().toLowerCase()))
                                        .map((s, idx) => {
                                            const isHidden = hiddenBuildings.includes(s.building);
                                            const isSelected = selectedBuilding === s.building && !isAddingNew;
                                            return (
                                                <div
                                                    key={s.building}
                                                    onClick={() => {
                                                        setIsAddingNew(false);
                                                        setSelectedBuilding(s.building);
                                                        updateFormFields(s.building);
                                                    }}
                                                    className={`px-3.5 py-1.5 rounded-xl border flex items-center gap-2 shrink-0 transition-all duration-150 cursor-pointer select-none font-bold text-xs ${
                                                        isHidden
                                                            ? 'bg-slate-100 dark:bg-slate-900/40 border-dashed border-slate-300 text-slate-400 opacity-60'
                                                            : isSelected 
                                                                ? 'bg-blue-600 border-blue-600 text-white shadow-md' 
                                                                : 'bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] border-[var(--border-primary)] text-[var(--text-primary)]'
                                                    }`}
                                                >
                                                    <span>{isHidden ? '🙈' : '🏢'}</span>
                                                    <span className={`whitespace-nowrap ${isHidden ? 'line-through' : ''}`}>
                                                        {s.building}
                                                    </span>
                                                    {s.admin_note && (
                                                        <span className={`text-[10px] px-1.5 py-0.2 rounded font-medium ${isSelected ? 'bg-blue-500 text-blue-100' : 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300'}`}>
                                                            {s.admin_note}
                                                        </span>
                                                    )}

                                                    {/* 動作小圖示：隱藏/重命名/刪除 */}
                                                    <div className="flex items-center gap-1 ml-0.5" onClick={(e) => e.stopPropagation()}>
                                                        <button
                                                            type="button"
                                                            onClick={() => toggleHideBuilding(s.building)}
                                                            className={`p-0.5 rounded transition-colors ${
                                                                isSelected ? 'hover:bg-blue-500 text-blue-200' : 'hover:bg-slate-200 text-slate-400'
                                                            }`}
                                                            title={isHidden ? '取消隱藏' : '隱藏'}
                                                        >
                                                            {isHidden ? <Eye size={12} /> : <EyeOff size={12} />}
                                                        </button>
                                                        {isSelected && (
                                                            <>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleRenameClick(s.building)}
                                                                    className="p-0.5 hover:bg-blue-500 rounded text-blue-100 transition-colors"
                                                                    title="修改名稱"
                                                                >
                                                                    <Edit2 size={12} />
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleDeleteClick(s.building)}
                                                                    className="p-0.5 hover:bg-blue-500 rounded text-rose-200 transition-colors"
                                                                    title="刪除"
                                                                >
                                                                    <Trash2 size={12} />
                                                                </button>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                </div>

                                {/* 新增大樓輸入欄 */}
                                {isAddingNew && (
                                    <div className="flex items-center gap-2 animate-in fade-in slide-in-from-top-1 duration-150 p-2.5 bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200 rounded-xl">
                                        <label className="text-xs font-extrabold text-blue-600 whitespace-nowrap">自訂新大樓名稱：</label>
                                        <input
                                            type="text"
                                            className="input-field flex-1 px-3 py-1.5 rounded-lg border border-blue-300 bg-white text-xs font-bold focus:outline-none focus:border-blue-500"
                                            placeholder="例如：遠雄富源大樓"
                                            value={newBuildingName}
                                            onChange={(e) => setNewBuildingName(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    const nextEl = document.getElementById('startDate');
                                                    if (nextEl) nextEl.focus();
                                                }
                                            }}
                                        />
                                    </div>
                                )}
                            </div>

                            {/* Content Panel */}
                            <div className="flex flex-col gap-5">
                                
                                {/* 📅 頁籤一：開團與時程控制面板 */}
                                {activeTab === 'SCHEDULE' && (
                                    <>
                                        {/* Auto Settings Card */}
                                        <div className="bg-[var(--bg-secondary)] p-4 sm:p-5 rounded-2xl border border-[var(--border-primary)] shadow-md flex flex-col gap-4">
                                            <div className="flex justify-between items-center">
                                                <h3 className="font-extrabold text-base text-[var(--text-primary)] flex items-center gap-1.5">
                                                    <span className="flex items-center justify-center bg-blue-500 text-white rounded-full w-5 h-5 text-xs font-black">2</span>
                                                    每週定期自動開關團設定
                                                </h3>
                                                <label className="inline-flex items-center cursor-pointer select-none">
                                                    <div className="relative inline-block w-11 h-6 flex-shrink-0">
                                                        <input
                                                            type="checkbox"
                                                            className="sr-only peer"
                                                            checked={isAuto}
                                                            onChange={(e) => setIsAuto(e.target.checked)}
                                                        />
                                                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                                                    </div>
                                                </label>
                                            </div>

                                            {isAuto && (
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 animate-in fade-in duration-200 pt-3 border-t border-[var(--border-primary)]">
                                                    {/* Auto Open Time */}
                                                    <div className="space-y-3 p-4 bg-[var(--bg-tertiary)] rounded-2xl border border-[var(--border-primary)] shadow-sm">
                                                        <label className="text-base font-extrabold text-emerald-600 flex items-center gap-1.5">
                                                            <Clock size={18} />
                                                            自動開團時間 (每週)
                                                        </label>
                                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full">
                                                            <select
                                                                className="input-field w-full min-w-0 p-3 text-sm bg-[var(--bg-secondary)] border-[var(--border-primary)]"
                                                                value={autoOpenDay}
                                                                onChange={(e) => setAutoOpenDay(e.target.value)}
                                                            >
                                                                <option value="">選擇星期</option>
                                                                <option value="1">星期一</option>
                                                                <option value="2">星期二</option>
                                                                <option value="3">星期三</option>
                                                                <option value="4">星期四</option>
                                                                <option value="5">星期五</option>
                                                                <option value="6">星期六</option>
                                                                <option value="0">星期日</option>
                                                            </select>
                                                            <input
                                                                type="time"
                                                                className="input-field w-full min-w-0 p-3 text-sm bg-[var(--bg-secondary)] border-[var(--border-primary)] appearance-none"
                                                                value={autoOpenTime}
                                                                onChange={(e) => setAutoOpenTime(e.target.value)}
                                                            />
                                                        </div>
                                                    </div>

                                                    {/* Auto Close Time */}
                                                    <div className="space-y-3 p-4 bg-[var(--bg-tertiary)] rounded-2xl border border-[var(--border-primary)] shadow-sm">
                                                        <label className="text-base font-extrabold text-rose-600 flex items-center gap-1.5">
                                                            <Clock size={18} />
                                                            自動結單時間 (每週)
                                                        </label>
                                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full">
                                                            <select
                                                                className="input-field w-full min-w-0 p-3 text-sm bg-[var(--bg-secondary)] border-[var(--border-primary)]"
                                                                value={autoCloseDay}
                                                                onChange={(e) => setAutoCloseDay(e.target.value)}
                                                            >
                                                                <option value="">選擇星期</option>
                                                                <option value="1">星期一</option>
                                                                <option value="2">星期二</option>
                                                                <option value="3">星期三</option>
                                                                <option value="4">星期四</option>
                                                                <option value="5">星期五</option>
                                                                <option value="6">星期六</option>
                                                                <option value="0">星期日</option>
                                                            </select>
                                                            <input
                                                                type="time"
                                                                className="input-field w-full min-w-0 p-3 text-sm bg-[var(--bg-secondary)] border-[var(--border-primary)] appearance-none"
                                                                value={autoCloseTime}
                                                                onChange={(e) => setAutoCloseTime(e.target.value)}
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {/* Manual Settings Card */}
                                        <div className="bg-[var(--bg-secondary)] p-4 sm:p-5 rounded-2xl border border-[var(--border-primary)] shadow-md flex flex-col gap-4 max-w-full overflow-hidden">
                                            <h3 className="font-extrabold text-base text-[var(--text-primary)] pb-2.5 border-b border-[var(--border-primary)] flex items-center gap-1.5">
                                                <span className="flex items-center justify-center bg-blue-500 text-white rounded-full w-5 h-5 text-xs font-black">3</span>
                                                手動臨時加開時段設定
                                            </h3>

                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 w-full box-border">
                                                {/* Start Time */}
                                                <div className="p-3.5 sm:p-4 bg-[var(--bg-tertiary)]/60 rounded-2xl border border-[var(--border-primary)] flex flex-col gap-3 w-full max-w-full box-border overflow-hidden">
                                                    <div className="flex items-center justify-between">
                                                        <label className="text-xs sm:text-sm font-extrabold text-[var(--text-primary)] flex items-center gap-1.5">
                                                            <Calendar className="text-amber-500" size={16} />
                                                            加開：開始時間
                                                        </label>
                                                        {(startDate || startTime) && (
                                                            <button
                                                                type="button"
                                                                onClick={() => { setStartDate(''); setStartTime(''); }}
                                                                className="text-xs text-rose-500 hover:text-rose-700 font-extrabold hover:underline cursor-pointer"
                                                            >
                                                                ✕ 清除
                                                            </button>
                                                        )}
                                                    </div>

                                                    <div className="flex flex-col sm:flex-row gap-2.5 w-full overflow-hidden">
                                                        <input
                                                            type="date"
                                                            id="startDate"
                                                            className="input-field flex-1 min-w-0 appearance-none px-3 py-2.5 text-xs sm:text-sm rounded-xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] font-bold text-[var(--text-primary)] focus:border-blue-500 box-border w-full"
                                                            value={startDate}
                                                            onChange={(e) => setStartDate(e.target.value)}
                                                            onKeyDown={(e) => handleKeyDown(e, 'startTime', null)}
                                                        />
                                                        <input
                                                            type="time"
                                                            id="startTime"
                                                            className="input-field flex-1 min-w-0 appearance-none px-3 py-2.5 text-xs sm:text-sm rounded-xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] font-bold text-[var(--text-primary)] focus:border-blue-500 box-border w-full"
                                                            value={startTime}
                                                            onChange={(e) => setStartTime(e.target.value)}
                                                            onKeyDown={(e) => handleKeyDown(e, 'endDate', 'startDate')}
                                                        />
                                                    </div>
                                                </div>

                                                {/* End Time */}
                                                <div className="p-3.5 sm:p-4 bg-[var(--bg-tertiary)]/60 rounded-2xl border border-[var(--border-primary)] flex flex-col gap-3 w-full max-w-full box-border overflow-hidden">
                                                    <div className="flex items-center justify-between">
                                                        <label className="text-xs sm:text-sm font-extrabold text-[var(--text-primary)] flex items-center gap-1.5">
                                                            <Clock className="text-rose-500" size={16} />
                                                            加開：結束時間
                                                        </label>
                                                        {(endDate || endTime) && (
                                                            <button
                                                                type="button"
                                                                onClick={() => { setEndDate(''); setEndTime(''); }}
                                                                className="text-xs text-rose-500 hover:text-rose-700 font-extrabold hover:underline cursor-pointer"
                                                            >
                                                                ✕ 清除
                                                            </button>
                                                        )}
                                                    </div>

                                                    <div className="flex flex-col sm:flex-row gap-2.5 w-full overflow-hidden">
                                                        <input
                                                            type="date"
                                                            id="endDate"
                                                            className="input-field flex-1 min-w-0 appearance-none px-3 py-2.5 text-xs sm:text-sm rounded-xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] font-bold text-[var(--text-primary)] focus:border-blue-500 box-border w-full"
                                                            value={endDate}
                                                            onChange={(e) => setEndDate(e.target.value)}
                                                            onKeyDown={(e) => handleKeyDown(e, 'endTime', 'startTime')}
                                                        />
                                                        <input
                                                            type="time"
                                                            id="endTime"
                                                            className="input-field flex-1 min-w-0 appearance-none px-3 py-2.5 text-xs sm:text-sm rounded-xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] font-bold text-[var(--text-primary)] focus:border-blue-500 box-border w-full"
                                                            value={endTime}
                                                            onChange={(e) => setEndTime(e.target.value)}
                                                            onKeyDown={(e) => handleKeyDown(e, 'saveBtn', 'endDate')}
                                                        />
                                                    </div>
                                                </div>
                                            </div>

                                            {/* 管理員備注 */}
                                            {!isAddingNew && selectedBuilding && (
                                                <div className="bg-amber-50/60 border border-amber-200 p-4 rounded-2xl flex flex-col gap-2 mt-2">
                                                    <label className="text-sm font-extrabold text-amber-700 flex items-center gap-1.5">
                                                        <StickyNote size={15} />
                                                        管理員備注（僅自己可見）
                                                    </label>
                                                    <textarea
                                                        rows={2}
                                                        className="input-field w-full p-2.5 text-sm rounded-xl border border-amber-200 bg-white resize-none focus:outline-none focus:border-amber-400"
                                                        placeholder="例：每週二固定補貨、聯絡人：王小明 0912-345-678"
                                                        value={adminNote}
                                                        onChange={(e) => setAdminNote(e.target.value)}
                                                    />
                                                    <p className="text-xs text-amber-600/70">備注會在「儲存大樓設定」時一併儲存。</p>
                                                </div>
                                            )}

                                            <div className="flex justify-end border-t border-[var(--border-primary)]/50 pt-3">
                                                <button
                                                    id="saveBtn"
                                                    onClick={handleSave}
                                                    disabled={isSaving}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'ArrowUp') {
                                                            e.preventDefault();
                                                            document.getElementById('endTime')?.focus();
                                                        }
                                                    }}
                                                    className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold flex items-center gap-1.5 shadow-md shadow-blue-500/20 active:scale-95 transition-all focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                                >
                                                    <Save size={14} />
                                                    {isSaving ? '儲存中...' : '儲存大樓設定'}
                                                </button>
                                            </div>
                                        </div>
                                    </>
                                )}

                                {/* 🔗 頁籤二：下單網址與推廣面板 */}
                                {activeTab === 'PROMOTION_LINK' && (
                                    <div className="bg-[var(--bg-secondary)] p-5 rounded-2xl border border-[var(--border-primary)] shadow-md flex flex-col gap-4">
                                        <h3 className="font-extrabold text-base text-[var(--text-primary)] pb-2.5 border-b border-[var(--border-primary)] flex items-center gap-1.5">
                                            <Link size={18} className="text-blue-500" />
                                            獲取大樓專屬下單網址 & 推廣文案
                                        </h3>

                                        {activeUrl ? (
                                            <div className="space-y-4">
                                                <div className="p-4 bg-blue-50/50 border border-blue-100 rounded-2xl space-y-2.5">
                                                    <h4 className="font-extrabold text-sm text-blue-800">
                                                        🔗 {selectedBuilding} 專屬 LIFF 下單連結
                                                    </h4>
                                                    <div className="flex flex-col sm:flex-row gap-2">
                                                        <input
                                                            type="text"
                                                            readOnly
                                                            className="input-field flex-1 p-2.5 bg-white rounded-xl border border-blue-200 text-xs text-slate-800 font-mono font-bold focus:outline-none"
                                                            value={activeUrl}
                                                        />
                                                        <button
                                                            type="button"
                                                            onClick={handleCopy}
                                                            className="sm:w-28 py-2.5 rounded-xl font-bold flex items-center justify-center gap-1 shadow-sm text-xs text-white bg-blue-600 hover:bg-blue-700 active:scale-95 transition-all cursor-pointer"
                                                            style={{ backgroundColor: copied ? '#10B981' : undefined }}
                                                        >
                                                            {copied ? <Check size={14} /> : <Copy size={14} />}
                                                            {copied ? '已複製！' : '一鍵複製'}
                                                        </button>
                                                    </div>
                                                    <p className="text-xs text-slate-500 font-medium">
                                                        ※ 複製此網址丟給該大樓社區住戶即可下單。系統會自動鎖定該大樓，並依據設定進行下單時段驗證。
                                                    </p>
                                                </div>

                                                {/* LINE 群組開團發文喊單範本 (可編輯與儲存) */}
                                                <div className="p-4 bg-emerald-50/40 border border-emerald-200/60 rounded-2xl space-y-3">
                                                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                                                        <h4 className="font-extrabold text-sm text-emerald-800 flex items-center gap-1.5">
                                                            📢【{selectedBuilding}】專屬 LINE 群組發文喊單範本
                                                            {customTemplates[selectedBuilding] && (
                                                                <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-bold">已自訂範本</span>
                                                            )}
                                                        </h4>
                                                        {customTemplates[selectedBuilding] && (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleResetTemplate(selectedBuilding)}
                                                                className="text-xs text-slate-500 hover:text-slate-700 underline font-bold cursor-pointer"
                                                            >
                                                                重設為預設範本
                                                            </button>
                                                        )}
                                                    </div>

                                                    {/* 變數輔助按鈕 */}
                                                    <div className="flex flex-wrap items-center gap-2 text-xs text-emerald-800">
                                                        <span className="font-bold text-[11px]">快速插入動態變數：</span>
                                                        <button
                                                            type="button"
                                                            onClick={() => insertTagAtCursor('{building}')}
                                                            className="px-2 py-0.5 bg-white hover:bg-emerald-100 text-emerald-700 rounded text-[11px] font-bold border border-emerald-300 transition-colors cursor-pointer"
                                                            title="將在游標位置插入當前大樓名稱變數"
                                                        >
                                                            ＋ 大樓名稱 {"{building}"}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => insertTagAtCursor('{url}')}
                                                            className="px-2 py-0.5 bg-white hover:bg-emerald-100 text-emerald-700 rounded text-[11px] font-bold border border-emerald-300 transition-colors cursor-pointer"
                                                            title="將在游標位置插入當前 LIFF 下單連結變數"
                                                        >
                                                            ＋ 下單網址 {"{url}"}
                                                        </button>
                                                    </div>

                                                    {/* 可編輯文案區域 */}
                                                    <textarea
                                                        ref={templateTextareaRef}
                                                        rows={7}
                                                        className="w-full p-3 rounded-xl border border-emerald-300 bg-white text-xs font-mono text-slate-800 focus:outline-none focus:border-emerald-500 leading-relaxed shadow-inner"
                                                        value={templateInputText}
                                                        onChange={(e) => setTemplateInputText(e.target.value)}
                                                        placeholder={`可自訂【${selectedBuilding}】專屬發文文案...`}
                                                    />

                                                    <div className="flex flex-wrap justify-between items-center gap-2 pt-1">
                                                        <button
                                                            type="button"
                                                            onClick={() => handleSaveTemplate(selectedBuilding, templateInputText)}
                                                            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer"
                                                        >
                                                            <Save size={13} />
                                                            儲存【{selectedBuilding}】專屬文案
                                                        </button>

                                                        <button
                                                            type="button"
                                                            onClick={async () => {
                                                                const textToCopy = templateInputText.replace(/\{building\}/g, selectedBuilding).replace(/\{url\}/g, activeUrl);
                                                                const ok = await copyToClipboard(textToCopy);
                                                                if (ok) {
                                                                    alert(`已成功複製【${selectedBuilding}】LINE 開團發文文案！`);
                                                                } else {
                                                                    alert(`複製失敗，請手動複製：\n${textToCopy}`);
                                                                }
                                                            }}
                                                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer"
                                                        >
                                                            <Copy size={13} />
                                                            一鍵複製【{selectedBuilding}】發文文案
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="text-center py-10 text-xs text-slate-400">
                                                請先在左側選擇大樓社區以查看專屬網址與文案。
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* 💰 頁籤三：專屬定價與運費面板 */}
                                {activeTab === 'PRICING_SHIPPING' && (
                                    <>
                                        {/* Shipping Settings Card */}
                                        {!isAddingNew && selectedBuilding && (
                                            <div className="bg-[var(--bg-secondary)] p-5 rounded-2xl border border-[var(--border-primary)] shadow-md flex flex-col gap-4">
                                                <div className={`flex justify-between items-center gap-2 ${!isFreeShipping ? 'pb-2.5 border-b border-[var(--border-primary)]' : ''}`}>
                                                    <h3 className="font-extrabold text-base text-[var(--text-primary)] flex items-center gap-1.5">
                                                        <Truck size={18} className="text-emerald-500 shrink-0" />
                                                        <span>【{selectedBuilding}】</span>
                                                    </h3>
                                                    {/* 免運切換 */}
                                                    <label className="inline-flex items-center cursor-pointer gap-2 select-none">
                                                        <span className="text-sm font-semibold text-[var(--text-secondary)]">永久免運</span>
                                                        <div className="relative inline-block w-11 h-6 flex-shrink-0">
                                                            <input
                                                                type="checkbox"
                                                                className="sr-only peer"
                                                                checked={isFreeShipping}
                                                                onChange={(e) => {
                                                                    const val = e.target.checked;
                                                                    setIsFreeShipping(val);
                                                                    handleSaveShipping({ isFreeShipping: val });
                                                                }}
                                                            />
                                                            <div className="w-11 h-6 bg-gray-200 dark:bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                                                        </div>
                                                    </label>
                                                </div>

                                                {!isFreeShipping && (
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 animate-in fade-in duration-200">
                                                        {/* 免運門檻 */}
                                                        <div className="flex flex-col gap-1.5">
                                                            <label className="text-sm font-extrabold text-[var(--text-primary)]">
                                                                免運門檻
                                                            </label>
                                                            <p className="text-xs text-[var(--text-tertiary)]">訂單滿此金額免運（填 0 表示不開放免運）</p>
                                                            <div className="relative">
                                                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] font-bold font-mono text-sm">$</span>
                                                                <input
                                                                    type="number"
                                                                    min="0"
                                                                    className="input-field pl-7 p-3 w-full text-base font-bold"
                                                                    placeholder="例：500"
                                                                    value={freeShippingMin}
                                                                    onChange={(e) => setFreeShippingMin(e.target.value)}
                                                                    onBlur={(e) => handleSaveShipping({ freeShippingMin: e.target.value })}
                                                                />
                                                            </div>
                                                        </div>
                                                        {/* 運費金額 */}
                                                        <div className="flex flex-col gap-1.5">
                                                            <label className="text-sm font-extrabold text-[var(--text-primary)]">
                                                                未達門檻運費
                                                            </label>
                                                            <p className="text-xs text-[var(--text-tertiary)]">未達免運門檻時加收的運費</p>
                                                            <div className="relative">
                                                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] font-bold font-mono text-sm">$</span>
                                                                <input
                                                                    type="number"
                                                                    min="0"
                                                                    className="input-field pl-7 p-3 w-full text-base font-bold"
                                                                    placeholder="例：60"
                                                                    value={shippingFee}
                                                                    onChange={(e) => setShippingFee(e.target.value)}
                                                                    onBlur={(e) => handleSaveShipping({ shippingFee: e.target.value })}
                                                                />
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* 促銷活動引擎與專屬定價 */}
                                        {!isAddingNew && selectedBuilding && (
                                            <>
                                                {/* 促銷活動引擎區塊 */}
                                                <div className="bg-[var(--bg-secondary)] p-5 rounded-2xl border border-[var(--border-primary)] shadow-md flex flex-col gap-4">
                                                    <h3 className="font-extrabold text-base text-[var(--text-primary)] pb-2.5 border-b border-[var(--border-primary)] flex items-center justify-between">
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="text-base flex-shrink-0">🎉</span>
                                                            促銷活動引擎管理
                                                        </div>
                                                        <button
                                                            onClick={async () => {
                                                                const name = prompt('請輸入促銷名稱 (例：燕麥任選買3送2)');
                                                                if (!name) return;
                                                                const type = prompt('請選擇促銷類型 (輸入 1 買X送Y，輸入 2 任選組合價)', '1');
                                                                
                                                                try {
                                                                    if (type === '1') {
                                                                        const inputRule = prompt('請輸入優惠門檻 (格式：買:送，多階梯請用逗號分隔，例 "3:2, 5:4")', '3:2');
                                                                        if (!inputRule) return;

                                                                        const tierPairs = inputRule.split(',').map(s => s.trim()).filter(Boolean);
                                                                        const tiers = [];
                                                                        for (const pair of tierPairs) {
                                                                            const parts = pair.split(':').map(n => Number(n.trim()));
                                                                            if (parts.length === 2 && parts[0] > 0 && parts[1] > 0) {
                                                                                tiers.push({ buyQty: parts[0], freeQty: parts[1] });
                                                                            }
                                                                        }

                                                                        if (tiers.length === 0) {
                                                                            alert('❌ 格式錯誤！請依據 "買:送" 格式輸入，例如 "3:2" 或 "3:2, 5:4"');
                                                                            return;
                                                                        }

                                                                        const modeStr = prompt('請選擇贈品模式：\n1. 客人自選贈品 (CUSTOMER_SELECT)\n2. 自動折抵最低價 (AUTO_LOWEST_PRICE)\n3. 送同品項 (SAME_PRODUCT)', '1');
                                                                        let rewardSelectionMode = 'CUSTOMER_SELECT';
                                                                        if (modeStr === '2') rewardSelectionMode = 'AUTO_LOWEST_PRICE';
                                                                        if (modeStr === '3') rewardSelectionMode = 'SAME_PRODUCT';

                                                                        await callGAS(apiUrl, 'createPromotion', {
                                                                            name,
                                                                            promoType: 'BUY_X_GET_Y',
                                                                            buyQty: tiers[0].buyQty,
                                                                            freeQty: tiers[0].freeQty,
                                                                            tiers,
                                                                            communityId: selectedCommunityId,
                                                                            rewardSelectionMode
                                                                        }, user.token);
                                                                        alert('✅ 促銷活動已成功新增！');
                                                                    } else if (type === '2') {
                                                                        const buyX = prompt('請輸入任選幾件 (例：3)');
                                                                        const bundlePrice = prompt('請輸入組合價 (例：100)');
                                                                        if (!buyX || !bundlePrice) return;
                                                                        await callGAS(apiUrl, 'createPromotion', {
                                                                            name, promoType: 'BUNDLE_PRICE', buyQty: buyX, bundlePrice, communityId: selectedCommunityId
                                                                        }, user.token);
                                                                        alert('✅ 促銷活動已成功新增！');
                                                                    }
                                                                    fetchAllProducts();
                                                                } catch (error) {
                                                                    console.error(error);
                                                                    alert('❌ 新增失敗：' + error.message);
                                                                }
                                                            }}
                                                            className="text-[10px] text-emerald-600 hover:text-emerald-800 font-bold flex items-center gap-1 transition-colors cursor-pointer"
                                                        >
                                                            <span className="text-base leading-none">＋</span> 新增促銷活動
                                                        </button>
                                                    </h3>
                                                    
                                                    {allPromotions.filter(p => p.communityId === selectedCommunityId || !p.communityId).length === 0 ? (
                                                        <div className="text-center py-6 text-xs text-[var(--text-secondary)]">目前尚無設定促銷活動</div>
                                                    ) : (
                                                        <div className="flex flex-col gap-2">
                                                            {allPromotions
                                                                .filter(p => p.communityId === selectedCommunityId || !p.communityId)
                                                                .map(promo => (
                                                                    <div key={promo.promoId} className="flex items-center justify-between p-3 border border-[var(--border-primary)] rounded-xl bg-[var(--bg-tertiary)]">
                                                                        <div>
                                                                            <div className="font-bold text-sm text-[var(--text-primary)]">{promo.name}</div>
                                                                            <div className="text-xs text-[var(--text-secondary)] mt-0.5">
                                                                                {promo.promoType === 'BUY_X_GET_Y' && (() => {
                                                                                    if (Array.isArray(promo.tiers) && promo.tiers.length > 0) {
                                                                                        const tierText = promo.tiers.map(t => `買 ${t.buyQty} 送 ${t.freeQty}`).join(' 🔥 ');
                                                                                        return `規則：${tierText}`;
                                                                                    }
                                                                                    return `規則：買 ${promo.buyQty} 送 ${promo.freeQty}`;
                                                                                })()}
                                                                                {promo.promoType === 'BUNDLE_PRICE' && `規則：任選 ${promo.buyQty} 件 $${promo.bundlePrice}`}
                                                                                {promo.promoType === 'BUY_X_GET_Y' && promo.rewardSelectionMode === 'CUSTOMER_SELECT' && <span className="ml-2 text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">自選贈品</span>}
                                                                                {promo.promoType === 'BUY_X_GET_Y' && promo.rewardSelectionMode === 'AUTO_LOWEST_PRICE' && <span className="ml-2 text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">折抵最低價</span>}
                                                                                {promo.promoType === 'BUY_X_GET_Y' && promo.rewardSelectionMode === 'SAME_PRODUCT' && <span className="ml-2 text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">送同品項</span>}
                                                                                {!promo.communityId && <span className="ml-2 text-[10px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded">全域可用</span>}
                                                                            </div>
                                                                        </div>
                                                                        <button
                                                                            onClick={async () => {
                                                                                if (!window.confirm(`確定刪除促銷活動 [${promo.name}]？(若有綁定商品可能受影響)`)) return;
                                                                                await callGAS(apiUrl, 'deletePromotion', { promoId: promo.promoId }, user.token);
                                                                                fetchAllProducts();
                                                                            }}
                                                                            className="p-2 bg-red-50 text-red-500 rounded-lg hover:bg-red-500 hover:text-white transition-colors cursor-pointer"
                                                                            title="刪除"
                                                                        >
                                                                            <Trash2 size={16} />
                                                                        </button>
                                                                    </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>

                                                {/* 社區專屬定價管理區塊 */}
                                                <div className="bg-[var(--bg-secondary)] p-5 rounded-2xl border border-[var(--border-primary)] shadow-md flex flex-col gap-4">
                                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2.5 border-b border-[var(--border-primary)]">
                                                        <h3 className="font-extrabold text-base text-[var(--text-primary)] flex items-start sm:items-center gap-1.5">
                                                            <span className="text-base flex-shrink-0 mt-0.5 sm:mt-0">🏷️</span>
                                                            <div className="flex flex-col sm:flex-row sm:items-center">
                                                                <span>【{selectedBuilding}】</span>
                                                                <span>專屬商品定價與促銷綁定</span>
                                                            </div>
                                                        </h3>
                                                        <div className="relative min-w-[160px] sm:min-w-[200px]">
                                                            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                                            <input
                                                                type="text"
                                                                placeholder="搜尋商品..."
                                                                value={productSearchTerm}
                                                                onChange={(e) => setProductSearchTerm(e.target.value)}
                                                                className="w-full pl-7 pr-6 py-1.5 text-xs rounded-xl border border-[var(--border-primary)] bg-[var(--bg-tertiary)] text-[var(--text-primary)] focus:outline-none focus:border-blue-500 font-medium"
                                                            />
                                                            {productSearchTerm && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setProductSearchTerm('')}
                                                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs cursor-pointer"
                                                                >
                                                                    ✕
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <p className="text-xs text-[var(--text-tertiary)]">
                                                        在此設定專屬售價並綁定促銷活動引擎。若無設定則採用預設原價。
                                                    </p>

                                                    {loadingCustomPrices ? (
                                                        <div className="text-center py-6 text-xs text-[var(--text-secondary)]">載入客製化價格中...</div>
                                                    ) : (
                                                        <div className="border border-[var(--border-primary)] rounded-xl overflow-hidden max-h-[500px] overflow-y-auto bg-[var(--bg-secondary)] shadow-inner">
                                                            {/* Desktop Header */}
                                                            <div className="hidden md:grid grid-cols-12 gap-3 p-3 bg-[var(--bg-tertiary)] text-[var(--text-secondary)] text-xs font-bold sticky top-0 z-10 border-b border-[var(--border-primary)]">
                                                                <div className="col-span-4">商品名稱</div>
                                                                <div className="col-span-2 text-right pr-4">原價</div>
                                                                <div className="col-span-2">專屬定價</div>
                                                                <div className="col-span-3">促銷活動引擎</div>
                                                                <div className="col-span-1 text-center">操作</div>
                                                            </div>
                                                            <div className="flex flex-col divide-y divide-[var(--border-primary)] text-xs">
                                                                {allProducts
                                                                    .filter(p => !productSearchTerm.trim() || p.name.toLowerCase().includes(productSearchTerm.trim().toLowerCase()))
                                                                    .map(p => {
                                                                    const customData = customPrices[p.id] || { price: '', promotions: [] };
                                                                    const priceVal = customData.price !== undefined ? customData.price : '';
                                                                    const hasCustom = customPrices[p.id] !== undefined;

                                                                    const saveNow = (newData) => {
                                                                        handleSaveCustomPrice(p.id, newData);
                                                                    };

                                                                    const handlePriceChange = (val) => {
                                                                        setCustomPrices(prev => ({
                                                                            ...prev,
                                                                            [p.id]: {
                                                                                ...(prev[p.id] || { price: '', promotions: [] }),
                                                                                price: val !== '' ? Number(val) : ''
                                                                            }
                                                                        }));
                                                                    };

                                                                    return (
                                                                        <div key={p.id} className="flex flex-col md:grid md:grid-cols-12 gap-3 p-4 md:p-3 hover:bg-slate-50/60 transition-colors items-start md:items-center">
                                                                            {/* 商品名稱與手機版原價 */}
                                                                            <div className="md:col-span-4 font-bold text-slate-800 text-sm md:text-xs w-full flex justify-between md:block leading-snug">
                                                                                <span>{p.name}</span>
                                                                                <span className="md:hidden font-mono text-slate-400 font-bold">${p.single_price}</span>
                                                                            </div>
                                                                            
                                                                            {/* 桌面版原價 */}
                                                                            <div className="hidden md:block md:col-span-2 text-right pr-4 font-mono font-bold text-slate-400">
                                                                                ${p.single_price}
                                                                            </div>
                                                                            
                                                                            {/* 專屬定價 */}
                                                                            <div className="md:col-span-2 w-full flex items-center justify-between md:block">
                                                                                <span className="md:hidden font-bold text-slate-500 text-xs">專屬定價</span>
                                                                                <div className="relative w-28 md:w-11/12">
                                                                                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                                                                                    <input
                                                                                        type="number"
                                                                                        min="0"
                                                                                        placeholder="預設"
                                                                                        className="input-field pl-5 p-1.5 w-full text-xs font-bold text-slate-800"
                                                                                        value={priceVal}
                                                                                        onChange={(e) => handlePriceChange(e.target.value)}
                                                                                        onBlur={() => saveNow(customPrices[p.id] || { price: '', promotions: [] })}
                                                                                    />
                                                                                </div>
                                                                            </div>
                                                                            
                                                                            {/* 促銷綁定 */}
                                                                            <div className="md:col-span-3 w-full flex items-center justify-between md:block">
                                                                                <span className="md:hidden font-bold text-slate-500 text-xs">促銷綁定</span>
                                                                                <div className="flex-1 ml-4 md:ml-0 md:w-full">
                                                                                    <select
                                                                                        className="input-field p-1.5 w-full text-xs font-bold text-slate-800 bg-white truncate"
                                                                                        value={customData.promoId || ''}
                                                                                        onChange={(e) => {
                                                                                            const val = e.target.value;
                                                                                            setCustomPrices(prev => {
                                                                                                const current = prev[p.id] || { price: '', promotions: [], promoId: '' };
                                                                                                const newData = { ...current, promoId: val };
                                                                                                handleSaveCustomPrice(p.id, newData);
                                                                                                return { ...prev, [p.id]: newData };
                                                                                            });
                                                                                        }}
                                                                                    >
                                                                                        <option value="">無促銷活動</option>
                                                                                        {allPromotions.map(promo => (
                                                                                            <option key={promo.promoId} value={promo.promoId}>
                                                                                                {promo.name} ({promo.promoType === 'BUY_X_GET_Y' ? `買${promo.buyQty}送${promo.freeQty}` : `任${promo.buyQty}件$${promo.bundlePrice}`})
                                                                                            </option>
                                                                                        ))}
                                                                                    </select>
                                                                                </div>
                                                                            </div>
                                                                            
                                                                            {/* 操作按鈕 */}
                                                                            <div className="md:col-span-1 w-full flex justify-end md:justify-center mt-1 md:mt-0">
                                                                                {savingPriceProductId === p.id ? (
                                                                                    <span className="text-blue-500 font-semibold animate-pulse text-[10px]">儲存中...</span>
                                                                                ) : hasCustom ? (
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={() => handleDeleteCustomPrice(p.id)}
                                                                                        className="px-3 md:px-2 py-1.5 md:py-1 bg-red-100 hover:bg-red-500 text-red-600 hover:text-white rounded md:rounded text-xs md:text-[10px] font-bold active:scale-95 transition-all cursor-pointer"
                                                                                    >
                                                                                        移除專屬
                                                                                    </button>
                                                                                ) : (
                                                                                    <span className="hidden md:inline text-slate-300 text-[10px]">—</span>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                    )}

                    {/* 🛵 頁籤四：散客外送區域管理面板 */}
                    {activeTab === 'DELIVERY_ZONES' && (
                        <div className="bg-[var(--bg-secondary)] p-6 rounded-2xl border border-[var(--border-primary)] shadow-md flex flex-col gap-6">
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-3 border-b border-[var(--border-primary)] gap-2">
                                <div>
                                    <h3 className="font-extrabold text-lg text-[var(--text-primary)] flex items-center gap-2">
                                        <Truck className="text-emerald-500" />
                                        運費管理
                                    </h3>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                                {/* 新增/編輯區域區 */}
                                <div className="lg:col-span-1 bg-[var(--bg-tertiary)] p-4 rounded-2xl border border-[var(--border-primary)] flex flex-col gap-4 h-fit">
                                    <h4 className="font-extrabold text-sm text-[var(--text-primary)] flex items-center gap-1.5 pb-2 border-b border-[var(--border-primary)]">
                                        {editingAreaId ? '📝 編輯外送區域' : '➕ 新增外送區域'}
                                    </h4>
                                    
                                    <form onSubmit={handleSaveArea} className="space-y-4">
                                        <div className="flex flex-col gap-1">
                                            <label className="text-xs font-extrabold text-[var(--text-secondary)]">外送區域名稱 <span className="text-red-500">*</span></label>
                                            <input
                                                type="text"
                                                className="input-field p-2.5 w-full text-sm font-bold"
                                                placeholder="例：台南東區散客、台南白河區"
                                                value={areaName}
                                                onChange={(e) => setAreaName(e.target.value)}
                                            />
                                        </div>

                                        <div className="flex justify-between items-center bg-[var(--bg-tertiary)] p-3 rounded-xl border border-[var(--border-primary)]">
                                            <span className="text-xs font-bold text-[var(--text-secondary)]">此區域永久免運</span>
                                            <label className="inline-flex items-center cursor-pointer select-none">
                                                <div className="relative inline-block w-9 h-5 flex-shrink-0">
                                                    <input
                                                        type="checkbox"
                                                        className="sr-only peer"
                                                        checked={areaFreeShipping}
                                                        onChange={(e) => setAreaFreeShipping(e.target.checked)}
                                                    />
                                                    <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
                                                </div>
                                            </label>
                                        </div>

                                        {!areaFreeShipping && (
                                            <div className="grid grid-cols-2 gap-3">
                                                <div className="flex flex-col gap-1">
                                                    <label className="text-xs font-extrabold text-[var(--text-secondary)]">未達門檻運費</label>
                                                    <div className="relative">
                                                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] text-xs font-bold font-mono">$</span>
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            className="input-field pl-6 p-2.5 w-full text-sm font-bold"
                                                            placeholder="例：60"
                                                            value={areaFee}
                                                            onChange={(e) => setAreaFee(e.target.value)}
                                                        />
                                                    </div>
                                                </div>
                                                <div className="flex flex-col gap-1">
                                                    <label className="text-xs font-extrabold text-[var(--text-secondary)]">免運門檻金額</label>
                                                    <div className="relative">
                                                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] text-xs font-bold font-mono">$</span>
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            className="input-field pl-6 p-2.5 w-full text-sm font-bold"
                                                            placeholder="例：500"
                                                            value={areaFreeMin}
                                                            onChange={(e) => setAreaFreeMin(e.target.value)}
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        <div className="flex gap-2 justify-end pt-2">
                                            {editingAreaId && (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setEditingAreaId('');
                                                        setAreaName('');
                                                        setAreaFee('');
                                                        setAreaFreeMin('');
                                                        setAreaFreeShipping(false);
                                                    }}
                                                    className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-bold active:scale-95 transition-all cursor-pointer"
                                                >
                                                    取消編輯
                                                </button>
                                            )}
                                            <button
                                                type="submit"
                                                disabled={isSavingArea}
                                                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md shadow-blue-500/20 active:scale-95 transition-all cursor-pointer"
                                            >
                                                <Save size={12} />
                                                {isSavingArea ? '儲存中...' : (editingAreaId ? '更新區域' : '新增區域')}
                                            </button>
                                        </div>
                                    </form>
                                </div>

                                {/* 已設定區域列表 */}
                                <div className="lg:col-span-2 bg-[var(--bg-tertiary)] p-4 rounded-2xl border border-[var(--border-primary)] flex flex-col gap-4">
                                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-2 border-b border-[var(--border-primary)]">
                                        <h4 className="font-extrabold text-sm text-[var(--text-primary)]">📦 外送區域列表</h4>
                                        
                                        {/* 🔍 散客外送區域搜尋框與視圖切換 */}
                                        <div className="flex items-center gap-2 w-full sm:w-auto">
                                            <div className="relative flex-1 sm:w-56">
                                                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                                <input
                                                    type="text"
                                                    placeholder="搜尋外送區域名稱..."
                                                    value={deliveryAreaSearchTerm}
                                                    onChange={(e) => setDeliveryAreaSearchTerm(e.target.value)}
                                                    className="w-full pl-8 pr-8 py-1.5 text-xs rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-primary)] focus:outline-none focus:border-blue-500 font-bold placeholder:font-normal placeholder:text-slate-400 transition-colors"
                                                />
                                                {deliveryAreaSearchTerm && (
                                                    <button
                                                        type="button"
                                                        onClick={() => setDeliveryAreaSearchTerm('')}
                                                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold w-4 h-4 rounded-full hover:bg-slate-200 flex items-center justify-center transition-colors cursor-pointer"
                                                    >
                                                        ✕
                                                    </button>
                                                )}
                                            </div>
                                            
                                            {/* 視圖切換按鈕 */}
                                            <div className="flex items-center bg-[var(--bg-primary)] p-0.5 rounded-lg border border-[var(--border-primary)] shrink-0">
                                                <button
                                                    onClick={() => setDeliveryAreaViewMode('grid')}
                                                    className={`p-1.5 rounded-md transition-all text-xs font-bold flex items-center gap-1 cursor-pointer ${
                                                        deliveryAreaViewMode === 'grid'
                                                            ? 'bg-[var(--bg-secondary)] text-blue-600 dark:text-blue-400 shadow-sm border border-[var(--border-primary)]'
                                                            : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)] border border-transparent'
                                                    }`}
                                                    title="卡片視圖"
                                                >
                                                    <LayoutGrid size={14} />
                                                </button>
                                                <button
                                                    onClick={() => setDeliveryAreaViewMode('table')}
                                                    className={`p-1.5 rounded-md transition-all text-xs font-bold flex items-center gap-1 cursor-pointer ${
                                                        deliveryAreaViewMode === 'table'
                                                            ? 'bg-[var(--bg-secondary)] text-blue-600 dark:text-blue-400 shadow-sm border border-[var(--border-primary)]'
                                                            : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)] border border-transparent'
                                                    }`}
                                                    title="列表視圖"
                                                >
                                                    <List size={14} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    {loadingCommunities && communities.length === 0 ? (
                                        <div className="text-center py-10 text-xs text-[var(--text-secondary)]">載入外送區域中...</div>
                                    ) : deliveryAreaViewMode === 'grid' ? (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            {communities
                                                .filter(c => !deliveryAreaSearchTerm.trim() || c.communityName.toLowerCase().includes(deliveryAreaSearchTerm.trim().toLowerCase()))
                                                .length > 0 ? (
                                                communities
                                                    .filter(c => !deliveryAreaSearchTerm.trim() || c.communityName.toLowerCase().includes(deliveryAreaSearchTerm.trim().toLowerCase()))
                                                    .map((c) => (
                                                        <div key={c.communityId} className="bg-[var(--bg-primary)] rounded-2xl border border-[var(--border-primary)] p-4 flex flex-col gap-4 shadow-sm hover:shadow-md hover:border-blue-500/40 transition-all relative overflow-hidden group">
                                                            <div className="flex justify-between items-start">
                                                                <div className="font-black text-lg text-[var(--text-primary)] tracking-tight">{c.communityName}</div>
                                                            </div>
                                                            
                                                            <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)]/60 rounded-xl p-3 flex items-center justify-between">
                                                                <div>
                                                                    <div className="text-[11px] text-[var(--text-tertiary)] font-extrabold flex items-center gap-1 uppercase tracking-wider">
                                                                        運費
                                                                    </div>
                                                                    <div className={`text-xl font-black font-mono mt-0.5 tracking-tight ${c.defaultFreeShipping ? 'text-emerald-600 dark:text-emerald-400' : 'text-orange-500'}`}>
                                                                        {c.defaultFreeShipping ? '免運' : `$${c.shippingFee}`}
                                                                    </div>
                                                                </div>
                                                                <div className="text-right border-l border-[var(--border-primary)] pl-3">
                                                                    <div className="text-[10px] text-[var(--text-tertiary)] font-bold">免運門檻</div>
                                                                    <div className="text-sm font-black text-[var(--text-primary)] font-mono mt-0.5">
                                                                        {c.defaultFreeShipping ? '-' : (c.freeShippingMin > 0 ? `滿 $${c.freeShippingMin}` : '無門檻')}
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-[var(--border-primary)]/50 mt-auto">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        setEditingAreaId(c.communityId);
                                                                        setAreaName(c.communityName);
                                                                        setAreaFreeShipping(c.defaultFreeShipping);
                                                                        setAreaFee(c.shippingFee || '');
                                                                        setAreaFreeMin(c.freeShippingMin || '');
                                                                    }}
                                                                    className="py-2 px-3 bg-[var(--bg-tertiary)] hover:bg-amber-500/10 hover:text-amber-600 text-[var(--text-primary)] rounded-xl text-xs font-bold border border-[var(--border-primary)] hover:border-amber-500/30 active:scale-95 transition-all cursor-pointer flex items-center justify-center"
                                                                >
                                                                    編輯
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleDeleteArea(c.communityId, c.communityName)}
                                                                    className="py-2 px-3 bg-[var(--bg-tertiary)] hover:bg-rose-500/10 hover:text-rose-600 text-[var(--text-primary)] rounded-xl text-xs font-bold border border-[var(--border-primary)] hover:border-rose-500/30 active:scale-95 transition-all cursor-pointer flex items-center justify-center"
                                                                >
                                                                    刪除
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ))
                                            ) : (
                                                <div className="col-span-full text-center p-10 text-[var(--text-tertiary)] bg-[var(--bg-primary)] rounded-2xl border border-[var(--border-primary)]">
                                                    <Truck className="mx-auto mb-3 opacity-30" size={36} />
                                                    <p className="font-bold text-sm text-[var(--text-secondary)]">
                                                        {deliveryAreaSearchTerm ? `查無符合「${deliveryAreaSearchTerm}」的外送區域` : '目前尚無外送區域，請在左側表單建立第一個區域！'}
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="border border-[var(--border-primary)] rounded-xl overflow-hidden overflow-x-auto w-full">
                                            <table className="w-full text-left text-xs whitespace-nowrap min-w-[500px]">
                                                <thead className="bg-[var(--bg-secondary)] text-[var(--text-secondary)] font-bold">
                                                    <tr className="border-b border-[var(--border-primary)]">
                                                        <th className="p-3">區域名稱</th>
                                                        <th className="p-3">運費</th>
                                                        <th className="p-3">免運門檻</th>
                                                        <th className="p-3 text-center">操作</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-[var(--border-primary)] bg-[var(--bg-primary)]">
                                                    {communities
                                                        .filter(c => !deliveryAreaSearchTerm.trim() || c.communityName.toLowerCase().includes(deliveryAreaSearchTerm.trim().toLowerCase()))
                                                        .length > 0 ? (
                                                        communities
                                                            .filter(c => !deliveryAreaSearchTerm.trim() || c.communityName.toLowerCase().includes(deliveryAreaSearchTerm.trim().toLowerCase()))
                                                            .map((c) => (
                                                                <tr key={c.communityId} className="hover:bg-slate-50 transition-colors">
                                                                    <td className="p-3 font-bold text-slate-800">{c.communityName}</td>
                                                                    <td className="p-3 font-mono font-bold text-orange-500">
                                                                        {c.defaultFreeShipping ? '免運' : `$${c.shippingFee}`}
                                                                    </td>
                                                                    <td className="p-3 font-mono font-bold text-slate-600">
                                                                        {c.defaultFreeShipping ? '-' : (c.freeShippingMin > 0 ? `滿 $${c.freeShippingMin}` : '無門檻')}
                                                                    </td>
                                                                    <td className="p-3 text-center space-x-1.5">
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => {
                                                                                setEditingAreaId(c.communityId);
                                                                                setAreaName(c.communityName);
                                                                                setAreaFreeShipping(c.defaultFreeShipping);
                                                                                setAreaFee(c.shippingFee || '');
                                                                                setAreaFreeMin(c.freeShippingMin || '');
                                                                            }}
                                                                            className="px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500 text-amber-600 hover:text-white rounded border border-amber-500/20 active:scale-95 transition-all cursor-pointer"
                                                                        >
                                                                            編輯
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => handleDeleteArea(c.communityId, c.communityName)}
                                                                            className="px-2.5 py-1 bg-rose-500/10 hover:bg-rose-500 text-rose-600 hover:text-white rounded border border-rose-500/20 active:scale-95 transition-all cursor-pointer"
                                                                        >
                                                                            刪除
                                                                        </button>
                                                                    </td>
                                                                </tr>
                                                            ))
                                                    ) : (
                                                        <tr>
                                                            <td colSpan="4" className="text-center p-8 text-slate-400">
                                                                {deliveryAreaSearchTerm ? `查無符合「${deliveryAreaSearchTerm}」的外送區域` : '目前尚無外送區域，請在左側表單建立第一個區域！'}
                                                            </td>
                                                        </tr>
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                    {activeTab === 'REWARD_SETTINGS' && (
                        <div className="bg-[var(--bg-secondary)] p-5 rounded-2xl border border-[var(--border-primary)] shadow-sm space-y-6">
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-[var(--border-primary)] pb-4">
                                <div>
                                    <h3 className="font-black text-lg text-[var(--text-primary)] flex items-center gap-2">
                                        <Gift className="text-emerald-500" /> 線上會員滿額折抵設定 (LIFF)
                                    </h3>
                                    <p className="text-xs text-[var(--text-secondary)] mt-1 font-medium">
                                        顧客下單時可自選套用已解鎖之滿額折抵，使用後將自動扣除對應門檻額度。
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={async () => {
                                        setRewardSaving(true);
                                        try {
                                            const ids = rewardTestUserIds.split(',').map(s => s.trim()).filter(Boolean);
                                            const res = await callGAS(apiUrl, 'saveRewardConfig', {
                                                mode: rewardMode,
                                                testUserIds: ids,
                                                tierRules: rewardTierRules
                                            }, user?.token);
                                            if (res && res.success) {
                                                alert('成功儲存滿額折抵設定！');
                                            } else {
                                                alert(res?.error || '儲存失敗');
                                            }
                                        } catch (e) {
                                            alert('儲存出錯');
                                        } finally {
                                            setRewardSaving(false);
                                        }
                                    }}
                                    disabled={rewardSaving}
                                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl shadow-md flex items-center gap-2 cursor-pointer disabled:opacity-50"
                                >
                                    <Save size={16} />
                                    {rewardSaving ? '儲存中...' : '儲存設定'}
                                </button>
                            </div>

                            {/* 1. 功能模式設定 */}
                            <div className="bg-[var(--bg-tertiary)] p-4 rounded-xl border border-[var(--border-primary)] space-y-3">
                                <label className="text-xs font-black text-[var(--text-primary)] flex items-center gap-1.5">
                                    <ShieldCheck size={16} className="text-blue-500" />
                                    功能運行狀態模式：
                                </label>
                                <div className="grid grid-cols-3 gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setRewardMode('OFF')}
                                        className={`py-3 px-3 rounded-xl text-xs font-black flex flex-col items-center gap-1 cursor-pointer transition-all border ${
                                            rewardMode === 'OFF'
                                                ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/40 shadow-sm'
                                                : 'bg-[var(--bg-primary)] text-[var(--text-tertiary)] border-[var(--border-primary)]'
                                        }`}
                                    >
                                        <span className="text-sm">🔴 關閉 (OFF)</span>
                                        <span className="text-[10px] font-normal">全站顧客皆無法使用</span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setRewardMode('TEST')}
                                        className={`py-3 px-3 rounded-xl text-xs font-black flex flex-col items-center gap-1 cursor-pointer transition-all border ${
                                            rewardMode === 'TEST'
                                                ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/40 shadow-sm'
                                                : 'bg-[var(--bg-primary)] text-[var(--text-tertiary)] border-[var(--border-primary)]'
                                        }`}
                                    >
                                        <span className="text-sm">🟡 測試模式 (TEST)</span>
                                        <span className="text-[10px] font-normal">僅下方指定的 LINE UserID 能測試</span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setRewardMode('ON')}
                                        className={`py-3 px-3 rounded-xl text-xs font-black flex flex-col items-center gap-1 cursor-pointer transition-all border ${
                                            rewardMode === 'ON'
                                                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/40 shadow-sm'
                                                : 'bg-[var(--bg-primary)] text-[var(--text-tertiary)] border-[var(--border-primary)]'
                                        }`}
                                    >
                                        <span className="text-sm">🟢 全站正式開啟 (ON)</span>
                                        <span className="text-[10px] font-normal">所有 LIFF 下單顧客全面啟用</span>
                                    </button>
                                </div>

                                {rewardMode === 'TEST' && (
                                    <div className="pt-2 space-y-1 animate-in fade-in duration-150">
                                        <label className="text-[11px] font-bold text-[var(--text-secondary)]">允許測試的 LINE User ID (用逗號隔開)：</label>
                                        <input
                                            type="text"
                                            value={rewardTestUserIds}
                                            onChange={(e) => setRewardTestUserIds(e.target.value)}
                                            placeholder="留空代表允許所有管理員測試，或貼入 U123456..."
                                            className="w-full p-2.5 bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-xl text-xs font-mono"
                                        />
                                        <p className="text-[10px] text-[var(--text-tertiary)]">可在「會員管理」頁面複製您自己的 LINE UserID。</p>
                                    </div>
                                )}
                            </div>

                            {/* 2. 階梯門檻規則管理 */}
                            <div className="space-y-3">
                                <div className="flex justify-between items-center">
                                    <h4 className="font-extrabold text-sm text-[var(--text-primary)] flex items-center gap-1.5">
                                        <Sparkles size={16} className="text-amber-500" />
                                        階梯門檻與對應折抵金額
                                    </h4>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const lastRule = rewardTierRules[rewardTierRules.length - 1] || { spendMin: 0, discount: 0 };
                                            setRewardTierRules([
                                                ...rewardTierRules,
                                                { spendMin: lastRule.spendMin + 5000, discount: lastRule.discount + 200 }
                                            ]);
                                        }}
                                        className="px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 rounded-xl text-xs font-bold border border-blue-500/30 flex items-center gap-1 cursor-pointer"
                                    >
                                        <Plus size={14} /> 新增門檻
                                    </button>
                                </div>

                                <div className="space-y-2">
                                    {rewardTierRules.map((rule, idx) => (
                                        <div key={idx} className="flex items-center gap-2 bg-[var(--bg-tertiary)] p-3 rounded-xl border border-[var(--border-primary)]">
                                            <span className="font-extrabold text-xs text-[var(--text-tertiary)] w-12">階梯 {idx + 1}</span>
                                            <div className="flex-1 flex items-center gap-2">
                                                <div className="flex items-center gap-1 text-xs font-bold text-[var(--text-secondary)]">
                                                    <span>滿 $</span>
                                                    <input
                                                        type="number"
                                                        value={rule.spendMin}
                                                        onChange={(e) => {
                                                            const newRules = [...rewardTierRules];
                                                            newRules[idx].spendMin = Number(e.target.value) || 0;
                                                            setRewardTierRules(newRules);
                                                        }}
                                                        className="w-24 p-1.5 bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-lg text-xs font-mono font-black"
                                                    />
                                                </div>

                                                <span className="text-xs text-[var(--text-tertiary)] font-bold">折抵 ➔</span>

                                                <div className="flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                                                    <span>$</span>
                                                    <input
                                                        type="number"
                                                        value={rule.discount}
                                                        onChange={(e) => {
                                                            const newRules = [...rewardTierRules];
                                                            newRules[idx].discount = Number(e.target.value) || 0;
                                                            setRewardTierRules(newRules);
                                                        }}
                                                        className="w-20 p-1.5 bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-lg text-xs font-mono font-black text-emerald-600 dark:text-emerald-400"
                                                    />
                                                </div>
                                            </div>

                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setRewardTierRules(rewardTierRules.filter((_, i) => i !== idx));
                                                }}
                                                className="p-1.5 text-rose-500 hover:bg-rose-500/10 rounded-lg cursor-pointer"
                                                title="刪除此階梯"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
