import React, { useState, useEffect, useCallback, useRef } from 'react';
import { callGAS } from '../utils/api';
// Using specific icons only when needed
import { Calendar, User, CheckCircle, DollarSign } from 'lucide-react';

export default function PayrollPage({ user, apiUrl }) {
    // State for filters
    const [year, setYear] = useState(new Date().getFullYear());
    const [month, setMonth] = useState(new Date().getMonth() + 1);
    const [targetUser, setTargetUser] = useState(user.username);
    const [userList, setUserList] = useState([]);

    // State for Data
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState(null); // { config, summary, dailyData, dailyRecords }

    // State for Modals
    const [editingDay, setEditingDay] = useState(null); // { date, rowData }
    const [editType, setEditType] = useState('LEAVE'); // LEAVE or LOSS
    const [editValue, setEditValue] = useState('');
    const [editNote, setEditNote] = useState('');

    // State for Settings Modal
    const [showSettings, setShowSettings] = useState(false);
    const [settingsForm, setSettingsForm] = useState({
        baseSalary: 0, attendanceBonus: 0, insurance: 0, monthlyOffDays: 8, bonusTiers: '[]'
    });
    const [isSubmitting, setIsSubmitting] = useState(false);

    // State for Basic Profile Modal
    const [showProfile, setShowProfile] = useState(false);
    const [profileData, setProfileData] = useState({
        profile: { joinedDate: '', birthday: '', identityId: '', contact: '', note: '' },
        seniorityText: '',
        estimatedLeaveDays: 0
    });
    const [profileForm, setProfileForm] = useState({
        joinedDate: '', birthday: '', identityId: '', contact: '', note: ''
    });

    // Input Refs for Navigation
    const settingRefs = {
        baseSalary: useRef(null),
        attendanceBonus: useRef(null),
        monthlyOffDays: useRef(null),
        insurance: useRef(null),
        bonusTiers: useRef(null)
    };

    const dayEditRefs = {
        editValue: useRef(null),
        editNote: useRef(null)
    };

    // Load User List (Only for BOSS)
    useEffect(() => {
        const isAdmin = user.role === 'BOSS';
        if (isAdmin) {
            callGAS(apiUrl, 'getUsers', {}, user.token)
                .then(users => setUserList(users))
                .catch(err => console.error(err));
        }
    }, [user.role, user.token, apiUrl]);

    // Fetch Payroll Data
    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const result = await callGAS(apiUrl, 'getPayrollData', {
                year, month, targetUser
            }, user.token);

            if (result && !result.error) {
                setData(result);
                // Pre-fill settings form
                if (result.config) {
                    setSettingsForm({
                        ...result.config,
                        bonusTiers: JSON.stringify(result.config.bonusTiers || [])
                    });
                }
            } else {
                console.error(result?.error);
            }
        } catch (e) {
            console.error(e);
            alert('載入失敗: ' + e.message);
        } finally {
            setLoading(false);
        }
    }, [year, month, targetUser, user.token]);

    const fetchProfile = useCallback(async () => {
        try {
            const result = await callGAS(apiUrl, 'getEmployeeProfile', { targetUser }, user.token);
            if (result && !result.error) {
                setProfileData(result);
                setProfileForm(result.profile);
            }
        } catch (e) {
            console.error(e);
        }
    }, [targetUser, user.token, apiUrl]);

    // Save Payroll to Expenditures
    const handleSavePayroll = async () => {
        if (!data || !data.summary) {
            alert('請先計算薪資資料');
            return;
        }

        const confirmMsg = `確定要將 ${targetUser} 的薪資存檔至支出表嗎？\n\n實領薪資: $${(data.summary.finalSalary || 0).toLocaleString()}\n月份: ${year}年${month}月`;
        if (!confirm(confirmMsg)) return;

        setIsSubmitting(true);
        try {
            await callGAS(apiUrl, 'savePayrollToExpenditure', {
                targetUser,
                year,
                month,
                finalSalary: data.summary.finalSalary
            }, user.token);

            alert('薪資存檔成功！');
        } catch (error) {
            console.error('Save payroll failed:', error);
            alert('存檔失敗: ' + error.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    useEffect(() => {
        fetchData();
        fetchProfile();
    }, [fetchData, fetchProfile]);

    const handleSaveRecord = async () => {
        if (!editingDay) return;
        setIsSubmitting(true);
        try {
            await callGAS(apiUrl, 'saveDailyRecord', {
                date: editingDay.date,
                username: targetUser,
                type: editType,
                value: (editType === 'WORK' || editType === 'LEAVE' || editType === 'SPECIAL_LEAVE' || editType === 'SICK_LEAVE') ? 1 : Number(editValue),
                note: editNote
            }, user.token);
            setEditingDay(null);
            fetchData(); // Reload
        } catch (e) {
            alert('儲存失敗: ' + e.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleSaveProfile = async () => {
        setIsSubmitting(true);
        try {
            await callGAS(apiUrl, 'saveEmployeeProfile', {
                username: targetUser,
                ...profileForm
            }, user.token);
            setShowProfile(false);
            fetchProfile();
        } catch (e) {
            alert('儲存基本資料失敗: ' + e.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleSaveSettings = async () => {
        let parsedTiers = [];
        try {
            parsedTiers = JSON.parse(settingsForm.bonusTiers);
        } catch (e) {
            alert('獎金級距格式錯誤 (JSON Error)');
            return;
        }

        setIsSubmitting(true);
        try {
            await callGAS(apiUrl, 'savePayrollSettings', {
                targetUser,
                baseSalary: Number(settingsForm.baseSalary),
                attendanceBonus: Number(settingsForm.attendanceBonus),
                insurance: Number(settingsForm.insurance),
                monthlyOffDays: Number(settingsForm.monthlyOffDays),
                bonusTiers: parsedTiers
            }, user.token);

            setShowSettings(false);
            fetchData();
        } catch (e) {
            alert('儲存設定失敗: ' + e.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleSettingKeyDown = (e, currentField) => {
        const sequence = ['baseSalary', 'attendanceBonus', 'monthlyOffDays', 'insurance', 'bonusTiers'];
        const currentIndex = sequence.indexOf(currentField);
        const isTextarea = currentField === 'bonusTiers';

        // Prevent number increment/decrement with arrows only on numeric inputs
        if (!isTextarea && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
            e.preventDefault();
        }

        if (e.key === 'Enter') {
            // Textarea allows Enter for new line unless it's a specific "submit" trigger
            if (currentField === 'bonusTiers' && !e.ctrlKey) {
                // Just let it be for textarea default behavior
                return;
            }

            e.preventDefault();
            const nextField = sequence[currentIndex + 1];
            if (nextField && settingRefs[nextField].current) {
                settingRefs[nextField].current.focus();
                settingRefs[nextField].current.select?.();
            }
            return;
        }

        const navMap = {
            baseSalary: { ArrowRight: 'attendanceBonus', ArrowDown: 'monthlyOffDays' },
            attendanceBonus: { ArrowLeft: 'baseSalary', ArrowDown: 'insurance' },
            monthlyOffDays: { ArrowRight: 'insurance', ArrowUp: 'baseSalary', ArrowDown: 'bonusTiers' },
            insurance: { ArrowLeft: 'monthlyOffDays', ArrowUp: 'attendanceBonus', ArrowDown: 'bonusTiers' },
            bonusTiers: {} // Keep empty to allow internal line movement
        };

        const targetField = navMap[currentField]?.[e.key];
        if (targetField && settingRefs[targetField].current) {
            e.preventDefault();
            settingRefs[targetField].current.focus();
            settingRefs[targetField].current.select?.();
        }
    };

    const handleDayEditKeyDown = (e, currentField) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (currentField === 'editType') {
                if (editType === 'LOSS') {
                    dayEditRefs.editValue.current?.focus();
                } else {
                    dayEditRefs.editNote.current?.focus();
                }
            } else if (currentField === 'editValue') {
                dayEditRefs.editNote.current?.focus();
            } else if (currentField === 'editNote') {
                handleSaveRecord();
            }
        }

        if (currentField === 'editType' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
            e.preventDefault();
            const types = ['WORK', 'LEAVE', 'SPECIAL_LEAVE', 'SICK_LEAVE', 'LOSS'];
            let idx = types.indexOf(editType);
            if (e.key === 'ArrowLeft') idx = (idx - 1 + types.length) % types.length;
            if (e.key === 'ArrowRight') idx = (idx + 1) % types.length;
            setEditType(types[idx]);
        }
    };

    // Helper to generate days in month
    const getDaysInMonth = (y, m) => {
        const days = new Date(y, m, 0).getDate();
        return Array.from({ length: days }, (_, i) => {
            const d = new Date(y, m - 1, i + 1);
            // Local formatting for consistency with backend (simple approach)
            const offset = d.getTimezoneOffset() * 60000;
            const localDate = new Date(d.getTime() - offset);
            const localDateStr = localDate.toISOString().split('T')[0];

            return {
                date: localDateStr,
                day: i + 1,
                weekday: ['日', '一', '二', '三', '四', '五', '六'][d.getDay()]
            };
        });
    };

    const days = getDaysInMonth(year, month);
    const summary = data?.summary || {};

    // Helper: Count days based on actual displayed status
    let attendanceDaysCount = 0;
    let generalLeaveDaysCount = 0;
    let specialLeaveDaysCount = 0;
    let sickLeaveDaysCount = 0;

    days.forEach(d => {
        const dateKey = d.date;
        const sales = data?.dailyData?.[dateKey] || 0;
        const record = data?.dailyRecords?.[dateKey] || {};
        const hasSales = sales > 0;

        // Match the exact logic used in the table display
        if (hasSales) {
            // 出勤 (有業績)
            attendanceDaysCount++;
        } else if (record.isLeave) {
            // 休假
            generalLeaveDaysCount++;
        } else if (record.isSpecialLeave) {
            // 特休
            specialLeaveDaysCount++;
        } else if (record.isSickLeave) {
            // 病假
            sickLeaveDaysCount++;
        } else {
            // Default is 休假 (as per new logic)
            generalLeaveDaysCount++;
        }
    });


    const formatBirthday = (val) => {
        if (!val) return '';
        try {
            // 1. If it's already a Date object
            if (val instanceof Date) {
                return `${val.getMonth() + 1}月${val.getDate()}日`;
            }

            // 2. Convert to string and try to match simple digits first involved in separators
            // Matches: 2026/01/20, 1/20, 01-20, etc.
            const str = String(val);

            // If it looks like a standard timestamp "2026-01-20..." or has year
            // Try Standard Date parsing
            const d = new Date(str);
            if (!isNaN(d.getTime())) {
                return `${d.getMonth() + 1}月${d.getDate()}日`;
            }

            // 3. Fallback: regex to find month/day patterns if standard parse fails
            // Look for any pattern like M/D or MM-DD
            const match = str.match(/(\d{1,2})[/-](\d{1,2})/);
            if (match) {
                // Warning: simple regex might be ambiguous for Year/Month, assuming Month/Day order or Month/Day pattern
                return `${match[1]}月${match[2]}日`;
            }

            // 4. Last resort: Replace common separators with Chinese char
            return str.replace(/[/.-]/g, '月') + '日';
        } catch (e) {
            console.error('Format err', e);
            return String(val);
        }
    };

    return (
        <div className="p-2 md:p-8 space-y-4 md:space-y-6 max-w-7xl mx-auto pb-24">

            {/* --- Mobile View Header & Controls --- */}
            <div className="md:hidden space-y-4">
                {/* Row 1: Title (Left) + Recalculate (Right) - Adjusted */}
                <div className="flex justify-between items-center px-1 mb-2">
                    <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                        <DollarSign className="text-blue-500" size={24} /> 薪資結算中心
                    </h1>
                    <button onClick={fetchData} className="btn-secondary py-1 px-3 text-xs h-7 rounded-full border-slate-200 text-slate-500">
                        重新計算
                    </button>
                </div>

                {/* Row 2: Filters Capsule */}
                <div className="flex justify-center">
                    <div className="bg-white rounded-lg border border-slate-200 shadow-sm h-10 px-1 flex items-center gap-1 w-full max-w-[340px] justify-center">
                        <select value={year} onChange={e => setYear(Number(e.target.value))} className="bg-transparent text-sm font-medium text-slate-700 h-8 pl-2 pr-1 outline-none text-center">
                            {[2025, 2026, 2027].map(y => <option key={y} value={y}>{y}年</option>)}
                        </select>
                        <div className="w-px h-4 bg-slate-200"></div>
                        <select value={month} onChange={e => setMonth(Number(e.target.value))} className="bg-transparent text-sm font-bold text-blue-600 h-8 px-1 outline-none text-center w-16">
                            {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>{m}月</option>)}
                        </select>
                        {user.role === 'BOSS' && (
                            <>
                                <div className="w-px h-4 bg-slate-200"></div>
                                <select value={targetUser} onChange={e => setTargetUser(e.target.value)} className="bg-transparent text-sm font-medium text-slate-700 h-8 pl-1 pr-2 outline-none text-center min-w-[5rem]">
                                    {userList.map(u => <option key={u.userid} value={u.username}>{u.username}</option>)}
                                    {!userList.some(u => u.username === targetUser) && <option value={targetUser}>{targetUser}</option>}
                                </select>
                            </>
                        )}
                    </div>
                </div>

                {/* Row 3: Action Buttons Capsule */}
                {user.role === 'BOSS' && (
                    <div className="flex justify-center">
                        <div className="bg-white rounded-lg border border-slate-200 shadow-sm h-10 px-1 flex items-center gap-1 w-full max-w-[340px] justify-center">
                            <button onClick={() => setShowSettings(true)} className="h-8 px-2 text-xs font-medium text-slate-600 hover:bg-slate-50 rounded-md flex items-center gap-1">
                                <User size={14} /> 薪資設定
                            </button>
                            <div className="w-px h-4 bg-slate-200"></div>
                            <button onClick={() => setShowProfile(true)} className="h-8 px-2 text-xs font-medium text-slate-600 hover:bg-slate-50 rounded-md flex items-center gap-1">
                                <Calendar size={14} /> 基本資料
                            </button>
                            <div className="w-px h-4 bg-slate-200"></div>
                            <button onClick={handleSavePayroll} disabled={isSubmitting || !data} className="h-8 px-2 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded-md flex items-center gap-1 disabled:opacity-50">
                                <DollarSign size={14} /> 薪資存檔
                            </button>
                        </div>
                    </div>
                )}

                {/* Info (Seniority etc) - Keep compact */}
                <div className="flex flex-wrap justify-center gap-2 px-1 text-[10px]">
                    <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-100">到職: {profileData.profile.joinedDate || '-'}</span>
                    <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded border border-indigo-100">年資: {profileData.seniorityText}</span>
                    <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded border border-emerald-100">剩餘特休: {(profileData.estimatedLeaveDays - (data?.totalSpecialLeaveUsed || 0))}天</span>
                </div>
            </div>


            {/* --- Desktop View Header & Controls --- */}
            <div className="hidden md:flex glass-panel p-6 flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400 flex items-center gap-3">
                        <DollarSign /> 薪資結算中心
                    </h1>
                    <p className="text-slate-400 text-sm mt-1">自動彙整業績、出勤與各項扣除額</p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    <select value={year} onChange={e => setYear(Number(e.target.value))} className="input-field w-24">
                        {[2025, 2026, 2027].map(y => <option key={y} value={y}>{y}年</option>)}
                    </select>
                    <select value={month} onChange={e => setMonth(Number(e.target.value))} className="input-field w-20">
                        {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>{m}月</option>)}
                    </select>
                    {user.role === 'BOSS' && (
                        <select value={targetUser} onChange={e => setTargetUser(e.target.value)} className="input-field w-32">
                            {userList.map(u => <option key={u.userid} value={u.username}>{u.username}</option>)}
                            {!userList.some(u => u.username === targetUser) && <option value={targetUser}>{targetUser}</option>}
                        </select>
                    )}
                    {user.role === 'BOSS' && (
                        <>
                            <button onClick={() => setShowSettings(true)} className="btn-secondary flex items-center gap-2">
                                <User size={16} /> 薪資設定
                            </button>
                            <button onClick={() => setShowProfile(true)} className="btn-secondary flex items-center gap-2 border-emerald-200 text-emerald-700 hover:bg-emerald-50">
                                <Calendar size={16} /> 基本資料
                            </button>
                            <button onClick={handleSavePayroll} disabled={isSubmitting || !data} className="btn-secondary flex items-center gap-2 border-blue-200 text-blue-700 hover:bg-blue-50 disabled:opacity-50">
                                <DollarSign size={16} /> {isSubmitting ? '存檔中...' : '薪資存檔'}
                            </button>
                        </>
                    )}
                    <button onClick={fetchData} className="btn-primary">重新計算</button>
                </div>
            </div>

            {/* Desktop Info */}
            <div className="hidden md:flex flex-wrap gap-4 px-2">
                <div className="flex items-center gap-2 bg-blue-50 text-blue-700 px-3 py-1.5 rounded-full text-sm font-medium border border-blue-100">
                    <Calendar size={14} /> 到職日: {profileData.profile.joinedDate || '未設定'}
                </div>
                <div className="flex items-center gap-2 bg-indigo-50 text-indigo-700 px-3 py-1.5 rounded-full text-sm font-medium border border-indigo-100">
                    <User size={14} /> 年資: {profileData.seniorityText}
                </div>
                <div className="flex items-center gap-2 bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-full text-sm font-medium border border-emerald-100">
                    <CheckCircle size={14} /> 特休狀況: 預估總額 {profileData.estimatedLeaveDays} 天 / 已請 {data?.totalSpecialLeaveUsed || 0} 天 / 剩餘 {(profileData.estimatedLeaveDays - (data?.totalSpecialLeaveUsed || 0))} 天
                </div>
            </div>

            {/* Birthday Reminder */}
            {user.role === 'BOSS' && data?.isBirthdayMonth && (
                <div className="px-1 md:px-2">
                    <div className="bg-gradient-to-r from-pink-50 to-rose-50 border border-pink-100 rounded-xl p-3 md:p-4 flex items-center gap-3 md:gap-4 animate-bounce-subtle">
                        <div className="bg-white p-1.5 md:p-2 rounded-full shadow-sm text-lg md:text-2xl">🎂</div>
                        <div>
                            <h4 className="text-rose-700 font-bold text-sm md:text-base">本月適逢該員工生日 {profileData.profile.birthday ? `(${formatBirthday(profileData.profile.birthday)})` : ''}！</h4>
                            <p className="text-rose-600/80 text-xs md:text-sm">結算薪資時，別忘了發放生日禮金或準備小驚喜喔！</p>
                        </div>
                    </div>
                </div>
            )}

            {/* --- Summary Cards (Mobile One-Line 4-Cols) --- */}
            {/* Row 4: Base / Perf / Ins / Net */}
            <div className="grid grid-cols-4 gap-2 px-1 md:hidden">
                <SummaryCard title="底薪" amount={data?.config?.baseSalary} color="text-slate-800" isMobile />
                <SummaryCard
                    title="業績獎金"
                    amount={summary.bonus}
                    color="text-indigo-600"
                    isMobile
                />
                <SummaryCard
                    title="勞健保"
                    amount={summary.insurance}
                    isDeduction
                    color="text-red-600"
                    isMobile
                    hoverContent={
                        <div className="flex flex-col items-end">
                            <p className="text-[10px] text-slate-400 leading-none mb-0.5">獎金扣額</p>
                            <p className="text-xs font-bold text-emerald-600 font-mono">${(summary.bonus || 0).toLocaleString()}</p>
                        </div>
                    }
                />
                <SummaryCard
                    title="實領薪資"
                    amount={summary.finalSalary}
                    color="text-blue-600"
                    isMobile
                    className="bg-blue-50/50 border-blue-100"
                />
            </div>

            {/* Row 5: Attend / Normal / Special / Sick */}
            <div className="grid grid-cols-4 gap-2 px-1 mt-2 md:hidden">
                <SummaryCard
                    title="全勤"
                    amount={summary.attendanceBonus}
                    color="text-yellow-600"
                    isMobile
                    hoverContent={
                        <div className="flex flex-col items-end">
                            <p className="text-[10px] text-slate-400 leading-none mb-0.5">出勤天</p>
                            <p className="text-xs font-bold text-emerald-600">{attendanceDaysCount} 天</p>
                        </div>
                    }
                />
                <SummaryCard
                    title="一般休假"
                    amount={generalLeaveDaysCount}
                    isCurrency={false}
                    suffix="天"
                    color="text-slate-500"
                    isMobile
                    hoverContent={
                        <div className="flex flex-col items-end gap-1">
                            <p className="text-[10px] text-slate-400 leading-none">補貼</p>
                            <p className={`text-xs font-bold ${(summary.leaveCompensation || 0) >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                                ${(summary.leaveCompensation || 0).toLocaleString()}
                            </p>
                        </div>
                    }
                />
                <SummaryCard
                    title="特休紀錄"
                    amount={specialLeaveDaysCount}
                    isCurrency={false}
                    suffix="天"
                    color="text-emerald-500"
                    isMobile
                />
                <SummaryCard
                    title="病假紀錄"
                    amount={sickLeaveDaysCount}
                    isCurrency={false}
                    suffix="天"
                    color="text-amber-500"
                    isMobile
                    hoverContent={
                        <div className="flex flex-col items-end">
                            <p className="text-[10px] text-slate-400 leading-none">扣款</p>
                            <p className="text-xs font-bold text-red-600">-${(sickLeaveDaysCount * 500).toLocaleString()}</p>
                        </div>
                    }
                />
            </div>

            {/* Desktop Summary Cards (Original Layout) */}
            <div className="hidden md:grid grid-cols-2 lg:grid-cols-4 gap-4 px-2">
                <SummaryCard title="底薪" amount={data?.config?.baseSalary} color="text-slate-800" />
                <SummaryCard
                    title="業績獎金"
                    amount={summary.bonus} // Changed from 0 to summary.bonus for actual bonus amount
                    subtext={`業績總額: $${(summary.sales || 0).toLocaleString()}`}
                    color="text-indigo-600"
                />
                <SummaryCard
                    title="勞健保 (扣除)"
                    amount={summary.insurance}
                    isDeduction
                    color="text-red-600"
                    hoverContent={
                        <div className="flex flex-col items-end">
                            <p className="text-sm font-bold text-emerald-600 font-mono">${(summary.bonus || 0).toLocaleString()}</p>
                        </div>
                    }
                />
                <SummaryCard title="實領薪資" amount={summary.finalSalary} color="text-blue-600" subtext="含獎金/扣除保險與扣款" />
            </div>

            <div className="hidden md:grid grid-cols-2 lg:grid-cols-4 gap-4 mt-4 px-2">
                <SummaryCard
                    title="全勤獎金"
                    amount={summary.attendanceBonus}
                    color="text-yellow-600"
                    hoverContent={
                        <div className="flex flex-col items-end">
                            <p className="text-[10px] text-slate-400 font-medium leading-none mb-1">出勤天</p>
                            <p className="text-sm font-bold text-emerald-600 font-mono">{attendanceDaysCount} 天</p>
                        </div>
                    }
                />
                <SummaryCard
                    title="一般休假"
                    amount={generalLeaveDaysCount}
                    isCurrency={false}
                    suffix=" 天"
                    color="text-slate-500"
                    hoverContent={
                        <div className="flex flex-col items-end gap-1">
                            <div>
                                <p className="text-[10px] text-slate-400 font-medium leading-none mb-1">月休天數標準</p>
                                <p className="text-sm font-bold text-emerald-600 font-mono">{data?.config?.monthlyOffDays || 0} 天</p>
                            </div>
                            <div className="w-full border-t border-emerald-100 pt-1 mt-0.5">
                                <p className="text-[10px] text-slate-400 font-medium leading-none mb-1">補：</p>
                                <p className={`text-sm font-bold font-mono ${(summary.leaveCompensation || 0) >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                                    {(summary.leaveCompensation || 0) >= 0 ? '+' : '-'}${Math.abs(summary.leaveCompensation || 0).toLocaleString()}
                                </p>
                            </div>
                        </div>
                    }
                />
                <SummaryCard title="特休紀錄" amount={specialLeaveDaysCount} isCurrency={false} suffix=" 天" color="text-emerald-500" />
                <SummaryCard
                    title="病假紀錄"
                    amount={sickLeaveDaysCount}
                    isCurrency={false}
                    suffix=" 天"
                    color="text-amber-500"
                    hoverContent={
                        <div className="flex flex-col items-end">
                            <p className="text-[10px] text-slate-400 font-medium leading-none mb-1">扣款：</p>
                            <p className="text-sm font-bold text-red-600 font-mono">-${(sickLeaveDaysCount * 500).toLocaleString()}</p>
                        </div>
                    }
                />
            </div>

            <div className="px-1 md:px-2 mt-2 md:mt-4">
                <div className="bg-white p-3 rounded-lg border border-red-100 flex justify-between items-center shadow-sm">
                    <span className="text-sm text-red-600 font-bold">盤損/扣款合計</span>
                    <span className="text-lg font-bold text-red-600">-${(summary.loss || 0).toLocaleString()}</span>
                </div>
            </div>

            {/* Calendar Table (Desktop) */}
            <div className="hidden md:block glass-panel overflow-hidden">
                <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-50 text-slate-500 text-sm">
                        <tr>
                            <th className="p-4 w-32">日期</th>
                            <th className="p-4 w-24 text-center">星期</th>
                            <th className="p-4 text-right">當日業績</th>
                            <th className="p-4 text-center">出勤狀態</th>
                            <th className="p-4 text-right">虧損/其他</th>
                            <th className="p-4 text-center">操作</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {days.map((dayItem) => {
                            const dateStr = dayItem.date;
                            const sales = data?.dailyData?.[dateStr] || 0;
                            const record = data?.dailyRecords?.[dateStr] || {};
                            const hasSales = sales > 0;

                            let status = '休假';
                            let statusColor = 'text-yellow-500 bg-yellow-500/10 px-2 rounded font-medium';

                            if (hasSales) {
                                status = '出勤 (有業績)';
                                statusColor = 'text-green-400 font-bold';
                            } else if (record.isLeave) {
                                status = '休假';
                                statusColor = 'text-yellow-500 bg-yellow-500/10 px-2 rounded font-medium';
                            } else if (record.isSpecialLeave) {
                                status = '特休';
                                statusColor = 'text-emerald-500 bg-emerald-500/10 px-2 rounded font-medium';
                            } else if (record.isSickLeave) {
                                status = '病假';
                                statusColor = 'text-amber-500 bg-amber-500/10 px-2 rounded font-medium';
                            }

                            const isWeekend = dayItem.weekday === '六' || dayItem.weekday === '日';

                            return (
                                <tr key={dateStr} className={`hover:bg-slate-50 transition-colors ${isWeekend ? 'bg-slate-50/50' : ''}`}>
                                    <td className="p-4 font-mono text-slate-600">{dateStr}</td>
                                    <td className={`p-4 text-center ${dayItem.weekday === '日' ? 'text-red-600' : 'text-slate-500'}`}>
                                        {dayItem.weekday}
                                    </td>
                                    <td className="p-4 text-right font-mono text-emerald-600">
                                        {Math.abs(sales) > 0.01 ? `$${sales.toLocaleString()}` : '-'}
                                    </td>
                                    <td className="p-4 text-center">
                                        <span className={`text-sm ${statusColor}`}>{status}</span>
                                    </td>
                                    <td className="p-4 text-right font-mono text-red-600">
                                        {Math.abs(record.loss || 0) > 0.01 ? `-$${Math.abs(record.loss).toLocaleString()}` : ''}
                                        {record.note && <span className="block text-xs text-slate-500">{record.note}</span>}
                                    </td>
                                    <td className="p-4 text-center">
                                        {user.role === 'BOSS' && (
                                            <button
                                                onClick={() => {
                                                    setEditingDay(dayItem);
                                                    setEditType('LEAVE'); // Default
                                                }}
                                                className="text-xs btn-ghost text-blue-400 hover:text-blue-300"
                                            >
                                                編輯
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* --- Mobile Daily Records (Direct Presentation) --- */}
            <div className="md:hidden space-y-2">
                {days.map((dayItem) => {
                    const dateStr = dayItem.date;
                    const dateParts = dateStr.split('-');
                    const shortDate = `${dateParts[1]}/${dateParts[2]}`;
                    const sales = data?.dailyData?.[dateStr] || 0;
                    const record = data?.dailyRecords?.[dateStr] || {};
                    const hasSales = sales > 0;

                    let status = '休';
                    let statusColor = 'bg-yellow-100 text-yellow-700';
                    if (hasSales) { status = '勤'; statusColor = 'bg-green-100 text-green-700'; }
                    else if (record.isLeave) { status = '休'; statusColor = 'bg-yellow-100 text-yellow-700'; }
                    else if (record.isSpecialLeave) { status = '特'; statusColor = 'bg-emerald-100 text-emerald-700'; }
                    else if (record.isSickLeave) { status = '病'; statusColor = 'bg-amber-100 text-amber-700'; }

                    const isWeekend = dayItem.weekday === '六' || dayItem.weekday === '日';

                    return (
                        <div key={dateStr} className={`bg-white rounded-lg border border-slate-100 p-2 flex items-center shadow-sm text-xs ${isWeekend ? 'bg-slate-50/50' : ''}`}>
                            {/* Date & Week */}
                            <div className="w-14 items-center flex flex-col justify-center border-r border-slate-100 pr-2 mr-2">
                                <span className={`font-bold text-sm ${dayItem.weekday === '日' ? 'text-rose-500' : 'text-slate-700'}`}>{shortDate}</span>
                                <span className={`text-[10px] ${dayItem.weekday === '日' ? 'text-rose-400' : 'text-slate-400'}`}>週{dayItem.weekday}</span>
                            </div>

                            {/* Content Middle */}
                            <div className="flex-1 grid grid-cols-3 gap-1 items-center">
                                {/* Sales */}
                                <div className="text-center">
                                    <p className="text-[9px] text-slate-400 mb-0.5">業績</p>
                                    <p className={`font-bold ${sales > 0 ? 'text-emerald-600' : 'text-slate-300'}`}>{sales > 0 ? `$${sales.toLocaleString()}` : '-'}</p>
                                </div>
                                {/* Status */}
                                <div className="text-center">
                                    <p className="text-[9px] text-slate-400 mb-0.5">狀態</p>
                                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${statusColor}`}>{status}</span>
                                </div>
                                {/* Loss */}
                                <div className="text-center">
                                    <p className="text-[9px] text-slate-400 mb-0.5">虧損</p>
                                    <p className={`font-bold ${record.loss ? 'text-red-500' : 'text-slate-300'}`}>{record.loss ? `-$${Number(record.loss).toLocaleString()}` : '-'}</p>
                                </div>
                            </div>

                            {/* Edit Button Right */}
                            <div className="pl-2 ml-1 border-l border-slate-100">
                                {user.role === 'BOSS' && (
                                    <button
                                        onClick={() => { setEditingDay(dayItem); setEditType('LEAVE'); }}
                                        className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-50 text-slate-400 hover:bg-blue-50 hover:text-blue-500"
                                    >
                                        <span className="text-[10px]">編輯</span>
                                    </button>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Edit Modal (Day) */}
            {
                editingDay && (
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                        <div className="glass-panel w-full max-w-md p-6 animate-fadeIn">
                            <h3 className="text-xl font-bold mb-4">{editingDay.date} ({editingDay.weekday}) 設定</h3>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm text-slate-400 mb-2">類型 (左右鍵切換)</label>
                                    <div
                                        className="flex bg-slate-50 rounded p-1 border border-slate-200 outline-none focus-within:ring-2 focus-within:ring-blue-500/20"
                                        tabIndex="0"
                                        onKeyDown={e => handleDayEditKeyDown(e, 'editType')}
                                    >
                                        {[
                                            { id: 'WORK', label: '上班', color: 'bg-blue-600' },
                                            { id: 'LEAVE', label: '休假', color: 'bg-yellow-600' },
                                            { id: 'SPECIAL_LEAVE', label: '特休', color: 'bg-emerald-600' },
                                            { id: 'SICK_LEAVE', label: '病假', color: 'bg-amber-600' },
                                            { id: 'LOSS', label: '盤損/扣款', color: 'bg-red-600' }
                                        ].map(t => (
                                            <button
                                                key={t.id}
                                                className={`flex-1 py-2 rounded text-xs transition-all ${editType === t.id ? `${t.color} text-white shadow-sm` : 'text-slate-500 hover:bg-slate-100'}`}
                                                onClick={() => setEditType(t.id)}
                                            >{t.label}</button>
                                        ))}
                                    </div>
                                </div>

                                {editType === 'LOSS' && (
                                    <div>
                                        <label className="block text-sm text-slate-400 mb-1">金額 (負數為扣款)</label>
                                        <input
                                            type="number"
                                            className="input-field w-full"
                                            placeholder="-100"
                                            ref={dayEditRefs.editValue}
                                            value={editValue}
                                            onChange={e => setEditValue(e.target.value)}
                                            onKeyDown={e => handleDayEditKeyDown(e, 'editValue')}
                                        />
                                    </div>
                                )}

                                <div>
                                    <label className="block text-sm text-slate-400 mb-1">備註</label>
                                    <input
                                        type="text"
                                        className="input-field w-full"
                                        placeholder="原因說明..."
                                        ref={dayEditRefs.editNote}
                                        value={editNote}
                                        onChange={e => setEditNote(e.target.value)}
                                        onKeyDown={e => handleDayEditKeyDown(e, 'editNote')}
                                    />
                                </div>
                            </div>

                            <div className="flex gap-3 mt-6">
                                <button onClick={() => setEditingDay(null)} className="btn-secondary flex-1" disabled={isSubmitting}>取消</button>
                                <button onClick={handleSaveRecord} className="btn-primary flex-1" disabled={isSubmitting}>
                                    {isSubmitting ? '儲存中...' : '保存'}
                                </button>
                            </div>

                            {/* Loading Overlay within Modal */}
                            {isSubmitting && (
                                <div className="absolute inset-0 bg-white/60 backdrop-blur-[2px] z-10 flex items-center justify-center rounded-lg">
                                    <div className="flex flex-col items-center gap-2">
                                        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                                        <span className="text-sm font-medium text-blue-600">資料存盤中...</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )
            }

            {/* Settings Modal (Config) */}
            {
                showSettings && (
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                        <div className="glass-panel w-full max-w-lg p-6 animate-fadeIn max-h-[90vh] overflow-y-auto">
                            <h3 className="text-xl font-bold mb-4">薪資參數設定 - {targetUser}</h3>

                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="label">底薪</label>
                                        <input type="number" className="input-field w-full"
                                            ref={settingRefs.baseSalary}
                                            value={settingsForm.baseSalary}
                                            onChange={e => setSettingsForm({ ...settingsForm, baseSalary: e.target.value })}
                                            onKeyDown={e => handleSettingKeyDown(e, 'baseSalary')} />
                                    </div>
                                    <div>
                                        <label className="label">全勤獎金</label>
                                        <input type="number" className="input-field w-full"
                                            ref={settingRefs.attendanceBonus}
                                            value={settingsForm.attendanceBonus}
                                            onChange={e => setSettingsForm({ ...settingsForm, attendanceBonus: e.target.value })}
                                            onKeyDown={e => handleSettingKeyDown(e, 'attendanceBonus')} />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="label">月休天數標準</label>
                                        <input type="number" className="input-field w-full"
                                            ref={settingRefs.monthlyOffDays}
                                            value={settingsForm.monthlyOffDays}
                                            onChange={e => setSettingsForm({ ...settingsForm, monthlyOffDays: e.target.value })}
                                            onKeyDown={e => handleSettingKeyDown(e, 'monthlyOffDays')} />
                                    </div>
                                    <div>
                                        <label className="label">勞健保 (扣除額)</label>
                                        <input type="number" className="input-field w-full"
                                            ref={settingRefs.insurance}
                                            value={settingsForm.insurance}
                                            onChange={e => setSettingsForm({ ...settingsForm, insurance: e.target.value })}
                                            onKeyDown={e => handleSettingKeyDown(e, 'insurance')} />
                                    </div>
                                </div>

                                <div>
                                    <label className="label">業績獎金級距 (JSON)</label>
                                    <textarea
                                        className="input-field w-full font-mono text-xs h-32"
                                        ref={settingRefs.bonusTiers}
                                        value={settingsForm.bonusTiers}
                                        onChange={e => setSettingsForm({ ...settingsForm, bonusTiers: e.target.value })}
                                        onKeyDown={e => handleSettingKeyDown(e, 'bonusTiers')}
                                        placeholder='[{"threshold": 50000, "bonus": 1000}]'
                                    />
                                    <p className="text-xs text-slate-400 mt-1">{"格式: `[{\"threshold\": 目標金額, \"bonus\": 獎金 }]` (按 Enter 儲存)"}</p>
                                </div>
                            </div>

                            <div className="flex gap-3 mt-6">
                                <button onClick={() => setShowSettings(false)} className="btn-secondary flex-1" disabled={isSubmitting}>取消</button>
                                <button onClick={handleSaveSettings} className="btn-primary flex-1" disabled={isSubmitting}>
                                    {isSubmitting ? '儲存中...' : '保存設定'}
                                </button>
                            </div>

                            {/* Loading Overlay within Modal */}
                            {isSubmitting && (
                                <div className="absolute inset-0 bg-white/60 backdrop-blur-[2px] z-10 flex items-center justify-center rounded-lg text-center">
                                    <div className="flex flex-col items-center gap-2">
                                        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                                        <span className="text-sm font-medium text-blue-600 font-bold">設定儲存中<br /><span className="text-[10px] opacity-70">正在同步至雲端</span></span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )
            }

            {/* Employee Profile Modal */}
            {
                showProfile && (
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                        <div className="glass-panel w-full max-w-lg p-6 animate-fadeIn">
                            <div className="flex justify-between items-start mb-6">
                                <div>
                                    <h3 className="text-xl font-bold">員工基本資料 - {targetUser}</h3>
                                    <p className="text-sm text-slate-400 mt-1">設定到職日以自動計算年資假</p>
                                </div>
                                <div className="text-right">
                                    <span className="block text-xs text-slate-400 uppercase font-bold tracking-wider">目前年資</span>
                                    <span className="text-lg font-bold text-blue-600">{profileData.seniorityText}</span>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="label">到職日期</label>
                                        <input
                                            type="date"
                                            className="input-field w-full"
                                            value={profileForm.joinedDate}
                                            onChange={e => setProfileForm({ ...profileForm, joinedDate: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="label">生日紀錄 (月/日)</label>
                                        <input
                                            type="text"
                                            placeholder="05/20"
                                            className="input-field w-full"
                                            value={profileForm.birthday}
                                            onChange={e => setProfileForm({ ...profileForm, birthday: e.target.value })}
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="label">身分證/卡號</label>
                                        <input
                                            type="text"
                                            className="input-field w-full"
                                            placeholder="A123456789"
                                            value={profileForm.identityId}
                                            onChange={e => setProfileForm({ ...profileForm, identityId: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="label">聯絡電話</label>
                                        <input
                                            type="text"
                                            className="input-field w-full"
                                            placeholder="0912-345-678"
                                            value={profileForm.contact}
                                            onChange={e => setProfileForm({ ...profileForm, contact: e.target.value })}
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="label">備註事項</label>
                                    <textarea
                                        className="input-field w-full h-24"
                                        placeholder="其他個人備註..."
                                        value={profileForm.note}
                                        onChange={e => setProfileForm({ ...profileForm, note: e.target.value })}
                                    />
                                </div>

                                <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3 flex justify-between items-center">
                                    <span className="text-sm text-emerald-800 font-medium">勞基法預估特休額度</span>
                                    <span className="text-xl font-bold text-emerald-600 font-mono">{profileData.estimatedLeaveDays} 天</span>
                                </div>
                            </div>

                            <div className="flex gap-3 mt-8">
                                <button onClick={() => setShowProfile(false)} className="btn-secondary flex-1" disabled={isSubmitting}>取消</button>
                                <button onClick={handleSaveProfile} className="btn-primary flex-1" disabled={isSubmitting}>
                                    {isSubmitting ? '儲存中...' : '儲存資料'}
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
}

function SummaryCard({ title, amount, subtext, color, isDeduction, isCurrency = true, suffix = '', hiddenAmount, hiddenTitle = '總額參考', hoverContent, isMobile, className = '' }) {
    const [showHidden, setShowHidden] = useState(false);

    const handleToggle = () => {
        if (isMobile || 'ontouchstart' in window) {
            setShowHidden(!showHidden);
        }
    };

    return (
        <div
            onClick={handleToggle}
            className={`
                relative overflow-hidden transition-all cursor-default border border-slate-100 bg-white
                ${isMobile ? 'h-16 p-2 rounded-lg flex flex-col justify-center items-center text-center shadow-sm' : 'h-28 p-4 rounded-xl flex flex-col justify-between glass-panel hover:border-blue-500'}
                ${className}
            `}
            onMouseEnter={() => !isMobile && setShowHidden(true)}
            onMouseLeave={() => !isMobile && setShowHidden(false)}
        >
            <div className={`flex justify-between items-start z-10 w-full ${isMobile ? 'justify-center' : ''}`}>
                <span className={`${isMobile ? 'text-[10px]' : 'text-sm'} text-slate-500 font-bold`}>{title}</span>
            </div>

            <div className={`z-10 w-full ${isMobile ? 'mt-1' : ''}`}>
                <span className={`${isMobile ? 'text-xs' : 'text-2xl'} font-bold tracking-tight ${color}`}>
                    {isDeduction && '-'}{isCurrency && '$'}{(amount || 0).toLocaleString()}{suffix}
                </span>
                {!isMobile && subtext && <p className="text-xs text-slate-500 mt-1">{subtext}</p>}
            </div>

            {/* Hidden Details Tab overlay */}
            {(hiddenAmount !== undefined || hoverContent) && (
                <div className={`absolute top-0 right-0 p-1 md:p-2 transition-all duration-300 ${showHidden ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0'}`}>
                    <div className="bg-white/95 backdrop-blur shadow-sm border border-emerald-100 rounded px-1.5 py-0.5 text-right">
                        {hoverContent ? hoverContent : (
                            <>
                                {hiddenTitle && <p className="text-[8px] md:text-xs text-slate-400 font-medium">{hiddenTitle}</p>}
                                <p className="text-xs md:text-sm font-bold text-emerald-600 font-mono">
                                    {isCurrency && '$'}{(hiddenAmount || 0).toLocaleString()}
                                </p>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* Decor */}
            {!isMobile && (
                <div className={`absolute -right-2 -bottom-2 w-16 h-16 rounded-full opacity-5 ${color?.replace('text-', 'bg-') || 'bg-slate-400'}`}></div>
            )}
        </div>
    );
}
