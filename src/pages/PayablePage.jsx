import React, { useState, useEffect } from 'react';
import { Wallet, Search, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { callGAS } from '../utils/api';

export default function PayablePage({ user, apiUrl }) {
    const [records, setRecords] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [expandedRows, setExpandedRows] = useState(new Set());

    const fetchData = async () => {
        setLoading(true);
        try {
            const data = await callGAS(apiUrl, 'getPayables', {}, user.token);
            if (Array.isArray(data)) {
                // Sort by date descending
                const sorted = data.sort((a, b) => new Date(b.date) - new Date(a.date));
                setRecords(sorted);
            }
        } catch (error) {
            console.error('Failed to fetch payables:', error);
            alert('獲取應付帳款失敗: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (user?.token) fetchData();
    }, [user.token, apiUrl]);

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
        const search = searchTerm.toLowerCase();
        const vendor = String(r.vendorName || r.vendor || '').toLowerCase();
        const op = String(getOperatorName(r)).toLowerCase();
        const loc = String(r.location || r.customer || '').toLowerCase();
        return vendor.includes(search) || op.includes(search) || loc.includes(search);
    });

    const totalAmount = filtered.reduce((sum, r) => sum + (Number(r.amount) || Number(r.total) || 0), 0);

    return (
        <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                        <Wallet className="text-rose-400" /> 應付帳款 (Payables)
                    </h1>
                </div>
                <div className="glass-panel px-4 py-2 border-rose-500/20 bg-rose-500/5">
                    <p className="text-xs text-slate-400">總應付金額</p>
                    <p className="text-xl font-bold text-rose-400">${totalAmount.toLocaleString()}</p>
                </div>
            </div>

            <div className="glass-panel p-4 flex gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                    <input
                        type="text"
                        placeholder="搜尋廠商名稱..."
                        className="input-field pl-10 w-full"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <button onClick={fetchData} className="btn-secondary px-4">
                    <RefreshCw size={18} />
                </button>
            </div>

            <div className="glass-panel p-0 overflow-hidden">
                <table className="w-full text-left text-sm">
                    <thead className="bg-slate-800 text-slate-400 text-xs uppercase sticky top-0">
                        <tr>
                            <th className="p-4 w-10"></th>
                            <th className="p-4 text-center">產生日期</th>
                            <th className="p-4">廠商名稱</th>
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
                                        <td className="p-4 text-slate-300 text-center">
                                            {(() => {
                                                const dateVal = r.serverTimestamp || r.timestamp || r.date;
                                                if (!dateVal) return '-';

                                                const d = new Date(dateVal);
                                                // If invalid date, return original string
                                                if (isNaN(d.getTime())) return String(dateVal);

                                                return d.toLocaleString('zh-TW', {
                                                    year: 'numeric',
                                                    month: '2-digit',
                                                    day: '2-digit',
                                                    hour: '2-digit',
                                                    minute: '2-digit'
                                                });
                                            })()}
                                        </td>
                                        <td className="p-4 font-medium text-white">{r.vendorName || r.vendor || '-'}</td>
                                        <td className="p-4 text-right font-mono font-bold text-rose-300">
                                            ${(Number(r.amount) || Number(r.total) || 0).toLocaleString()}
                                        </td>
                                        <td className="p-4 text-center">
                                            <span className={`px-2 py-1 rounded text-xs font-bold ${r.status === 'PAID' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-rose-400'}`}>
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
                                                            {(r.items || r.products || []).length > 0 ? (
                                                                (r.items || r.products || []).map((item, idx) => (
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
                                                                            {item.qty || item.quantity || item.soldQty || 1}
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
                                                        <span>操作員: {r.operator || r.Operator || r.buyer || '-'}</span>
                                                        <span>位置: {r.location || r.customer || '-'}</span>
                                                    </div>
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
        </div>
    );
}
