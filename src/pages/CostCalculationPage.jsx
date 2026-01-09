import React, { useState, useEffect } from 'react';
import { DollarSign, Search, Calendar, RefreshCw, Clock } from 'lucide-react';
import { callGAS } from '../utils/api';
import { getLocalDateString } from '../utils/constants';

export default function CostCalculationPage({ user, apiUrl }) {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [startDate, setStartDate] = useState(getLocalDateString());
    const [endDate, setEndDate] = useState(getLocalDateString());
    const [searchTerm, setSearchTerm] = useState('');

    const fetchData = async () => {
        setLoading(true);
        try {
            const response = await callGAS(apiUrl, 'getExpenditures', { startDate, endDate }, user.token);
            if (Array.isArray(response)) {
                setData(response);
            } else {
                setData([]);
            }
        } catch (error) {
            console.error('Failed to fetch expenditures:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (user?.token) fetchData();
    }, [user.token, apiUrl]);

    const filteredData = data.filter(item => {
        const searchStr = `${item.customer || ''} ${item.salesRep || ''} ${item.note || ''}`.toLowerCase();
        return searchStr.includes(searchTerm.toLowerCase());
    });

    // 計算各項總和
    const summary = filteredData.reduce((acc, curr) => {
        acc.stall += Number(curr.stall || 0);
        acc.cleaning += Number(curr.cleaning || 0);
        acc.electricity += Number(curr.electricity || 0);
        acc.gas += Number(curr.gas || 0);
        acc.parking += Number(curr.parking || 0);
        acc.goods += Number(curr.goods || 0);
        acc.bags += Number(curr.bags || 0);
        acc.others += Number(curr.others || 0);
        acc.serviceFee += Number(curr.serviceFee || 0);
        acc.linePay += Number(curr.linePay || 0);
        acc.finalTotal += Number(curr.finalTotal || 0);
        acc.vehicleMaintenance += Number(curr.vehicleMaintenance || 0);
        acc.salary += Number(curr.salary || 0);
        acc.reserve += Number(curr.reserve || 0);
        return acc;
    }, {
        stall: 0, cleaning: 0, electricity: 0, gas: 0, parking: 0,
        goods: 0, bags: 0, others: 0, serviceFee: 0, linePay: 0, finalTotal: 0,
        vehicleMaintenance: 0, salary: 0, reserve: 0
    });

    const totalOperationalCost = summary.stall + summary.cleaning + summary.electricity +
        summary.gas + summary.parking + summary.bags +
        summary.others + summary.vehicleMaintenance + summary.salary;

    const expenseCategories = [
        { key: 'stall', label: '攤位費', color: 'text-blue-400' },
        { key: 'cleaning', label: '清潔費', color: 'text-indigo-400' },
        { key: 'electricity', label: '電費', color: 'text-yellow-400' },
        { key: 'gas', label: '加油費', color: 'text-orange-400' },
        { key: 'parking', label: '停車費', color: 'text-slate-400' },
        { key: 'bags', label: '塑膠袋', color: 'text-teal-400' },
        { key: 'serviceFee', label: '服務費', color: 'text-rose-400' },
        { key: 'others', label: '其他支出', color: 'text-purple-400' },
        { key: 'vehicleMaintenance', label: '車輛保養', color: 'text-indigo-400' },
        { key: 'salary', label: '薪資發放', color: 'text-amber-400' }
    ];

    return (
        <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6 flex flex-col h-[calc(100vh-6rem)] animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shrink-0">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                        <DollarSign className="text-rose-400" /> 成本支出計算
                    </h1>
                    <p className="text-slate-400 text-sm mt-1">分析 Expenditures 分頁中的各項經營成本與支出</p>
                </div>
                <div className="flex gap-4 flex-wrap">
                    <div className="glass-panel px-4 py-2 bg-rose-500/5 border-rose-500/20">
                        <p className="text-[10px] text-slate-400 uppercase font-bold text-center">總營運成本</p>
                        <p className="text-xl font-bold text-rose-400 text-center">${totalOperationalCost.toLocaleString()}</p>
                    </div>
                    <div className="glass-panel px-4 py-2 bg-emerald-500/5 border-emerald-500/20">
                        <p className="text-[10px] text-slate-400 uppercase font-bold text-center">貨款</p>
                        <p className="text-xl font-bold text-emerald-400 text-center">${summary.goods.toLocaleString()}</p>
                    </div>
                    <div className="glass-panel px-4 py-2 bg-teal-500/5 border-teal-500/20">
                        <p className="text-[10px] text-slate-400 uppercase font-bold text-center">公積金</p>
                        <p className="text-xl font-bold text-teal-400 text-center">${summary.reserve.toLocaleString()}</p>
                    </div>
                    <div className="glass-panel px-4 py-2 bg-slate-500/5 border-slate-500/20">
                        <p className="text-[10px] text-slate-400 uppercase font-bold text-center">Line Pay 收款</p>
                        <p className="text-xl font-bold text-slate-300 text-center">${summary.linePay.toLocaleString()}</p>
                    </div>
                </div>
            </div>

            <div className="glass-panel p-4 shrink-0 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="flex items-center gap-2">
                    <Calendar size={18} className="text-slate-400" />
                    <input type="date" className="input-field flex-1 text-white" value={startDate} onChange={e => setStartDate(e.target.value)} />
                    <span className="text-slate-500">至</span>
                    <input type="date" className="input-field flex-1 text-white" value={endDate} onChange={e => setEndDate(e.target.value)} />
                </div>
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input type="text" placeholder="搜尋對象或業務..." className="input-field pl-10 w-full text-white" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                </div>
                <button onClick={fetchData} className="btn-primary flex items-center justify-center gap-2">
                    <RefreshCw size={18} className={loading ? 'animate-spin' : ''} /> 執行計算
                </button>
            </div>

            {/* 九大支出統計卡片 - 重新加入 */}
            <div className="grid grid-cols-2 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-12 gap-3 shrink-0">
                {expenseCategories.map(cat => (
                    <div key={cat.key} className="glass-panel p-3 bg-slate-800/20 border-white/5">
                        <p className="text-[10px] text-slate-500 font-bold uppercase truncate">{cat.label}</p>
                        <p className={`text-sm md:text-md font-bold ${cat.color} mt-1`}>${summary[cat.key].toLocaleString()}</p>
                    </div>
                ))}
            </div>

            <div className="glass-panel p-0 overflow-hidden flex-1 border-white/5 relative">
                <div className="h-full overflow-auto custom-scrollbar">
                    <table className="w-full text-left text-sm border-separate border-spacing-0 min-w-[1100px]">
                        <thead className="bg-slate-800/95 text-slate-400 text-xs uppercase sticky top-0 z-30 backdrop-blur-md shadow-lg">
                            <tr>
                                <th className="p-4 border-b border-white/10 sticky left-0 z-40 bg-slate-800/95">時間/對象/業務</th>
                                <th className="p-4 text-right border-b border-white/10">基礎營運支出</th>
                                <th className="p-4 text-right border-b border-white/10">金流與服務費</th>
                                <th className="p-4 text-right border-b border-white/10">車輛與人事</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {loading ? (
                                <tr><td colSpan="4" className="p-20 text-center text-slate-500 font-medium">
                                    <div className="flex flex-col items-center gap-2">
                                        <RefreshCw className="animate-spin text-rose-500" />
                                        <span>正在讀取支出數據...</span>
                                    </div>
                                </td></tr>
                            ) : filteredData.length > 0 ? (
                                filteredData.map((item, idx) => (
                                    <tr key={idx} className="hover:bg-white/5 transition-colors group">
                                        <td className="p-4 sticky left-0 z-10 bg-slate-900/90 backdrop-blur-sm border-b border-white/5 group-hover:bg-slate-800/90 transition-colors shadow-[2px_0_10px_rgba(0,0,0,0.3)]">
                                            <div className="flex flex-col gap-1">
                                                <span className="text-slate-200 font-mono text-xs flex items-center gap-1">
                                                    <Clock size={12} className="text-slate-500" />
                                                    {(() => {
                                                        const rawDate = item.date || item.serverTimestamp;
                                                        if (!rawDate) return '無日期';
                                                        const d = new Date(rawDate);
                                                        return isNaN(d.getTime()) ? String(rawDate) : d.toLocaleString('zh-TW', { hour12: false });
                                                    })()}
                                                </span>
                                                <span className="text-sm font-bold text-white">{item.customer || '未知對象'}</span>
                                                <span className="text-xs text-slate-400 font-medium bg-slate-800 self-start px-1.5 py-0.5 rounded">{item.salesRep || '-'}</span>
                                            </div>
                                        </td>

                                        {/* 基礎營運支出 */}
                                        <td className="p-4 text-right align-top">
                                            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[11px] content-start">
                                                <span className="text-slate-400">攤位: <span className="text-slate-200">${Number(item.stall || 0).toLocaleString()}</span></span>
                                                <span className="text-slate-400">清潔: <span className="text-slate-200">${Number(item.cleaning || 0).toLocaleString()}</span></span>
                                                <span className="text-slate-400">電費: <span className="text-slate-200">${Number(item.electricity || 0).toLocaleString()}</span></span>
                                                <span className="text-slate-400">加油: <span className="text-slate-200">${Number(item.gas || 0).toLocaleString()}</span></span>
                                                <span className="text-slate-400">停車: <span className="text-slate-200">${Number(item.parking || 0).toLocaleString()}</span></span>
                                                <span className="text-slate-400">貨款: <span className="text-slate-200">${Number(item.goods || 0).toLocaleString()}</span></span>
                                                <span className="text-slate-400">袋子: <span className="text-slate-200">${Number(item.bags || 0).toLocaleString()}</span></span>
                                                <span className="text-slate-400">其他: <span className="text-slate-200">${Number(item.others || 0).toLocaleString()}</span></span>
                                            </div>
                                        </td>

                                        {/* 金流與服務費 */}
                                        <td className="p-4 text-right align-top">
                                            <div className="flex flex-col gap-2 items-end">
                                                <div className="flex justify-between w-32 bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/20">
                                                    <span className="text-[10px] text-emerald-400/70">LP 收款</span>
                                                    <span className="text-xs font-bold text-emerald-400">+${Number(item.linePay || 0).toLocaleString()}</span>
                                                </div>
                                                <div className="flex justify-between w-32 bg-rose-500/10 px-2 py-1 rounded border border-rose-500/20">
                                                    <span className="text-[10px] text-rose-400/70">服務費</span>
                                                    <span className="text-xs font-bold text-rose-400">-${Number(item.serviceFee || 0).toLocaleString()}</span>
                                                </div>
                                            </div>
                                        </td>

                                        {/* 車輛與人事 */}
                                        <td className="p-4 text-right align-top">
                                            <div className="flex flex-col gap-1 text-xs items-end">
                                                <span className="text-slate-400">車輛保養: <span className="text-indigo-300 font-bold">${Number(item.vehicleMaintenance || 0).toLocaleString()}</span></span>
                                                <span className="text-slate-400">薪資發放: <span className="text-amber-300 font-bold">${Number(item.salary || 0).toLocaleString()}</span></span>
                                                <span className="text-slate-400">公積金: <span className="text-purple-300 font-bold">${Number(item.reserve || 0).toLocaleString()}</span></span>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr><td colSpan="4" className="p-20 text-center text-slate-500 font-medium">目前的日期區間內沒有支出紀錄</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
