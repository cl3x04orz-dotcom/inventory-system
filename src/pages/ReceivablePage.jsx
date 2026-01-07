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
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                        <Wallet className="text-emerald-400" /> 應收帳款 (Receivables)
                    </h1>
                </div>
                <div className="glass-panel px-4 py-2 border-emerald-500/20 bg-emerald-500/5">
                    <p className="text-xs text-slate-400">總應收金額</p>
                    <p className="text-xl font-bold text-emerald-400">${totalAmount.toLocaleString()}</p>
                </div>
            </div>

            {/* Filters */}
            <div className="mb-6 p-4 rounded-xl bg-slate-800/50 border border-slate-700/50">
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
                    <div className="space-y-1">
                        <label className="text-[10px] text-slate-500 font-bold uppercase px-1">開始日期</label>
                        <input
                            type="date"
                            className="input-field w-full"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] text-slate-500 font-bold uppercase px-1">結束日期</label>
                        <input
                            type="date"
                            className="input-field w-full"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] text-slate-500 font-bold uppercase px-1">銷售對象/客戶</label>
                        <input
                            type="text"
                            placeholder="輸入客戶..."
                            className="input-field w-full"
                            value={clientSearch}
                            onChange={(e) => setClientSearch(e.target.value)}
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] text-slate-500 font-bold uppercase px-1">業務員</label>
                        <input
                            type="text"
                            placeholder="輸入姓名..."
                            className="input-field w-full"
                            value={operatorSearch}
                            onChange={(e) => setOperatorSearch(e.target.value)}
                        />
                    </div>

                    <button onClick={fetchData} className="btn-secondary h-[42px] px-6 flex items-center gap-2 justify-center">
                        <RefreshCw size={18} /> 查詢
                    </button>
                </div>
            </div>

            {/* Table */}
            <div className="rounded-xl border border-slate-700/50 overflow-hidden">
                <table className="w-full text-left text-sm">
                    <thead className="bg-slate-800 text-slate-400 text-xs uppercase sticky top-0">
                        <tr>
                            <th className="p-4 w-10"></th>
                            <th className="p-4">產生日期</th>
                            <th className="p-4">銷售對象</th>
                            <th className="p-4 text-right">金額</th>
                            <th className="p-4 text-center">狀態</th>
                            <th className="p-4 text-center">操作</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        {loading ? (
                            <tr><td colSpan="6" className="p-10 text-center text-slate-500">載入中...</td></tr>
                        ) : filtered.length > 0 ? (
                            filtered.map((r, i) => (
                                <React.Fragment key={i}>
                                    <tr className="hover:bg-white/5 transition-colors cursor-pointer" onClick={() => toggleRow(i)}>
                                        <td className="p-4 text-slate-500">
                                            {expandedRows.has(i) ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                        </td>
                                        <td className="p-4 text-slate-300">
                                            {(() => {
                                                const dateVal = r.serverTimestamp || r.timestamp || r.date;
                                                if (!dateVal) return '-';

                                                // If it's a date-only string like YYYY-MM-DD (length 10), don't show time
                                                const dateStr = String(dateVal);
                                                const d = new Date(dateVal);
                                                if (isNaN(d.getTime())) return dateStr;

                                                const isDateOnly = dateStr.length <= 10 && !dateStr.includes('T') && !dateStr.includes(':');

                                                return isDateOnly
                                                    ? d.toLocaleDateString('zh-TW')
                                                    : d.toLocaleString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
                                            })()}
                                        </td>
                                        <td className="p-4 font-medium text-white">{r.clientName || r.customer || r.location || '-'}</td>
                                        <td className="p-4 text-right font-mono font-bold text-emerald-300">
                                            ${(Number(r.amount) || Number(r.total) || 0).toLocaleString()}
                                        </td>
                                        <td className="p-4 text-center">
                                            <span className={`px-2 py-1 rounded text-xs font-bold ${r.status === 'PAID' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
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
                                        <tr className="bg-slate-900/30">
                                            <td colSpan="6" className="p-4 pl-12">
                                                <div className="bg-slate-800 border-2 border-slate-600 rounded-lg overflow-hidden">
                                                    <table className="w-full text-sm">
                                                        <thead>
                                                            <tr className="bg-slate-700/50 text-slate-400 border-b border-slate-600">
                                                                <th className="py-2 px-4 text-left font-medium">業務員</th>
                                                                <th className="py-2 px-4 text-left font-medium">產品</th>
                                                                <th className="py-2 px-4 text-right font-medium">單價</th>
                                                                <th className="py-2 px-4 text-center font-medium">數量</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-slate-700">
                                                            {(r.items || r.products || r.salesData || []).length > 0 ? (
                                                                (r.items || r.products || r.salesData || []).map((item, idx) => (
                                                                    <tr key={idx} className="hover:bg-slate-700/30">
                                                                        <td className="py-3 px-4 text-slate-300">
                                                                            {getOperatorName(r)}
                                                                        </td>
                                                                        <td className="py-3 px-4 text-slate-200 font-medium">
                                                                            {item.productName || item.name || '-'}
                                                                        </td>
                                                                        <td className="py-3 px-4 text-right text-slate-300 font-mono">
                                                                            ${(Number(item.price) || Number(item.unitPrice) || 0).toLocaleString()}
                                                                        </td>
                                                                        <td className="py-3 px-4 text-center text-slate-300 font-mono">
                                                                            {item.qty || item.soldQty || 1}
                                                                        </td>
                                                                    </tr>
                                                                ))
                                                            ) : (
                                                                <tr>
                                                                    <td colSpan="4" className="py-4 text-center text-slate-500 italic">無產品明細</td>
                                                                </tr>
                                                            )}
                                                        </tbody>
                                                    </table>
                                                    <div className="p-3 bg-slate-700/20 text-xs text-slate-400 flex gap-4 border-t border-slate-600">
                                                        <span>單據編號: {r.id || '-'}</span>
                                                        <span>操作員: {r.operator || r.Operator || r.salesRep || '-'}</span>
                                                        <span>付款方式: {r.paymentMethod || '信用資助'}</span>
                                                    </div>
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
        </div>
    );
}
