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
        summary.others + summary.vehicleMaintenance + summary.salary + summary.serviceFee;

    const expenseCategories = [
        { key: 'stall', label: '攤位費', color: 'text-blue-600' },
        { key: 'cleaning', label: '清潔費', color: 'text-indigo-600' },
        { key: 'electricity', label: '電費', color: 'text-amber-600' },
        { key: 'gas', label: '加油費', color: 'text-orange-600' },
        { key: 'parking', label: '停車費', color: 'text-slate-600' },
        { key: 'bags', label: '塑膠袋', color: 'text-teal-600' },
        { key: 'serviceFee', label: '服務費', color: 'text-rose-600' },
        { key: 'others', label: '其他支出', color: 'text-purple-600' },
        { key: 'vehicleMaintenance', label: '車輛保養', color: 'text-indigo-600' },
        { key: 'salary', label: '薪資發放', color: 'text-amber-600' }
    ];

    return (
        <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-4 md:space-y-6 flex flex-col h-[calc(100vh-6rem)] animate-in fade-in duration-500 overflow-hidden">
            <div className="flex justify-between items-start gap-4 shrink-0">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <DollarSign className="text-rose-600 shrink-0" />
                        <h1 className="text-2xl font-bold text-slate-800 whitespace-nowrap">成本支出計算</h1>
                    </div>
                    <p className="text-slate-500 text-sm mt-1 pl-8 md:pl-0 truncate">
                        (Cost Calculation) 分析各項經營成本
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-4 gap-2 shrink-0">
                <div className="glass-panel px-1 py-1.5 md:px-4 bg-rose-50 border-rose-200 flex flex-col justify-center items-center">
                    <p className="text-[9px] md:text-[10px] text-slate-500 uppercase font-bold text-center leading-tight">總營運成本</p>
                    <p className="text-xs md:text-xl font-bold text-rose-600 text-center text-nowrap mt-0.5 md:mt-1">${totalOperationalCost.toLocaleString()}</p>
                </div>
                <div className="glass-panel px-1 py-1.5 md:px-4 bg-emerald-50 border-emerald-200 flex flex-col justify-center items-center">
                    <p className="text-[9px] md:text-[10px] text-slate-500 uppercase font-bold text-center leading-tight">貨款</p>
                    <p className="text-xs md:text-xl font-bold text-emerald-700 text-center text-nowrap mt-0.5 md:mt-1">${summary.goods.toLocaleString()}</p>
                </div>
                <div className="glass-panel px-1 py-1.5 md:px-4 bg-teal-50 border-teal-200 flex flex-col justify-center items-center">
                    <p className="text-[9px] md:text-[10px] text-slate-500 uppercase font-bold text-center leading-tight">公積金</p>
                    <p className="text-xs md:text-xl font-bold text-teal-700 text-center text-nowrap mt-0.5 md:mt-1">${summary.reserve.toLocaleString()}</p>
                </div>
                <div className="glass-panel px-1 py-1.5 md:px-4 bg-slate-50 border-slate-200 flex flex-col justify-center items-center">
                    <p className="text-[9px] md:text-[10px] text-slate-500 uppercase font-bold text-center leading-tight">Line Pay</p>
                    <p className="text-xs md:text-xl font-bold text-slate-800 text-center text-nowrap mt-0.5 md:mt-1">${summary.linePay.toLocaleString()}</p>
                </div>
            </div>

            <div className="p-3 shrink-0 grid grid-cols-1 md:grid-cols-3 gap-3 bg-slate-50 rounded-xl border border-slate-200">
                {/* Date Inputs: Grid cols 2 on mobile to take only 1 row height */}
                <div className="grid grid-cols-2 md:flex md:flex-row md:items-center gap-2 w-full">
                    <div className="space-y-1 w-full md:w-auto md:flex-1">
                        <input type="date" className="input-field w-full h-10 appearance-none bg-white text-slate-800 text-xs md:text-sm" value={startDate} onChange={e => setStartDate(e.target.value)} />
                    </div>
                    {/* Hide '至' on mobile completely as inputs are side-by-side or clearly range */}
                    <span className="text-slate-400 font-bold text-center md:text-left self-center hidden md:block">至</span>
                    <div className="space-y-1 w-full md:w-auto md:flex-1">
                        <input type="date" className="input-field w-full h-10 appearance-none bg-white text-slate-800 text-xs md:text-sm" value={endDate} onChange={e => setEndDate(e.target.value)} />
                    </div>
                </div>

                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input type="text" placeholder="搜尋..." className="input-field pl-10 w-full h-10 text-slate-800 bg-white" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                </div>

                <button onClick={fetchData} className="btn-primary w-full md:w-auto h-10 flex items-center justify-center gap-2">
                    <RefreshCw size={18} className={loading ? 'animate-spin' : ''} /> 計算
                </button>
            </div>

            {/* Compact 5-Col Grid for Expenses on Mobile (2 Rows x 5 Cols = 10 items) */}
            <div className="grid grid-cols-5 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-12 gap-2 shrink-0">
                {expenseCategories.map(cat => (
                    <div key={cat.key} className="p-1 md:p-3 bg-white border border-slate-200 rounded-lg shadow-sm flex flex-col justify-center items-center h-14 md:h-20">
                        <p className="text-[9px] md:text-[10px] text-slate-500 font-bold uppercase truncate w-full text-center">{cat.label}</p>
                        <p className={`text-xs md:text-base font-bold ${cat.color} mt-0.5 md:mt-1`}>${summary[cat.key].toLocaleString()}</p>
                    </div>
                ))}
            </div>

            <div className="bg-white rounded-xl shadow-sm p-0 flex-1 border border-slate-200 relative overflow-hidden">
                {/* Desktop Table View */}
                <div className="hidden md:block h-full overflow-auto custom-scrollbar">
                    <table className="w-full text-left text-sm border-separate border-spacing-0 min-w-[1100px]">
                        <thead className="bg-slate-50 text-slate-500 text-xs uppercase sticky top-0 z-30">
                            <tr>
                                <th className="p-4 border-b border-slate-100 sticky left-0 z-40 bg-slate-50">時間/對象/業務</th>
                                <th className="p-4 text-right border-b border-slate-100">基礎營運支出</th>
                                <th className="p-4 text-right border-b border-slate-100">金流與服務費</th>
                                <th className="p-4 text-right border-b border-slate-100">車輛與人事</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {loading ? (
                                <tr><td colSpan="4" className="p-20 text-center text-slate-500 font-medium">
                                    <div className="flex flex-col items-center gap-2">
                                        <RefreshCw className="animate-spin text-rose-500" />
                                        <span>正在讀取支出數據...</span>
                                    </div>
                                </td></tr>
                            ) : filteredData.length > 0 ? (
                                filteredData.map((item, idx) => (
                                    <tr key={idx} className="hover:bg-slate-50 transition-colors group">
                                        <td className="p-4 sticky left-0 z-10 bg-white border-b border-slate-100 group-hover:bg-slate-50 transition-colors">
                                            <div className="flex flex-col gap-1">
                                                <span className="text-slate-500 font-mono text-xs flex items-center gap-1">
                                                    <Clock size={12} className="text-slate-400" />
                                                    {(() => {
                                                        const rawDate = item.date || item.serverTimestamp;
                                                        if (!rawDate) return '無日期';
                                                        const d = new Date(rawDate);
                                                        return isNaN(d.getTime()) ? String(rawDate) : d.toLocaleString('zh-TW', { hour12: false });
                                                    })()}
                                                </span>
                                                <span className="text-sm font-bold text-slate-800">{item.customer || '未知對象'}</span>
                                                <span className="text-xs text-slate-500 font-medium bg-slate-100 self-start px-1.5 py-0.5 rounded">{item.salesRep || '-'}</span>
                                            </div>
                                        </td>

                                        {/* 基礎營運支出 */}
                                        <td className="p-4 text-right align-top">
                                            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[11px] content-start">
                                                <span className="text-slate-500">攤位: <span className="text-slate-700 font-medium">${Number(item.stall || 0).toLocaleString()}</span></span>
                                                <span className="text-slate-500">清潔: <span className="text-slate-700 font-medium">${Number(item.cleaning || 0).toLocaleString()}</span></span>
                                                <span className="text-slate-500">電費: <span className="text-slate-700 font-medium">${Number(item.electricity || 0).toLocaleString()}</span></span>
                                                <span className="text-slate-500">加油: <span className="text-slate-700 font-medium">${Number(item.gas || 0).toLocaleString()}</span></span>
                                                <span className="text-slate-500">停車: <span className="text-slate-700 font-medium">${Number(item.parking || 0).toLocaleString()}</span></span>
                                                <span className="text-slate-500">貨款: <span className="text-slate-700 font-medium">${Number(item.goods || 0).toLocaleString()}</span></span>
                                                <span className="text-slate-500">袋子: <span className="text-slate-700 font-medium">${Number(item.bags || 0).toLocaleString()}</span></span>
                                                <span className="text-slate-500">其他: <span className="text-slate-700 font-medium">${Number(item.others || 0).toLocaleString()}</span></span>
                                            </div>
                                        </td>

                                        {/* 金流與服務費 */}
                                        <td className="p-4 text-right align-top">
                                            <div className="flex flex-col gap-2 items-end">
                                                <div className="flex justify-between w-32 bg-emerald-50 px-2 py-1 rounded border border-emerald-100">
                                                    <span className="text-[10px] text-emerald-600/70 uppercase font-bold">LP 收款</span>
                                                    <span className="text-xs font-bold text-emerald-700">+${Number(item.linePay || 0).toLocaleString()}</span>
                                                </div>
                                                <div className="flex justify-between w-32 bg-rose-50 px-2 py-1 rounded border border-rose-100">
                                                    <span className="text-[10px] text-rose-600/70 uppercase font-bold">服務費</span>
                                                    <span className="text-xs font-bold text-rose-700">-${Number(item.serviceFee || 0).toLocaleString()}</span>
                                                </div>
                                            </div>
                                        </td>

                                        {/* 車輛與人事 */}
                                        <td className="p-4 text-right align-top">
                                            <div className="flex flex-col gap-1 text-xs items-end">
                                                <span className="text-slate-500">車輛保養: <span className="text-indigo-600 font-bold">${Number(item.vehicleMaintenance || 0).toLocaleString()}</span></span>
                                                <span className="text-slate-500">薪資發放: <span className="text-amber-600 font-bold">${Number(item.salary || 0).toLocaleString()}</span></span>
                                                <span className="text-slate-500">公積金: <span className="text-purple-600 font-bold">${Number(item.reserve || 0).toLocaleString()}</span></span>
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

                {/* Mobile Card List View */}
                <div className="md:hidden h-full overflow-y-auto p-3 space-y-3 custom-scrollbar">
                    {loading ? (
                        <div className="p-10 text-center text-slate-500 font-medium flex flex-col items-center gap-2">
                            <RefreshCw className="animate-spin text-rose-500" />
                            <span>正在讀取支出數據...</span>
                        </div>
                    ) : filteredData.length > 0 ? (
                        filteredData.map((item, idx) => (
                            <div key={idx} className="bg-white rounded-xl border border-slate-200 p-3 shadow-sm text-xs space-y-3">
                                {/* Header: Date & Customer */}
                                <div className="flex justify-between items-start border-b border-slate-100 pb-2">
                                    <div className="flex flex-col gap-0.5">
                                        <span className="font-bold text-slate-800 text-sm">{item.customer || '未知對象'}</span>
                                        <span className="text-slate-400 font-mono text-[10px] flex items-center gap-1">
                                            {(() => {
                                                const rawDate = item.date || item.serverTimestamp;
                                                const d = new Date(rawDate);
                                                return isNaN(d.getTime()) ? String(rawDate) : d.toLocaleString('zh-TW', { hour12: false });
                                            })()}
                                        </span>
                                    </div>
                                    <span className="text-[10px] text-slate-500 font-medium bg-slate-100 px-2 py-1 rounded-full">{item.salesRep || '-'}</span>
                                </div>

                                {/* Body: Categories Directly Presented */}
                                <div className="grid grid-cols-2 gap-3">
                                    {/* Left Col: Basic Ops */}
                                    <div className="space-y-1.5">
                                        <p className="text-[10px] text-slate-400 font-bold uppercase">基礎營運</p>
                                        <div className="space-y-0.5 text-slate-500">
                                            <div className="flex justify-between"><span>攤位</span> <span className="font-medium text-slate-700">${Number(item.stall || 0).toLocaleString()}</span></div>
                                            <div className="flex justify-between"><span>清潔</span> <span className="font-medium text-slate-700">${Number(item.cleaning || 0).toLocaleString()}</span></div>
                                            <div className="flex justify-between"><span>電費</span> <span className="font-medium text-slate-700">${Number(item.electricity || 0).toLocaleString()}</span></div>
                                            <div className="flex justify-between"><span>加油</span> <span className="font-medium text-slate-700">${Number(item.gas || 0).toLocaleString()}</span></div>
                                            <div className="flex justify-between"><span>停車</span> <span className="font-medium text-slate-700">${Number(item.parking || 0).toLocaleString()}</span></div>
                                            <div className="flex justify-between"><span>貨款</span> <span className="font-medium text-slate-700">${Number(item.goods || 0).toLocaleString()}</span></div>
                                            <div className="flex justify-between"><span>袋子</span> <span className="font-medium text-slate-700">${Number(item.bags || 0).toLocaleString()}</span></div>
                                            <div className="flex justify-between"><span>其他</span> <span className="font-medium text-slate-700">${Number(item.others || 0).toLocaleString()}</span></div>
                                        </div>
                                    </div>

                                    {/* Right Col: Cash & Personnel */}
                                    <div className="space-y-3">
                                        <div className="space-y-1.5">
                                            <p className="text-[10px] text-slate-400 font-bold uppercase">金流服務</p>
                                            <div className="space-y-1">
                                                <div className="flex justify-between items-center text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
                                                    <span>LP</span> <span className="font-bold">+${Number(item.linePay || 0).toLocaleString()}</span>
                                                </div>
                                                <div className="flex justify-between items-center text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded">
                                                    <span>服務</span> <span className="font-bold">-${Number(item.serviceFee || 0).toLocaleString()}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="space-y-1.5">
                                            <p className="text-[10px] text-slate-400 font-bold uppercase">人事車輛</p>
                                            <div className="space-y-0.5 text-slate-500">
                                                <div className="flex justify-between"><span className="text-indigo-600">保養</span> <span className="font-bold text-indigo-600">${Number(item.vehicleMaintenance || 0).toLocaleString()}</span></div>
                                                <div className="flex justify-between"><span className="text-amber-600">薪資</span> <span className="font-bold text-amber-600">${Number(item.salary || 0).toLocaleString()}</span></div>
                                                <div className="flex justify-between"><span className="text-purple-600">公積</span> <span className="font-bold text-purple-600">${Number(item.reserve || 0).toLocaleString()}</span></div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="p-10 text-center text-slate-500 font-medium">區間內無紀錄</div>
                    )}
                </div>
            </div>
        </div>
    );
}
