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
    
    const [isSaving, setIsSaving] = useState(false);
    const [copied, setCopied] = useState(false);

    const LIFF_ID = '2010308873-ur2zL2cc';

    const fetchSettings = useCallback(async () => {
        setLoading(true);
        try {
            const data = await callGAS(apiUrl, 'getBuildingSettings', {}, user.token);
            if (Array.isArray(data)) {
                setSettings(data);
                
                // 預設選擇第一個
                if (data.length > 0 && !selectedBuilding) {
                    const first = data[0].building;
                    setSelectedBuilding(first);
                    updateFormFields(first, data);
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
        } else {
            setStartDate('');
            setStartTime('');
            setEndDate('');
            setEndTime('');
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
                end_time: eDateTime
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
        <div className="max-w-4xl mx-auto h-[calc(100vh-6rem)] flex flex-col p-4 gap-4">
            {/* Header Area */}
            <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center bg-[var(--bg-secondary)] p-4 rounded-xl border border-[var(--border-primary)] shadow-sm gap-4">
                <h2 className="text-xl md:text-2xl font-bold flex items-center gap-2 text-[var(--text-primary)]">
                    <Link className="text-blue-600" />
                    開團時段與網址生成面板
                </h2>
                <button onClick={fetchSettings} className="btn-secondary px-3 py-1.5 rounded-lg text-xs font-bold" disabled={loading}>
                    {loading ? '載入中...' : '重新整理'}
                </button>
            </div>

            {loading ? (
                <div className="flex-1 flex flex-col items-center justify-center py-20 gap-3 text-[var(--text-secondary)]">
                    <RefreshCw className="animate-spin text-blue-500" size={36} />
                    <span>載入大樓時段設定中...</span>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 flex-1 overflow-y-auto pb-6">
                    {/* Left: Building Selection Card */}
                    <div className="md:col-span-1 bg-[var(--bg-secondary)] p-5 rounded-xl border border-[var(--border-primary)] shadow-sm flex flex-col gap-4">
                        <h3 className="font-bold text-lg text-[var(--text-primary)] pb-2 border-b border-[var(--border-primary)]">
                            第一步：選擇大樓 / 社區
                        </h3>
                        
                        <div className="space-y-3">
                            <label className="text-xs font-bold text-[var(--text-secondary)]">選擇現有大樓</label>
                            <select
                                className="w-full bg-[var(--bg-secondary)] p-2.5 rounded-xl border border-[var(--border-primary)] text-sm font-bold text-[var(--text-primary)] focus:outline-none"
                                value={selectedBuilding}
                                onChange={handleBuildingChange}
                            >
                                {settings.map(s => (
                                    <option key={s.building} value={s.building}>{s.building}</option>
                                ))}
                                <option value="__new__">+ 新增大樓 / 社區</option>
                            </select>

                            {isAddingNew && (
                                <div className="space-y-1.5 animate-in fade-in slide-in-from-top-1 duration-150">
                                    <label className="text-xs font-bold text-blue-600">自訂新大樓名稱</label>
                                    <input
                                        type="text"
                                        className="input-field w-full p-2.5 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] text-sm"
                                        placeholder="例如：遠雄大樓"
                                        value={newBuildingName}
                                        onChange={(e) => setNewBuildingName(e.target.value)}
                                    />
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Middle: Set Times Card */}
                    <div className="md:col-span-2 bg-[var(--bg-secondary)] p-5 rounded-xl border border-[var(--border-primary)] shadow-sm flex flex-col gap-5">
                        <h3 className="font-bold text-lg text-[var(--text-primary)] pb-2 border-b border-[var(--border-primary)]">
                            第二步：設定開結單時段
                        </h3>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {/* Start Time */}
                            <div className="space-y-3 p-4 bg-[var(--bg-tertiary)] rounded-2xl border border-[var(--border-primary)]">
                                <label className="text-sm font-extrabold text-[var(--text-primary)] flex items-center gap-1.5">
                                    <Calendar className="text-amber-500" size={16} />
                                    開團時間 (Start Time)
                                </label>
                                <div className="space-y-2">
                                    <input
                                        type="date"
                                        className="input-field w-full p-2.5 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] text-sm font-bold"
                                        value={startDate}
                                        onChange={(e) => setStartDate(e.target.value)}
                                    />
                                    <input
                                        type="time"
                                        className="input-field w-full p-2.5 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] text-sm font-bold"
                                        value={startTime}
                                        onChange={(e) => setStartTime(e.target.value)}
                                    />
                                </div>
                                <button
                                    type="button"
                                    onClick={() => { setStartDate(''); setStartTime(''); }}
                                    className="text-xs text-red-500 font-bold hover:underline"
                                >
                                    清除開團時間
                                </button>
                            </div>

                            {/* End Time */}
                            <div className="space-y-3 p-4 bg-[var(--bg-tertiary)] rounded-2xl border border-[var(--border-primary)]">
                                <label className="text-sm font-extrabold text-[var(--text-primary)] flex items-center gap-1.5">
                                    <Clock className="text-rose-500" size={16} />
                                    結單時間 (End Time)
                                </label>
                                <div className="space-y-2">
                                    <input
                                        type="date"
                                        className="input-field w-full p-2.5 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] text-sm font-bold"
                                        value={endDate}
                                        onChange={(e) => setEndDate(e.target.value)}
                                    />
                                    <input
                                        type="time"
                                        className="input-field w-full p-2.5 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] text-sm font-bold"
                                        value={endTime}
                                        onChange={(e) => setEndTime(e.target.value)}
                                    />
                                </div>
                                <button
                                    type="button"
                                    onClick={() => { setEndDate(''); setEndTime(''); }}
                                    className="text-xs text-red-500 font-bold hover:underline"
                                >
                                    清除結單時間
                                </button>
                            </div>
                        </div>

                        <div className="flex justify-end border-t border-[var(--border-primary)]/50 pt-4">
                            <button
                                onClick={handleSave}
                                disabled={isSaving}
                                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold flex items-center gap-1.5 shadow-md shadow-blue-500/20 active:scale-95 transition-all"
                            >
                                <Save size={16} />
                                {isSaving ? '儲存中...' : '儲存大樓設定'}
                            </button>
                        </div>

                        {/* URL Generation display */}
                        {activeUrl && (
                            <div className="p-4 bg-blue-50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/30 rounded-2xl space-y-2.5 animate-in fade-in duration-200">
                                <h4 className="font-extrabold text-sm text-blue-700 dark:text-blue-400">
                                    第三步：獲取專屬開團網址
                                </h4>
                                <div className="flex flex-col sm:flex-row gap-2">
                                    <input
                                        type="text"
                                        readOnly
                                        className="input-field flex-1 p-2.5 rounded-xl border border-blue-200 dark:border-blue-800 bg-[var(--bg-secondary)] text-xs text-[var(--text-primary)] font-mono font-bold"
                                        value={activeUrl}
                                    />
                                    <button
                                        onClick={handleCopy}
                                        className="btn-primary sm:w-28 py-2.5 rounded-xl font-bold flex items-center justify-center gap-1 shadow-sm text-xs"
                                        style={{ backgroundColor: copied ? '#10B981' : undefined }}
                                    >
                                        {copied ? <Check size={14} /> : <Copy size={14} />}
                                        {copied ? '已複製！' : '一鍵複製'}
                                    </button>
                                </div>
                                <p className="text-[10px] text-slate-400 font-medium">
                                    ※ 轉貼此網址至 LINE 群組，住戶點選將自動鎖定該大樓，並依據您所設定的時段進行下單防呆。
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
