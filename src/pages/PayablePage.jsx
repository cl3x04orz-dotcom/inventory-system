import React, { useState, useEffect } from 'react';
import { Wallet, Search, RefreshCw } from 'lucide-react';
import { callGAS } from '../utils/api';

export default function PayablePage({ user, apiUrl }) {
    const [records, setRecords] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    const fetchData = async () => {
        setLoading(true);
        try {
            const data = await callGAS(apiUrl, 'getPayables', {}, user.token);
            if (Array.isArray(data)) {
                setRecords(data);
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

    const filtered = records.filter(r =>
        String(r.vendorName || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    const totalAmount = filtered.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

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
                            <th className="p-4">產生日期</th>
                            <th className="p-4">廠商名稱</th>
                            <th className="p-4">關聯單號</th>
                            <th className="p-4 text-right">金額</th>
                            <th className="p-4">到期日</th>
                            <th className="p-4 text-center">狀態</th>
                            <th className="p-4">備註</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        {loading ? (
                            <tr><td colSpan="7" className="p-10 text-center text-slate-500">載入中...</td></tr>
                        ) : filtered.length > 0 ? (
                            filtered.map((r, i) => (
                                <tr key={i} className="hover:bg-white/5">
                                    <td className="p-4 text-slate-300">{r.date ? new Date(r.date).toLocaleDateString('zh-TW') : '-'}</td>
                                    <td className="p-4 font-medium text-white">{r.vendorName}</td>
                                    <td className="p-4 text-slate-400 font-mono text-xs">{r.orderId || '-'}</td>
                                    <td className="p-4 text-right font-mono font-bold text-rose-300">${Number(r.amount).toLocaleString()}</td>
                                    <td className="p-4 text-slate-300">{r.dueDate ? new Date(r.dueDate).toLocaleDateString('zh-TW') : '-'}</td>
                                    <td className="p-4 text-center">
                                        <span className={`px-2 py-1 rounded text-xs font-bold ${r.status === 'PAID' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-rose-400'}`}>
                                            {r.status === 'PAID' ? '已付款' : '未付款'}
                                        </span>
                                    </td>
                                    <td className="p-4 text-slate-400 text-xs max-w-xs truncate">{r.note || '-'}</td>
                                </tr>
                            ))
                        ) : (
                            <tr><td colSpan="7" className="p-10 text-center text-slate-500">無應付帳款</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
