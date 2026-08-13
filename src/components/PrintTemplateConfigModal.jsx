import React, { useState, useEffect, useRef } from 'react';
import { X, Check, Type, Layout, Eye, EyeOff, Settings, Save, RotateCcw, MoveLeft, MoveRight, Code, Tag, Info, Sparkles, Sliders, Layers } from 'lucide-react';
import { safeLocalStorage } from '../utils/storage';
import { callGAS } from '../utils/api';
import { printNativeSpreadsheetHtml } from '../utils/printHelper';

export const DEFAULT_GRID_COLUMNS = [
    { id: 'idx', key: 'idx', label: '編號', width: 6, align: 'center', visible: true, locked: true },
    { id: 'name', key: 'name', label: '品項', width: 34, align: 'left', visible: true },
    { id: 'stock', key: 'stock', label: '原庫存', width: 12, align: 'center', visible: true },
    { id: 'picked', key: 'picked', label: '領貨數', width: 14, align: 'center', visible: true, isHighlight: true },
    { id: 'returns', key: 'returns', label: '退貨數', width: 12, align: 'center', visible: true },
    { id: 'sold', key: 'sold', label: '實售數', width: 12, align: 'center', visible: true },
    { id: 'price', key: 'price', label: '單價', width: 10, align: 'right', visible: false },
    { id: 'subtotal', key: 'subtotal', label: '應繳金', width: 12, align: 'right', visible: false }
];

export const DEFAULT_PRINT_CONFIG = {
    title: '銷售與領貨點貨單據',
    layout: 'two_columns', // 'two_columns' | 'single_column'
    fontSize: 15, // 11 | 13 | 15 | 18
    nameFontSize: 18, // 📦 品項名稱單獨字體大小: 1 - 100px
    borderStyle: 'thick', // 'thick' | 'thin'
    columns: DEFAULT_GRID_COLUMNS,
    showExpenses: true,
    showCash: true,
    showSignatures: true
};

export const FRIENDLY_COLUMN_OPTIONS = [
    { id: 'idx', label: '編號', icon: '🔢' },
    { id: 'name', label: '品項', icon: '📦' },
    { id: 'stock', label: '原庫存', icon: '📦' },
    { id: 'picked', label: '領貨數', icon: '🚚' },
    { id: 'returns', label: '退貨數', icon: '↩️' },
    { id: 'sold', label: '實售數', icon: '💰' },
    { id: 'price', label: '單價', icon: '💵' },
    { id: 'subtotal', label: '應繳金', icon: '📝' },
];

export default function PrintTemplateConfigModal({ isOpen, onClose, onSave, apiUrl }) {
    const [config, setConfig] = useState(DEFAULT_PRINT_CONFIG);
    const [savedNotice, setSavedNotice] = useState(false);
    const [activeInputIndex, setActiveInputIndex] = useState(null); // 'title' or column index
    const [resizingColIndex, setResizingColIndex] = useState(null);
    const paperRef = useRef(null);
    const startXRef = useRef(0);
    const startWidthRef = useRef(0);

    const targetApiUrl = apiUrl || (typeof window !== 'undefined' && window.VITE_API_URL) || '/api';

    useEffect(() => {
        const loadConfig = async () => {
            // 1. 先讀本機 Fast Cache
            const saved = safeLocalStorage.getItem('print_template_config');
            if (saved) {
                try {
                    const parsed = JSON.parse(saved);
                    setConfig({
                        ...DEFAULT_PRINT_CONFIG,
                        ...parsed,
                        columns: parsed.columns && parsed.columns.length > 0 ? parsed.columns : DEFAULT_GRID_COLUMNS
                    });
                } catch (e) {
                    console.error('Parse print config error:', e);
                }
            }

            // 2. 背景從 PostgreSQL 雲端資料庫抓取最新版同步
            try {
                const res = await callGAS(targetApiUrl, 'getPrintTemplateConfig', {});
                if (res && res.success && res.config) {
                    const cloudConfig = typeof res.config === 'string' ? JSON.parse(res.config) : res.config;
                    const merged = {
                        ...DEFAULT_PRINT_CONFIG,
                        ...cloudConfig,
                        columns: cloudConfig.columns && cloudConfig.columns.length > 0 ? cloudConfig.columns : DEFAULT_GRID_COLUMNS
                    };
                    setConfig(merged);
                    safeLocalStorage.setItem('print_template_config', JSON.stringify(merged));
                }
            } catch (err) {
                console.warn('[PrintConfigModal] Cloud DB fetch fallback:', err);
            }
        };

        if (isOpen) {
            loadConfig();
        }
    }, [isOpen, targetApiUrl]);

    // 滑鼠拖拉 A4 白紙表格欄位邊界 ↔ Drag Column Resizer
    const handleMouseDownResizer = (e, index) => {
        e.preventDefault();
        e.stopPropagation();
        setResizingColIndex(index);
        startXRef.current = e.clientX;
        startWidthRef.current = config.columns[index].width;

        const handleMouseMove = (moveEvent) => {
            if (!paperRef.current) return;
            const paperWidth = paperRef.current.clientWidth || 800;
            const deltaX = moveEvent.clientX - startXRef.current;
            const deltaPercent = Math.round((deltaX / paperWidth) * 100);
            const newWidth = Math.max(4, Math.min(60, startWidthRef.current + deltaPercent));

            setConfig(prev => {
                const newCols = [...prev.columns];
                newCols[index] = { ...newCols[index], width: newWidth };
                return { ...prev, columns: newCols };
            });
        };

        const handleMouseUp = () => {
            setResizingColIndex(null);
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    };

    if (!isOpen) return null;

    const insertVariable = (tag) => {
        if (activeInputIndex === 'title') {
            setConfig(prev => ({ ...prev, title: prev.title + ' ' + tag }));
        } else if (typeof activeInputIndex === 'number') {
            const newCols = [...config.columns];
            newCols[activeInputIndex].label = newCols[activeInputIndex].label + ' ' + tag;
            setConfig({ ...config, columns: newCols });
        } else {
            // 預設追加至大標題
            setConfig(prev => ({ ...prev, title: prev.title + ' ' + tag }));
        }
    };

    const handleAutoBalanceWidths = (presetType = 'standard') => {
        const visibleCols = config.columns.filter(c => c.visible);
        if (visibleCols.length === 0) return;

        let newCols = [...config.columns];

        if (presetType === 'presbyopia') {
            // 老花眼版型：品項名稱 50%，其餘均分
            const idxWidth = 6;
            const nameWidth = 50;
            const otherCols = visibleCols.filter(c => c.id !== 'name' && c.id !== 'idx');
            const remain = Math.max(0, 100 - idxWidth - nameWidth);
            const eachOther = otherCols.length > 0 ? Math.floor(remain / otherCols.length) : 0;

            newCols = newCols.map(c => {
                if (!c.visible) return c;
                if (c.id === 'idx') return { ...c, width: idxWidth };
                if (c.id === 'name') return { ...c, width: nameWidth };
                return { ...c, width: eachOther };
            });
        } else if (presetType === 'even') {
            // 完全均分版型
            const idxWidth = 6;
            const remain = Math.max(0, 100 - idxWidth);
            const otherCols = visibleCols.filter(c => c.id !== 'idx');
            const each = otherCols.length > 0 ? Math.floor(remain / otherCols.length) : 0;

            newCols = newCols.map(c => {
                if (!c.visible) return c;
                if (c.id === 'idx') return { ...c, width: idxWidth };
                return { ...c, width: each };
            });
        } else {
            // 黃金比例版型：品項名稱 38%，其餘均分
            const idxWidth = 6;
            const nameWidth = 38;
            const otherCols = visibleCols.filter(c => c.id !== 'name' && c.id !== 'idx');
            const remain = Math.max(0, 100 - idxWidth - nameWidth);
            const eachOther = otherCols.length > 0 ? Math.floor(remain / otherCols.length) : 0;

            newCols = newCols.map(c => {
                if (!c.visible) return c;
                if (c.id === 'idx') return { ...c, width: idxWidth };
                if (c.id === 'name') return { ...c, width: nameWidth };
                return { ...c, width: eachOther };
            });
        }

        setConfig({ ...config, columns: newCols });
    };

    const handleSave = async () => {
        safeLocalStorage.setItem('print_template_config', JSON.stringify(config));
        setSavedNotice(true);
        setTimeout(() => setSavedNotice(false), 2000);
        if (onSave) onSave(config);

        try {
            await callGAS(targetApiUrl, 'savePrintTemplateConfig', { config });
            console.log('[PrintConfigModal] Saved to Cloud PostgreSQL DB successfully!');
        } catch (err) {
            console.error('[PrintConfigModal] Cloud DB save failed, saved locally:', err);
        }
    };

    const handleReset = () => {
        setConfig(DEFAULT_PRINT_CONFIG);
        safeLocalStorage.setItem('print_template_config', JSON.stringify(DEFAULT_PRINT_CONFIG));
    };

    const moveColumn = (index, direction) => {
        const newCols = [...config.columns];
        const targetIndex = index + direction;
        if (targetIndex < 0 || targetIndex >= newCols.length) return;
        const temp = newCols[index];
        newCols[index] = newCols[targetIndex];
        newCols[targetIndex] = temp;
        setConfig({ ...config, columns: newCols });
    };

    const updateColumn = (index, field, value) => {
        const newCols = [...config.columns];
        newCols[index] = { ...newCols[index], [field]: value };
        setConfig({ ...config, columns: newCols });
    };

    const handlePreview = () => {
        const sampleData = {
            data: {
                date: new Date().toISOString(),
                location: '總部/車次',
                salesRep: '管理者',
                totalSalesAmount: 15000,
                totalCashCalc: 14500,
                finalTotal: 14500,
                reserve: 1000,
                expenses: { stall: 300, cleaning: 100, electricity: 100, others: 0 },
                rows: [
                    { name: '經典紅茶 (大杯)', stock: 50, picked: 20, returns: 5, sold: 15, price: 30, subtotal: 450 },
                    { name: '招牌奶茶 (大杯)', stock: 40, picked: 15, returns: 2, sold: 13, price: 50, subtotal: 650 },
                    { name: '黑糖珍珠鮮奶', stock: 30, picked: 10, returns: 0, sold: 10, price: 70, subtotal: 700 },
                    { name: '原味蛋塔 (盒裝)', stock: 20, picked: 5, returns: 1, sold: 4, price: 180, subtotal: 720 },
                    { name: '高山烏龍茶', stock: 60, picked: 25, returns: 8, sold: 17, price: 35, subtotal: 595 }
                ]
            }
        };
        printNativeSpreadsheetHtml(sampleData, config);
    };

    const visibleCols = config.columns.filter(c => c.visible);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 md:p-4 bg-slate-900/70 backdrop-blur-md animate-fade-in">
            {/* Main Modal Container */}
            <div className="bg-slate-100 rounded-2xl shadow-2xl border border-slate-300 w-full max-w-6xl max-h-[95vh] flex flex-col overflow-hidden text-slate-900">
                
                {/* Modal Header */}
                <div className="flex items-center justify-between px-6 py-3.5 border-b border-slate-200 bg-white">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-blue-600 text-white rounded-xl shadow-md">
                            <Sparkles size={20} />
                        </div>
                        <div>
                            <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
                                📄 1:1 所見即所得 A4 紙張畫布編輯器
                                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 font-bold border border-blue-200">WYSIWYG Live Paper</span>
                            </h2>
                            <p className="text-xs font-medium text-slate-500">直覺直接在 A4 白紙上面點擊打字、滑鼠拖拉表格分割線，所見即 100% 所印</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100 transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Top Floating Control Bar (字體與版型極速控制器) */}
                <div className="px-6 py-3 bg-slate-200/90 border-b border-slate-300 flex flex-wrap items-center justify-between gap-3 text-xs">
                    {/* Left: Quick Font Controls */}
                    <div className="flex items-center gap-3">
                        {/* Global Font Size */}
                        <div className="flex items-center gap-1.5 bg-white px-3 py-1.5 rounded-xl border border-slate-300 shadow-sm">
                            <Type size={14} className="text-blue-600" />
                            <span className="font-bold text-slate-700">全局字體:</span>
                            <select
                                value={config.fontSize}
                                onChange={(e) => setConfig({ ...config, fontSize: Number(e.target.value) })}
                                className="font-bold text-slate-900 bg-transparent focus:outline-none cursor-pointer"
                            >
                                <option value={11}>精簡 (11px)</option>
                                <option value={13}>標準 (13px)</option>
                                <option value={15}>放大 (15px) ⭐</option>
                                <option value={18}>特大 (18px)</option>
                            </select>
                        </div>

                        {/* Precise 1-100px Product Item Font Size Controller */}
                        <div className="flex items-center gap-2 bg-amber-50 px-3 py-1.5 rounded-xl border border-amber-300 shadow-sm">
                            <span className="font-black text-amber-900 shrink-0">📦 品項字體 (1-100px):</span>
                            
                            {/* 1 ~ 100px Drag Slider */}
                            <input
                                type="range"
                                min={1}
                                max={100}
                                value={config.nameFontSize || 18}
                                onChange={(e) => setConfig({ ...config, nameFontSize: Number(e.target.value) })}
                                className="w-24 accent-amber-600 cursor-pointer"
                                title="滑動拖拉 1px - 100px"
                            />
                            
                            {/* 1 ~ 100px Direct Number Input */}
                            <div className="flex items-center bg-white border border-amber-400 rounded-lg px-1 py-0.5 shadow-2xs">
                                <input
                                    type="number"
                                    min={1}
                                    max={100}
                                    value={config.nameFontSize || 18}
                                    onChange={(e) => {
                                        const val = Math.max(1, Math.min(100, Number(e.target.value) || 1));
                                        setConfig({ ...config, nameFontSize: val });
                                    }}
                                    className="w-10 font-black text-amber-900 text-center focus:outline-none text-xs"
                                />
                                <span className="text-[10px] font-black text-amber-700 font-mono mr-0.5">px</span>
                            </div>
                        </div>

                        {/* Layout Select */}
                        <div className="flex items-center gap-1.5 bg-white px-3 py-1.5 rounded-xl border border-slate-300 shadow-sm">
                            <Layout size={14} className="text-blue-600" />
                            <span className="font-bold text-slate-700">版型:</span>
                            <select
                                value={config.layout}
                                onChange={(e) => setConfig({ ...config, layout: e.target.value })}
                                className="font-bold text-slate-900 bg-transparent focus:outline-none cursor-pointer"
                            >
                                <option value="two_columns">A4 左右雙欄並排 ⭐</option>
                                <option value="single_column">A4 單欄直式列表</option>
                            </select>
                        </div>
                    </div>

                    {/* Right: Quick Auto-Balance Buttons */}
                    <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-600">💡 一鍵自動補滿 100%:</span>
                        <button
                            type="button"
                            onClick={() => handleAutoBalanceWidths('standard')}
                            className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-sm transition-all active:scale-95 cursor-pointer"
                        >
                            ✨ 黃金比例
                        </button>
                        <button
                            type="button"
                            onClick={() => handleAutoBalanceWidths('presbyopia')}
                            className="px-2.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold shadow-sm transition-all active:scale-95 cursor-pointer"
                        >
                            👓 老花眼 (50%)
                        </button>
                        <button
                            type="button"
                            onClick={() => handleAutoBalanceWidths('even')}
                            className="px-2.5 py-1.5 bg-slate-700 hover:bg-slate-800 text-white rounded-xl font-bold shadow-sm transition-all active:scale-95 cursor-pointer"
                        >
                            ⚖️ 平均欄寬
                        </button>
                    </div>
                </div>

                {/* 🧰 Column Selector Bar (常用欄位快速開關與選擇列) */}
                <div className="px-6 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center gap-2 overflow-x-auto text-xs">
                    <span className="font-black text-slate-800 shrink-0 flex items-center gap-1">
                        ✨ 欄位快速開啟/隱藏:
                    </span>
                    {FRIENDLY_COLUMN_OPTIONS.map((opt) => {
                        const colObj = config.columns.find(c => c.id === opt.id);
                        const isVisible = colObj ? colObj.visible !== false : false;
                        return (
                            <button
                                key={opt.id}
                                type="button"
                                onClick={() => {
                                    const newCols = config.columns.map(c => {
                                        if (c.id === opt.id) {
                                            return { ...c, visible: !c.visible };
                                        }
                                        return c;
                                    });
                                    setConfig({ ...config, columns: newCols });
                                }}
                                title={`點擊切換 ${opt.label} 欄位顯示/隱藏`}
                                className={`px-3 py-1 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shrink-0 shadow-xs border ${
                                    isVisible
                                        ? 'bg-blue-600 text-white border-blue-600 shadow-blue-500/20'
                                        : 'bg-white text-slate-500 border-slate-300 hover:bg-slate-100 hover:text-slate-700'
                                }`}
                            >
                                <span>{opt.icon}</span>
                                <span>{opt.label}</span>
                                <span className={`text-[10px] px-1 py-0.2 rounded font-mono ${isVisible ? 'bg-blue-700 text-white' : 'bg-slate-200 text-slate-600'}`}>
                                    {isVisible ? '✓ 顯示' : '隱藏'}
                                </span>
                            </button>
                        );
                    })}
                </div>

                {/* Modal Body - 1:1 Live A4 Paper Canvas Center */}
                <div className="flex-1 p-6 overflow-y-auto bg-slate-200/70 flex justify-center">
                    
                    {/* 📄 1:1 Real A4 Paper Canvas */}
                    <div
                        ref={paperRef}
                        className="w-full max-w-4xl bg-white border border-slate-300 shadow-2xl p-8 min-h-[720px] text-slate-900 rounded-sm relative font-sans transition-all"
                        style={{ fontSize: `${config.fontSize}px` }}
                    >
                        {/* Paper Watermark Badge */}
                        <div className="absolute top-3 right-4 text-[10px] font-bold text-slate-400 border border-slate-200 px-2 py-0.5 rounded pointer-events-none">
                            1:1 A4 印單白紙畫布 (所見即 100% 所印)
                        </div>

                        {/* 1. Header Title Block (直接在白紙上點擊編輯大標題) */}
                        <div className="text-center border-b-2 border-slate-900 pb-3 mb-4">
                            <label className="text-[10px] font-bold text-blue-600 block mb-1">
                                ✏️ 點擊下方文字直接修改標題 (支援代碼如 {"{{date}}"})
                            </label>
                            <input
                                type="text"
                                value={config.title}
                                onFocus={() => setActiveInputIndex('title')}
                                onChange={(e) => setConfig({ ...config, title: e.target.value })}
                                className="w-full text-center font-black bg-blue-50/40 hover:bg-blue-50 focus:bg-white border border-transparent hover:border-blue-300 focus:border-blue-500 rounded px-2 py-1 focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all"
                                style={{ fontSize: `${config.fontSize + 8}px` }}
                            />
                        </div>

                        {/* 2. Top Info Row Simulation */}
                        <div className="flex justify-between items-center bg-slate-50 border border-slate-900 px-3 py-1.5 text-xs font-bold mb-4 rounded-xs">
                            <span>📅 日期: 2026/08/12</span>
                            <span>🏢 營業所/車次: 總部/車次</span>
                            <span>👤 業務員: 管理者</span>
                        </div>

                        {/* 3. 📄 Interactive A4 Table Grid (1:1 展示：單欄 vs 左右對折雙欄) */}
                        <div className="mb-6">
                            <div className="text-[11px] font-bold text-slate-600 mb-2 flex items-center justify-between">
                                <span className="flex items-center gap-1">
                                    <Sliders size={13} className="text-blue-600" />
                                    💡 欄位調整：點擊標題直接改字，滑鼠按住表頭右側邊界線 <strong className="text-blue-700 font-black font-mono">↔</strong> 左右拖拉可調整欄寬！
                                </span>
                                <span className="text-blue-700 font-mono font-bold">
                                    當前版型: {config.layout === 'two_columns' ? 'A4 左右雙欄對折並排 (全頁 100%)' : 'A4 單欄直式列表'}
                                </span>
                            </div>

                            {/* Dynamic Layout Rendering (雙欄對折並排 vs 單欄直式) */}
                            <div className={config.layout === 'two_columns' ? 'grid grid-cols-2 gap-3' : 'w-full'}>
                                
                                {/* TABLE 1: LEFT COLUMN / FULL COLUMN */}
                                <div className="border-2 border-slate-900 rounded-xs overflow-hidden">
                                    {config.layout === 'two_columns' && (
                                        <div className="bg-slate-200 text-slate-800 text-[10px] font-black px-2 py-0.5 text-center border-b border-slate-900">
                                            ◀ 左半頁單據對折區
                                        </div>
                                    )}
                                    <table className="w-full border-collapse text-xs">
                                        <thead>
                                            <tr className="bg-slate-100 border-b-2 border-slate-900">
                                                {config.columns.map((col, idx) => {
                                                    if (!col.visible) return null;
                                                    return (
                                                        <th
                                                            key={col.id}
                                                            style={{ width: `${col.width}%`, textAlign: col.align || 'center' }}
                                                            className="p-1.5 border-r border-slate-900 font-black relative group bg-slate-100 hover:bg-blue-50/80 transition-colors"
                                                        >
                                                            {/* On-Paper Label Input with StopPropagation to allow clean editing */}
                                                            <input
                                                                type="text"
                                                                value={col.label}
                                                                onMouseDown={(e) => e.stopPropagation()}
                                                                onClick={(e) => e.stopPropagation()}
                                                                onFocus={() => setActiveInputIndex(idx)}
                                                                onChange={(e) => updateColumn(idx, 'label', e.target.value)}
                                                                className="w-full bg-white/70 hover:bg-white focus:bg-white border border-slate-300 focus:border-blue-600 rounded text-center font-black focus:outline-none px-1 py-0.5"
                                                            />

                                                            {/* Data Width Badge */}
                                                            <div className="text-[9px] font-mono text-slate-500 font-normal mt-0.5">
                                                                ({col.width}%)
                                                            </div>

                                                            {/* Column Reorder Arrows on Hover */}
                                                            <div className="absolute top-0.5 right-1 hidden group-hover:flex items-center gap-0.5 bg-white/90 border border-slate-300 rounded px-0.5 shadow-xs">
                                                                <button
                                                                    type="button"
                                                                    disabled={idx === 0}
                                                                    onClick={(e) => { e.stopPropagation(); moveColumn(idx, -1); }}
                                                                    className="hover:text-blue-600 disabled:opacity-20"
                                                                >
                                                                    <MoveLeft size={10} />
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    disabled={idx === config.columns.length - 1}
                                                                    onClick={(e) => { e.stopPropagation(); moveColumn(idx, 1); }}
                                                                    className="hover:text-blue-600 disabled:opacity-20"
                                                                >
                                                                    <MoveRight size={10} />
                                                                </button>
                                                            </div>

                                                            {/* ↔ Column Resizer Drag Handle (滑鼠直接按住拖拉欄寬) */}
                                                            <div
                                                                onMouseDown={(e) => handleMouseDownResizer(e, idx)}
                                                                title="按住滑鼠向左右拖拉，直接改變欄位寬度 ↔"
                                                                className="absolute top-0 bottom-0 right-0 w-2 cursor-col-resize hover:bg-blue-500/50 active:bg-blue-600 flex items-center justify-center transition-all group-hover:bg-blue-400/40"
                                                            >
                                                                <div className="w-0.5 h-4 bg-slate-400 group-hover:bg-blue-600"></div>
                                                            </div>
                                                        </th>
                                                    );
                                                })}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {/* 模擬 Sample Left Rows (0值空白、無$符號、應繳金空白) */}
                                            {[
                                                { name: '六甲1L', stock: 16, picked: 0, returns: 0, sold: 0, price: 75, subtotal: 0 },
                                                { name: '崙背1L', stock: 4, picked: 0, returns: 0, sold: 0, price: 80, subtotal: 0 },
                                                { name: '崙背2L', stock: 0, picked: 0, returns: 0, sold: 0, price: 155, subtotal: 0 }
                                            ].map((r, i) => (
                                                <tr key={i} className="border-b border-slate-900">
                                                    {config.columns.map(c => {
                                                        if (!c.visible) return null;
                                                        const isName = c.id === 'name';
                                                        const isPicked = c.id === 'picked';
                                                        
                                                        let val = c.id === 'idx' ? i + 1 : r[c.id] ?? '';
                                                        if (c.id === 'subtotal') val = '';
                                                        else if (c.id === 'price') val = Number(r.price || 0) === 0 ? '' : Number(r.price).toLocaleString();
                                                        else if (c.id !== 'name' && c.id !== 'idx' && Number(val) === 0) val = '';

                                                        const customStyle = isName ? { fontSize: `${config.nameFontSize || config.fontSize}px`, fontWeight: 900 } : {};
                                                        return (
                                                            <td
                                                                key={c.id}
                                                                style={{ textAlign: c.align || 'center', ...customStyle }}
                                                                className={`p-1.5 border-r border-slate-900 font-bold ${
                                                                    isPicked ? 'text-red-600 font-black' : (isName ? 'font-black' : '')
                                                                }`}
                                                            >
                                                                {val}
                                                            </td>
                                                        );
                                                    })}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                {/* TABLE 2: RIGHT COLUMN (Only rendered when layout is two_columns) */}
                                {config.layout === 'two_columns' && (
                                    <div className="border-2 border-slate-900 rounded-xs overflow-hidden">
                                        <div className="bg-slate-200 text-slate-800 text-[10px] font-black px-2 py-0.5 text-center border-b border-slate-900">
                                            ▶ 右半頁單據對折區
                                        </div>
                                        <table className="w-full border-collapse text-xs">
                                            <thead>
                                                <tr className="bg-slate-100 border-b-2 border-slate-900">
                                                    {config.columns.map((col, idx) => {
                                                        if (!col.visible) return null;
                                                        return (
                                                            <th
                                                                key={col.id}
                                                                style={{ width: `${col.width}%`, textAlign: col.align || 'center' }}
                                                                className="p-1.5 border-r border-slate-900 font-black relative group bg-slate-100 hover:bg-blue-50/80 transition-colors"
                                                            >
                                                                <input
                                                                    type="text"
                                                                    value={col.label}
                                                                    onMouseDown={(e) => e.stopPropagation()}
                                                                    onClick={(e) => e.stopPropagation()}
                                                                    onFocus={() => setActiveInputIndex(idx)}
                                                                    onChange={(e) => updateColumn(idx, 'label', e.target.value)}
                                                                    className="w-full bg-white/70 hover:bg-white focus:bg-white border border-slate-300 focus:border-blue-600 rounded text-center font-black focus:outline-none px-1 py-0.5"
                                                                />
                                                                <div className="text-[9px] font-mono text-slate-500 font-normal mt-0.5">
                                                                    ({col.width}%)
                                                                </div>
                                                                <div
                                                                    onMouseDown={(e) => handleMouseDownResizer(e, idx)}
                                                                    title="按住滑鼠向左右拖拉，直接改變欄位寬度 ↔"
                                                                    className="absolute top-0 bottom-0 right-0 w-2 cursor-col-resize hover:bg-blue-500/50 active:bg-blue-600 flex items-center justify-center transition-all group-hover:bg-blue-400/40"
                                                                >
                                                                    <div className="w-0.5 h-4 bg-slate-400 group-hover:bg-blue-600"></div>
                                                                </div>
                                                            </th>
                                                        );
                                                    })}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {/* 模擬 Sample Right Rows (0值空白、無$符號、應繳金空白) */}
                                                {[
                                                    { name: '齊立優格飲', stock: 37, picked: 0, returns: 0, sold: 0, price: 0, subtotal: 0 },
                                                    { name: '無糖豆漿', stock: 0, picked: 0, returns: 0, sold: 0, price: 39, subtotal: 0 }
                                                ].map((r, i) => (
                                                    <tr key={i} className="border-b border-slate-900">
                                                        {config.columns.map(c => {
                                                            if (!c.visible) return null;
                                                            const isName = c.id === 'name';
                                                            const isPicked = c.id === 'picked';
                                                            
                                                            let val = c.id === 'idx' ? i + 4 : r[c.id] ?? '';
                                                            if (c.id === 'subtotal') val = '';
                                                            else if (c.id === 'price') val = Number(r.price || 0) === 0 ? '' : Number(r.price).toLocaleString();
                                                            else if (c.id !== 'name' && c.id !== 'idx' && Number(val) === 0) val = '';

                                                            const customStyle = isName ? { fontSize: `${config.nameFontSize || config.fontSize}px`, fontWeight: 900 } : {};
                                                            return (
                                                                <td
                                                                    key={c.id}
                                                                    style={{ textAlign: c.align || 'center', ...customStyle }}
                                                                    className={`p-1.5 border-r border-slate-900 font-bold ${
                                                                        isPicked ? 'text-red-600 font-black' : (isName ? 'font-black' : '')
                                                                    }`}
                                                                >
                                                                    {val}
                                                                </td>
                                                            );
                                                        })}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}

                            </div>
                        </div>

                        {/* 4. Section Toggles Directly on Paper (紙張區塊開關視角) */}
                        <div className="space-y-4 pt-2">
                            {/* Expenses Section */}
                            <div className={`p-3 rounded border transition-all ${config.showExpenses ? 'bg-amber-50/50 border-amber-300' : 'bg-slate-100 border-dashed border-slate-300 opacity-40'}`}>
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs font-black text-amber-900 flex items-center gap-1">
                                        🏪 營業支出卡片 (攤位/清潔/電費)
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => setConfig({ ...config, showExpenses: !config.showExpenses })}
                                        className={`px-2.5 py-1 text-xs font-bold rounded-lg border flex items-center gap-1 ${
                                            config.showExpenses ? 'bg-amber-600 text-white border-amber-600' : 'bg-white text-slate-600 border-slate-300'
                                        }`}
                                    >
                                        {config.showExpenses ? <Eye size={12} /> : <EyeOff size={12} />}
                                        {config.showExpenses ? '顯示於單據' : '已隱藏'}
                                    </button>
                                </div>
                                {config.showExpenses && (
                                    <div className="grid grid-cols-4 gap-2 text-xs font-bold text-slate-800 text-center">
                                        <div className="bg-white p-1.5 rounded border border-amber-200">攤位費: $300</div>
                                        <div className="bg-white p-1.5 rounded border border-amber-200">清潔費: $100</div>
                                        <div className="bg-white p-1.5 rounded border border-amber-200">電費: $100</div>
                                        <div className="bg-white p-1.5 rounded border border-amber-200">總支出: $500</div>
                                    </div>
                                )}
                            </div>

                            {/* Cash Section */}
                            <div className={`p-3 rounded border transition-all ${config.showCash ? 'bg-blue-50/50 border-blue-300' : 'bg-slate-100 border-dashed border-slate-300 opacity-40'}`}>
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs font-black text-blue-900 flex items-center gap-1">
                                        💵 應繳現金與預留金卡片
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => setConfig({ ...config, showCash: !config.showCash })}
                                        className={`px-2.5 py-1 text-xs font-bold rounded-lg border flex items-center gap-1 ${
                                            config.showCash ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-300'
                                        }`}
                                    >
                                        {config.showCash ? <Eye size={12} /> : <EyeOff size={12} />}
                                        {config.showCash ? '顯示於單據' : '已隱藏'}
                                    </button>
                                </div>
                                {config.showCash && (
                                    <div className="flex justify-between items-center text-xs font-bold text-slate-900 bg-white p-2 rounded border border-blue-200">
                                        <span>總銷售額: $15,000</span>
                                        <span>預留金: $1,000</span>
                                        <span className="text-blue-700 font-black text-sm">應繳現金: $14,500</span>
                                    </div>
                                )}
                            </div>

                            {/* Signatures Section */}
                            <div className={`p-3 rounded border transition-all ${config.showSignatures ? 'bg-slate-50 border-slate-300' : 'bg-slate-100 border-dashed border-slate-300 opacity-40'}`}>
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs font-black text-slate-800 flex items-center gap-1">
                                        ✍️ 業務員與點貨員簽名欄
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => setConfig({ ...config, showSignatures: !config.showSignatures })}
                                        className={`px-2.5 py-1 text-xs font-bold rounded-lg border flex items-center gap-1 ${
                                            config.showSignatures ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-300'
                                        }`}
                                    >
                                        {config.showSignatures ? <Eye size={12} /> : <EyeOff size={12} />}
                                        {config.showSignatures ? '顯示於單據' : '已隱藏'}
                                    </button>
                                </div>
                                {config.showSignatures && (
                                    <div className="flex justify-between items-center text-xs font-bold text-slate-700 pt-3 border-t border-slate-300">
                                        <div>業務員簽名: ___________________</div>
                                        <div>點貨員簽名: ___________________</div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Modal Footer */}
                <div className="flex items-center justify-between px-6 py-3.5 border-t border-slate-300 bg-white">
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={handleReset}
                            className="px-3 py-2 text-slate-700 hover:text-slate-900 text-xs font-bold flex items-center gap-1 rounded-xl border border-slate-300 hover:bg-slate-50 bg-white shadow-xs"
                        >
                            <RotateCcw size={14} />
                            恢復預設值
                        </button>
                        <button
                            type="button"
                            onClick={handlePreview}
                            className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold flex items-center gap-1.5 rounded-xl transition-colors shadow-sm"
                        >
                            <Eye size={14} />
                            🖨️ 試印預覽
                        </button>
                    </div>

                    <div className="flex items-center gap-3">
                        {savedNotice && (
                            <span className="text-xs text-emerald-700 font-black flex items-center gap-1 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200">
                                <Check size={14} /> 已儲存最新樣板畫布！
                            </span>
                        )}
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-slate-700 font-bold text-sm hover:bg-slate-100 rounded-xl"
                        >
                            取消
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                handleSave();
                                onClose();
                            }}
                            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-black text-sm rounded-xl shadow-md shadow-blue-500/20 flex items-center gap-2 transition-all active:scale-95 cursor-pointer"
                        >
                            <Save size={16} />
                            儲存設計樣板
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
