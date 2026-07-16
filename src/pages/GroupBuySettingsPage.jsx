import React, { useState, useEffect, useCallback } from 'react';
import { Link, Calendar, Clock, Copy, Save, Plus, Check, RefreshCw } from 'lucide-react';
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
        }
    }, [user.token, fetchSettings]);

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
                auto_close_time: autoCloseTime
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
                            {settings.map(s => {
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
                                        <div className="flex items-center gap-2">
                                            <span className="text-base">🏢</span>
                                            <span className="text-base font-bold tracking-wide">{s.building}</span>
                                        </div>
                                        {isSelected && <Check size={16} className="text-blue-600" />}
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
        </div>
    );
}
