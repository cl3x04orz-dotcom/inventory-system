import React, { useState, useEffect, useMemo } from 'react';
import { Users, TrendingUp, TrendingDown, Package, DollarSign, Activity, Search, ArrowUpRight, ArrowDownRight, RefreshCw, Calendar, Heart, AlertCircle } from 'lucide-react';
import { callGAS } from '../utils/api';
import { getLocalDateString } from '../utils/constants';

export default function CustomerAnalyticsPage({ user, apiUrl }) {
    const [customers, setCustomers] = useState([]);
    const [selectedCustomer, setSelectedCustomer] = useState('');
    const [mode, setMode] = useState('monthly'); // 'daily' | 'weekly' | 'monthly'

    // Monthly States
    const [baseMonth, setBaseMonth] = useState(() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    });
    const [compareMonth, setCompareMonth] = useState(() => {
        const d = new Date();
        d.setMonth(d.getMonth() - 1);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    });

    // Weekly/Daily States
    const [baseDate, setBaseDate] = useState(getLocalDateString(new Date()));
    const [compareDate, setCompareDate] = useState(() => {
        const d = new Date();
        d.setDate(d.getDate() - 7);
        return getLocalDateString(d);
    });

    const [loading, setLoading] = useState(false);
    const [data, setData] = useState(null);
    const [sortBy, setSortBy] = useState('order');

    // Generate month options
    const monthOptions = (() => {
        const options = [];
        const d = new Date();
        for (let i = 0; i < 36; i++) {
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            options.push(`${y}-${m}`);
            d.setMonth(d.getMonth() - 1);
        }
        return options;
    })();

    // Initial load: Get customer list
    useEffect(() => {
        const loadCustomers = async () => {
            try {
                const end = new Date();
                const start = new Date();
                start.setMonth(start.getMonth() - 12);
                const res = await callGAS(apiUrl, 'getCustomerRanking', {
                    startDate: getLocalDateString(start),
                    endDate: getLocalDateString(end)
                }, user.token);
                if (Array.isArray(res)) {
                    const names = res.map(c => c.customerName).filter(Boolean);
                    setCustomers(names);
                    if (names.length > 0 && !selectedCustomer) setSelectedCustomer(names[0]);
                }
            } catch (err) {
                console.error('Failed to load customers:', err);
            }
        };
        if (user?.token) loadCustomers();
    }, [apiUrl, user.token]);

    const getWeekRange = (dateStr) => {
        const d = new Date(dateStr);
        const day = d.getDay() || 7; // 1-7
        const monday = new Date(d);
        monday.setDate(d.getDate() - day + 1);
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        return { start: getLocalDateString(monday), end: getLocalDateString(sunday) };
    };

    const fetchData = async () => {
        if (!selectedCustomer) return;
        setLoading(true);

        let payload = { customer: selectedCustomer, mode };

        if (mode === 'monthly') {
            const [bY, bM] = baseMonth.split('-').map(Number);
            payload.baseStart = getLocalDateString(new Date(bY, bM - 1, 1));
            payload.baseEnd = getLocalDateString(new Date(bY, bM, 0));

            const [cY, cM] = compareMonth.split('-').map(Number);
            payload.compStart = getLocalDateString(new Date(cY, cM - 1, 1));
            payload.compEnd = getLocalDateString(new Date(cY, cM, 0));
        } else if (mode === 'daily') {
            payload.baseStart = baseDate;
            payload.baseEnd = baseDate;
            payload.compStart = compareDate;
            payload.compEnd = compareDate;
        } else {
            const bRange = getWeekRange(baseDate);
            const cRange = getWeekRange(compareDate);
            payload.baseStart = bRange.start;
            payload.baseEnd = bRange.end;
            payload.compStart = cRange.start;
            payload.compEnd = cRange.end;
        }

        try {
            const res = await callGAS(apiUrl, 'getCustomerAnalytics', payload, user.token);
            if (res && res.error) {
                alert(`分析失敗: ${res.error}`);
            } else {
                setData(res);
            }
        } catch (err) {
            console.error('Failed to fetch analytics:', err);
            alert(`連線分析失敗: ${err.message || '未知錯誤'}`);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (selectedCustomer) fetchData();
    }, [selectedCustomer, baseMonth, compareMonth, baseDate, compareDate, mode]);

    const sortedTrends = useMemo(() => {
        if (!data?.productTrends) return [];
        return [...data.productTrends].sort((a, b) => {
            if (sortBy === 'diff') return b.diffQty - a.diffQty;
            return a.order - b.order;
        });
    }, [data, sortBy]);

    const HealthBadge = ({ recencyDays }) => {
        if (recencyDays === -1) return null;
        let status = { label: '未進貨', color: 'bg-slate-100 text-slate-500', icon: AlertCircle };
        if (recencyDays <= 3) status = { label: '熱絡', color: 'bg-emerald-100 text-emerald-600', icon: Heart };
        else if (recencyDays <= 7) status = { label: '穩定', color: 'bg-blue-100 text-blue-600', icon: Activity };
        else if (recencyDays <= 14) status = { label: '轉冷', color: 'bg-amber-100 text-amber-600', icon: AlertCircle };
        else status = { label: '流失預警', color: 'bg-rose-100 text-rose-600', icon: AlertCircle };

        const Icon = status.icon;
        return (
            <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${status.color} border border-current opacity-90`}>
                <Icon size={14} /> {status.label} ({recencyDays}天待進貨)
            </div>
        );
    };

    const KPICard = ({ title, current, previous, growth, type = 'currency' }) => {
        const isPositive = growth > 0;
        const isNeutral = growth === 0;

        return (
            <div className="bg-[var(--bg-secondary)] p-5 rounded-xl border border-[var(--border-primary)] shadow-sm hover:shadow-md transition-all">
                <div className="flex justify-between items-start mb-3">
                    <div className="p-2 bg-[var(--bg-tertiary)] rounded-lg text-[var(--text-secondary)]">
                        {type === 'currency' ? <DollarSign size={18} /> : <Activity size={18} />}
                    </div>
                    {!isNeutral && (
                        <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${isPositive ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                            {isPositive ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
                            {Math.abs(growth).toFixed(1)}%
                        </div>
                    )}
                </div>
                <h4 className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-1">{title}</h4>
                <div className="flex flex-col">
                    <span className="text-2xl font-bold text-[var(--text-primary)]">
                        {type === 'currency' ? `$${(current || 0).toLocaleString()}` : (current || 0).toLocaleString()}
                    </span>
                    <span className="text-[10px] text-[var(--text-tertiary)] font-bold mt-1">
                        前期: {type === 'currency' ? `$${(previous || 0).toLocaleString()}` : (previous || 0).toLocaleString()}
                    </span>
                </div>
            </div>
        );
    };

    return (
        <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6 flex flex-col min-h-[calc(10vh-6rem)] pb-10">
            {/* Header section */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-[var(--text-primary)] flex items-center gap-2">
                        <Users className="text-blue-600" /> 客戶分析 Pro
                    </h1>
                    <p className="text-[var(--text-secondary)] text-sm mt-1">支援單日/週/月彈性比較與客戶健康預警系統</p>
                </div>
                {data && <HealthBadge recencyDays={data.recencyDays} />}
            </div>

            {/* Filter bar */}
            <div className="bg-[var(--bg-secondary)] p-4 rounded-xl border border-[var(--border-primary)] shadow-sm flex flex-col gap-4">
                <div className="flex flex-wrap items-center gap-4">
                    <div className="flex-1 min-w-[300px]">
                        <label className="text-xs font-bold text-[var(--text-tertiary)] uppercase ml-1 block mb-1">分析對象</label>
                        <select
                            className="input-field px-4 w-full bg-[var(--bg-tertiary)] text-sm font-bold cursor-pointer"
                            value={selectedCustomer}
                            onChange={(e) => setSelectedCustomer(e.target.value)}
                        >
                            <option value="">選擇銷售對象...</option>
                            {customers.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </div>

                    <div>
                        <label className="text-xs font-bold text-[var(--text-tertiary)] uppercase ml-1 block mb-1">分析維度</label>
                        <div className="flex items-center gap-1 p-1 bg-[var(--bg-tertiary)] rounded-lg border border-[var(--border-primary)]">
                            <button
                                onClick={() => setMode('daily')}
                                className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-2 ${mode === 'daily' ? 'bg-[var(--bg-secondary)] text-blue-600 shadow-sm' : 'text-[var(--text-tertiary)]'}`}
                            >
                                <Calendar size={14} /> 單日
                            </button>
                            <button
                                onClick={() => setMode('weekly')}
                                className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-2 ${mode === 'weekly' ? 'bg-[var(--bg-secondary)] text-blue-600 shadow-sm' : 'text-[var(--text-tertiary)]'}`}
                            >
                                <Calendar size={14} /> 週度
                            </button>
                            <button
                                onClick={() => setMode('monthly')}
                                className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-2 ${mode === 'monthly' ? 'bg-[var(--bg-secondary)] text-blue-600 shadow-sm' : 'text-[var(--text-tertiary)]'}`}
                            >
                                <Activity size={14} /> 月度
                            </button>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-[var(--border-primary)] pt-4">
                    {mode === 'monthly' ? (
                        <>
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-[var(--text-tertiary)] uppercase text-center block">基準月份 (Base)</label>
                                <select
                                    className="input-field w-full text-sm font-bold bg-[var(--bg-tertiary)] cursor-pointer"
                                    value={baseMonth}
                                    onChange={(e) => setBaseMonth(e.target.value)}
                                >
                                    {monthOptions.map(m => <option key={m} value={m}>{m}</option>)}
                                </select>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-[var(--text-tertiary)] uppercase text-center block">對比月份 (Compare)</label>
                                <select
                                    className="input-field w-full text-sm font-bold bg-[var(--bg-tertiary)] cursor-pointer"
                                    value={compareMonth}
                                    onChange={(e) => setCompareMonth(e.target.value)}
                                >
                                    {monthOptions.map(m => <option key={m} value={m}>{m}</option>)}
                                </select>
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="space-y-1.5 flex flex-col">
                                <label className="text-xs font-bold text-[var(--text-tertiary)] uppercase text-center block">
                                    {mode === 'daily' ? '基準日期 (Base)' : '基準日期 (所在週)'}
                                </label>
                                <input
                                    type="date"
                                    className="input-field w-full text-sm font-bold bg-[var(--bg-tertiary)]"
                                    value={baseDate}
                                    onChange={(e) => setBaseDate(e.target.value)}
                                />
                                {mode === 'weekly' && (
                                    <div className="text-[10px] text-blue-500 font-bold text-center mt-1 bg-blue-50/50 py-1 rounded">
                                        包含範圍：{getWeekRange(baseDate).start} ~ {getWeekRange(baseDate).end}
                                    </div>
                                )}
                            </div>
                            <div className="space-y-1.5 flex flex-col">
                                <label className="text-xs font-bold text-[var(--text-tertiary)] uppercase text-center block">
                                    {mode === 'daily' ? '對比日期 (Compare)' : '對比日期 (所在週)'}
                                </label>
                                <input
                                    type="date"
                                    className="input-field w-full text-sm font-bold bg-[var(--bg-tertiary)]"
                                    value={compareDate}
                                    onChange={(e) => setCompareDate(e.target.value)}
                                />
                                {mode === 'weekly' && (
                                    <div className="text-[10px] text-blue-500 font-bold text-center mt-1 bg-blue-50/50 py-1 rounded">
                                        包含範圍：{getWeekRange(compareDate).start} ~ {getWeekRange(compareDate).end}
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>

            {loading ? (
                <div className="flex-1 flex flex-col items-center justify-center p-20 text-[var(--text-tertiary)] gap-4">
                    <RefreshCw size={40} className="animate-spin opacity-20" />
                    <p className="font-bold text-xs uppercase tracking-widest animate-pulse">分析數據中...</p>
                </div>
            ) : data ? (
                <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <KPICard
                            title="區域採購額 / Revenue"
                            current={data.kpi.revenue.current}
                            previous={data.kpi.revenue.previous}
                            growth={data.kpi.revenue.growth}
                        />
                        <KPICard
                            title="採購次數 / Frequency"
                            current={data.kpi.transactions.current}
                            previous={data.kpi.transactions.previous}
                            growth={data.kpi.transactions.growth}
                            type="count"
                        />
                        <KPICard
                            title="退貨數據 / Returns"
                            current={data.kpi.returns.current}
                            previous={data.kpi.returns.previous}
                            growth={data.kpi.returns.diff === 0 ? 0 : (data.kpi.returns.diff > 0 ? -1 : 1)}
                            type="count"
                        />
                    </div>

                    <div className="bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-primary)] overflow-hidden shadow-sm flex flex-col">
                        <div className="p-5 border-b border-[var(--border-primary)] flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-[var(--bg-tertiary)]/50">
                            <div>
                                <h3 className="font-bold text-[var(--text-primary)]">
                                    {mode === 'weekly' ? '週度' : mode === 'daily' ? '單日' : '月度'} 商品消長排行
                                </h3>
                                <p className="text-[10px] text-[var(--text-tertiary)] font-bold uppercase italic mt-0.5">對比商品銷量變化量</p>
                            </div>

                            <div className="flex flex-wrap items-center gap-3">
                                <div className="flex items-center gap-1.5 p-1 bg-[var(--bg-tertiary)] rounded-lg border border-[var(--border-primary)]">
                                    <button
                                        onClick={() => setSortBy('diff')}
                                        className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all ${sortBy === 'diff' ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'}`}
                                    >
                                        按變化量
                                    </button>
                                    <button
                                        onClick={() => setSortBy('order')}
                                        className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all ${sortBy === 'order' ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'}`}
                                    >
                                        按權重
                                    </button>
                                </div>
                                <div className="h-4 w-[1px] bg-[var(--border-primary)] hidden sm:block" />
                                <div className="flex gap-2 text-[var(--text-primary)]">
                                    <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-600 rounded-full text-[10px] font-bold">
                                        <TrendingUp size={12} /> 成長
                                    </div>
                                    <div className="flex items-center gap-1.5 px-3 py-1 bg-rose-50 text-rose-600 rounded-full text-[10px] font-bold">
                                        <TrendingDown size={12} /> 退步
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-[var(--bg-tertiary)]/30 text-[var(--text-tertiary)] text-[11px] font-bold uppercase border-b border-[var(--border-primary)]">
                                    <tr>
                                        <th className="p-4 pl-6">商品名稱</th>
                                        <th className="p-4 text-center">前期 銷量</th>
                                        <th className="p-4 text-center font-bold text-[var(--text-primary)]">本期 銷量</th>
                                        <th className="p-4 text-right pr-6">變化</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[var(--border-primary)]">
                                    {sortedTrends.length > 0 ? sortedTrends.map((p, idx) => (
                                        <tr key={idx} className="hover:bg-[var(--bg-hover)] transition-colors group">
                                            <td className="p-4 pl-6">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-lg bg-[var(--bg-tertiary)] flex items-center justify-center text-[var(--text-secondary)]">
                                                        <Package size={16} />
                                                    </div>
                                                    <span className="font-bold text-[var(--text-primary)]">{p.pName}</span>
                                                </div>
                                            </td>
                                            <td className="p-4 text-center font-mono text-[var(--text-secondary)]">{p.compQty}</td>
                                            <td className="p-4 text-center font-mono font-bold text-[var(--text-primary)]">{p.baseQty}</td>
                                            <td className="p-4 text-right pr-6">
                                                <div className={`flex flex-col items-end ${p.diffQty > 0 ? 'text-emerald-500' : (p.diffQty < 0 ? 'text-rose-500' : 'text-[var(--text-tertiary)]')}`}>
                                                    <div className="flex items-center gap-1 font-bold font-mono">
                                                        {p.diffQty > 0 ? <TrendingUp size={14} /> : (p.diffQty < 0 ? <TrendingDown size={14} /> : null)}
                                                        {p.diffQty > 0 ? `+${p.diffQty}` : p.diffQty}
                                                    </div>
                                                    <span className="text-[10px] font-bold opacity-70">
                                                        {p.diffPercent !== 0 ? `${p.diffPercent.toFixed(1)}%` : '-'}
                                                    </span>
                                                </div>
                                            </td>
                                        </tr>
                                    )) : (
                                        <tr><td colSpan="4" className="p-20 text-center text-[var(--text-tertiary)] font-bold">查無交易數據</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="flex-1 bg-[var(--bg-tertiary)]/30 border-2 border-dashed border-[var(--border-primary)] rounded-xl flex flex-col items-center justify-center p-20 text-[var(--text-tertiary)] gap-4">
                    <Search size={48} className="opacity-20" />
                    <p className="font-bold text-sm tracking-widest uppercase">請選擇左上方銷售對象以開始分析</p>
                </div>
            )}
        </div>
    );
}
