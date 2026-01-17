import React, { useState, useEffect } from 'react';
import { PieChart, TrendingUp, TrendingDown, DollarSign, Calendar, RefreshCw, MinusCircle } from 'lucide-react';
import { callGAS } from '../utils/api';
import { getLocalDateString } from '../utils/constants';

export default function IncomeStatementPage({ user, apiUrl }) {
    const [loading, setLoading] = useState(false);
    const [startDate, setStartDate] = useState(getLocalDateString().substring(0, 8) + '01'); // Default to first day of month
    const [endDate, setEndDate] = useState(getLocalDateString());
    const [data, setData] = useState({
        revenue: 0,
        cogs: 0,
        grossProfit: 0,
        expenses: {},
        totalExpenses: 0,
        netIncome: 0
    });

    const fetchData = async () => {
        setLoading(true);
        try {
            const [salesData, expenseData] = await Promise.all([
                callGAS(apiUrl, 'getProfitAnalysis', { startDate, endDate }, user.token),
                callGAS(apiUrl, 'getExpenditures', { startDate, endDate }, user.token)
            ]);

            // Calculate Revenue & COGS
            let revenue = 0;
            let cogs = 0;
            if (Array.isArray(salesData)) {
                salesData.forEach(item => {
                    revenue += Number(item.revenue || 0);
                    cogs += Number(item.cost || 0);
                });
            }

            // Calculate Expenses
            let totalExpenses = 0;
            const expenseCats = {
                stall: 0, cleaning: 0, electricity: 0, gas: 0, parking: 0,
                bags: 0, serviceFee: 0, others: 0, vehicleMaintenance: 0, salary: 0
            };

            if (Array.isArray(expenseData)) {
                expenseData.forEach(item => {
                    expenseCats.stall += Number(item.stall || 0);
                    expenseCats.cleaning += Number(item.cleaning || 0);
                    expenseCats.electricity += Number(item.electricity || 0);
                    expenseCats.gas += Number(item.gas || 0);
                    expenseCats.parking += Number(item.parking || 0);
                    expenseCats.bags += Number(item.bags || 0);
                    expenseCats.serviceFee += Number(item.serviceFee || 0);
                    expenseCats.others += Number(item.others || 0);
                    expenseCats.vehicleMaintenance += Number(item.vehicleMaintenance || 0);
                    expenseCats.salary += Number(item.salary || 0);
                });
            }

            Object.values(expenseCats).forEach(val => totalExpenses += val);

            setData({
                revenue,
                cogs,
                grossProfit: revenue - cogs,
                expenses: expenseCats,
                totalExpenses,
                netIncome: (revenue - cogs) - totalExpenses
            });

        } catch (error) {
            console.error('Failed to fetch income statement data:', error);
            alert('載入失敗');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (user?.token) fetchData();
    }, [user.token, apiUrl]);

    const formatCurrency = (val) => `$${Math.round(val).toLocaleString()}`;
    const getPercent = (val, total) => total === 0 ? '0%' : `${((val / total) * 100).toFixed(1)}%`;

    return (
        <div className="max-w-4xl mx-auto p-2 md:p-6 space-y-2 md:space-y-6 flex flex-col h-[calc(100dvh-6rem)] overflow-hidden">
            <div className="flex justify-between items-center shrink-0 gap-2">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <PieChart className="text-emerald-600 shrink-0 w-5 h-5 md:w-6 md:h-6" />
                        <h1 className="text-lg md:text-2xl font-bold text-slate-800 whitespace-nowrap">損益表</h1>
                    </div>
                    <div className="hidden md:block">
                        <div className="text-slate-400 text-sm font-medium mt-0.5 inline ml-2">
                            (Income Statement)
                        </div>
                        <p className="text-slate-500 text-sm mt-1 truncate">
                            檢視指定期間的營收、成本、費用與淨利
                        </p>
                    </div>
                </div>
                <button onClick={fetchData} className="btn-secondary p-1.5 md:p-2 rounded-lg md:rounded-xl shrink-0">
                    <RefreshCw size={16} className={`md:w-5 md:h-5 ${loading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            <div className="bg-slate-50 p-2 md:p-4 rounded-xl border border-slate-200 shrink-0 flex flex-col md:flex-row md:items-center gap-2 md:gap-4 shadow-sm">
                <div className="hidden md:block">
                    <Calendar size={18} className="text-slate-400" />
                </div>

                <div className="grid grid-cols-2 md:flex md:flex-row md:items-center gap-2 flex-1 w-full">
                    <div className="w-full md:w-auto md:flex-1">
                        <input
                            type="date"
                            className="input-field w-full h-8 md:h-10 appearance-none bg-white text-xs md:text-sm"
                            value={startDate}
                            onChange={e => setStartDate(e.target.value)}
                        />
                    </div>

                    <span className="text-slate-500 font-bold text-center md:text-left self-center hidden md:block">至</span>

                    <div className="w-full md:w-auto md:flex-1">
                        <input
                            type="date"
                            className="input-field w-full h-8 md:h-10 appearance-none bg-white text-xs md:text-sm"
                            value={endDate}
                            onChange={e => setEndDate(e.target.value)}
                        />
                    </div>
                </div>

                <button onClick={fetchData} className="btn-primary h-8 md:h-10 px-6 w-full md:w-auto text-xs md:text-sm">查詢</button>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden flex-1 flex flex-col shadow-sm min-h-0">
                <div className="flex-1 p-3 md:p-8">
                    <div className="space-y-4 md:space-y-6 max-w-2xl mx-auto font-mono text-sm md:text-base">
                        {/* Revenue Section */}
                        <div className="space-y-1 md:space-y-2">
                            <h3 className="text-emerald-700 font-bold text-base md:text-lg border-b border-emerald-200 pb-1 md:pb-2 mb-2 md:mb-4">營業收入 (Revenue)</h3>
                            <div className="flex justify-between items-center text-xs md:text-base">
                                <span className="text-slate-600">銷貨收入</span>
                                <span className="text-slate-900 font-bold">{formatCurrency(data.revenue)}</span>
                            </div>
                            <div className="flex justify-between items-center text-rose-600 text-xs md:text-base">
                                <span className="flex items-center gap-2"><MinusCircle size={12} className="md:w-3.5 md:h-3.5" /> 銷貨成本</span>
                                <span>- {formatCurrency(data.cogs)}</span>
                            </div>
                            <div className="flex justify-between items-center pt-1 md:pt-2 border-t border-slate-100 text-xs md:text-base">
                                <span className="text-emerald-700 font-bold">營業毛利 (Gross Profit)</span>
                                <span className="text-emerald-700 font-bold">{formatCurrency(data.grossProfit)}</span>
                            </div>
                            <div className="text-right text-[10px] md:text-xs text-slate-500">
                                毛利率: {getPercent(data.grossProfit, data.revenue)}
                            </div>
                        </div>

                        {/* Expenses Section */}
                        <div className="space-y-1 md:space-y-2 mt-2 md:mt-8">
                            <h3 className="text-orange-700 font-bold text-base md:text-lg border-b border-orange-200 pb-1 md:pb-2 mb-2 md:mb-4 whitespace-nowrap">營業費用 (Operating Expenses)</h3>

                            <div className="grid grid-cols-3 md:grid-cols-1 gap-2 md:gap-0">
                                {Object.entries(data.expenses).map(([key, val]) => {
                                    const labels = {
                                        stall: '攤位費', cleaning: '清潔費', electricity: '電費', gas: '加油費',
                                        parking: '停車費', bags: '塑膠袋', serviceFee: '服務費', others: '其他',
                                        vehicleMaintenance: '維修', salary: '薪資'
                                    };
                                    if (val === 0) return null;
                                    return (
                                        <div key={key} className="flex flex-col md:flex-row justify-center md:justify-between items-center md:items-center text-slate-500 text-[10px] md:text-sm bg-slate-50 md:bg-transparent p-1 md:p-0 rounded md:rounded-none">
                                            <span className="font-medium">{labels[key]}</span>
                                            <span className="text-slate-700 font-bold md:font-normal">{formatCurrency(val)}</span>
                                        </div>
                                    );
                                })}
                            </div>

                            <div className="flex justify-between items-center pt-1 md:pt-2 border-t border-slate-100 text-orange-700 mt-1 text-xs md:text-base">
                                <span className="font-bold">費用總計</span>
                                <span className="font-bold">- {formatCurrency(data.totalExpenses)}</span>
                            </div>
                        </div>

                        {/* Net Income Section */}
                        <div className="mt-2 md:mt-8 pt-2 md:pt-4 border-t-2 border-slate-200">
                            <div className="flex justify-between items-center text-base md:text-xl">
                                <span className="text-slate-800 font-bold">本期淨利 (Net Income)</span>
                                <span className={`font-bold ${data.netIncome >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                                    {formatCurrency(data.netIncome)}
                                </span>
                            </div>
                            <div className="text-right text-[10px] md:text-sm text-slate-500 mt-0.5 md:mt-1">
                                淨利率: {getPercent(data.netIncome, data.revenue)}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
