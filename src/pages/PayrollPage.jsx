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
        baseSalary: 0, attendanceBonus: 0, insurance: 0, monthlyOffDays: 8, bonusTiers: '[]', empType: 'FULL_TIME', hourlyWage: 0, commissionRate: 0.5
    });
    const [isSubmitting, setIsSubmitting] = useState(false);

    // State for Payroll Disbursement Modal
    const [showPayrollModal, setShowPayrollModal] = useState(false);
    const [payrollModalForm, setPayrollModalForm] = useState({
        paymentMethod: 'CASH',
        paymentDate: new Date().toISOString().split('T')[0]
    });

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
                        bonusTiers: JSON.stringify(result.config.bonusTiers || []),
                        commissionRate: result.config.commissionRate != null
                            ? (result.config.commissionRate * 100) // 轉換為百分比顯示 (0.005 -> 0.5)
                            : 0.5
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

    // Save Payroll to Expenditures — step 1: open modal
    const handleSavePayroll = async () => {
        if (!data || !data.summary) {
            alert('請先計算薪資資料');
            return;
        }
        // Reset modal form to today's date
        setPayrollModalForm({
            paymentMethod: 'CASH',
            paymentDate: new Date().toISOString().split('T')[0]
        });
        setShowPayrollModal(true);
    };

    // step 2: actually call API
    const handleConfirmSavePayroll = async () => {
        setShowPayrollModal(false);
        setIsSubmitting(true);
        try {
            const result = await callGAS(apiUrl, 'savePayrollToExpenditure', {
                targetUser,
                year,
                month,
                finalSalary: data.summary.finalSalary,
                paymentMethod: payrollModalForm.paymentMethod,
                paymentDate: payrollModalForm.paymentDate
            }, user.token);
            const methodLabel = payrollModalForm.paymentMethod === 'CASH' ? '現金' : '匯款';
            alert(`薪資存檔成功！\n\n👤 ${targetUser}\n💰 $${(data.summary.finalSalary || 0).toLocaleString()}\n📅 記帳月份：${year}年${month}月\n💳 付款方式：${methodLabel}\n\n※ 記帳日期為 ${year}年${month}月底，請在支出管理或銷售查詢中選擇該月份即可看到此筆記錄。`);
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
                bonusTiers: parsedTiers,
                empType: settingsForm.empType,
                hourlyWage: Number(settingsForm.hourlyWage),
                commissionRate: Number(settingsForm.commissionRate) / 100 // 將 % 轉小數儲存 (0.5 -> 0.005)
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
                <div className="flex justify-between items-center px-1 mb-6">
                    <h1 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
                        <DollarSign className="text-[var(--accent-blue)]" size={24} /> 薪資結算中心
                    </h1>
                    <button onClick={fetchData} className="btn-secondary py-1 px-3 text-xs h-7 rounded-full border-[var(--border-primary)] text-[var(--text-secondary)]">
                        重新計算
                    </button>
                </div>

                {/* Row 2: Filters Capsule */}
                <div className="flex justify-center">
                    <div className="bg-[var(--bg-primary)] rounded-lg border border-[var(--border-primary)] shadow-sm h-10 px-1 flex items-center gap-1 w-full max-w-[340px] justify-center">
                        <select value={year} onChange={e => setYear(Number(e.target.value))} className="bg-transparent text-sm font-medium text-[var(--text-primary)] h-8 pl-2 pr-1 outline-none text-center">
                            {[2025, 2026, 2027].map(y => <option key={y} value={y}>{y}年</option>)}
                        </select>
                        <div className="w-px h-4 bg-slate-200"></div>
                        <select value={month} onChange={e => setMonth(Number(e.target.value))} className="bg-transparent text-sm font-bold text-[var(--accent-blue)] h-8 px-1 outline-none text-center w-16">
                            {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>{m}月</option>)}
                        </select>
                        {user.role === 'BOSS' && (
                            <>
                                <div className="w-px h-4 bg-slate-200"></div>
                                <select value={targetUser} onChange={e => setTargetUser(e.target.value)} className="bg-transparent text-sm font-medium text-[var(--text-primary)] h-8 pl-1 pr-2 outline-none text-center min-w-[5rem]">
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
                        <div className="bg-[var(--bg-primary)] rounded-lg border border-[var(--border-primary)] shadow-sm h-10 px-1 flex items-center gap-1 w-full max-w-[340px] justify-center">
                            <button onClick={() => setShowSettings(true)} className="h-8 px-2 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] rounded-md flex items-center gap-1">
                                <User size={14} /> 薪資設定
                            </button>
                            <div className="w-px h-4 bg-slate-200"></div>
                            <button onClick={() => setShowProfile(true)} className="h-8 px-2 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] rounded-md flex items-center gap-1">
                                <Calendar size={14} /> 基本資料
                            </button>
                            <div className="w-px h-4 bg-slate-200"></div>
                            <button onClick={handleSavePayroll} disabled={isSubmitting || !data} className="h-8 px-2 text-xs font-medium text-[var(--accent-blue)] hover:bg-[var(--bg-secondary)] rounded-md flex items-center gap-1 disabled:opacity-50">
                                <DollarSign size={14} /> 薪資存檔
                            </button>
                        </div>
                    </div>
                )}

                {/* Info (Seniority etc) - Keep compact */}
                <div className="flex flex-wrap justify-center gap-2 px-1 text-[10px]">
                    <span className="bg-[var(--bg-secondary)] text-[var(--accent-blue)] px-2 py-0.5 rounded border border-[var(--border-primary)]">到職: {profileData.profile.joinedDate || '-'}</span>
                    <span className="bg-[var(--bg-secondary)] text-indigo-500 px-2 py-0.5 rounded border border-[var(--border-primary)]">年資: {profileData.seniorityText}</span>
                {data?.config?.empType !== 'PART_TIME' && (
                    <span className="bg-[var(--bg-secondary)] text-emerald-500 px-2 py-0.5 rounded border border-[var(--border-primary)]">剩餘特休: {(profileData.estimatedLeaveDays - (data?.totalSpecialLeaveUsed || 0))}天</span>
                )}
                </div>
            </div>


            {/* --- Desktop View Header & Controls --- */}
            <div className="hidden md:flex glass-panel p-6 flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-[var(--accent-blue)] to-indigo-500 flex items-center gap-3">
                        <DollarSign /> 薪資結算中心
                    </h1>
                    <p className="text-[var(--text-tertiary)] text-sm mt-1">自動彙整業績、出勤與各項扣除額</p>
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
                            <button onClick={() => setShowProfile(true)} className="btn-secondary flex items-center gap-2 border-[var(--border-primary)] text-emerald-500 hover:bg-[var(--bg-secondary)]">
                                <Calendar size={16} /> 基本資料
                            </button>
                            <button onClick={handleSavePayroll} disabled={isSubmitting || !data} className="btn-secondary flex items-center gap-2 border-[var(--border-primary)] text-blue-700 hover:bg-[var(--bg-secondary)] disabled:opacity-50">
                                <DollarSign size={16} /> {isSubmitting ? '存檔中...' : '薪資存檔'}
                            </button>
                        </>
                    )}
                    <button onClick={fetchData} className="btn-primary">重新計算</button>
                </div>
            </div>

            {/* Desktop Info */}
            <div className="hidden md:flex flex-wrap gap-4 px-2">
                <div className="flex items-center gap-2 bg-[var(--bg-secondary)] text-[var(--accent-blue)] px-3 py-1.5 rounded-full text-sm font-medium border border-[var(--border-primary)]">
                    <Calendar size={14} /> 到職日: {profileData.profile.joinedDate || '未設定'}
                </div>
                <div className="flex items-center gap-2 bg-[var(--bg-secondary)] text-indigo-500 px-3 py-1.5 rounded-full text-sm font-medium border border-[var(--border-primary)]">
                    <User size={14} /> 年資: {profileData.seniorityText}
                </div>
                {data?.config?.empType !== 'PART_TIME' && (
                    <div className="flex items-center gap-2 bg-[var(--bg-secondary)] text-emerald-500 px-3 py-1.5 rounded-full text-sm font-medium border border-[var(--border-primary)]">
                        <CheckCircle size={14} /> 特休狀況: 預估總額 {profileData.estimatedLeaveDays} 天 / 已請 {data?.totalSpecialLeaveUsed || 0} 天 / 剩餘 {(profileData.estimatedLeaveDays - (data?.totalSpecialLeaveUsed || 0))} 天
                    </div>
                )}
            </div>

            {/* Birthday Reminder */}
            {user.role === 'BOSS' && data?.isBirthdayMonth && (
                <div className="px-1 md:px-2">
                    <div className="bg-gradient-to-r from-pink-50 to-rose-50 border border-pink-100 rounded-xl p-3 md:p-4 flex items-center gap-3 md:gap-4 animate-bounce-subtle">
                        <div className="bg-[var(--bg-primary)] p-1.5 md:p-2 rounded-full shadow-sm text-lg md:text-2xl">🎂</div>
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
                {data?.config?.empType === 'PART_TIME' ? (
                    <SummaryCard 
                        title="時薪小計" 
                        amount={summary.calculatedBase} 
                        color="text-amber-700" 
                        isMobile 
                        hoverContent={
                            <div className="flex flex-col items-end">
                                <p className="text-[10px] text-[var(--text-tertiary)] leading-none mb-0.5">總工時</p>
                                <p className="text-xs font-bold text-amber-600">{summary.totalWorkHours || 0} hr</p>
                            </div>
                        } 
                    />
                ) : (
                    <SummaryCard title="底薪" amount={data?.config?.baseSalary} color="text-[var(--text-primary)]" isMobile />
                )}
                {data?.config?.empType === 'PART_TIME' ? (
                    <SummaryCard
                        title="業績抽成"
                        amount={0}
                        color="text-amber-700"
                        isMobile
                    />
                ) : (
                    <SummaryCard
                        title="業績獎金"
                        amount={0}
                        color="text-indigo-600"
                        isMobile
                    />
                )}
                <SummaryCard
                    title="勞健保"
                    amount={summary.insurance}
                    isDeduction
                    color="text-red-600"
                    isMobile
                    hoverContent={
                        <div className="flex flex-col items-end">
                            <p className="text-xs font-bold text-emerald-500 font-mono">${(summary.bonus || 0).toLocaleString()}</p>
                        </div>
                    }
                />
                <SummaryCard
                    title="實領薪資"
                    amount={summary.finalSalary}
                    color="text-[var(--accent-blue)]"
                    isMobile
                    className="bg-[var(--bg-secondary)]/50 border-blue-100"
                />
            </div>

            <div className="grid grid-cols-4 gap-2 px-1 mt-2 md:hidden">
                <SummaryCard
                    title="全勤"
                    amount={summary.attendanceBonus}
                    color="text-yellow-600"
                    isMobile
                    hoverContent={
                        <div className="flex flex-col items-end">
                            <p className="text-[10px] text-[var(--text-tertiary)] leading-none mb-0.5">出勤天</p>
                            <p className="text-xs font-bold text-emerald-500">{attendanceDaysCount} 天</p>
                        </div>
                    }
                />
                {data?.config?.empType !== 'PART_TIME' && (
                    <>
                        <SummaryCard
                            title="一般休假"
                            amount={generalLeaveDaysCount}
                            isCurrency={false}
                            suffix="天"
                            color="text-[var(--text-secondary)]"
                            isMobile
                            hoverContent={
                                <div className="flex flex-col items-end gap-1">
                                    <p className="text-[10px] text-[var(--text-tertiary)] leading-none">補貼</p>
                                    <p className={`text-xs font-bold ${(summary.leaveCompensation || 0) >= 0 ? 'text-[var(--accent-blue)]' : 'text-red-600'}`}>
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
                                    <p className="text-[10px] text-[var(--text-tertiary)] leading-none">扣款</p>
                                    <p className="text-xs font-bold text-red-600">-${(sickLeaveDaysCount * 500).toLocaleString()}</p>
                                </div>
                            }
                        />
                    </>
                )}
            </div>

            {/* Desktop Summary Cards (Original Layout) */}
            <div className="hidden md:grid grid-cols-2 lg:grid-cols-4 gap-4 px-2">
                {data?.config?.empType === 'PART_TIME' ? (
                    <SummaryCard title={`時薪小計 (共 ${summary.totalWorkHours || 0} hr)`} amount={summary.calculatedBase} color="text-amber-700" />
                ) : (
                    <SummaryCard title="底薪" amount={data?.config?.baseSalary} color="text-[var(--text-primary)]" />
                )}
                {data?.config?.empType === 'PART_TIME' ? (
                    <SummaryCard
                        title="業績抽成"
                        amount={0}
                        subtext={`業績 $${(summary.sales || 0).toLocaleString()}`}
                        color="text-amber-700"
                    />
                ) : (
                    <SummaryCard
                        title="業績獎金"
                        amount={0}
                        subtext={`業績總額: $${(summary.sales || 0).toLocaleString()}`}
                        color="text-indigo-600"
                    />
                )}
                <SummaryCard
                    title="勞健保 (扣除)"
                    amount={summary.insurance}
                    isDeduction
                    color="text-red-600"
                    hoverContent={
                        <div className="flex flex-col items-end">
                            <p className="text-sm font-bold text-emerald-500 font-mono">${(summary.bonus || 0).toLocaleString()}</p>
                        </div>
                    }
                />
                <SummaryCard title="實領薪資" amount={summary.finalSalary} color="text-[var(--accent-blue)]" />
            </div>

            <div className="hidden md:grid grid-cols-2 lg:grid-cols-4 gap-4 mt-4 px-2">
                <SummaryCard
                    title="全勤獎金"
                    amount={summary.attendanceBonus}
                    color="text-yellow-600"
                    hoverContent={
                        <div className="flex flex-col items-end">
                            <p className="text-[10px] text-[var(--text-tertiary)] font-medium leading-none mb-1">出勤天</p>
                            <p className="text-sm font-bold text-emerald-500 font-mono">{attendanceDaysCount} 天</p>
                        </div>
                    }
                />
                {data?.config?.empType !== 'PART_TIME' && (
                    <>
                        <SummaryCard
                            title="一般休假"
                            amount={generalLeaveDaysCount}
                            isCurrency={false}
                            suffix=" 天"
                            color="text-[var(--text-secondary)]"
                            hoverContent={
                                <div className="flex flex-col items-end gap-1">
                                    <div>
                                        <p className="text-[10px] text-[var(--text-tertiary)] font-medium leading-none mb-1">月休天數標準</p>
                                        <p className="text-sm font-bold text-emerald-500 font-mono">{data?.config?.monthlyOffDays || 0} 天</p>
                                    </div>
                                    <div className="w-full border-t border-emerald-100 pt-1 mt-0.5">
                                        <p className="text-[10px] text-[var(--text-tertiary)] font-medium leading-none mb-1">補：</p>
                                        <p className={`text-sm font-bold font-mono ${(summary.leaveCompensation || 0) >= 0 ? 'text-[var(--accent-blue)]' : 'text-red-600'}`}>
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
                                    <p className="text-[10px] text-[var(--text-tertiary)] font-medium leading-none mb-1">扣款：</p>
                                    <p className="text-sm font-bold text-red-600 font-mono">-${(sickLeaveDaysCount * 500).toLocaleString()}</p>
                                </div>
                            }
                        />
                    </>
                )}
            </div>

            <div className="px-1 md:px-2 mt-2 md:mt-4">
                <div className="bg-[var(--bg-primary)] p-3 rounded-lg border border-red-100 flex justify-between items-center shadow-sm">
                    <span className="text-sm text-red-600 font-bold">盤損/扣款合計</span>
                    <span className="text-lg font-bold text-red-600">-${(summary.loss || 0).toLocaleString()}</span>
                </div>
            </div>

            {/* Calendar Table (Desktop) */}
            <div className="hidden md:block glass-panel overflow-hidden p-6">
                <div className="grid grid-cols-7 gap-px bg-[var(--border-primary)] rounded-xl overflow-hidden border border-[var(--border-primary)] shadow-sm">
                    {/* Weekday Headers */}
                    {['日', '一', '二', '三', '四', '五', '六'].map((day, idx) => (
                        <div key={day} className={`bg-[var(--bg-secondary)] text-center py-2.5 text-sm font-bold ${idx === 0 || idx === 6 ? 'text-red-500' : 'text-[var(--text-secondary)]'}`}>
                            {day}
                        </div>
                    ))}

                    {/* Empty Slots */}
                    {Array.from({ length: new Date(year, month - 1, 1).getDay() }).map((_, i) => (
                        <div key={`empty-${i}`} className="bg-[var(--bg-secondary)]/30 min-h-[110px]"></div>
                    ))}

                    {/* Day Cells */}
                    {days.map((dayItem) => {
                        const dateStr = dayItem.date;
                        const sales = data?.dailyData?.[dateStr] || 0;
                        const record = data?.dailyRecords?.[dateStr] || {};
                        const hasSales = sales > 0;

                        let status = '休假';
                        let statusStyle = 'bg-yellow-50 text-yellow-600 border-yellow-200';

                        if (hasSales) {
                            status = '出勤';
                            statusStyle = 'bg-emerald-50 text-emerald-600 border-emerald-200';
                        } else if (record.isLeave) {
                            status = '休假';
                            statusStyle = 'bg-yellow-50 text-yellow-600 border-yellow-200';
                        } else if (record.isSpecialLeave) {
                            status = '特休';
                            statusStyle = 'bg-teal-50 text-teal-600 border-teal-200';
                        } else if (record.isSickLeave) {
                            status = '病假';
                            statusStyle = 'bg-amber-50 text-amber-600 border-amber-200';
                        }

                        const isWeekend = dayItem.weekday === '六' || dayItem.weekday === '日';

                        return (
                            <div key={dateStr} className={`bg-[var(--bg-primary)] p-2.5 min-h-[110px] flex flex-col gap-1.5 relative group hover:bg-[var(--bg-secondary)] transition-colors ${isWeekend ? 'bg-[var(--bg-secondary)]/20' : ''}`}>
                                <div className="flex justify-between items-start">
                                    <span className={`text-base font-bold ${isWeekend ? 'text-red-500' : 'text-[var(--text-primary)]'}`}>
                                        {dayItem.day}
                                    </span>
                                    <div className="flex items-center gap-1">
                                        {data?.config?.empType === 'PART_TIME' && record.workHours > 0 && (
                                            <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 shadow-sm">
                                                {record.workHours}h
                                            </span>
                                        )}
                                        {user.role === 'BOSS' && (
                                            <button
                                                onClick={() => {
                                                    setEditingDay(dayItem);
                                                    setEditType('LEAVE'); // Default
                                                }}
                                                className="opacity-0 group-hover:opacity-100 text-[10px] font-bold bg-blue-50 text-blue-600 px-2 py-0.5 rounded shadow-sm transition-opacity"
                                            >
                                                編輯
                                            </button>
                                        )}
                                    </div>
                                </div>
                                <div className="flex-1 space-y-1">
                                    <div className={`text-[10px] px-1.5 py-0.5 rounded border text-center font-bold shadow-sm ${statusStyle}`}>
                                        {status}
                                    </div>
                                    {hasSales && (
                                        <div className="text-xs font-bold text-emerald-600 text-center font-mono">
                                            +${sales.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                                        </div>
                                    )}
                                    {Math.abs(record.loss || 0) > 0.01 && (
                                        <div className="text-[11px] font-bold text-red-600 text-center font-mono bg-red-50 rounded py-[1px]">
                                            -${Math.abs(record.loss).toLocaleString(undefined, { maximumFractionDigits: 1 })}
                                        </div>
                                    )}
                                    {record.note && (
                                        <div className="text-[10px] text-slate-500 leading-tight mt-1 line-clamp-2" title={record.note}>
                                            {record.note}
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* --- Mobile Daily Records (Calendar Presentation) --- */}
            <div className="md:hidden glass-panel overflow-hidden p-2 mt-4">
                <div className="grid grid-cols-7 gap-px bg-[var(--border-primary)] rounded-lg overflow-hidden border border-[var(--border-primary)] shadow-sm">
                    {/* Weekday Headers */}
                    {['日', '一', '二', '三', '四', '五', '六'].map((day, idx) => (
                        <div key={day} className={`bg-[var(--bg-secondary)] text-center py-1.5 text-[10px] font-bold ${idx === 0 || idx === 6 ? 'text-red-500' : 'text-[var(--text-secondary)]'}`}>
                            {day}
                        </div>
                    ))}

                    {/* Empty Slots */}
                    {Array.from({ length: new Date(year, month - 1, 1).getDay() }).map((_, i) => (
                        <div key={`empty-${i}`} className="bg-[var(--bg-secondary)]/30 min-h-[64px]"></div>
                    ))}

                    {/* Day Cells */}
                    {days.map((dayItem) => {
                        const dateStr = dayItem.date;
                        const sales = data?.dailyData?.[dateStr] || 0;
                        const record = data?.dailyRecords?.[dateStr] || {};
                        const hasSales = sales > 0;

                        let status = '休';
                        let statusStyle = 'bg-yellow-50 text-yellow-600';

                        if (hasSales) {
                            status = '勤';
                            statusStyle = 'bg-emerald-50 text-emerald-600';
                        } else if (record.isLeave) {
                            status = '休';
                            statusStyle = 'bg-yellow-50 text-yellow-600';
                        } else if (record.isSpecialLeave) {
                            status = '特';
                            statusStyle = 'bg-teal-50 text-teal-600';
                        } else if (record.isSickLeave) {
                            status = '病';
                            statusStyle = 'bg-amber-50 text-amber-600';
                        }

                        const isWeekend = dayItem.weekday === '六' || dayItem.weekday === '日';

                        return (
                            <div key={dateStr}
                                 onClick={() => {
                                     if(user.role === 'BOSS') {
                                         setEditingDay(dayItem);
                                         setEditType('LEAVE');
                                     }
                                 }}
                                 className={`bg-[var(--bg-primary)] p-1 min-h-[64px] flex flex-col items-center relative active:bg-[var(--bg-secondary)] transition-colors ${isWeekend ? 'bg-[var(--bg-secondary)]/20' : ''} ${user.role === 'BOSS' ? 'cursor-pointer' : ''}`}>
                                
                                <span className={`text-[11px] font-bold ${isWeekend ? 'text-red-500' : 'text-[var(--text-primary)]'} leading-none mb-0.5`}>
                                    {dayItem.day}
                                </span>
                                
                                <div className={`text-[9px] px-1 py-[2px] rounded text-center font-bold shadow-sm w-full leading-none mb-0.5 ${statusStyle}`}>
                                    {status}
                                </div>
                                
                                {data?.config?.empType === 'PART_TIME' && record.workHours > 0 && (
                                    <div className="text-[8px] font-bold text-amber-600 text-center tracking-tighter leading-none mb-0.5">
                                        {record.workHours}h
                                    </div>
                                )}
                                
                                {hasSales && (
                                    <div className="text-[8px] font-bold text-emerald-600 text-center tracking-tighter leading-none mb-0.5">
                                        +{sales.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                                    </div>
                                )}
                                
                                {Math.abs(record.loss || 0) > 0.01 && (
                                    <div className="text-[8px] font-bold text-red-600 text-center tracking-tighter bg-red-50 rounded w-full leading-none py-[2px]">
                                        -{Math.abs(record.loss).toLocaleString(undefined, { maximumFractionDigits: 1 })}
                                    </div>
                                )}
                                
                                {record.note && (
                                    <div className="absolute top-0 right-0 w-1.5 h-1.5 bg-blue-400 rounded-full m-1 shadow-sm"></div>
                                )}
                            </div>
                        );
                    })}
                </div>
                {user.role === 'BOSS' && (
                    <div className="text-center mt-2.5 text-[10px] text-[var(--text-tertiary)] flex items-center justify-center gap-1">
                        <span className="w-1.5 h-1.5 bg-blue-400 rounded-full inline-block"></span> 有藍點代表該日有備註，點擊日期方格即可編輯
                    </div>
                )}
            </div>

            {/* Payroll Disbursement Modal */}
            {showPayrollModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="glass-panel w-full max-w-sm p-6 animate-fadeIn space-y-5">
                        <h3 className="text-xl font-bold text-[var(--text-primary)]">💰 薪資發放確認</h3>
                        <div className="bg-[var(--bg-secondary)] rounded-xl p-4 border border-[var(--border-primary)] space-y-1">
                            <p className="text-xs text-[var(--text-tertiary)] uppercase font-bold">發放對象 / 月份</p>
                            <p className="text-lg font-bold text-[var(--text-primary)]">{targetUser} — {year}年{month}月</p>
                            <p className="text-2xl font-bold text-blue-600">${(data?.summary?.finalSalary || 0).toLocaleString()}</p>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-[var(--text-secondary)] mb-2">付款方式</label>
                                <div className="flex gap-2">
                                    {[{ val: 'CASH', label: '💵 現金' }, { val: 'TRANSFER', label: '🏦 匯款' }].map(opt => (
                                        <button
                                            key={opt.val}
                                            onClick={() => setPayrollModalForm(f => ({ ...f, paymentMethod: opt.val }))}
                                            className={`flex-1 py-2 rounded-lg font-bold text-sm border transition-all ${
                                                payrollModalForm.paymentMethod === opt.val
                                                    ? 'bg-blue-600 text-white border-blue-600 shadow-md'
                                                    : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] border-[var(--border-primary)] hover:border-blue-400'
                                            }`}
                                        >
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-[var(--text-secondary)] mb-2">
                                    實際付款日期
                                    <span className="ml-2 text-xs text-amber-500 font-normal">
                                        ({payrollModalForm.paymentMethod === 'CASH' ? '現金幾號出去的？' : '幾號轉帳成功的？'})
                                    </span>
                                </label>
                                <input
                                    type="date"
                                    className="input-field w-full"
                                    value={payrollModalForm.paymentDate}
                                    onChange={e => setPayrollModalForm(f => ({ ...f, paymentDate: e.target.value }))}
                                />
                                <p className="text-xs text-[var(--text-tertiary)] mt-1">
                                    帳目歸入 {year}年{month}月（損益），但現金流追蹤以此付款日為準
                                </p>
                            </div>
                        </div>

                        <div className="flex gap-3 pt-2">
                            <button
                                onClick={() => setShowPayrollModal(false)}
                                className="flex-1 btn-secondary py-2"
                            >
                                取消
                            </button>
                            <button
                                onClick={handleConfirmSavePayroll}
                                className="flex-1 btn-primary py-2"
                            >
                                確認存檔
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Modal (Day) */}
            {
                editingDay && (
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                        <div className="glass-panel w-full max-w-md p-6 animate-fadeIn">
                            <h3 className="text-xl font-bold mb-4">{editingDay.date} ({editingDay.weekday}) 設定</h3>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm text-[var(--text-tertiary)] mb-2">類型 (左右鍵切換)</label>
                                    <div
                                        className="flex bg-[var(--bg-secondary)] rounded p-1 border border-[var(--border-primary)] outline-none focus-within:ring-2 focus-within:ring-blue-500/20"
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
                                                className={`flex-1 py-2 rounded text-xs transition-all ${editType === t.id ? `${t.color} text-white shadow-sm` : 'text-[var(--text-secondary)] hover:bg-slate-100'}`}
                                                onClick={() => setEditType(t.id)}
                                            >{t.label}</button>
                                        ))}
                                    </div>
                                </div>

                                {editType === 'LOSS' && (
                                    <div>
                                        <label className="block text-sm text-[var(--text-tertiary)] mb-1">金額 (負數為扣款)</label>
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
                                    <label className="block text-sm text-[var(--text-tertiary)] mb-1">備註</label>
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
                                <div className="absolute inset-0 bg-[var(--bg-primary)]/60 backdrop-blur-[2px] z-10 flex items-center justify-center rounded-lg">
                                    <div className="flex flex-col items-center gap-2">
                                        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                                        <span className="text-sm font-medium text-[var(--accent-blue)]">資料存盤中...</span>
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
                                <div className="grid grid-cols-2 gap-4 border-b border-[var(--border-primary)] pb-4">
                                    <div className="col-span-2">
                                        <label className="label">員工類型</label>
                                        <div className="flex bg-[var(--bg-tertiary)] rounded-lg p-1 border border-[var(--border-primary)]">
                                            <button
                                                onClick={() => setSettingsForm({ ...settingsForm, empType: 'FULL_TIME' })}
                                                className={`flex-1 py-1 text-sm font-bold rounded-md transition-all ${settingsForm.empType !== 'PART_TIME'
                                                    ? 'bg-blue-500 text-white shadow-sm'
                                                    : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
                                                    }`}
                                            >
                                                正職人員
                                            </button>
                                            <button
                                                onClick={() => setSettingsForm({ ...settingsForm, empType: 'PART_TIME' })}
                                                className={`flex-1 py-1 text-sm font-bold rounded-md transition-all ${settingsForm.empType === 'PART_TIME'
                                                    ? 'bg-amber-500 text-white shadow-sm'
                                                    : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
                                                    }`}
                                            >
                                                工讀人員
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        {settingsForm.empType === 'PART_TIME' ? (
                                            <>
                                                <label className="label text-amber-700">時薪 (Hourly Wage)</label>
                                                <input type="number" className="input-field w-full border-amber-300 focus:ring-amber-500"
                                                    value={settingsForm.hourlyWage}
                                                    onChange={e => setSettingsForm({ ...settingsForm, hourlyWage: e.target.value })}
                                                />
                                            </>
                                        ) : (
                                            <>
                                                <label className="label">底薪 (Base Salary)</label>
                                                <input type="number" className="input-field w-full"
                                                    ref={settingRefs.baseSalary}
                                                    value={settingsForm.baseSalary}
                                                    onChange={e => setSettingsForm({ ...settingsForm, baseSalary: e.target.value })}
                                                    onKeyDown={e => handleSettingKeyDown(e, 'baseSalary')} />
                                            </>
                                        )}
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

                                {settingsForm.empType === 'PART_TIME' ? (
                                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
                                        <label className="label text-amber-800">業績抽成比率 (%)</label>
                                        <div className="flex items-center gap-3">
                                            <input
                                                type="number"
                                                step="0.1"
                                                min="0"
                                                max="100"
                                                className="input-field w-28 text-center text-lg font-bold text-amber-900 border-amber-300 focus:ring-amber-500"
                                                value={settingsForm.commissionRate}
                                                onChange={e => setSettingsForm({ ...settingsForm, commissionRate: e.target.value })}
                                            />
                                            <span className="text-amber-700 font-bold text-lg">%</span>
                                            <span className="text-xs text-amber-600 ml-2">
                                                業績抽成 = 當月總業績 × {settingsForm.commissionRate || 0}%
                                            </span>
                                        </div>
                                        <p className="text-xs text-amber-500">工讀生不使用級距制，改以固定比率計算業績獎金</p>
                                    </div>
                                ) : (
                                    <div>
                                        <label className="label">業績獎金級距 (正職專用)</label>
                                        <textarea
                                            className="input-field w-full font-mono text-xs h-32"
                                            ref={settingRefs.bonusTiers}
                                            value={settingsForm.bonusTiers}
                                            onChange={e => setSettingsForm({ ...settingsForm, bonusTiers: e.target.value })}
                                            onKeyDown={e => handleSettingKeyDown(e, 'bonusTiers')}
                                            placeholder='[{"threshold": 50000, "bonus": 1000}]'
                                        />
                                        <p className="text-xs text-[var(--text-tertiary)] mt-1">{"格式: `[{\"threshold\": 目標金額, \"bonus\": 獎金 }]`"}</p>
                                    </div>
                                )}
                            </div>

                            <div className="flex gap-3 mt-6">
                                <button onClick={() => setShowSettings(false)} className="btn-secondary flex-1" disabled={isSubmitting}>取消</button>
                                <button onClick={handleSaveSettings} className="btn-primary flex-1" disabled={isSubmitting}>
                                    {isSubmitting ? '儲存中...' : '保存設定'}
                                </button>
                            </div>

                            {/* Loading Overlay within Modal */}
                            {isSubmitting && (
                                <div className="absolute inset-0 bg-[var(--bg-primary)]/60 backdrop-blur-[2px] z-10 flex items-center justify-center rounded-lg text-center">
                                    <div className="flex flex-col items-center gap-2">
                                        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                                        <span className="text-sm font-medium text-[var(--accent-blue)] font-bold">設定儲存中<br /><span className="text-[10px] opacity-70">正在同步至雲端</span></span>
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
                                    <p className="text-sm text-[var(--text-tertiary)] mt-1">設定到職日以自動計算年資假</p>
                                </div>
                                <div className="text-right">
                                    <span className="block text-xs text-[var(--text-tertiary)] uppercase font-bold tracking-wider">目前年資</span>
                                    <span className="text-lg font-bold text-[var(--accent-blue)]">{profileData.seniorityText}</span>
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

                                <div className="bg-[var(--bg-secondary)] border border-emerald-100 rounded-lg p-3 flex justify-between items-center">
                                    <span className="text-sm text-emerald-800 font-medium">勞基法預估特休額度</span>
                                    <span className="text-xl font-bold text-emerald-500 font-mono">{profileData.estimatedLeaveDays} 天</span>
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
                relative overflow-hidden transition-all cursor-default border border-[var(--border-primary)] bg-[var(--bg-primary)]
                ${isMobile ? 'h-16 p-2 rounded-lg flex flex-col justify-center items-center text-center shadow-sm' : 'h-28 p-4 rounded-xl flex flex-col justify-between glass-panel hover:border-blue-500'}
                ${className}
            `}
            onMouseEnter={() => !isMobile && setShowHidden(true)}
            onMouseLeave={() => !isMobile && setShowHidden(false)}
        >
            <div className={`flex justify-between items-start z-10 w-full ${isMobile ? 'justify-center' : ''}`}>
                <span className={`${isMobile ? 'text-[10px]' : 'text-sm'} text-[var(--text-secondary)] font-bold`}>{title}</span>
            </div>

            <div className={`z-10 w-full ${isMobile ? 'mt-1' : ''}`}>
                <span className={`${isMobile ? 'text-xs' : 'text-2xl'} font-bold tracking-tight ${color}`}>
                    {isDeduction && '-'}{isCurrency && '$'}{(amount || 0).toLocaleString()}{suffix}
                </span>
                {!isMobile && subtext && <p className="text-xs text-[var(--text-secondary)] mt-1">{subtext}</p>}
            </div>

            {/* Hidden Details Tab overlay */}
            {(hiddenAmount !== undefined || hoverContent) && (
                <div className={`absolute top-0 right-0 p-1 md:p-2 transition-all duration-300 ${showHidden ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0'}`}>
                    <div className="bg-[var(--bg-primary)]/95 backdrop-blur shadow-sm border border-emerald-100 rounded px-1.5 py-0.5 text-right">
                        {hoverContent ? hoverContent : (
                            <>
                                {hiddenTitle && <p className="text-[8px] md:text-xs text-[var(--text-tertiary)] font-medium">{hiddenTitle}</p>}
                                <p className="text-xs md:text-sm font-bold text-emerald-500 font-mono">
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
