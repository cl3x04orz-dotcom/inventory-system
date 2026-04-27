import React, { useState, useEffect } from 'react';
import { Wallet, Search, RefreshCw, ChevronDown, ChevronUp, CheckSquare } from 'lucide-react';
import { callGAS } from '../utils/api';
import { getLocalDateString, getFirstDayOfMonthString } from '../utils/constants';

export default function PayablePage({ user, apiUrl }) {
    const [records, setRecords] = useState([]);
    const [loading, setLoading] = useState(false);

    // Search Filters
    const [startDate, setStartDate] = useState(getFirstDayOfMonthString());
    const [endDate, setEndDate] = useState(getLocalDateString());
    const [vendorSearch, setVendorSearch] = useState('');
    const [operatorSearch, setOperatorSearch] = useState('');

    const [expandedRows, setExpandedRows] = useState(new Set());
    // 批次選取：以項目的 UUID 為準
    const [selectedItemUuids, setSelectedItemUuids] = useState(new Set());

    const fetchData = React.useCallback(async () => {
        setLoading(true);
        setSelectedItemUuids(new Set()); // 清空選取
        try {
            const payload = {};
            if (startDate) payload.startDate = startDate;
            if (endDate) payload.endDate = endDate;

            const data = await callGAS(apiUrl, 'getPayables', payload, user.token);
            if (Array.isArray(data)) {
                const sorted = data.sort((a, b) => new Date(b.date) - new Date(a.date));
                setRecords(sorted);
            }
        } catch (error) {
            console.error('Failed to fetch payables:', error);
        } finally {
            setLoading(false);
        }
    }, [apiUrl, user.token, startDate, endDate]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // 批次付款：收集所有選取的項目 UUID 一起送後端
    const handleBatchMarkAsPaid = async () => {
        if (selectedItemUuids.size === 0) return;
        if (!confirm(`確定要將選取的 ${selectedItemUuids.size} 項細項標記為已付款嗎？`)) return;

        const allUuids = Array.from(selectedItemUuids);

        setLoading(true);
        try {
            await callGAS(apiUrl, 'markPayableAsPaid', { targetUuids: allUuids }, user.token);
            alert(`成功標記 ${selectedItemUuids.size} 項帳款為已付款！`);
            setSelectedItemUuids(new Set());
            fetchData();
        } catch (error) {
            console.error('Failed to mark as paid:', error);
            alert('更新失敗: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    // 單筆付款（原本組別付款）
    const handleMarkAsPaid = async (r) => {
        if (!confirm('確定要將此「整組」帳款標記為已付款嗎？')) return;
        setLoading(true);
        try {
            const uuids = Array.isArray(r.uuids) ? r.uuids : [];
            await callGAS(apiUrl, 'markPayableAsPaid', { targetUuids: uuids }, user.token);
            alert('更新成功！');
            fetchData();
        } catch (error) {
            console.error('Failed to mark as paid:', error);
            alert('更新失敗: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    // [New] 特對單一細項付款
    const handleSingleItemPaid = async (item) => {
        if (!item.uuid) return alert('找不到該項目的唯一標記');
        if (!confirm(`確定要單獨將 [${item.productName}] 標記為已付款嗎？`)) return;
        setLoading(true);
        try {
            await callGAS(apiUrl, 'markPayableAsPaid', { targetUuids: [item.uuid] }, user.token);
            alert('細項更新成功！');
            fetchData();
        } catch (error) {
            console.error('Failed to mark item as paid:', error);
            alert('更新失敗: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const toggleRow = (index) => {
        const next = new Set(expandedRows);
        next.has(index) ? next.delete(index) : next.add(index);
        setExpandedRows(next);
    };

    // 整組勾選邏輯：點擊組別勾選框，切換該組內所有細項
    const toggleGroupSelect = (e, r) => {
        e.stopPropagation();
        const itemUuids = (r.items || []).map(item => item.uuid).filter(Boolean);
        const next = new Set(selectedItemUuids);

        // 檢查是否該組內所有項目都已選中
        const allInGroupSelected = itemUuids.every(uuid => next.has(uuid));

        if (allInGroupSelected) {
            itemUuids.forEach(uuid => next.delete(uuid));
        } else {
            itemUuids.forEach(uuid => next.add(uuid));
        }
        setSelectedItemUuids(next);
    };

    // 單一細項勾選邏輯
    const toggleItemSelect = (e, uuid) => {
        e.stopPropagation();
        const next = new Set(selectedItemUuids);
        next.has(uuid) ? next.delete(uuid) : next.add(uuid);
        setSelectedItemUuids(next);
    };

    const getOperatorName = (r) => {
        return r.operator || r.Operator || r.buyer || r.salesRep || r.salesPerson || '-';
    };

    const filtered = records.filter(r => {
        const vendor = String(r.vendorName || r.vendor || '').toLowerCase();
        const op = String(getOperatorName(r)).toLowerCase();
        const matchVendor = !vendorSearch || vendor.includes(vendorSearch.toLowerCase());
        const matchOp = !operatorSearch || op.includes(operatorSearch.toLowerCase());
        return matchVendor && matchOp;
    });

    const unpaidFiltered = filtered.filter(r => r.status !== 'PAID');
    const allUnpaidUuids = unpaidFiltered.flatMap(r => (r.items || []).map(item => item.uuid).filter(Boolean));
    const allSelected = allUnpaidUuids.length > 0 && allUnpaidUuids.every(uuid => selectedItemUuids.has(uuid));

    const toggleSelectAll = (e) => {
        e.stopPropagation();
        if (allSelected) {
            setSelectedItemUuids(new Set());
        } else {
            setSelectedItemUuids(new Set(allUnpaidUuids));
        }
    };

    // 判斷組別是否為「部分選中」或「全部選中」狀態
    const getGroupSelectionState = (r) => {
        const itemUuids = (r.items || []).map(item => item.uuid).filter(Boolean);
        if (itemUuids.length === 0) return 'none';
        const selectedCount = itemUuids.filter(uuid => selectedItemUuids.has(uuid)).length;
        if (selectedCount === 0) return 'none';
        if (selectedCount === itemUuids.length) return 'all';
        return 'partial';
    };

    const totalAmount = filtered.reduce((sum, r) => sum + (Number(r.amount) || Number(r.total) || 0), 0);

    // [New] 計算目前選取項目的總金額
    const selectedAmount = filtered.reduce((sum, r) => {
        const items = r.items || r.products || [];
        const itemSum = items.reduce((iSum, item) => {
            if (selectedItemUuids.has(item.uuid)) {
                return iSum + (Number(item.price) || Number(item.unitPrice) || 0) * (Number(item.qty) || Number(item.quantity) || 1);
            }
            return iSum;
        }, 0);
        return sum + itemSum;
    }, 0);

    return (
        <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">
            {/* Header */}
            <div className="flex flex-row justify-between items-center gap-4">
                <div className="flex-1 min-w-0">
                    <h1 className="text-xl md:text-2xl font-bold text-[var(--text-primary)] flex items-center gap-2 truncate">
                        <Wallet className="text-rose-600 w-6 h-6 shrink-0" />
                        <span className="truncate">應付帳款</span>
                    </h1>
                </div>
                <div className="flex items-center gap-3">
                    {selectedItemUuids.size > 0 && (
                        <button
                            onClick={handleBatchMarkAsPaid}
                            disabled={loading}
                            className="btn-primary flex items-center gap-2 text-sm px-4 py-2"
                        >
                            <CheckSquare size={16} />
                            批次確認付款 ({selectedItemUuids.size})
                        </button>
                    )}
                    {selectedAmount > 0 && (
                        <div className="glass-panel px-3 py-2 border-rose-500/30 bg-rose-50/50 dark:bg-rose-500/10 shrink-0 flex flex-col items-end animate-in fade-in zoom-in-95 duration-200">
                            <p className="text-[10px] text-rose-600 dark:text-rose-400 font-bold uppercase tracking-wider">已選取金額</p>
                            <p className="text-lg md:text-xl font-black text-rose-600 dark:text-rose-400">
                                ${selectedAmount.toLocaleString()}
                            </p>
                        </div>
                    )}
                    <div className="glass-panel px-3 py-2 border-[var(--border-primary)] bg-[var(--bg-secondary)] shrink-0 flex flex-col items-end">
                        <p className="text-[10px] text-[var(--text-secondary)] font-bold uppercase tracking-wider">總應付金額</p>
                        <p className="text-lg md:text-xl font-bold text-rose-500">${totalAmount.toLocaleString()}</p>
                    </div>
                </div>
            </div>

            {/* Filters */}
            <div className="mb-6 p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-primary)]">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                    <div className="space-y-1">
                        <label className="text-[10px] text-[var(--text-secondary)] font-bold uppercase px-1">開始日期</label>
                        <input
                            type="date"
                            className="input-field w-full h-10 appearance-none bg-[var(--bg-primary)]"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] text-[var(--text-secondary)] font-bold uppercase px-1">結束日期</label>
                        <input
                            type="date"
                            className="input-field w-full h-10 appearance-none bg-[var(--bg-primary)]"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] text-[var(--text-secondary)] font-bold uppercase px-1">廠商名稱</label>
                        <input
                            type="text"
                            placeholder="輸入廠商..."
                            className="input-field w-full h-10"
                            value={vendorSearch}
                            onChange={(e) => setVendorSearch(e.target.value)}
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] text-[var(--text-secondary)] font-bold uppercase px-1">採購人員</label>
                        <input
                            type="text"
                            placeholder="輸入姓名..."
                            className="input-field w-full h-10"
                            value={operatorSearch}
                            onChange={(e) => setOperatorSearch(e.target.value)}
                        />
                    </div>
                </div>
            </div>

            {/* Desktop Table */}
            <div className="hidden md:block rounded-xl border border-[var(--border-primary)] overflow-hidden">
                <table className="w-full text-left text-sm">
                    <thead className="bg-[var(--bg-secondary)] text-[var(--text-secondary)] text-xs uppercase sticky top-0">
                        <tr>
                            <th className="p-4 w-10">
                                <input
                                    type="checkbox"
                                    className="w-4 h-4 rounded cursor-pointer accent-rose-500"
                                    checked={allSelected}
                                    onChange={toggleSelectAll}
                                    title="全選未付款"
                                />
                            </th>
                            <th className="p-4 w-8"></th>
                            <th className="p-4 text-center">產生日期</th>
                            <th className="p-4">廠商名稱</th>
                            <th className="p-4 text-right">金額</th>
                            <th className="p-4 text-center">狀態</th>
                            <th className="p-4 text-center">操作</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-primary)] bg-[var(--bg-primary)]">
                        {loading ? (
                            <tr><td colSpan="7" className="p-10 text-center text-[var(--text-secondary)]">載入中...</td></tr>
                        ) : filtered.length > 0 ? (
                            filtered.map((r, i) => (
                                <React.Fragment key={i}>
                                    <tr
                                        className={`hover:bg-[var(--bg-secondary)] transition-colors cursor-pointer ${getGroupSelectionState(r) !== 'none' ? 'bg-rose-50/30' : ''}`}
                                        onClick={() => toggleRow(i)}
                                    >
                                        <td className="p-4" onClick={(e) => e.stopPropagation()}>
                                            {r.status !== 'PAID' && (
                                                <div className="relative flex items-center justify-center">
                                                    <input
                                                        type="checkbox"
                                                        className={`w-4 h-4 rounded cursor-pointer accent-rose-500 ${getGroupSelectionState(r) === 'partial' ? 'opacity-50' : ''}`}
                                                        checked={getGroupSelectionState(r) === 'all'}
                                                        onChange={(e) => toggleGroupSelect(e, r)}
                                                    />
                                                    {getGroupSelectionState(r) === 'partial' && (
                                                        <div className="absolute w-2 h-0.5 bg-white pointer-events-none"></div>
                                                    )}
                                                </div>
                                            )}
                                        </td>
                                        <td className="p-4 text-[var(--text-tertiary)]">
                                            {expandedRows.has(i) ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                        </td>
                                        <td className="p-4 text-[var(--text-secondary)] text-center">
                                            {(() => {
                                                const dateVal = r.serverTimestamp || r.timestamp || r.date;
                                                const d = new Date(dateVal);
                                                return isNaN(d.getTime()) ? '-' : d.toLocaleDateString('zh-TW');
                                            })()}
                                        </td>
                                        <td className="p-4 font-medium text-[var(--text-primary)]">{r.vendorName || r.vendor || '-'}</td>
                                        <td className="p-4 text-right font-mono font-bold text-rose-500">
                                            ${(Number(r.amount) || Number(r.total) || 0).toLocaleString()}
                                        </td>
                                        <td className="p-4 text-center">
                                            <span className={`px-2 py-1 rounded-full text-xs font-bold ${r.status === 'PAID' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-rose-50 text-rose-600 border border-rose-100'}`}>
                                                {r.status === 'PAID' ? '已付款' : '未付款'}
                                            </span>
                                        </td>
                                        <td className="p-4 text-center" onClick={(e) => e.stopPropagation()}>
                                            {r.status !== 'PAID' && (
                                                <button
                                                    onClick={() => handleMarkAsPaid(r)}
                                                    className="btn-primary text-xs py-1 px-3"
                                                >
                                                    確認付款
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                    {expandedRows.has(i) && (
                                        <tr className="bg-[var(--bg-secondary)]/50">
                                            <td colSpan="7" className="p-4 pl-16">
                                                <div className="bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-lg overflow-hidden">
                                                    <table className="w-full text-sm">
                                                        <thead>
                                                            <tr className="bg-[var(--bg-secondary)] text-[var(--text-secondary)] border-b border-[var(--border-primary)]">
                                                                <th className="py-2 px-4 w-10"></th>
                                                                <th className="py-2 px-4 text-left font-medium">業務員</th>
                                                                <th className="py-2 px-4 text-left font-medium">產品</th>
                                                                <th className="py-2 px-4 text-right font-medium">單價</th>
                                                                <th className="py-2 px-4 text-center font-medium">數量</th>
                                                                <th className="py-2 px-4 text-center font-medium w-24">操作</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-[var(--border-primary)]">
                                                            {(r.items || r.products || []).length > 0 ? (
                                                                (r.items || r.products || []).map((item, idx) => (
                                                                    <tr key={idx} className={`hover:bg-[var(--bg-secondary)] ${selectedItemUuids.has(item.uuid) ? 'bg-rose-50/50' : ''}`}>
                                                                        <td className="py-3 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                                                                            <input
                                                                                type="checkbox"
                                                                                className="w-3.5 h-3.5 rounded cursor-pointer accent-rose-500"
                                                                                checked={selectedItemUuids.has(item.uuid)}
                                                                                onChange={(e) => toggleItemSelect(e, item.uuid)}
                                                                            />
                                                                        </td>
                                                                        <td className="py-3 px-4 text-[var(--text-secondary)]">{getOperatorName(r)}</td>
                                                                        <td className="py-3 px-4 text-[var(--text-primary)] font-medium">{item.productName || item.name || '-'}</td>
                                                                        <td className="py-3 px-4 text-right text-[var(--text-secondary)] font-mono">${(Number(item.price) || Number(item.unitPrice) || 0).toLocaleString()}</td>
                                                                        <td className="py-3 px-4 text-center text-[var(--text-secondary)] font-mono">{item.qty || item.quantity || 1}</td>
                                                                        <td className="py-3 px-4 text-center">
                                                                            <button
                                                                                onClick={() => handleSingleItemPaid(item)}
                                                                                className="px-2 py-1 text-[10px] bg-rose-50 text-rose-600 border border-rose-200 rounded hover:bg-rose-100 transition-colors"
                                                                            >
                                                                                確認付款
                                                                            </button>
                                                                        </td>
                                                                    </tr>
                                                                ))
                                                            ) : (
                                                                <tr><td colSpan="4" className="py-4 text-center text-[var(--text-secondary)] italic">無產品明細</td></tr>
                                                            )}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            ))
                        ) : (
                            <tr><td colSpan="7" className="p-10 text-center text-[var(--text-secondary)]">無應付帳款</td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Mobile Card View */}
            <div className="md:hidden space-y-4">
                {/* 批次按鈕（手機版） */}
                {selectedItemUuids.size > 0 && (
                    <button
                        onClick={handleBatchMarkAsPaid}
                        disabled={loading}
                        className="btn-primary w-full flex items-center justify-center gap-2 py-2.5"
                    >
                        <CheckSquare size={16} />
                        批次確認付款 ({selectedItemUuids.size})
                    </button>
                )}
                {loading ? (
                    <div className="p-10 text-center text-[var(--text-secondary)]">載入中...</div>
                ) : filtered.length > 0 ? (
                    filtered.map((r, i) => (
                        <div
                            key={i}
                            className={`bg-[var(--bg-primary)] rounded-xl border p-4 shadow-sm transition-colors ${getGroupSelectionState(r) !== 'none' ? 'border-rose-400' : 'border-[var(--border-primary)]'}`}
                            onClick={() => toggleRow(i)}
                        >
                            <div className="flex justify-between items-start mb-3">
                                <div className="flex items-start gap-3">
                                    {r.status !== 'PAID' && (
                                        <div className="relative shrink-0 pt-0.5">
                                            <input
                                                type="checkbox"
                                                className={`w-4 h-4 rounded cursor-pointer accent-rose-500 ${getGroupSelectionState(r) === 'partial' ? 'opacity-50' : ''}`}
                                                checked={getGroupSelectionState(r) === 'all'}
                                                onChange={(e) => toggleGroupSelect(e, r)}
                                            />
                                            {getGroupSelectionState(r) === 'partial' && (
                                                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                                    <div className="w-2 h-0.5 bg-white"></div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                    <div>
                                        <div className="text-xs text-[var(--text-tertiary)] mb-1">
                                            {(() => {
                                                const dateVal = r.serverTimestamp || r.timestamp || r.date;
                                                const d = new Date(dateVal);
                                                return isNaN(d.getTime()) ? '-' : d.toLocaleDateString('zh-TW');
                                            })()}
                                        </div>
                                        <div className="font-bold text-[var(--text-primary)] text-lg">{r.vendorName || r.vendor || '未命名廠商'}</div>
                                        <div className="text-xs text-[var(--text-secondary)] mt-1">採購: {getOperatorName(r)}</div>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="text-xl font-black font-mono text-rose-500">
                                        ${(Number(r.amount) || Number(r.total) || 0).toLocaleString()}
                                    </div>
                                    <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${r.status === 'PAID' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-rose-50 text-rose-600 border border-rose-100'}`}>
                                        {r.status === 'PAID' ? '已付款' : '未付款'}
                                    </span>
                                </div>
                            </div>

                            {/* Action Button & Expand Details */}
                            <div className="pt-3 border-t border-[var(--border-primary)] flex items-center justify-between">
                                <button className="text-[var(--text-tertiary)] flex items-center gap-1 text-xs">
                                    {expandedRows.has(i) ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                    明細
                                </button>
                                {r.status !== 'PAID' && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleMarkAsPaid(r);
                                        }}
                                        className="btn-primary text-xs py-1.5 px-4"
                                    >
                                        確認付款
                                    </button>
                                )}
                            </div>

                            {/* Mobile Expanded Details */}
                            {expandedRows.has(i) && (
                                <div className="mt-3 bg-[var(--bg-secondary)] rounded-lg p-3 text-sm space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
                                    {(r.items || r.products || []).map((item, idx) => (
                                        <div
                                            key={idx}
                                            className={`flex items-center gap-3 border-b border-[var(--border-primary)] last:border-0 pb-2 last:pb-0 ${selectedItemUuids.has(item.uuid) ? 'text-rose-600' : ''}`}
                                            onClick={(e) => toggleItemSelect(e, item.uuid)}
                                        >
                                            <input
                                                type="checkbox"
                                                className="w-3.5 h-3.5 rounded cursor-pointer accent-rose-500 shrink-0"
                                                checked={selectedItemUuids.has(item.uuid)}
                                                onChange={(e) => toggleItemSelect(e, item.uuid)}
                                            />
                                            <div className="flex-1">
                                                <div className="text-[var(--text-primary)] font-medium">{item.productName || item.name}</div>
                                                <div className="text-[var(--text-tertiary)] text-[10px] font-mono">${(Number(item.price) || 0).toLocaleString()} x {item.qty || 1}</div>
                                            </div>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleSingleItemPaid(item);
                                                }}
                                                className="px-2 py-1 text-[10px] bg-rose-50 text-rose-600 border border-rose-200 rounded"
                                            >
                                                確認細項
                                            </button>
                                        </div>
                                    ))}
                                    {(!r.items && !r.products) && <div className="text-[var(--text-tertiary)] text-center py-2 italic">無產品明細</div>}
                                </div>
                            )}
                        </div>
                    ))
                ) : (
                    <div className="p-10 text-center text-[var(--text-secondary)]">無應付帳款</div>
                )}
            </div>
        </div>
    );
}
