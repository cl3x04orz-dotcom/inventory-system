import React, { useState, useEffect, useCallback } from 'react';
import { callGAS } from '../utils/api';
import { Calendar, DollarSign, User, Save, AlertCircle, CheckCircle, XCircle } from 'lucide-react';

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

    // Load User List (For BOSS)
    useEffect(() => {
        if (user.role === 'BOSS' || user.permissions?.includes('finance_payroll')) {
            callGAS(apiUrl, 'getUsers', {}, user.token)
                .then(users => setUserList(users))
                .catch(err => console.error(err));
        }
    }, [user]);

    // Fetch Payroll Data
    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            // Note: Replace apiUrl with props if available, or assume passed from App
            // For now using placeholder or the known method
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

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleSaveRecord = async () => {
        if (!editingDay) return;
        setIsSubmitting(true);
        try {
            await callGAS(apiUrl, 'saveDailyRecord', {
                date: editingDay.date,
                username: targetUser,
                type: editType,
                value: editType === 'LEAVE' ? 1 : Number(editValue), // Leave=1 day?
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

    // Helper to generate days in month
    const getDaysInMonth = (y, m) => {
        const days = new Date(y, m, 0).getDate();
        return Array.from({ length: days }, (_, i) => {
            const d = new Date(y, m - 1, i + 1);
            const dateStr = d.toISOString().split('T')[0]; // yyyy-mm-dd (UTC... better use local formatting)
            // Local formatting for consistency with backend
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

    return (
        <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto pb-24">

            {/* Header / Filter */}
            <div className="glass-panel p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400 flex items-center gap-3">
                        <DollarSign /> 薪資結算中心
                    </h1>
                    <p className="text-slate-400 text-sm mt-1">自動彙整業績、出勤與各項扣除額</p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    <select
                        value={year}
                        onChange={e => setYear(Number(e.target.value))}
                        className="input-field w-24"
                    >
                        {[2025, 2026, 2027].map(y => <option key={y} value={y}>{y}年</option>)}
                    </select>
                    <select
                        value={month}
                        onChange={e => setMonth(Number(e.target.value))}
                        className="input-field w-20"
                    >
                        {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>{m}月</option>)}
                    </select>

                    {(user.role === 'BOSS' || user.permissions?.includes('finance_payroll')) && (
                        <select
                            value={targetUser}
                            onChange={e => setTargetUser(e.target.value)}
                            className="input-field w-32"
                        >
                            {userList.map(u => (
                                <option key={u.userid} value={u.username}>{u.username}</option>
                            ))}
                            {!userList.some(u => u.username === targetUser) && <option value={targetUser}>{targetUser}</option>}
                        </select>
                    )}

                    <button
                        onClick={() => setShowSettings(true)}
                        className="btn-secondary flex items-center gap-2"
                        disabled={user.role !== 'BOSS'}
                    >
                        <User size={16} /> 薪資設定
                    </button>

                    <button onClick={fetchData} className="btn-primary">
                        重新計算
                    </button>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <SummaryCard title="底薪" amount={data?.config?.baseSalary} color="text-slate-800" />
                <SummaryCard title="全勤獎金" amount={summary.attendanceBonus} color="text-yellow-600" />
                <SummaryCard
                    title="業績獎金"
                    amount={0}
                    subtext={`業績: $${(summary.sales || 0).toLocaleString()}`}
                    color="text-green-600"
                />
                <SummaryCard title="月休/請假" amount={summary.leaveDays} isCurrency={false} suffix=" 天" subtext={`(標準: ${data?.config?.monthlyOffDays || 8}天)`} color="text-blue-600" />

                <SummaryCard title="勞健保(扣)" amount={summary.insurance} isDeduction color="text-red-600" hiddenAmount={summary.bonus} />
                <SummaryCard title="虧損/盤損(扣)" amount={Math.abs(summary.loss || 0)} isDeduction color="text-red-600" />

                <div className="col-span-2 lg:col-span-2 glass-panel p-4 flex justify-between items-center border border-emerald-200 bg-emerald-50">
                    <span className="text-lg text-emerald-900 font-bold">實領薪資</span>
                    <span className="text-4xl font-bold text-emerald-600">${(summary.finalSalary || 0).toLocaleString()}</span>
                </div>
            </div>

            {/* Calendar Table */}
            <div className="glass-panel overflow-hidden">
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

                            // Logic: Sales > 0 => Present. 
                            // If Sales == 0, check record.isLeave.
                            // If isLeave => "休假". Else => "上班" (Default).
                            let status = '上班';
                            let statusColor = 'text-slate-500';

                            if (hasSales) {
                                status = '出勤 (有業績)';
                                statusColor = 'text-green-400 font-bold';
                            } else if (record.isLeave) {
                                status = '休假';
                                statusColor = 'text-yellow-500 bg-yellow-500/10 px-2 rounded';
                            } else {
                                status = '上班 (無業績)';
                                statusColor = 'text-slate-500';
                            }

                            // Check for Sunday highlighting
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
                                        <button
                                            onClick={() => {
                                                setEditingDay(dayItem);
                                                setEditType('LEAVE'); // Default
                                            }}
                                            className="text-xs btn-ghost text-blue-400 hover:text-blue-300"
                                        >
                                            編輯
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* Edit Modal (Day) */}
            {editingDay && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="glass-panel w-full max-w-md p-6 animate-fadeIn">
                        <h3 className="text-xl font-bold mb-4">{editingDay.date} ({editingDay.weekday}) 設定</h3>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm text-slate-400 mb-2">類型</label>
                                <div className="flex bg-slate-50 rounded p-1 border border-slate-200">
                                    <button
                                        className={`flex-1 py-2 rounded text-sm ${editType === 'LEAVE' ? 'bg-yellow-600 text-white' : 'text-slate-500'}`}
                                        onClick={() => setEditType('LEAVE')}
                                    >休假</button>
                                    <button
                                        className={`flex-1 py-2 rounded text-sm ${editType === 'LOSS' ? 'bg-red-600 text-white' : 'text-slate-500'}`}
                                        onClick={() => setEditType('LOSS')}
                                    >盤損/扣款</button>
                                </div>
                            </div>

                            {editType === 'LOSS' && (
                                <div>
                                    <label className="block text-sm text-slate-400 mb-1">金額 (負數為扣款)</label>
                                    <input
                                        type="number"
                                        className="input-field w-full"
                                        placeholder="-100"
                                        value={editValue}
                                        onChange={e => setEditValue(e.target.value)}
                                    />
                                </div>
                            )}

                            <div>
                                <label className="block text-sm text-slate-400 mb-1">備註</label>
                                <input
                                    type="text"
                                    className="input-field w-full"
                                    placeholder="原因說明..."
                                    value={editNote}
                                    onChange={e => setEditNote(e.target.value)}
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
            )}

            {/* Settings Modal (Config) */}
            {showSettings && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="glass-panel w-full max-w-lg p-6 animate-fadeIn max-h-[90vh] overflow-y-auto">
                        <h3 className="text-xl font-bold mb-4">薪資參數設定 - {targetUser}</h3>

                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="label">底薪</label>
                                    <input type="number" className="input-field w-full"
                                        value={settingsForm.baseSalary}
                                        onChange={e => setSettingsForm({ ...settingsForm, baseSalary: e.target.value })} />
                                </div>
                                <div>
                                    <label className="label">全勤獎金</label>
                                    <input type="number" className="input-field w-full"
                                        value={settingsForm.attendanceBonus}
                                        onChange={e => setSettingsForm({ ...settingsForm, attendanceBonus: e.target.value })} />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="label">月休天數標準</label>
                                    <input type="number" className="input-field w-full"
                                        value={settingsForm.monthlyOffDays}
                                        onChange={e => setSettingsForm({ ...settingsForm, monthlyOffDays: e.target.value })} />
                                </div>
                                <div>
                                    <label className="label">勞健保 (扣除額)</label>
                                    <input type="number" className="input-field w-full"
                                        value={settingsForm.insurance}
                                        onChange={e => setSettingsForm({ ...settingsForm, insurance: e.target.value })} />
                                </div>
                            </div>

                            <div>
                                <label className="label">業績獎金級距 (JSON)</label>
                                <textarea
                                    className="input-field w-full font-mono text-xs h-32"
                                    value={settingsForm.bonusTiers}
                                    onChange={e => setSettingsForm({ ...settingsForm, bonusTiers: e.target.value })}
                                    placeholder='[{"threshold": 50000, "bonus": 1000}]'
                                />
                                <p className="text-xs text-slate-400 mt-1">{"格式: `[{\"threshold\": 目標金額, \"bonus\": 獎金 }]`"}</p>
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
            )}
        </div>
    );
}

function SummaryCard({ title, amount, subtext, color, isDeduction, isCurrency = true, suffix = '', hiddenAmount }) {
    const [showHidden, setShowHidden] = useState(false);

    return (
        <div
            className="glass-panel p-4 flex flex-col justify-between h-28 relative overflow-hidden group hover:border-blue-500 transition-all cursor-default"
            onMouseEnter={() => setShowHidden(true)}
            onMouseLeave={() => setShowHidden(false)}
        >
            <span className="text-slate-500 text-sm font-medium z-10">{title}</span>
            <div className="z-10">
                <span className={`text-2xl font-bold tracking-tight ${color}`}>
                    {isDeduction && '-'}{isCurrency && '$'}{(amount || 0).toLocaleString()}{suffix}
                </span>
                {subtext && <p className="text-xs text-slate-500 mt-1">{subtext}</p>}
            </div>

            {/* Hidden Details Tab overlay - shows on hover if hiddenAmount is provided */}
            {hiddenAmount !== undefined && (
                <div className={`absolute top-0 right-0 p-2 transition-all duration-300 ${showHidden ? 'translate-y-2 opacity-100' : '-translate-y-full opacity-0'}`}>
                    <div className="bg-white/90 backdrop-blur shadow-sm border border-emerald-100 rounded px-2 py-0.5 text-right">
                        <p className="text-sm font-bold text-emerald-600 font-mono">{(hiddenAmount || 0).toLocaleString()}</p>
                    </div>
                </div>
            )}

            {/* Decor */}
            <div className={`absolute -right-2 -bottom-2 w-16 h-16 rounded-full opacity-5 ${color?.replace('text-', 'bg-') || 'bg-slate-400'}`}></div>
        </div>
    );
}
