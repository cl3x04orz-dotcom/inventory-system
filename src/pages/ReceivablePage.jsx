import React, { useState, useEffect } from 'react';
import { Wallet, RefreshCw, ChevronDown, ChevronUp, CheckSquare, Banknote, CreditCard, X } from 'lucide-react';
import { callGAS } from '../utils/api';
import { getLocalDateString } from '../utils/constants';

export default function ReceivablePage({ user, apiUrl }) {
    const [records, setRecords] = useState([]);
    const [loading, setLoading] = useState(false);

    const [startDate, setStartDate] = useState(getLocalDateString());
    const [endDate, setEndDate] = useState(getLocalDateString());
    const [clientSearch, setClientSearch] = useState('');
    const [operatorSearch, setOperatorSearch] = useState('');

    const [expandedRows, setExpandedRows] = useState(new Set());
    const [selectedGroups, setSelectedGroups] = useState(new Set());

    // Modal state
    const [showModal, setShowModal] = useState(false);
    const [modalData, setModalData] = useState({ type: null, record: null }); // type: 'single' | 'batch'

    const fetchData = React.useCallback(async () => {
        setLoading(true);
        setSelectedGroups(new Set());
        try {
            const payload = {};
            if (startDate) payload.startDate = startDate;
            if (endDate) payload.endDate = endDate;

            const data = await callGAS(apiUrl, 'getReceivables', payload, user.token);
            if (Array.isArray(data)) {
                setRecords(data.sort((a, b) => new Date(b.date) - new Date(a.date)));
            }
        } catch (error) {
            console.error('Failed to fetch data:', error);
            alert('獲取資料失敗: ' + error.message);
        } finally {
            setLoading(false);
        }
    }, [apiUrl, user.token, startDate, endDate]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const handleConfirmPayment = async (paymentMethod) => {
        const { type, record } = modalData;
        const allUuids = [];

        if (type === 'batch') {
            filtered.forEach((r, i) => {
                if (selectedGroups.has(i) && Array.isArray(r.uuids)) {
                    allUuids.push(...r.uuids);
                }
            });
        } else if (type === 'single' && record) {
            allUuids.push(...(Array.isArray(record.uuids) ? record.uuids : []));
        }

        if (allUuids.length === 0) {
            alert('無有效收款 ID');
            setShowModal(false);
            return;
        }

        setLoading(true);
        setShowModal(false);
        try {
            await callGAS(apiUrl, 'markAsPaid', {
                targetUuids: allUuids,
                paymentMethod: paymentMethod // CASH or TRANSFER
            }, user.token);

            alert(`成功標記為已收款 (${paymentMethod === 'CASH' ? '現金' : '匯款'})！`);
            fetchData();
        } catch (error) {
            console.error('Failed to mark as paid:', error);
            alert('更新失敗: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleBatchMarkAsPaid = () => {
        if (selectedGroups.size === 0) return;
        setModalData({ type: 'batch', record: null });
        setShowModal(true);
    };

    const handleMarkAsPaid = (r) => {
        setModalData({ type: 'single', record: r });
        setShowModal(true);
    };

    const toggleRow = (index) => {
        const next = new Set(expandedRows);
        next.has(index) ? next.delete(index) : next.add(index);
        setExpandedRows(next);
    };

    const toggleSelect = (e, index) => {
        e.stopPropagation();
        const next = new Set(selectedGroups);
        next.has(index) ? next.delete(index) : next.add(index);
        setSelectedGroups(next);
    };

    const getOperatorName = (r) => {
        const fields = [r.salesRep, r.salesPerson, r.operator, r.Operator, r.buyer];
        const validName = fields.find(f => f && String(f).toLowerCase() !== 'unknown');
        return validName || '-';
    };

    const filtered = records.filter(r => {
        const client = String(r.clientName || r.customer || r.location || '').toLowerCase();
        const rep = String(getOperatorName(r)).toLowerCase();
        return (!clientSearch || client.includes(clientSearch.toLowerCase()))
            && (!operatorSearch || rep.includes(operatorSearch.toLowerCase()));
    });

    const unpaidFiltered = filtered.filter(r => r.status !== 'PAID');
    const allSelected = unpaidFiltered.length > 0 && unpaidFiltered.every(r => {
        const fi = filtered.indexOf(r);
        return selectedGroups.has(fi);
    });

    const toggleSelectAll = (e) => {
        e.stopPropagation();
        if (allSelected) {
            setSelectedGroups(new Set());
        } else {
            const next = new Set();
            filtered.forEach((r, i) => { if (r.status !== 'PAID') next.add(i); });
            setSelectedGroups(next);
        }
    };

    const totalAmount = filtered.reduce((sum, r) => sum + (Number(r.amount) || Number(r.total) || 0), 0);

    return (
        <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">
            {/* Header */}
            <div className="flex flex-row justify-between items-center gap-4">
                <div className="flex-1 min-w-0">
                    <h1 className="text-xl md:text-2xl font-bold text-[var(--text-primary)] flex items-center gap-2 truncate">
                        <Wallet className="text-emerald-500 w-6 h-6 shrink-0" />
                        <span className="truncate">應收帳款</span>
                    </h1>
                </div>
                <div className="flex items-center gap-3">
                    {selectedGroups.size > 0 && (
                        <button
                            onClick={handleBatchMarkAsPaid}
                            disabled={loading}
                            className="btn-primary flex items-center gap-2 text-sm px-4 py-2"
                        >
                            <CheckSquare size={16} />
                            批次確認收款 ({selectedGroups.size})
                        </button>
                    )}
                    <div className="glass-panel px-3 py-2 border-[var(--border-primary)] bg-[var(--bg-secondary)] shrink-0 flex flex-col items-end">
                        <p className="text-[10px] text-[var(--text-secondary)] font-bold uppercase tracking-wider">總應收金額</p>
                        <p className="text-lg md:text-xl font-bold text-emerald-500">${totalAmount.toLocaleString()}</p>
                    </div>
                </div>
            </div>

            {/* Filters */}
            <div className="mb-6 p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-primary)]">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="space-y-1">
                        <label className="text-[10px] text-[var(--text-secondary)] font-bold uppercase px-1">開始日期</label>
                        <input type="date" className="input-field w-full h-10 appearance-none bg-[var(--bg-primary)]" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] text-[var(--text-secondary)] font-bold uppercase px-1">結束日期</label>
                        <input type="date" className="input-field w-full h-10 appearance-none bg-[var(--bg-primary)]" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] text-[var(--text-secondary)] font-bold uppercase px-1">銷售對象/客戶</label>
                        <input type="text" placeholder="輸入客戶..." className="input-field w-full h-10" value={clientSearch} onChange={(e) => setClientSearch(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] text-[var(--text-secondary)] font-bold uppercase px-1">業務員</label>
                        <input type="text" placeholder="輸入姓名..." className="input-field w-full h-10" value={operatorSearch} onChange={(e) => setOperatorSearch(e.target.value)} />
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
                                    className="w-4 h-4 rounded cursor-pointer accent-emerald-500"
                                    checked={allSelected}
                                    onChange={toggleSelectAll}
                                    title="全選未收款"
                                />
                            </th>
                            <th className="p-4 w-8"></th>
                            <th className="p-4">產生日期</th>
                            <th className="p-4">銷售對象</th>
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
                                        className={`hover:bg-[var(--bg-secondary)] transition-colors cursor-pointer ${selectedGroups.has(i) ? 'bg-emerald-50/20' : ''}`}
                                        onClick={() => toggleRow(i)}
                                    >
                                        <td className="p-4" onClick={(e) => e.stopPropagation()}>
                                            {r.status !== 'PAID' && (
                                                <input
                                                    type="checkbox"
                                                    className="w-4 h-4 rounded cursor-pointer accent-emerald-500"
                                                    checked={selectedGroups.has(i)}
                                                    onChange={(e) => toggleSelect(e, i)}
                                                />
                                            )}
                                        </td>
                                        <td className="p-4 text-[var(--text-tertiary)]">
                                            {expandedRows.has(i) ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                        </td>
                                        <td className="p-4 text-[var(--text-secondary)]">
                                            {(() => {
                                                const d = new Date(r.serverTimestamp || r.timestamp || r.date);
                                                return isNaN(d.getTime()) ? '-' : d.toLocaleDateString('zh-TW');
                                            })()}
                                        </td>
                                        <td className="p-4 font-medium text-[var(--text-primary)]">{r.clientName || r.customer || r.location || '-'}</td>
                                        <td className="p-4 text-right font-mono font-bold text-emerald-500">
                                            ${(Number(r.amount) || Number(r.total) || 0).toLocaleString()}
                                        </td>
                                        <td className="p-4 text-center">
                                            <span className={`px-2 py-1 rounded-full text-xs font-bold ${r.status === 'PAID' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-rose-50 text-rose-600 border border-rose-100'}`}>
                                                {r.status === 'PAID' ? '已收款' : '未收款'}
                                            </span>
                                        </td>
                                        <td className="p-4 text-center" onClick={(e) => e.stopPropagation()}>
                                            {r.status !== 'PAID' && (
                                                <button onClick={() => handleMarkAsPaid(r)} className="btn-primary text-xs py-1 px-3">
                                                    確認收款
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
                                                                <th className="py-2 px-4 text-left font-medium">業務員</th>
                                                                <th className="py-2 px-4 text-left font-medium">產品</th>
                                                                <th className="py-2 px-4 text-right font-medium">單價</th>
                                                                <th className="py-2 px-4 text-center font-medium">數量</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-[var(--border-primary)]">
                                                            {(r.items || r.products || r.salesData || []).length > 0 ? (
                                                                (r.items || r.products || r.salesData || []).map((item, idx) => (
                                                                    <tr key={idx} className="hover:bg-[var(--bg-secondary)]">
                                                                        <td className="py-3 px-4 text-[var(--text-secondary)]">{getOperatorName(r)}</td>
                                                                        <td className="py-3 px-4 text-[var(--text-primary)] font-medium">{item.productName || item.name || '-'}</td>
                                                                        <td className="py-3 px-4 text-right text-[var(--text-secondary)] font-mono">${(Number(item.price) || Number(item.unitPrice) || 0).toLocaleString()}</td>
                                                                        <td className="py-3 px-4 text-center text-[var(--text-secondary)] font-mono">{item.qty || item.soldQty || 1}</td>
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
                            <tr><td colSpan="7" className="p-10 text-center text-[var(--text-secondary)]">無應收帳款</td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Mobile Card View */}
            <div className="md:hidden space-y-4">
                {selectedGroups.size > 0 && (
                    <button onClick={handleBatchMarkAsPaid} disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2 py-2.5">
                        <CheckSquare size={16} />
                        批次確認收款 ({selectedGroups.size})
                    </button>
                )}
                {loading ? (
                    <div className="p-10 text-center text-[var(--text-secondary)]">載入中...</div>
                ) : filtered.length > 0 ? (
                    filtered.map((r, i) => (
                        <div
                            key={i}
                            className={`bg-[var(--bg-primary)] rounded-xl border p-4 shadow-sm transition-colors ${selectedGroups.has(i) ? 'border-emerald-400' : 'border-[var(--border-primary)]'}`}
                            onClick={() => toggleRow(i)}
                        >
                            <div className="flex justify-between items-start mb-3">
                                <div className="flex items-start gap-3">
                                    {r.status !== 'PAID' && (
                                        <input
                                            type="checkbox"
                                            className="w-4 h-4 mt-1 rounded cursor-pointer accent-emerald-500 shrink-0"
                                            checked={selectedGroups.has(i)}
                                            onChange={(e) => toggleSelect(e, i)}
                                        />
                                    )}
                                    <div>
                                        <div className="text-xs text-[var(--text-tertiary)] mb-1">
                                            {(() => {
                                                const d = new Date(r.serverTimestamp || r.timestamp || r.date);
                                                return isNaN(d.getTime()) ? '-' : d.toLocaleDateString('zh-TW');
                                            })()}
                                        </div>
                                        <div className="font-bold text-[var(--text-primary)] text-lg">{r.clientName || r.customer || r.location || '未命名客戶'}</div>
                                        <div className="text-xs text-[var(--text-secondary)] mt-1">業務: {getOperatorName(r)}</div>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="text-xl font-black font-mono text-emerald-500">
                                        ${(Number(r.amount) || Number(r.total) || 0).toLocaleString()}
                                    </div>
                                    <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${r.status === 'PAID' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-rose-50 text-rose-600 border border-rose-100'}`}>
                                        {r.status === 'PAID' ? '已收款' : '未收款'}
                                    </span>
                                </div>
                            </div>

                            <div className="pt-3 border-t border-[var(--border-primary)] flex items-center justify-between">
                                <button className="text-[var(--text-tertiary)] flex items-center gap-1 text-xs">
                                    {expandedRows.has(i) ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                    明細
                                </button>
                                {r.status !== 'PAID' && (
                                    <button onClick={(e) => { e.stopPropagation(); handleMarkAsPaid(r); }} className="btn-primary text-xs py-1.5 px-4">
                                        確認收款
                                    </button>
                                )}
                            </div>

                            {expandedRows.has(i) && (
                                <div className="mt-3 bg-[var(--bg-secondary)] rounded-lg p-3 text-sm space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
                                    {(r.items || r.products || r.salesData || []).map((item, idx) => (
                                        <div key={idx} className="flex justify-between items-center border-b border-[var(--border-primary)] last:border-0 pb-2 last:pb-0">
                                            <span className="text-[var(--text-primary)]">{item.productName || item.name}</span>
                                            <div className="text-[var(--text-primary)] font-mono">${(Number(item.price) || 0).toLocaleString()} x {item.qty || 1}</div>
                                        </div>
                                    ))}
                                    {(!r.items && !r.products && !r.salesData) && <div className="text-[var(--text-tertiary)] text-center py-2 italic">無產品明細</div>}
                                </div>
                            )}
                        </div>
                    ))
                ) : (
                    <div className="p-10 text-center text-[var(--text-secondary)]">無應收帳款</div>
                )}
            </div>

            {/* Payment Method Modal */}
            {showModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-[var(--bg-primary)] rounded-2xl border border-[var(--border-primary)] shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-6 text-center">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-lg font-bold text-[var(--text-primary)]">選擇收款方式</h3>
                                <button onClick={() => setShowModal(false)} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors">
                                    <X size={20} />
                                </button>
                            </div>

                            <div className="grid grid-cols-1 gap-4">
                                <button
                                    onClick={() => handleConfirmPayment('CASH')}
                                    className="flex items-center justify-between p-4 rounded-xl border-2 border-emerald-100 bg-emerald-50/30 hover:bg-emerald-50 hover:border-emerald-500 transition-all group"
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 rounded-full bg-emerald-500 flex items-center justify-center text-white shadow-lg shadow-emerald-200">
                                            <Banknote size={24} />
                                        </div>
                                        <div className="text-left">
                                            <p className="font-bold text-emerald-700">現金收款</p>
                                            <p className="text-[10px] text-emerald-600/70">紀錄於當日銷售報表</p>
                                        </div>
                                    </div>
                                    <div className="w-6 h-6 rounded-full border-2 border-emerald-200 flex items-center justify-center group-hover:border-emerald-500">
                                        <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 scale-0 group-hover:scale-100 transition-transform"></div>
                                    </div>
                                </button>

                                <button
                                    onClick={() => handleConfirmPayment('TRANSFER')}
                                    className="flex items-center justify-between p-4 rounded-xl border-2 border-blue-100 bg-blue-50/30 hover:bg-blue-50 hover:border-blue-500 transition-all group"
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 rounded-full bg-blue-500 flex items-center justify-center text-white shadow-lg shadow-blue-200">
                                            <CreditCard size={24} />
                                        </div>
                                        <div className="text-left">
                                            <p className="font-bold text-blue-700">匯款收款</p>
                                            <p className="text-[10px] text-blue-600/70">純入帳，不計入現金報表</p>
                                        </div>
                                    </div>
                                    <div className="w-6 h-6 rounded-full border-2 border-blue-200 flex items-center justify-center group-hover:border-blue-500">
                                        <div className="w-2.5 h-2.5 rounded-full bg-blue-500 scale-0 group-hover:scale-100 transition-transform"></div>
                                    </div>
                                </button>
                            </div>

                            <p className="mt-6 text-[10px] text-[var(--text-tertiary)] italic">此動作無法輕易復原，請確認後點擊</p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
