import React, { useState, useEffect } from 'react';
import { Users, Search, Calendar, RefreshCw, DollarSign } from 'lucide-react';
import { callGAS } from '../utils/api';
import { getLocalDateString } from '../utils/constants';

export default function CustomerRankingPage({ user, apiUrl }) {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [startDate, setStartDate] = useState(getLocalDateString());
    const [endDate, setEndDate] = useState(getLocalDateString());
    const [searchTerm, setSearchTerm] = useState('');

    const fetchData = async () => {
        setLoading(true);
        try {
            const response = await callGAS(apiUrl, 'getCustomerRanking', { startDate, endDate }, user.token);
            if (Array.isArray(response)) {
                setData(response);
            } else {
                setData([]);
            }
        } catch (error) {
            console.error('Failed to fetch customer ranking:', error);
            alert('無法獲取客戶排行資料');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (user?.token) fetchData();
    }, [user.token, apiUrl]);

    const filteredData = data.filter(item =>
        String(item.customerName || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6 flex flex-col h-[calc(100vh-6rem)]">
            <div className="flex justify-between items-center shrink-0">
                <div>
                    <h1 className="text-2xl font-bold text-[var(--text-primary)] flex items-center gap-2">
                        <Users className="text-purple-600" /> 客戶銷售排行
                    </h1>
                    <p className="text-[var(--text-secondary)] text-sm mt-1">分析指定期間內各客戶的採購總額與貢獻度</p>
                </div>
                <button onClick={fetchData} disabled={loading} className="btn-secondary p-2 rounded-xl">
                    <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
                </button>
            </div>

            <div className="bg-[var(--bg-secondary)] p-4 rounded-xl border border-[var(--border-primary)] shrink-0 grid grid-cols-1 md:grid-cols-3 gap-4 shadow-sm">
                <div className="flex items-center gap-2">
                    <input type="date" className="input-field flex-1 text-sm" value={startDate} onChange={e => setStartDate(e.target.value)} />
                    <span className="text-[var(--text-secondary)] font-bold hidden md:inline">至</span>
                    <input type="date" className="input-field flex-1 text-sm" value={endDate} onChange={e => setEndDate(e.target.value)} />
                </div>
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" size={18} />
                    <input
                        type="text"
                        placeholder="搜尋客戶名稱..."
                        className="input-field pl-10 w-full"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>
                <button onClick={fetchData} className="btn-primary flex items-center justify-center gap-2 h-[42px]">
                    <Search size={18} /> 執行查詢
                </button>
            </div>

            <div className="bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-primary)] overflow-hidden flex-1 flex flex-col shadow-sm">
                <div className="overflow-y-auto flex-1">
                    {/* Desktop View */}
                    <table className="hidden md:table w-full text-left text-sm">
                        <thead className="bg-[var(--bg-tertiary)] text-[var(--text-secondary)] text-xs uppercase sticky top-0 z-10 font-bold border-b border-[var(--border-primary)]">
                            <tr>
                                <th className="p-4 w-16 text-center">排名</th>
                                <th className="p-4">客戶名稱</th>
                                <th className="p-4 text-right">交易次數</th>
                                <th className="p-4 text-right">銷售總額</th>
                                <th className="p-4 text-right">佔比</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border-primary)]">
                            {loading ? (
                                <tr><td colSpan="5" className="p-20 text-center text-[var(--text-secondary)]">載入中...</td></tr>
                            ) : filteredData.length > 0 ? (
                                filteredData.map((item, idx) => {
                                    const totalRevenue = data.reduce((sum, i) => sum + i.totalAmount, 0);
                                    const percentage = (item.totalAmount / totalRevenue) * 100;
                                    return (
                                        <tr key={idx} className="hover:bg-[var(--bg-hover)] transition-colors">
                                            <td className="p-4 text-center font-mono text-[var(--text-secondary)]">{idx + 1}</td>
                                            <td className="p-4 font-bold text-[var(--text-primary)]">{item.customerName}</td>
                                            <td className="p-4 text-right font-mono text-[var(--text-secondary)]">{item.transactionCount.toLocaleString()}</td>
                                            <td className="p-4 text-right font-mono text-purple-700 font-bold">${item.totalAmount.toLocaleString()}</td>
                                            <td className="p-4 text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                    <span className="text-xs text-[var(--text-tertiary)]">{percentage.toFixed(1)}%</span>
                                                    <div className="w-16 h-1.5 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
                                                        <div className="h-full bg-purple-500" style={{ width: `${percentage}%` }} />
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            ) : (
                                <tr><td colSpan="5" className="p-20 text-center text-slate-500">暫無資料</td></tr>
                            )}
                        </tbody>
                    </table>

                    {/* Mobile View */}
                    <div className="md:hidden divide-y divide-[var(--border-primary)]">
                        {loading ? (
                            <div className="p-10 text-center text-[var(--text-secondary)]">載入中...</div>
                        ) : filteredData.length > 0 ? (
                            filteredData.map((item, idx) => {
                                const totalRevenue = data.reduce((sum, i) => sum + i.totalAmount, 0);
                                const percentage = (item.totalAmount / totalRevenue) * 100;
                                return (
                                    <div key={idx} className="p-4 bg-[var(--bg-secondary)] active:bg-[var(--bg-hover)] transition-colors">
                                        <div className="flex justify-between items-start mb-2">
                                            <div className="flex items-center gap-3">
                                                <span className="w-6 h-6 rounded-full bg-[var(--bg-tertiary)] border border-[var(--border-primary)] flex items-center justify-center text-[10px] font-bold text-[var(--text-tertiary)] shrink-0 shadow-sm">
                                                    {idx + 1}
                                                </span>
                                                <div className="text-sm font-bold text-[var(--text-primary)]">{item.customerName}</div>
                                            </div>
                                            <div className="flex flex-col items-end">
                                                <span className="text-xs font-mono font-bold text-purple-700">${item.totalAmount.toLocaleString()}</span>
                                                <span className="text-[10px] text-[var(--text-tertiary)] font-bold">{percentage.toFixed(1)}%</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center justify-between pl-9 mt-1">
                                            <div className="flex items-center gap-2">
                                                <span className="text-[10px] text-[var(--text-tertiary)] font-bold uppercase">交易次數</span>
                                                <span className="text-xs font-mono text-[var(--text-secondary)]">{item.transactionCount.toLocaleString()}</span>
                                            </div>
                                            <div className="w-24 h-1 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
                                                <div className="h-full bg-purple-500" style={{ width: `${percentage}%` }} />
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        ) : (
                            <div className="p-10 text-center text-[var(--text-secondary)]">暫無資料</div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
