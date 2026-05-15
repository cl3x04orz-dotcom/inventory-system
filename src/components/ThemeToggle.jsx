import React, { useState } from 'react';
import { Sun, Moon, Clock, Settings } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

export default function ThemeToggle() {
    const { theme, actualTheme, setTheme, autoSchedule, setAutoSchedule } = useTheme();
    const [showSettings, setShowSettings] = useState(false);

    const themes = [
        { value: 'light', label: '淺色', icon: Sun },
        { value: 'dark', label: '深色', icon: Moon },
        { value: 'auto', label: '自動', icon: Clock },
    ];

    const handleScheduleChange = (field, value) => {
        setAutoSchedule({ ...autoSchedule, [field]: value });
    };

    return (
        <div className="relative">
            {/* 膠囊容器 */}
            <div
                className="flex items-center gap-0.5 rounded-full px-1 py-1"
                style={{
                    background: 'var(--theme-toggle-bg, #1e293b)',
                    boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.3), 0 1px 0 rgba(255,255,255,0.06)',
                }}
            >
                {themes.map(({ value, label, icon: Icon }) => {
                    const active = theme === value;
                    return (
                        <button
                            key={value}
                            onClick={() => setTheme(value)}
                            title={label}
                            className={`
                                relative flex items-center justify-center w-8 h-8 rounded-full
                                transition-all duration-300 ease-out
                                ${active
                                    ? 'text-blue-500 scale-100'
                                    : 'text-slate-400 hover:text-slate-200 scale-95 hover:scale-100'
                                }
                            `}
                            style={active ? {
                                background: 'radial-gradient(circle at 40% 35%, #334155, #1e293b)',
                                boxShadow: '0 2px 8px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08)',
                            } : {}}
                        >
                            <Icon size={14} strokeWidth={active ? 2.5 : 1.8} />
                            {/* 僅在 active 時顯示底部光點 */}
                            {active && (
                                <span
                                    className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-blue-400"
                                    style={{ boxShadow: '0 0 4px 1px rgba(96,165,250,0.6)' }}
                                />
                            )}
                        </button>
                    );
                })}

                {/* 排程設定齒輪（auto 模式才顯示） */}
                {theme === 'auto' && (
                    <button
                        onClick={() => setShowSettings(!showSettings)}
                        title="排程設定"
                        className={`
                            flex items-center justify-center w-7 h-7 rounded-full ml-0.5
                            transition-all duration-200
                            ${showSettings
                                ? 'text-blue-400 rotate-45'
                                : 'text-slate-500 hover:text-slate-300'
                            }
                        `}
                    >
                        <Settings size={12} />
                    </button>
                )}
            </div>

            {/* 排程設定面板 */}
            {showSettings && theme === 'auto' && (
                <div className="absolute top-full right-0 mt-2 w-72 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl p-4 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                    <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-3 flex items-center gap-2">
                        <Clock size={16} />
                        自動排程設定
                    </h4>

                    <div className="space-y-3">
                        <label className="flex items-center justify-between">
                            <span className="text-sm text-slate-600 dark:text-slate-400">啟用自動排程</span>
                            <input
                                type="checkbox"
                                checked={autoSchedule.enabled}
                                onChange={(e) => handleScheduleChange('enabled', e.target.checked)}
                                className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                            />
                        </label>

                        <div>
                            <label className="text-xs text-slate-500 dark:text-slate-400 block mb-1">
                                <Sun size={12} className="inline mr-1" />
                                淺色模式開始時間
                            </label>
                            <input
                                type="time"
                                value={autoSchedule.lightStart}
                                onChange={(e) => handleScheduleChange('lightStart', e.target.value)}
                                disabled={!autoSchedule.enabled}
                                className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
                            />
                        </div>

                        <div>
                            <label className="text-xs text-slate-500 dark:text-slate-400 block mb-1">
                                <Moon size={12} className="inline mr-1" />
                                深色模式開始時間
                            </label>
                            <input
                                type="time"
                                value={autoSchedule.darkStart}
                                onChange={(e) => handleScheduleChange('darkStart', e.target.value)}
                                disabled={!autoSchedule.enabled}
                                className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
                            />
                        </div>

                        <div className="pt-2 border-t border-slate-200 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400">
                            當前主題：<span className="font-bold text-slate-700 dark:text-slate-300">
                                {actualTheme === 'light' ? '淺色' : '深色'}
                            </span>
                        </div>
                    </div>

                    <button
                        onClick={() => setShowSettings(false)}
                        className="mt-3 w-full px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-all"
                    >
                        關閉
                    </button>
                </div>
            )}
        </div>
    );
}
