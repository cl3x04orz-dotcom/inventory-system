import React, { useState, useEffect, useRef } from 'react';
import { X, Check, Type, Layout, Eye, Settings, Save, RotateCcw, MoveLeft, MoveRight, Code, Tag, Info } from 'lucide-react';
import { safeLocalStorage } from '../utils/storage';
import { callGAS } from '../utils/api';
import { printNativeSpreadsheetHtml } from '../utils/printHelper';

export const DEFAULT_GRID_COLUMNS = [
    { id: 'idx', key: 'idx', label: '{{#}}', width: 6, align: 'center', visible: true, locked: true },
    { id: 'name', key: 'name', label: '{{product_name}}', width: 34, align: 'left', visible: true },
    { id: 'stock', key: 'stock', label: '原庫存({{stock}})', width: 12, align: 'center', visible: true },
    { id: 'picked', key: 'picked', label: '補領貨({{picked}})', width: 14, align: 'center', visible: true, isHighlight: true },
    { id: 'returns', key: 'returns', label: '退貨數({{returns}})', width: 12, align: 'center', visible: true },
    { id: 'sold', key: 'sold', label: '實售數({{sold}})', width: 12, align: 'center', visible: true },
    { id: 'price', key: 'price', label: '單價({{price}})', width: 10, align: 'right', visible: false },
    { id: 'subtotal', key: 'subtotal', label: '小計({{subtotal}})', width: 12, align: 'right', visible: false }
];

export const DEFAULT_PRINT_CONFIG = {
    title: '銷售與領貨點貨單據 (日期: {{date}} / 營業所: {{location}})',
    layout: 'two_columns', // 'two_columns' | 'single_column'
    fontSize: 15, // 11 | 13 | 15 | 18
    nameFontSize: 18, // 📦 品項名稱單獨字體大小: 13 | 16 | 18 | 20 | 22 | 24
    borderStyle: 'thick', // 'thick' | 'thin'
    columns: DEFAULT_GRID_COLUMNS,
    showExpenses: true,
    showCash: true,
    showSignatures: true
};

export const AVAILABLE_VARIABLES = [
    { tag: '{{date}}', desc: '開單日期' },
    { tag: '{{location}}', desc: '營業所/車次' },
    { tag: '{{salesRep}}', desc: '業務員' },
    { tag: '{{totalSalesAmount}}', desc: '總銷售金額' },
    { tag: '{{totalCashCalc}}', desc: '應繳現金' },
    { tag: '{{reserve}}', desc: '預留金' },
    { tag: '{{totalExpenses}}', desc: '總營業支出' },
    { tag: '{{#}}', desc: '商品編號' },
    { tag: '{{product_name}}', desc: '商品品項名稱' },
    { tag: '{{stock}}', desc: '原車庫存' },
    { tag: '{{picked}}', desc: '補領貨數' },
    { tag: '{{returns}}', desc: '退貨數' },
    { tag: '{{sold}}', desc: '實售數' },
    { tag: '{{price}}', desc: '單價' },
    { tag: '{{subtotal}}', desc: '金額小計' },
];

export default function PrintTemplateConfigModal({ isOpen, onClose, onSave, apiUrl }) {
    const [config, setConfig] = useState(DEFAULT_PRINT_CONFIG);
    const [savedNotice, setSavedNotice] = useState(false);
    const [activeInputIndex, setActiveInputIndex] = useState(null); // 'title' or column index
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

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
            {/* Pure Light Mode Container */}
            <div className="bg-white rounded-2xl shadow-2xl border border-slate-300 w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden text-slate-900">
                
                {/* Modal Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-100 text-blue-700 rounded-xl shadow-sm">
                            <Code size={22} />
                        </div>
                        <div>
                            <h2 className="text-lg font-black text-slate-900">📊 試算表動態變數範本引擎 (Spreadsheet Variable Engine)</h2>
                            <p className="text-xs font-medium text-slate-600">任意填寫儲存格與代碼（如 <code className="bg-blue-100 text-blue-800 px-1 rounded font-bold">{"{{date}}"}</code>、<code className="bg-amber-100 text-amber-800 px-1 rounded font-bold">{"{{product_name}}"}</code>），打造 100% 自訂樣版</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-slate-500 hover:text-slate-800 rounded-xl hover:bg-slate-200 transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Modal Body */}
                <div className="p-6 overflow-y-auto space-y-6 bg-white">

                    {/* 🧰 Variable Toolbar (代碼插入工具箱) */}
                    <div className="bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 p-4 rounded-xl border border-blue-200 shadow-sm">
                        <div className="flex items-center gap-2 mb-2">
                            <Tag size={16} className="text-blue-700" />
                            <span className="text-xs font-black text-blue-900">🧰 一鍵代碼插入工具箱 (點擊自動填入目前選擇的格子)</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                            {AVAILABLE_VARIABLES.map((v) => (
                                <button
                                    key={v.tag}
                                    type="button"
                                    onClick={() => insertVariable(v.tag)}
                                    title={`點擊插入 ${v.desc}`}
                                    className="px-2.5 py-1 bg-white hover:bg-blue-600 hover:text-white border border-blue-300 rounded-lg text-xs font-mono font-bold text-blue-800 shadow-sm transition-all active:scale-95 flex items-center gap-1 cursor-pointer"
                                >
                                    <span>{v.tag}</span>
                                    <span className="text-[10px] opacity-75 font-sans">({v.desc})</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Top Controls: Title, Global Font, Product Name Font, Layout */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        {/* Title */}
                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 shadow-sm">
                            <label className="text-xs font-black text-slate-800 block mb-2">
                                📝 單據大標題 (支援代碼)
                            </label>
                            <input
                                type="text"
                                value={config.title}
                                onFocus={() => setActiveInputIndex('title')}
                                onChange={(e) => setConfig({ ...config, title: e.target.value })}
                                placeholder="例如: 銷貨單据 {{date}}"
                                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                            />
                        </div>

                        {/* Global Font Size */}
                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 shadow-sm">
                            <label className="text-xs font-black text-slate-800 block mb-2 flex items-center gap-1">
                                <Type size={14} className="text-blue-600" />
                                🔍 全局基礎字體
                            </label>
                            <select
                                value={config.fontSize}
                                onChange={(e) => setConfig({ ...config, fontSize: Number(e.target.value) })}
                                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                            >
                                <option value={11}>精簡級 (11px)</option>
                                <option value={13}>標準級 (13px)</option>
                                <option value={15}>放大級 (15px) ⭐</option>
                                <option value={18}>特大級 (18px)</option>
                            </select>
                        </div>

                        {/* Independent Product Name Font Size (Presbyopia ⭐) */}
                        <div className="bg-amber-50/60 p-4 rounded-xl border border-amber-200 shadow-sm">
                            <label className="text-xs font-black text-amber-900 block mb-2 flex items-center gap-1">
                                📦 品項名稱獨立放大 (老花眼專用 ⭐)
                            </label>
                            <select
                                value={config.nameFontSize || 18}
                                onChange={(e) => setConfig({ ...config, nameFontSize: Number(e.target.value) })}
                                className="w-full px-3 py-2 bg-white border border-amber-300 rounded-lg text-sm font-black text-amber-900 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                            >
                                <option value={13}>與全局相同 (13px)</option>
                                <option value={16}>清晰大字 (16px)</option>
                                <option value={18}>特大清晰 (18px) ⭐ 推薦</option>
                                <option value={20}>超級大字 (20px) 🔥</option>
                                <option value={22}>老花眼無障礙 (22px) 👑</option>
                                <option value={24}>巨型大字 (24px) 🚀</option>
                            </select>
                        </div>

                        {/* Layout */}
                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 shadow-sm">
                            <label className="text-xs font-black text-slate-800 block mb-2 flex items-center gap-1">
                                <Layout size={14} className="text-blue-600" />
                                📐 版型結構
                            </label>
                            <select
                                value={config.layout}
                                onChange={(e) => setConfig({ ...config, layout: e.target.value })}
                                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                            >
                                <option value="two_columns">A4 左右雙欄對折並排 ⭐</option>
                                <option value="single_column">A4 單欄直式傳統列表</option>
                            </select>
                        </div>
                    </div>

                    {/* Interactive Cell-by-Cell Grid Canvas */}
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 shadow-sm space-y-4">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                            <label className="text-sm font-black text-slate-900 flex items-center gap-2">
                                📊 試算表儲存格矩陣 (一格一格編輯)
                            </label>
                            {/* Smart Auto Balance & Quick Layout Presets */}
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="text-xs font-bold text-slate-600">💡 智慧一鍵對齊:</span>
                                <button
                                    type="button"
                                    onClick={() => handleAutoBalanceWidths('standard')}
                                    className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-sm transition-all flex items-center gap-1 active:scale-95 cursor-pointer"
                                >
                                    ✨ 黃金比例補滿 100%
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleAutoBalanceWidths('presbyopia')}
                                    className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold shadow-sm transition-all flex items-center gap-1 active:scale-95 cursor-pointer"
                                >
                                    👓 老花眼大品項 (50%)
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleAutoBalanceWidths('even')}
                                    className="px-2.5 py-1 bg-slate-700 hover:bg-slate-800 text-white rounded-lg text-xs font-bold shadow-sm transition-all flex items-center gap-1 active:scale-95 cursor-pointer"
                                >
                                    ⚖️ 平均對分欄寬
                                </button>
                            </div>
                        </div>

                        {/* Live Visual Width Bar (即時實體比例展示列) */}
                        <div className="border border-slate-300 rounded-lg overflow-hidden bg-slate-200 flex text-center font-bold text-[11px] text-slate-700 h-8 shadow-inner">
                            {config.columns.filter(c => c.visible).map((c) => (
                                <div
                                    key={c.id}
                                    style={{ width: `${c.width}%` }}
                                    className="border-r border-slate-300 bg-white flex items-center justify-center truncate px-1"
                                    title={`${c.label} (${c.width}%)`}
                                >
                                    <span className="truncate">{c.label.replace(/\{\{.*?\}\}/g, '') || c.label}</span>
                                    <span className="text-[9px] text-blue-600 ml-0.5 font-mono">({c.width}%)</span>
                                </div>
                            ))}
                        </div>

                        {/* Grid Canvas Table */}
                        <div className="overflow-x-auto border border-slate-300 rounded-xl bg-white shadow-sm">
                            <table className="w-full border-collapse text-xs text-slate-900">
                                <thead>
                                    <tr className="bg-slate-100 border-b border-slate-300 text-slate-800 font-black">
                                        <th className="p-2.5 border-r border-slate-300 text-center w-12">顯示</th>
                                        <th className="p-2.5 border-r border-slate-300 text-left">儲存格標題 / 代碼 (一格一格自由填入)</th>
                                        <th className="p-2.5 border-r border-slate-300 text-center w-32">欄寬比例 (%)</th>
                                        <th className="p-2.5 border-r border-slate-300 text-center w-24">對齊方式</th>
                                        <th className="p-2.5 text-center w-24">順序調整</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {config.columns.map((col, idx) => (
                                        <tr
                                            key={col.id}
                                            className={`border-b border-slate-200 transition-colors ${
                                                !col.visible ? 'opacity-40 bg-slate-100' : 'hover:bg-blue-50/60'
                                            }`}
                                        >
                                            {/* Visibility Toggle */}
                                            <td className="p-2 border-r border-slate-200 text-center">
                                                <input
                                                    type="checkbox"
                                                    checked={col.visible}
                                                    onChange={(e) => updateColumn(idx, 'visible', e.target.checked)}
                                                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer accent-blue-600"
                                                />
                                            </td>

                                            {/* Editable Label Cell with Variable Code Support & Data Source Indicator */}
                                            <td className="p-2 border-r border-slate-200">
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        type="text"
                                                        value={col.label}
                                                        onFocus={() => setActiveInputIndex(idx)}
                                                        onChange={(e) => updateColumn(idx, 'label', e.target.value)}
                                                        placeholder="例如: 領貨({{picked}})"
                                                        className="flex-1 px-2.5 py-1.5 bg-white border border-slate-300 rounded font-mono font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                                    />
                                                    <span className="text-[10px] font-bold px-2 py-1 rounded bg-slate-100 text-slate-600 border border-slate-200 whitespace-nowrap shrink-0">
                                                        對應數據: {
                                                            col.id === 'idx' ? '🔢 序號' :
                                                            col.id === 'name' ? '📦 商品名稱' :
                                                            col.id === 'stock' ? '🏢 原車庫存' :
                                                            col.id === 'picked' ? '🚚 補領貨數' :
                                                            col.id === 'returns' ? '↩️ 退貨數' :
                                                            col.id === 'sold' ? '💰 實售數' :
                                                            col.id === 'price' ? '💵 單價' : '📊 小計'
                                                        }
                                                    </span>
                                                </div>
                                            </td>

                                            {/* Column Width Slider */}
                                            <td className="p-2 border-r border-slate-200 text-center">
                                                <div className="flex items-center gap-2 px-1">
                                                    <input
                                                        type="range"
                                                        min="4"
                                                        max="50"
                                                        value={col.width}
                                                        onChange={(e) => updateColumn(idx, 'width', Number(e.target.value))}
                                                        className="w-full accent-blue-600 cursor-pointer"
                                                    />
                                                    <span className="font-mono text-xs w-8 text-right font-black text-slate-800">{col.width}%</span>
                                                </div>
                                            </td>

                                            {/* Alignment */}
                                            <td className="p-2 border-r border-slate-200 text-center">
                                                <select
                                                    value={col.align}
                                                    onChange={(e) => updateColumn(idx, 'align', e.target.value)}
                                                    className="px-2 py-1 bg-white border border-slate-300 rounded text-xs font-bold text-slate-900 focus:ring-1 focus:ring-blue-500"
                                                >
                                                    <option value="left">靠左</option>
                                                    <option value="center">置中</option>
                                                    <option value="right">靠右</option>
                                                </select>
                                            </td>

                                            {/* Reorder Buttons */}
                                            <td className="p-2 text-center">
                                                <div className="flex items-center justify-center gap-1">
                                                    <button
                                                        type="button"
                                                        disabled={idx === 0}
                                                        onClick={() => moveColumn(idx, -1)}
                                                        className="p-1 rounded text-slate-700 hover:bg-slate-200 disabled:opacity-30 border border-slate-200"
                                                    >
                                                        <MoveLeft size={14} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        disabled={idx === config.columns.length - 1}
                                                        onClick={() => moveColumn(idx, 1)}
                                                        className="p-1 rounded text-slate-700 hover:bg-slate-200 disabled:opacity-30 border border-slate-200"
                                                    >
                                                        <MoveRight size={14} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Section Controls */}
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 shadow-sm">
                        <label className="text-xs font-black text-slate-800 block mb-2">
                            區塊開關控制
                        </label>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                            <label className="flex items-center gap-2 font-bold text-slate-800 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={config.showExpenses}
                                    onChange={(e) => setConfig({ ...config, showExpenses: e.target.checked })}
                                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 accent-blue-600"
                                />
                                顯示營業支出 (攤位/清潔/電費)
                            </label>
                            <label className="flex items-center gap-2 font-bold text-slate-800 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={config.showCash}
                                    onChange={(e) => setConfig({ ...config, showCash: e.target.checked })}
                                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 accent-blue-600"
                                />
                                顯示應繳現金與預留金
                            </label>
                            <label className="flex items-center gap-2 font-bold text-slate-800 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={config.showSignatures}
                                    onChange={(e) => setConfig({ ...config, showSignatures: e.target.checked })}
                                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 accent-blue-600"
                                />
                                顯示業務員與點貨員簽名欄
                            </label>
                        </div>
                    </div>
                </div>

                {/* Modal Footer */}
                <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 bg-slate-50">
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={handleReset}
                            className="px-3 py-2 text-slate-700 hover:text-slate-900 text-xs font-bold flex items-center gap-1 rounded-xl border border-slate-300 hover:bg-white bg-slate-100 shadow-sm"
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
                            className="px-4 py-2 text-slate-700 font-bold text-sm hover:bg-slate-200 rounded-xl"
                        >
                            取消
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                handleSave();
                                onClose();
                            }}
                            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-black text-sm rounded-xl shadow-md shadow-blue-500/20 flex items-center gap-2 transition-all active:scale-95"
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
