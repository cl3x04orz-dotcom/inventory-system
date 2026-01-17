import React, { useState, useEffect } from 'react';
import { Wallet, Search, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { callGAS } from '../utils/api';
import { getLocalDateString } from '../utils/constants';

export default function ReceivablePage({ user, apiUrl }) {
    const [records, setRecords] = useState([]);
    const [loading, setLoading] = useState(false);

    // Search Filters
    const [startDate, setStartDate] = useState(getLocalDateString());
    const [endDate, setEndDate] = useState(getLocalDateString());
    const [clientSearch, setClientSearch] = useState('');
    const [operatorSearch, setOperatorSearch] = useState('');

    const [expandedRows, setExpandedRows] = useState(new Set());

    const fetchData = React.useCallback(async () => {
        setLoading(true);
        try {
            // Note: Currently fetching both receivables and sales history.
            // Since SalesPage was just fixed to save 'customer' and 'paymentMethod: CREDIT' correcty,
            // future data will appear in 'getReceivables'.
            // However, past data (saved as CASH/no-customer) might still need 'getSalesHistory' to be visible,
            // even though it can't distinguish generic sales from credit sales effectively.

            // For now, we fetch ONLY 'getReceivables' as this is the correct source of truth for "Receivables".
            // The previous 'getSalesHistory' method was showing ALL sales (cash included) which is confusing.
            // If the user needs to see old broken records, they will appear in Sales History page, not Receivables.

            const payload = {};
            if (startDate) payload.startDate = startDate;
            if (endDate) payload.endDate = endDate;

            const data = await callGAS(apiUrl, 'getReceivables', payload, user.token);

            if (Array.isArray(data)) {
                // Sort by date descending (newest first)
                const sorted = data.sort((a, b) => new Date(b.date) - new Date(a.date));
                setRecords(sorted);
            }
        } catch (error) {
            console.error('Failed to fetch data:', error);
            alert('獲取資料失敗: ' + error.message);
        } finally {
            setLoading(false);
        }
    }, [apiUrl, user.token, startDate, endDate]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleMarkAsPaid = async (recordId) => {
        if (!confirm('確定要將此筆帳款標記為已收款嗎？')) return;

        setLoading(true);
        try {
            await callGAS(apiUrl, 'markAsPaid', { recordId }, user.token);
            alert('更新成功！');
            fetchData(); // Refresh list
        } catch (error) {
            console.error('Failed to mark as paid:', error);
            alert('更新失敗: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const toggleRow = (index) => {
        const newExpanded = new Set(expandedRows);
        if (newExpanded.has(index)) {
            newExpanded.delete(index);
        } else {
            newExpanded.add(index);
        }
        setExpandedRows(newExpanded);
    };

    const getOperatorName = (r) => {
        const fields = [r.salesRep, r.salesPerson, r.operator, r.Operator, r.buyer];
        // Find the first field that is NOT undefined, NOT null, and NOT string "Unknown"
        const validName = fields.find(f => f && String(f).toLowerCase() !== 'unknown');
        return validName || '-';
    };

    const filtered = records.filter(r => {
        const client = String(r.clientName || r.customer || r.location || '').toLowerCase();
        const rep = String(getOperatorName(r)).toLowerCase();

        const matchClient = !clientSearch || client.includes(clientSearch.toLowerCase());
        const matchOp = !operatorSearch || rep.includes(operatorSearch.toLowerCase());

        return matchClient && matchOp;
    });

    const totalAmount = filtered.reduce((sum, r) => sum + (Number(r.amount) || Number(r.total) || 0), 0);

    return (
        <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">
            {/* Header */}
            <div className="flex flex-row justify-between items-center gap-4">
                <div className="flex-1 min-w-0">
                    <h1 className="text-xl md:text-2xl font-bold text-slate-800 flex items-center gap-2 truncate">
                        <Wallet className="text-emerald-600 w-6 h-6 shrink-0" />
                        <span className="truncate">應收帳款</span>
                    </h1>
                </div>
                <div className="glass-panel px-3 py-2 border-emerald-200 bg-emerald-50 shrink-0 flex flex-col items-end">
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">總應收金額</p>
                    <p className="text-lg md:text-xl font-bold text-emerald-600">${totalAmount.toLocaleString()}</p>
                </div>
            </div>

            {/* Filters */}
            <div className="mb-6 p-4 rounded-xl bg-slate-50 border border-slate-200">
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
                    <div className="space-y-1">
                        <label className="text-[10px] text-slate-500 font-bold uppercase px-1">開始日期</label>
                        <input
                            type="date"
                            className="input-field w-full h-10 appearance-none bg-white"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] text-slate-500 font-bold uppercase px-1">結束日期</label>
                        <input
                            type="date"
                            className="input-field w-full h-10 appearance-none bg-white"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] text-slate-500 font-bold uppercase px-1">銷售對象/客戶</label>
                        <input
                            type="text"
                            placeholder="輸入客戶..."
                            className="input-field w-full h-10"
                            value={clientSearch}
                            onChange={(e) => setClientSearch(e.target.value)}
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] text-slate-500 font-bold uppercase px-1">業務員</label>
                        <input
                            type="text"
                            placeholder="輸入姓名..."
                            className="input-field w-full h-10"
                            value={operatorSearch}
                            onChange={(e) => setOperatorSearch(e.target.value)}
                        />
                    </div>

                    <button onClick={fetchData} className="btn-secondary h-10 px-6 flex items-center gap-2 justify-center w-full md:w-auto">
                        <RefreshCw size={18} /> 查詢
                    </button>
                </div>
            </div>

            {/* Desktop Table */}
            <div className="hidden md:block rounded-xl border border-slate-200 overflow-hidden">
                <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-slate-500 text-xs uppercase sticky top-0">
                        <tr>
                            <th className="p-4 w-10"></th>
                            <th className="p-4">產生日期</th>
                            <th className="p-4">銷售對象</th>
                            <th className="p-4 text-right">金額</th>
                            <th className="p-4 text-center">狀態</th>
                            <th className="p-4 text-center">操作</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                        {loading ? (
                            <tr><td colSpan="6" className="p-10 text-center text-slate-500">載入中...</td></tr>
                        ) : filtered.length > 0 ? (
                            filtered.map((r, i) => (
                                <React.Fragment key={i}>
                                    <tr className="hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => toggleRow(i)}>
                                        <td className="p-4 text-slate-400">
                                            {expandedRows.has(i) ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                        </td>
                                        <td className="p-4 text-slate-500">
                                            {(() => {
                                                const dateVal = r.serverTimestamp || r.timestamp || r.date;
                                                const d = new Date(dateVal);
                                                return isNaN(d.getTime()) ? '-' : d.toLocaleDateString('zh-TW');
                                            })()}
                                        </td>
                                        <td className="p-4 font-medium text-slate-800">{r.clientName || r.customer || r.location || '-'}</td>
                                        <td className="p-4 text-right font-mono font-bold text-emerald-600">
                                            ${(Number(r.amount) || Number(r.total) || 0).toLocaleString()}
                                        </td>
                                        <td className="p-4 text-center">
                                            <span className={`px-2 py-1 rounded text-xs font-bold ${r.status === 'PAID' ? 'bg-green-100 text-green-700' : 'bg-rose-100 text-rose-700'}`}>
                                                {r.status === 'PAID' ? '已收款' : '未收款'}
                                            </span>
                                        </td>
                                        <td className="p-4 text-center" onClick={(e) => e.stopPropagation()}>
                                            {r.status !== 'PAID' && (
                                                <button
                                                    onClick={() => handleMarkAsPaid(r.id)}
                                                    className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded transition-colors"
                                                >
                                                    確認收款
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                    {expandedRows.has(i) && (
                                        <tr className="bg-slate-50/50">
                                            <td colSpan="6" className="p-4 pl-12">
                                                <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                                                    <table className="w-full text-sm">
                                                        <thead>
                                                            <tr className="bg-slate-50 text-slate-500 border-b border-slate-100">
                                                                <th className="py-2 px-4 text-left font-medium">業務員</th>
                                                                <th className="py-2 px-4 text-left font-medium">產品</th>
                                                                <th className="py-2 px-4 text-right font-medium">單價</th>
                                                                <th className="py-2 px-4 text-center font-medium">數量</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-slate-50">
                                                            {(r.items || r.products || r.salesData || []).length > 0 ? (
                                                                (r.items || r.products || r.salesData || []).map((item, idx) => (
                                                                    <tr key={idx} className="hover:bg-slate-50">
                                                                        <td className="py-3 px-4 text-slate-500">{getOperatorName(r)}</td>
                                                                        <td className="py-3 px-4 text-slate-800 font-medium">{item.productName || item.name || '-'}</td>
                                                                        <td className="py-3 px-4 text-right text-slate-500 font-mono">${(Number(item.price) || Number(item.unitPrice) || 0).toLocaleString()}</td>
                                                                        <td className="py-3 px-4 text-center text-slate-500 font-mono">{item.qty || item.soldQty || 1}</td>
                                                                    </tr>
                                                                ))
                                                            ) : (
                                                                <tr><td colSpan="4" className="py-4 text-center text-slate-500 italic">無產品明細</td></tr>
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
                            <tr><td colSpan="6" className="p-10 text-center text-slate-500">無應收帳款</td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Mobile Card View */}
            <div className="md:hidden space-y-4">
                {loading ? (
                    <div className="p-10 text-center text-slate-500">載入中...</div>
                ) : filtered.length > 0 ? (
                    filtered.map((r, i) => (
                        <div key={i} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm" onClick={() => toggleRow(i)}>
                            <div className="flex justify-between items-start mb-3">
                                <div>
                                    <div className="text-xs text-slate-400 mb-1">
                                        {(() => {
                                            const dateVal = r.serverTimestamp || r.timestamp || r.date;
                                            const d = new Date(dateVal);
                                            return isNaN(d.getTime()) ? '-' : d.toLocaleDateString('zh-TW');
                                        })()}
                                    </div>
                                    <div className="font-bold text-slate-800 text-lg">{r.clientName || r.customer || r.location || '未命名客戶'}</div>
                                    <div className="text-xs text-slate-500 mt-1">業務: {getOperatorName(r)}</div>
                                </div>
                                <div className="text-right">
                                    <div className="text-xl font-black font-mono text-emerald-600">
                                        ${(Number(r.amount) || Number(r.total) || 0).toLocaleString()}
                                    </div>
                                    <span className={`inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-bold ${r.status === 'PAID' ? 'bg-green-100 text-green-700' : 'bg-rose-100 text-rose-700'}`}>
                                        {r.status === 'PAID' ? '已收款' : '未收款'}
                                    </span>
                                </div>
                            </div>

                            {/* Action Button & Expand Details */}
                            <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                                <button className="text-slate-400 flex items-center gap-1 text-xs">
                                    {expandedRows.has(i) ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                    明細
                                </button>
                                {r.status !== 'PAID' && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation(); // prevent card toggle
                                            handleMarkAsPaid(r.id);
                                        }}
                                        className="px-4 py-1.5 bg-blue-600 text-white text-xs font-bold rounded-lg shadow-sm hover:bg-blue-500 active:scale-95 transition-all"
                                    >
                                        確認收款
                                    </button>
                                )}
                            </div>

                            {/* Mobile Expanded Details */}
                            {expandedRows.has(i) && (
                                <div className="mt-3 bg-slate-50 rounded-lg p-3 text-sm space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
                                    {(r.items || r.products || r.salesData || []).map((item, idx) => (
                                        <div key={idx} className="flex justify-between items-center border-b border-slate-100 last:border-0 pb-2 last:pb-0">
                                            <span className="text-slate-700">{item.productName || item.name}</span>
                                            <div className="text-right">
                                                <div className="text-slate-900 font-mono">${(Number(item.price) || 0).toLocaleString()} x {item.qty || 1}</div>
                                            </div>
                                        </div>
                                    ))}
                                    {(!r.items && !r.products && !r.salesData) && <div className="text-slate-400 text-center py-2 italic">無產品明細</div>}
                                </div>
                            )}
                        </div>
                    ))
                ) : (
                    <div className="p-10 text-center text-slate-500">無應收帳款</div>
                )}
            </div>
        </div>
    );
}
