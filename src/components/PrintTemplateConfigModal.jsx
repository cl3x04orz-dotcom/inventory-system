import React, { useState, useEffect } from 'react';
import { X, Check, Type, Layout, Eye, Settings, Save, RotateCcw, MoveLeft, MoveRight, EyeOff, Plus, Trash2 } from 'lucide-react';
import { safeLocalStorage } from '../utils/storage';
import { printNativeSpreadsheetHtml } from '../utils/printHelper';

export const DEFAULT_GRID_COLUMNS = [
    { id: 'idx', key: 'idx', label: '#', width: 6, align: 'center', visible: true, locked: true },
    { id: 'name', key: 'name', label: '品項名稱', width: 34, align: 'left', visible: true },
    { id: 'stock', key: 'stock', label: '原庫存', width: 12, align: 'center', visible: true },
    { id: 'picked', key: 'picked', label: '補領貨數', width: 14, align: 'center', visible: true, isHighlight: true },
    { id: 'returns', key: 'returns', label: '退貨數', width: 12, align: 'center', visible: true },
    { id: 'sold', key: 'sold', label: '實售數', width: 12, align: 'center', visible: true },
    { id: 'price', key: 'price', label: '單價', width: 10, align: 'right', visible: false },
    { id: 'subtotal', key: 'subtotal', label: '金額小計', width: 12, align: 'right', visible: false }
];

export const DEFAULT_PRINT_CONFIG = {
    title: '銷售與領貨點貨單據',
    layout: 'two_columns', // 'two_columns' | 'single_column'
    fontSize: 15, // 11 | 13 | 15 | 18
    borderStyle: 'thick', // 'thick' | 'thin'
    columns: DEFAULT_GRID_COLUMNS,
    showExpenses: true,
    showCash: true,
    showSignatures: true
};

export default function PrintTemplateConfigModal({ isOpen, onClose, onSave }) {
    const [config, setConfig] = useState(DEFAULT_PRINT_CONFIG);
    const [savedNotice, setSavedNotice] = useState(false);

    useEffect(() => {
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
    }, [isOpen]);

    if (!isOpen) return null;

    const handleSave = () => {
        safeLocalStorage.setItem('print_template_config', JSON.stringify(config));
        setSavedNotice(true);
        setTimeout(() => setSavedNotice(false), 2000);
        if (onSave) onSave(config);
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
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 rounded-lg">
                            <Settings size={22} />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">📊 線上試算表畫布設計器 (Grid Designer)</h2>
                            <p className="text-xs text-slate-500 dark:text-slate-400">自由拉寬欄位、拖曳欄位順序、直接編輯標題與字體大小</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 overflow-y-auto space-y-6">
                    {/* Top Controls: Title, Font Size, Layout */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* Title */}
                        <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-2">
                                📝 單據大標題 (點擊編輯)
                            </label>
                            <input
                                type="text"
                                value={config.title}
                                onChange={(e) => setConfig({ ...config, title: e.target.value })}
                                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg text-sm font-bold text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500"
                            />
                        </div>

                        {/* Font Size */}
                        <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-2 flex items-center gap-1">
                                <Type size={14} className="text-blue-500" />
                                🔍 字體放大層級
                            </label>
                            <select
                                value={config.fontSize}
                                onChange={(e) => setConfig({ ...config, fontSize: Number(e.target.value) })}
                                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg text-sm font-bold text-slate-900 dark:text-slate-100"
                            >
                                <option value={11}>精簡級 (11px) - 商品極多</option>
                                <option value={13}>標準級 (13px) - 標準比例</option>
                                <option value={15}>放大級 (15px) ⭐ 大字點貨 (推薦)</option>
                                <option value={18}>特大級 (18px) - 超清晰大字</option>
                            </select>
                        </div>

                        {/* Layout */}
                        <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-2 flex items-center gap-1">
                                <Layout size={14} className="text-blue-500" />
                                📐 版型結構
                            </label>
                            <select
                                value={config.layout}
                                onChange={(e) => setConfig({ ...config, layout: e.target.value })}
                                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg text-sm font-bold text-slate-900 dark:text-slate-100"
                            >
                                <option value="two_columns">A4 左右雙欄對折並排 ⭐ (單頁塞最多品項)</option>
                                <option value="single_column">A4 單欄直式傳統列表</option>
                            </select>
                        </div>
                    </div>

                    {/* Interactive Spreadsheet Canvas Grid */}
                    <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                        <div className="flex items-center justify-between mb-3">
                            <label className="text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                                📊 試算表欄位畫布 (可自由修改名稱、調整欄寬與排序)
                            </label>
                            <span className="text-xs text-blue-600 dark:text-blue-400 font-bold">
                                💡 提示：點擊欄位名稱直接修改標題，按左右按鈕可調整順序
                            </span>
                        </div>

                        {/* Grid Canvas Table */}
                        <div className="overflow-x-auto border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 shadow-inner">
                            <table className="w-full border-collapse text-xs">
                                <thead>
                                    <tr className="bg-slate-100 dark:bg-slate-700/80 border-b border-slate-300 dark:border-slate-700">
                                        <th className="p-2 border-r border-slate-300 dark:border-slate-700 text-center w-12 text-slate-500">顯示</th>
                                        <th className="p-2 border-r border-slate-300 dark:border-slate-700 text-left">標題名稱 (直接打字編輯)</th>
                                        <th className="p-2 border-r border-slate-300 dark:border-slate-700 text-center w-28">欄寬比例 (%)</th>
                                        <th className="p-2 border-r border-slate-300 dark:border-slate-700 text-center w-24">對齊方式</th>
                                        <th className="p-2 text-center w-24">順序調整</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {config.columns.map((col, idx) => (
                                        <tr
                                            key={col.id}
                                            className={`border-b border-slate-200 dark:border-slate-700/60 transition-colors ${
                                                !col.visible ? 'opacity-40 bg-slate-50 dark:bg-slate-800/40' : 'hover:bg-blue-50/50 dark:hover:bg-blue-900/10'
                                            }`}
                                        >
                                            {/* Visibility Toggle */}
                                            <td className="p-2 border-r border-slate-200 dark:border-slate-700 text-center">
                                                <input
                                                    type="checkbox"
                                                    checked={col.visible}
                                                    onChange={(e) => updateColumn(idx, 'visible', e.target.checked)}
                                                    className="rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                                                />
                                            </td>

                                            {/* Editable Label */}
                                            <td className="p-2 border-r border-slate-200 dark:border-slate-700">
                                                <input
                                                    type="text"
                                                    value={col.label}
                                                    onChange={(e) => updateColumn(idx, 'label', e.target.value)}
                                                    className="w-full px-2 py-1 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded font-bold text-slate-900 dark:text-slate-100 focus:bg-white focus:ring-1 focus:ring-blue-500"
                                                />
                                            </td>

                                            {/* Column Width Slider */}
                                            <td className="p-2 border-r border-slate-200 dark:border-slate-700 text-center">
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        type="range"
                                                        min="4"
                                                        max="50"
                                                        value={col.width}
                                                        onChange={(e) => updateColumn(idx, 'width', Number(e.target.value))}
                                                        className="w-full accent-blue-600 cursor-pointer"
                                                    />
                                                    <span className="font-mono text-xs w-8 text-right font-bold">{col.width}%</span>
                                                </div>
                                            </td>

                                            {/* Alignment */}
                                            <td className="p-2 border-r border-slate-200 dark:border-slate-700 text-center">
                                                <select
                                                    value={col.align}
                                                    onChange={(e) => updateColumn(idx, 'align', e.target.value)}
                                                    className="px-2 py-1 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded text-xs font-bold"
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
                                                        className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30"
                                                    >
                                                        <MoveLeft size={14} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        disabled={idx === config.columns.length - 1}
                                                        onClick={() => moveColumn(idx, 1)}
                                                        className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30"
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
                    <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                        <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-2">
                            區塊開關控制
                        </label>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                            <label className="flex items-center gap-2 text-slate-700 dark:text-slate-300 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={config.showExpenses}
                                    onChange={(e) => setConfig({ ...config, showExpenses: e.target.checked })}
                                    className="rounded text-blue-600 focus:ring-blue-500"
                                />
                                顯示營業支出 (攤位/清潔/電費)
                            </label>
                            <label className="flex items-center gap-2 text-slate-700 dark:text-slate-300 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={config.showCash}
                                    onChange={(e) => setConfig({ ...config, showCash: e.target.checked })}
                                    className="rounded text-blue-600 focus:ring-blue-500"
                                />
                                顯示應繳現金與預留金
                            </label>
                            <label className="flex items-center gap-2 text-slate-700 dark:text-slate-300 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={config.showSignatures}
                                    onChange={(e) => setConfig({ ...config, showSignatures: e.target.checked })}
                                    className="rounded text-blue-600 focus:ring-blue-500"
                                />
                                顯示業務員與點貨員簽名欄
                            </label>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={handleReset}
                            className="px-3 py-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 text-xs font-bold flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-800"
                        >
                            <RotateCcw size={14} />
                            恢復預設值
                        </button>
                        <button
                            type="button"
                            onClick={handlePreview}
                            className="px-4 py-2 bg-slate-700 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 rounded-lg transition-colors shadow-sm"
                        >
                            <Eye size={14} />
                            🖨️ 試印預覽
                        </button>
                    </div>

                    <div className="flex items-center gap-3">
                        {savedNotice && (
                            <span className="text-xs text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                                <Check size={14} /> 已儲存最新樣板畫布！
                            </span>
                        )}
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-slate-600 dark:text-slate-300 font-bold text-sm hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl"
                        >
                            取消
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                handleSave();
                                onClose();
                            }}
                            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-xl shadow-lg shadow-blue-500/20 flex items-center gap-2 transition-all active:scale-95"
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
