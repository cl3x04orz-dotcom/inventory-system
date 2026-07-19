import React, { useState, useEffect, useCallback } from 'react';
import { Link, Calendar, Clock, Copy, Save, Plus, Check, RefreshCw, Truck, Edit2, Trash2, ChevronUp, ChevronDown, StickyNote } from 'lucide-react';
import { callGAS } from '../utils/api';

export default function GroupBuySettingsPage({ user, apiUrl }) {
    const [settings, setSettings] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selectedBuilding, setSelectedBuilding] = useState('');
    const [isAddingNew, setIsAddingNew] = useState(false);
    const [newBuildingName, setNewBuildingName] = useState('');
    
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
        }
    }, [user.token, fetchSettings]);

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

    // 儲存運費設定
    const handleSaveShipping = async () => {
        const targetBuilding = isAddingNew ? newBuildingName.trim() : selectedBuilding;
        if (!targetBuilding || targetBuilding === '__new__') {
            alert('請先選擇或建立大樓！');
            return;
        }
        setIsSavingShipping(true);
        try {
            const res = await callGAS(apiUrl, 'saveCommunityShipping', {
                building: targetBuilding,
                default_free_shipping: isFreeShipping,
                free_shipping_min: isFreeShipping ? 0 : (Number(freeShippingMin) || 0),
                shipping_fee: isFreeShipping ? 0 : (Number(shippingFee) || 0),
            }, user.token);
            if (res && res.error) throw new Error(res.error);
            alert(`「${targetBuilding}」運費設定儲存成功！`);
            await fetchSettings();
        } catch (error) {
            alert('儲存運費設定失敗: ' + error.message);
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

    const handleCopy = () => {
        const url = getGeneratedUrl();
        if (!url) return;

        navigator.clipboard.writeText(url)
            .then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
            })
            .catch(() => {
                const textArea = document.createElement('textarea');
                textArea.value = url;
                textArea.style.position = 'fixed';
                document.body.appendChild(textArea);
                textArea.focus();
                textArea.select();
                try {
                    document.execCommand('copy');
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                } catch (e) {
                    alert('複製失敗，請手動複製網址');
                }
                document.body.removeChild(textArea);
            });
    };

    const activeUrl = getGeneratedUrl();

    return (
        <div className="max-w-6xl mx-auto min-h-screen flex flex-col p-4 gap-4 pb-24">
            {/* Header Area */}
            <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center bg-[var(--bg-secondary)] p-4 rounded-xl border border-[var(--border-primary)] shadow-sm gap-4">
                <h2 className="text-xl md:text-2xl font-bold flex items-center gap-2 text-[var(--text-primary)]">
                    <Link className="text-blue-600" />
                    開團管理
                </h2>
                <button onClick={fetchSettings} className="btn-secondary px-3 py-1.5 rounded-lg text-xs font-bold" disabled={loading}>
                    {loading ? '載入中...' : '重新整理'}
                </button>
            </div>

            {loading && settings.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center py-20 gap-3 text-[var(--text-secondary)]">
                    <RefreshCw className="animate-spin text-blue-500" size={36} />
                    <span>載入大樓時段設定中...</span>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5 pb-6">
                    {/* Left: Building Selection Card */}
                    <div className="md:col-span-1 bg-[var(--bg-secondary)] p-5 rounded-2xl border border-[var(--border-primary)] shadow-md flex flex-col gap-4 h-auto md:h-full overflow-hidden">
                        <h3 className="font-extrabold text-base text-[var(--text-primary)] pb-2.5 border-b border-[var(--border-primary)] flex items-center gap-1.5 flex-shrink-0">
                            <span className="flex items-center justify-center bg-blue-500 text-white rounded-full w-5 h-5 text-xs font-black">1</span>
                            選擇大樓 / 社區
                        </h3>
                        
                        {/* 大樓清單區 */}
                        <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
                            {settings.map((s, idx) => {
                                const isSelected = selectedBuilding === s.building && !isAddingNew;
                                return (
                                    <button
                                        key={s.building}
                                        type="button"
                                        onClick={() => {
                                            setIsAddingNew(false);
                                            setSelectedBuilding(s.building);
                                            updateFormFields(s.building);
                                        }}
                                        className={`w-full text-left p-3 rounded-xl border flex items-center justify-between transition-all duration-200 ${
                                            isSelected 
                                                ? 'bg-blue-50 border-blue-200 text-blue-700 shadow-sm font-extrabold' 
                                                : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700 hover:text-slate-900'
                                        }`}
                                    >
                                        <div className="flex items-center gap-2 min-w-0 flex-1">
                                            <span className="text-base flex-shrink-0">🏢</span>
                                            <div className="flex flex-col min-w-0">
                                                <span className="text-base font-bold tracking-wide truncate">{s.building}</span>
                                                {s.admin_note && (
                                                    <span className="text-xs text-amber-600 font-medium truncate leading-tight mt-0.5">
                                                        {s.admin_note}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        {isSelected ? (
                                            <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                                                <button
                                                    type="button"
                                                    onClick={() => handleMoveBuilding(idx, -1)}
                                                    disabled={idx === 0}
                                                    className="p-1 hover:bg-blue-100 rounded text-blue-400 disabled:opacity-30 transition-colors"
                                                    title="上移"
                                                >
                                                    <ChevronUp size={14} />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleMoveBuilding(idx, 1)}
                                                    disabled={idx === settings.length - 1}
                                                    className="p-1 hover:bg-blue-100 rounded text-blue-400 disabled:opacity-30 transition-colors"
                                                    title="下移"
                                                >
                                                    <ChevronDown size={14} />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleRenameClick(s.building)}
                                                    className="p-1 hover:bg-blue-150 rounded text-blue-600 transition-colors"
                                                    title="修改名稱"
                                                >
                                                    <Edit2 size={15} />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleDeleteClick(s.building)}
                                                    className="p-1 hover:bg-red-50 rounded text-red-500 transition-colors"
                                                    title="刪除大樓"
                                                >
                                                    <Trash2 size={15} />
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="w-4 h-4"></div>
                                        )}
                                    </button>
                                );
                            })}
                            
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
                                className={`w-full text-left p-3 rounded-xl border-2 border-dashed flex items-center gap-2 transition-all duration-200 ${
                                    isAddingNew 
                                        ? 'bg-blue-50 border-blue-300 text-blue-600 font-extrabold' 
                                        : 'bg-transparent border-slate-300 hover:border-slate-400 text-slate-500 hover:text-slate-700'
                                }`}
                            >
                                <Plus size={20} />
                                <span className="text-lg font-bold">新增大樓 / 社區</span>
                            </button>
                        </div>

                        {isAddingNew && (
                            <div className="space-y-1.5 animate-in fade-in slide-in-from-top-1 duration-150 p-3 bg-blue-50/30 border border-blue-100 rounded-xl flex-shrink-0">
                                <label className="text-sm font-extrabold text-blue-600">自訂新大樓名稱</label>
                                <input
                                    type="text"
                                    className="input-field w-full p-3 rounded-xl border border-blue-200 bg-white text-base font-bold focus:outline-none focus:border-blue-500"
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

                    {/* Right: Settings Container */}
                    <div className="md:col-span-2 flex flex-col gap-5">
                        
                        {/* Auto Settings Card */}
                        <div className="bg-[var(--bg-secondary)] p-5 rounded-2xl border border-[var(--border-primary)] shadow-md flex flex-col gap-4">
                            <div className="flex justify-between items-center pb-2.5 border-b border-[var(--border-primary)]">
                                <h3 className="font-extrabold text-base text-[var(--text-primary)] flex items-center gap-1.5">
                                    <span className="flex items-center justify-center bg-blue-500 text-white rounded-full w-5 h-5 text-xs font-black">2</span>
                                    每週定期自動開關團設定
                                </h3>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        className="sr-only peer"
                                        checked={isAuto}
                                        onChange={(e) => setIsAuto(e.target.checked)}
                                    />
                                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                                </label>
                            </div>

                            {isAuto ? (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 animate-in fade-in duration-200">
                                    {/* Auto Open Time */}
                                    <div className="space-y-3 p-4 bg-emerald-50/10 dark:bg-emerald-950/10 rounded-2xl border border-emerald-500/20">
                                        <label className="text-base font-extrabold text-emerald-600 flex items-center gap-1.5">
                                            <Clock size={18} />
                                            自動開團時間 (每週)
                                        </label>
                                        <div className="grid grid-cols-2 gap-2">
                                            <select
                                                className="input-field p-3 text-sm bg-[var(--bg-secondary)] border-[var(--border-primary)]"
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
                                                className="input-field p-3 text-sm bg-[var(--bg-secondary)] border-[var(--border-primary)]"
                                                value={autoOpenTime}
                                                onChange={(e) => setAutoOpenTime(e.target.value)}
                                            />
                                        </div>
                                    </div>

                                    {/* Auto Close Time */}
                                    <div className="space-y-3 p-4 bg-rose-50/10 dark:bg-rose-950/10 rounded-2xl border border-rose-500/20">
                                        <label className="text-base font-extrabold text-rose-600 flex items-center gap-1.5">
                                            <Clock size={18} />
                                            自動結單時間 (每週)
                                        </label>
                                        <div className="grid grid-cols-2 gap-2">
                                            <select
                                                className="input-field p-3 text-sm bg-[var(--bg-secondary)] border-[var(--border-primary)]"
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
                                                className="input-field p-3 text-sm bg-[var(--bg-secondary)] border-[var(--border-primary)]"
                                                value={autoCloseTime}
                                                onChange={(e) => setAutoCloseTime(e.target.value)}
                                            />
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <p className="text-sm text-[var(--text-tertiary)] italic">
                                    💡 啟用後，大樓每週將在指定星期與時間「自動開關團」，不需每次手動設定。
                                </p>
                            )}
                        </div>

                        {/* Manual Settings Card */}
                        <div className="bg-[var(--bg-secondary)] p-5 rounded-2xl border border-[var(--border-primary)] shadow-md flex flex-col gap-4">
                            <h3 className="font-extrabold text-base text-[var(--text-primary)] pb-2.5 border-b border-[var(--border-primary)] flex items-center gap-1.5">
                                <span className="flex items-center justify-center bg-blue-500 text-white rounded-full w-5 h-5 text-xs font-black">3</span>
                                手動臨時加開時段設定
                            </h3>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {/* Start Time */}
                                <div className="space-y-3 p-4 bg-[var(--bg-tertiary)] rounded-2xl border border-[var(--border-primary)] flex flex-col justify-between">
                                    <div className="space-y-2">
                                        <label className="text-sm font-extrabold text-[var(--text-primary)] flex items-center gap-1.5">
                                            <Calendar className="text-amber-500" size={16} />
                                            加開：開始時間
                                        </label>
                                        <input
                                            type="date"
                                            id="startDate"
                                            className="input-field w-full p-3 text-sm rounded-lg border bg-[var(--bg-secondary)] font-bold focus:border-blue-500"
                                            value={startDate}
                                            onChange={(e) => setStartDate(e.target.value)}
                                            onKeyDown={(e) => handleKeyDown(e, 'startTime', null)}
                                        />
                                        <input
                                            type="time"
                                            id="startTime"
                                            className="input-field w-full p-3 text-sm rounded-lg border bg-[var(--bg-secondary)] font-bold focus:border-blue-500"
                                            value={startTime}
                                            onChange={(e) => setStartTime(e.target.value)}
                                            onKeyDown={(e) => handleKeyDown(e, 'endDate', 'startDate')}
                                        />
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => { setStartDate(''); setStartTime(''); }}
                                        className="text-xs text-red-500 font-bold hover:underline self-start mt-2"
                                    >
                                        清除開始時間
                                    </button>
                                </div>

                                {/* End Time */}
                                <div className="space-y-3 p-4 bg-[var(--bg-tertiary)] rounded-2xl border border-[var(--border-primary)] flex flex-col justify-between">
                                    <div className="space-y-2">
                                        <label className="text-sm font-extrabold text-[var(--text-primary)] flex items-center gap-1.5">
                                            <Clock className="text-rose-500" size={16} />
                                            加開：結束時間
                                        </label>
                                        <input
                                            type="date"
                                            id="endDate"
                                            className="input-field w-full p-3 text-sm rounded-lg border bg-[var(--bg-secondary)] font-bold focus:border-blue-500"
                                            value={endDate}
                                            onChange={(e) => setEndDate(e.target.value)}
                                            onKeyDown={(e) => handleKeyDown(e, 'endTime', 'startTime')}
                                        />
                                        <input
                                            type="time"
                                            id="endTime"
                                            className="input-field w-full p-3 text-sm rounded-lg border bg-[var(--bg-secondary)] font-bold focus:border-blue-500"
                                            value={endTime}
                                            onChange={(e) => setEndTime(e.target.value)}
                                            onKeyDown={(e) => handleKeyDown(e, 'saveBtn', 'endDate')}
                                        />
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => { setEndDate(''); setEndTime(''); }}
                                        className="text-xs text-red-500 font-bold hover:underline self-start mt-2"
                                    >
                                        清除結束時間
                                    </button>
                                </div>
                            </div>

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

                        {/* Shipping Settings Card */}
                        {!isAddingNew && selectedBuilding && (
                            <>
                            {/* 管理員備注 */}
                            <div className="bg-amber-50/60 border border-amber-200 p-4 rounded-2xl flex flex-col gap-2">
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
                            <div className="bg-[var(--bg-secondary)] p-5 rounded-2xl border border-[var(--border-primary)] shadow-md flex flex-col gap-4">
                                <div className="flex justify-between items-center pb-2.5 border-b border-[var(--border-primary)]">
                                    <h3 className="font-extrabold text-base text-[var(--text-primary)] flex items-center gap-1.5">
                                        <Truck size={18} className="text-emerald-500" />
                                        運費設定
                                    </h3>
                                    {/* 免運切換 */}
                                    <label className="relative inline-flex items-center cursor-pointer gap-2">
                                        <span className="text-sm font-semibold text-[var(--text-secondary)]">永久免運</span>
                                        <input
                                            type="checkbox"
                                            className="sr-only peer"
                                            checked={isFreeShipping}
                                            onChange={(e) => setIsFreeShipping(e.target.checked)}
                                        />
                                        <div className="w-11 h-6 bg-gray-200 dark:bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                                    </label>
                                </div>

                                {isFreeShipping ? (
                                    <p className="text-sm text-emerald-600 font-semibold bg-emerald-50 rounded-xl p-3 flex items-center gap-2">
                                        ✅ 此社區永久免運，不加收任何運費。
                                    </p>
                                ) : (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                                                />
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* 預覽 */}
                                {!isFreeShipping && (Number(shippingFee) > 0 || Number(freeShippingMin) > 0) && (
                                    <div className="text-xs text-slate-500 bg-slate-50 rounded-xl p-3 border border-slate-100">
                                        📦 規則預覽：訂單滿 <strong>${Number(freeShippingMin) || 0}</strong> 免運；未滿則加收 <strong>${Number(shippingFee) || 0}</strong> 運費。
                                    </div>
                                )}

                                <div className="flex justify-end border-t border-[var(--border-primary)]/50 pt-3">
                                    <button
                                        onClick={handleSaveShipping}
                                        disabled={isSavingShipping}
                                        className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold flex items-center gap-1.5 shadow-md shadow-emerald-500/20 active:scale-95 transition-all"
                                    >
                                        <Truck size={14} />
                                        {isSavingShipping ? '儲存中...' : '儲存運費設定'}
                                    </button>
                                </div>
                            </div>
                            </>  
                        )}

                        {/* URL Generation display */}
                        {activeUrl && (
                            <div className="p-4 bg-blue-50/50 border border-blue-100 rounded-2xl space-y-2.5 animate-in fade-in duration-200">
                                <h4 className="font-extrabold text-sm text-blue-800">
                                    🔗 獲取大樓專屬下單網址
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
                                        className="sm:w-28 py-2.5 rounded-xl font-bold flex items-center justify-center gap-1 shadow-sm text-xs text-white bg-blue-600 hover:bg-blue-700 active:scale-95 transition-all"
                                        style={{ backgroundColor: copied ? '#10B981' : undefined }}
                                    >
                                        {copied ? <Check size={14} /> : <Copy size={14} />}
                                        {copied ? '已複製！' : '一鍵複製'}
                                    </button>
                                </div>
                                <p className="text-xs text-slate-500 font-medium">
                                    ※ 複製此網址丟給該大樓社區住戶即可下單。系統會自動鎖定該大樓，並依據您所設定的每週自動或手動加開時段進行下單驗證。
                                </p>
                            </div>
                        )}

                    </div>
                </div>
            )}

            {/* 🚚 線上下單散客外送區域管理面板 */}
            <div className="bg-[var(--bg-secondary)] p-6 rounded-2xl border border-[var(--border-primary)] shadow-md flex flex-col gap-6 mt-4">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-3 border-b border-[var(--border-primary)] gap-2">
                    <div>
                        <h3 className="font-extrabold text-lg text-[var(--text-primary)] flex items-center gap-2">
                            <Truck className="text-emerald-500" />
                            線上下單外送區域與運費管理 (散客專用)
                        </h3>
                        <p className="text-xs text-[var(--text-secondary)] mt-1">針對「一般常態線上下單」的散客，依據台南不同行政區(如東區、永康、白河)設定各自的配送運費與免運門檻。</p>
                    </div>
                    <button
                        onClick={fetchCommunities}
                        className="btn-secondary px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5"
                        disabled={loadingCommunities}
                    >
                        <RefreshCw size={12} className={loadingCommunities ? 'animate-spin' : ''} />
                        重新整理
                    </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* 新增/編輯區域區 */}
                    <div className="lg:col-span-1 border-r border-[var(--border-primary)]/50 pr-0 lg:pr-6 space-y-4">
                        <h4 className="font-bold text-sm text-[var(--text-primary)] flex items-center gap-1.5">
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
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        className="sr-only peer"
                                        checked={areaFreeShipping}
                                        onChange={(e) => setAreaFreeShipping(e.target.checked)}
                                    />
                                    <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
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
                                        className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-bold active:scale-95 transition-all"
                                    >
                                        取消編輯
                                    </button>
                                )}
                                <button
                                    type="submit"
                                    disabled={isSavingArea}
                                    className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md shadow-blue-500/20 active:scale-95 transition-all"
                                >
                                    <Save size={12} />
                                    {isSavingArea ? '儲存中...' : (editingAreaId ? '更新區域' : '新增區域')}
                                </button>
                            </div>
                        </form>
                    </div>

                    {/* 已設定區域列表 */}
                    <div className="lg:col-span-2 space-y-3">
                        <h4 className="font-bold text-sm text-[var(--text-primary)]">📦 目前已設定的外送區域列表</h4>
                        
                        {loadingCommunities && communities.length === 0 ? (
                            <div className="text-center py-10 text-xs text-[var(--text-secondary)]">載入外送區域中...</div>
                        ) : (
                            <div className="border border-[var(--border-primary)] rounded-xl overflow-hidden">
                                <table className="w-full text-left text-xs">
                                    <thead className="bg-[var(--bg-secondary)] text-[var(--text-secondary)] font-bold">
                                        <tr className="border-b border-[var(--border-primary)]">
                                            <th className="p-3">區域名稱</th>
                                            <th className="p-3">運費</th>
                                            <th className="p-3">免運門檻</th>
                                            <th className="p-3 text-center">操作</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[var(--border-primary)] bg-[var(--bg-primary)]">
                                        {communities.length > 0 ? (
                                            communities.map((c) => (
                                                <tr key={c.communityId} className="hover:bg-slate-50 transition-colors">
                                                    <td className="p-3 font-bold text-slate-800">{c.communityName}</td>
                                                    <td className="p-3 font-mono font-bold text-orange-500">
                                                        {c.defaultFreeShipping ? '免運' : `$${c.shippingFee}`}
                                                    </td>
                                                    <td className="p-3 font-mono font-bold text-slate-600">
                                                        {c.defaultFreeShipping ? '-' : (c.freeShippingMin > 0 ? `滿 $${c.freeShippingMin} 免運` : '無免運門檻')}
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
                                                            className="px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500 text-amber-600 hover:text-white rounded border border-amber-500/20 active:scale-95 transition-all"
                                                        >
                                                            編輯
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleDeleteArea(c.communityId, c.communityName)}
                                                            className="px-2.5 py-1 bg-rose-500/10 hover:bg-rose-500 text-rose-600 hover:text-white rounded border border-rose-500/20 active:scale-95 transition-all"
                                                        >
                                                            刪除
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))
                                        ) : (
                                            <tr>
                                                <td colSpan="4" className="text-center p-8 text-slate-400">目前尚無外送區域，請在左側表單建立第一個區域！</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            </div>

        </div>
    );
}
