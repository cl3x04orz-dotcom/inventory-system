import React, { useState } from 'react';
import { Sun, Moon, Clock, Settings } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

export default function ThemeToggle() {
    const { theme, actualTheme, setTheme, autoSchedule, setAutoSchedule } = useTheme();
    const [showSettings, setShowSettings] = useState(false);

    const themes = [
        { value: 'light', label: '淺色', icon: Sun },
        { value: 'dark', label: '深色', icon: Moon },
        { value: 'auto', label: '自動', icon: Clock }
    ];

    const handleScheduleChange = (field, value) => {
        setAutoSchedule({
            ...autoSchedule,
            [field]: value
        });
    };

    return (
        <div className="relative">
            {/* 主題切換按鈕 */}
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
                {themes.map(({ value, label, icon: Icon }) => (
                    <button
                        key={value}
                        onClick={() => setTheme(value)}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 ${theme === value
                                ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm'
                                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                            }`}
                        title={label}
                    >
                        <Icon size={14} />
                        <span className="hidden md:inline">{label}</span>
                    </button>
                ))}

                {/* 設定按鈕 (僅在 auto 模式顯示) */}
                {theme === 'auto' && (
                    <button
                        onClick={() => setShowSettings(!showSettings)}
                        className="p-1.5 rounded-md text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
                        title="排程設定"
                    >
                        <Settings size={14} />
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
                        {/* 啟用開關 */}
                        <label className="flex items-center justify-between">
                            <span className="text-sm text-slate-600 dark:text-slate-400">啟用自動排程</span>
                            <input
                                type="checkbox"
                                checked={autoSchedule.enabled}
                                onChange={(e) => handleScheduleChange('enabled', e.target.checked)}
                                className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                            />
                        </label>

                        {/* 淺色模式開始時間 */}
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

                        {/* 深色模式開始時間 */}
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

                        {/* 當前狀態 */}
                        <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
                            <div className="text-xs text-slate-500 dark:text-slate-400">
                                當前主題: <span className="font-bold text-slate-700 dark:text-slate-300">
                                    {actualTheme === 'light' ? '淺色' : '深色'}
                                </span>
                            </div>
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
