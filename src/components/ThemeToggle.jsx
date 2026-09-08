import React, { useState, useRef, useEffect } from 'react';
import { Sun, Moon, Clock, ChevronDown } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

export default function ThemeToggle() {
    const { theme, setTheme } = useTheme();
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef(null);

    const themes = [
        { value: 'light', label: '淺色模式', icon: Sun },
        { value: 'dark', label: '深色模式', icon: Moon },
        { value: 'auto', label: '自動模式', icon: Clock },
    ];

    const currentTheme = themes.find(t => t.value === theme) || themes[0];
    const Icon = currentTheme.icon;

    // 點擊外部關閉選單
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div className="relative" ref={dropdownRef}>
            {/* 模式切換按鈕 (仿照功能選單樣式) */}
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    setIsOpen(!isOpen);
                }}
                className={`flex items-center justify-center gap-1.5 h-10 w-24 px-3 rounded-xl border transition-all duration-300 ${
                    isOpen
                        ? 'bg-blue-600 border-blue-600 text-white shadow-lg'
                        : 'bg-white border-slate-200 text-slate-700 hover:border-blue-400 shadow-sm active:scale-95'
                }`}
            >
                <Icon size={16} className={isOpen ? 'text-white' : 'text-blue-500'} />
                <span className="font-black text-xs tracking-tight">模式</span>
            </button>

            {/* 下拉選單面板 */}
            {isOpen && (
                <div 
                    className="absolute top-full right-0 mt-2 w-36 bg-white border border-slate-200 rounded-2xl shadow-2xl py-1.5 z-[100] animate-in fade-in slide-in-from-top-2 duration-200"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="px-2 pb-1 mb-1 border-b border-slate-100">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">介面外觀</span>
                    </div>
                    {themes.map((t) => (
                        <button
                            key={t.value}
                            onClick={() => {
                                setTheme(t.value);
                                setIsOpen(false);
                            }}
                            className={`w-full flex items-center gap-3 px-3 py-2 text-xs font-bold transition-all ${
                                theme === t.value
                                    ? 'bg-blue-50 text-blue-600'
                                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                            }`}
                        >
                            <t.icon size={14} />
                            {t.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
