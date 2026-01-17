import React, { useState, useEffect } from 'react';
import { Wallet, Search, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { callGAS } from '../utils/api';
import { getLocalDateString } from '../utils/constants';

export default function PayablePage({ user, apiUrl }) {
    const [records, setRecords] = useState([]);
    const [loading, setLoading] = useState(false);

    // Search Filters
    const [startDate, setStartDate] = useState(getLocalDateString());
    const [endDate, setEndDate] = useState(getLocalDateString());
    const [vendorSearch, setVendorSearch] = useState('');
    const [operatorSearch, setOperatorSearch] = useState('');

    const [expandedRows, setExpandedRows] = useState(new Set());

    const fetchData = React.useCallback(async () => {
        setLoading(true);
        try {
            const payload = {};
            if (startDate) payload.startDate = startDate;
            if (endDate) payload.endDate = endDate;

            const data = await callGAS(apiUrl, 'getPayables', payload, user.token);
            if (Array.isArray(data)) {
                // Sort by date descending
                const sorted = data.sort((a, b) => new Date(b.date) - new Date(a.date));
                setRecords(sorted);
            }
        } catch (error) {
            console.error('Failed to fetch payables:', error);
            // alert('獲取應付帳款失敗: ' + error.message);
        } finally {
            setLoading(false);
        }
    }, [apiUrl, user.token, startDate, endDate]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleMarkAsPaid = async (recordId) => {
        if (!confirm('確定要將此筆帳款標記為已付款嗎？')) return;

        setLoading(true);
        try {
            // Using 'markPayableAsPaid' based on standard naming convention or previous knowledge
            await callGAS(apiUrl, 'markPayableAsPaid', { recordId }, user.token);
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
        return r.operator || r.Operator || r.buyer || r.salesRep || r.salesPerson || '-';
    };

    const filtered = records.filter(r => {
        const vendor = String(r.vendorName || r.vendor || '').toLowerCase();
        const op = String(getOperatorName(r)).toLowerCase();

        const matchVendor = !vendorSearch || vendor.includes(vendorSearch.toLowerCase());
        const matchOp = !operatorSearch || op.includes(operatorSearch.toLowerCase());

        return matchVendor && matchOp;
    });

    const totalAmount = filtered.reduce((sum, r) => sum + (Number(r.amount) || Number(r.total) || 0), 0);

    return (
        <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">
            {/* Header */}
            <div className="flex flex-row justify-between items-center gap-4">
                <div className="flex-1 min-w-0">
                    <h1 className="text-xl md:text-2xl font-bold text-slate-800 flex items-center gap-2 truncate">
                        <Wallet className="text-rose-600 w-6 h-6 shrink-0" />
                        <span className="truncate">應付帳款</span>
                    </h1>
                </div>
                <div className="glass-panel px-3 py-2 border-rose-200 bg-rose-50 shrink-0 flex flex-col items-end">
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">總應付金額</p>
                    <p className="text-lg md:text-xl font-bold text-rose-600">${totalAmount.toLocaleString()}</p>
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
                        <label className="text-[10px] text-slate-500 font-bold uppercase px-1">廠商名稱</label>
                        <input
                            type="text"
                            placeholder="輸入廠商..."
                            className="input-field w-full h-10"
                            value={vendorSearch}
                            onChange={(e) => setVendorSearch(e.target.value)}
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] text-slate-500 font-bold uppercase px-1">採購人員</label>
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
                            <th className="p-4 text-center">產生日期</th>
                            <th className="p-4">廠商名稱</th>
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
                                        <td className="p-4 text-slate-500 text-center">
                                            {(() => {
                                                const dateVal = r.serverTimestamp || r.timestamp || r.date;
                                                const d = new Date(dateVal);
                                                return isNaN(d.getTime()) ? '-' : d.toLocaleDateString('zh-TW');
                                            })()}
                                        </td>
                                        <td className="p-4 font-medium text-slate-800">{r.vendorName || r.vendor || '-'}</td>
                                        <td className="p-4 text-right font-mono font-bold text-rose-600">
                                            ${(Number(r.amount) || Number(r.total) || 0).toLocaleString()}
                                        </td>
                                        <td className="p-4 text-center">
                                            <span className={`px-2 py-1 rounded text-xs font-bold ${r.status === 'PAID' ? 'bg-green-100 text-green-700' : 'bg-rose-100 text-rose-700'}`}>
                                                {r.status === 'PAID' ? '已付款' : '未付款'}
                                            </span>
                                        </td>
                                        <td className="p-4 text-center" onClick={(e) => e.stopPropagation()}>
                                            {r.status !== 'PAID' && (
                                                <button
                                                    onClick={() => handleMarkAsPaid(r.id)}
                                                    className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded transition-colors"
                                                >
                                                    確認付款
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
                                                            {(r.items || r.products || []).length > 0 ? (
                                                                (r.items || r.products || []).map((item, idx) => (
                                                                    <tr key={idx} className="hover:bg-slate-50">
                                                                        <td className="py-3 px-4 text-slate-500">{getOperatorName(r)}</td>
                                                                        <td className="py-3 px-4 text-slate-800 font-medium">{item.productName || item.name || '-'}</td>
                                                                        <td className="py-3 px-4 text-right text-slate-500 font-mono">${(Number(item.price) || Number(item.unitPrice) || 0).toLocaleString()}</td>
                                                                        <td className="py-3 px-4 text-center text-slate-500 font-mono">{item.qty || item.quantity || 1}</td>
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
                            <tr><td colSpan="6" className="p-10 text-center text-slate-500">無應付帳款</td></tr>
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
                                    <div className="font-bold text-slate-800 text-lg">{r.vendorName || r.vendor || '未命名廠商'}</div>
                                    <div className="text-xs text-slate-500 mt-1">採購: {getOperatorName(r)}</div>
                                </div>
                                <div className="text-right">
                                    <div className="text-xl font-black font-mono text-rose-600">
                                        ${(Number(r.amount) || Number(r.total) || 0).toLocaleString()}
                                    </div>
                                    <span className={`inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-bold ${r.status === 'PAID' ? 'bg-green-100 text-green-700' : 'bg-rose-100 text-rose-700'}`}>
                                        {r.status === 'PAID' ? '已付款' : '未付款'}
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
                                        確認付款
                                    </button>
                                )}
                            </div>

                            {/* Mobile Expanded Details */}
                            {expandedRows.has(i) && (
                                <div className="mt-3 bg-slate-50 rounded-lg p-3 text-sm space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
                                    {(r.items || r.products || []).map((item, idx) => (
                                        <div key={idx} className="flex justify-between items-center border-b border-slate-100 last:border-0 pb-2 last:pb-0">
                                            <span className="text-slate-700">{item.productName || item.name}</span>
                                            <div className="text-right">
                                                <div className="text-slate-900 font-mono">${(Number(item.price) || 0).toLocaleString()} x {item.qty || 1}</div>
                                            </div>
                                        </div>
                                    ))}
                                    {(!r.items && !r.products) && <div className="text-slate-400 text-center py-2 italic">無產品明細</div>}
                                </div>
                            )}
                        </div>
                    ))
                ) : (
                    <div className="p-10 text-center text-slate-500">無應付帳款</div>
                )}
            </div>
        </div>
    );
}
