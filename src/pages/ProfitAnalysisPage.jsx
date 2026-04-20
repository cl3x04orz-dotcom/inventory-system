import React, { useState, useEffect } from 'react';
import { TrendingUp, Search, Calendar, RefreshCw, AlertTriangle, ChevronUp, ChevronDown, Award } from 'lucide-react';
import { callGAS } from '../utils/api';
import { getLocalDateString } from '../utils/constants';

export default function ProfitAnalysisPage({ user, apiUrl }) {
    const [data, setData] = useState([]);
    const [productMap, setProductMap] = useState({});
    const [loading, setLoading] = useState(false);
    const [startDate, setStartDate] = useState(getLocalDateString());
    const [endDate, setEndDate] = useState(getLocalDateString());
    const [searchTerm, setSearchTerm] = useState('');
    const [customerFilter, setCustomerFilter] = useState('');
    const [customersList, setCustomersList] = useState([]);
    const [customerStats, setCustomerStats] = useState(null);
    const [sortConfig, setSortConfig] = useState({ key: 'profit', direction: 'desc' });
    const [category, setCategory] = useState('全部'); // 全部, 市場, 批發

    const fetchData = async () => {
        setLoading(true);
        try {
            const products = await callGAS(apiUrl, 'getProducts', {}, user.token);
            const pMap = {};
            if (Array.isArray(products)) {
                products.forEach(p => { pMap[p.id] = p.name; });
                setProductMap(pMap);
            }

            const response = await callGAS(apiUrl, 'getProfitAnalysis', { startDate, endDate, customer: customerFilter, category }, user.token);
            if (Array.isArray(response)) {
                setData(response);
                setCustomerStats(null);
            } else if (response && response.products) {
                setData(response.products);
                setCustomerStats(response.customerStats);
            } else {
                setData([]);
                setCustomerStats(null);
            }
        } catch (error) {
            console.error('Failed to fetch profit analysis:', error);
            alert('無法獲取毛利分析資料');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (user?.token) {
            fetchData();
        }
    }, [user.token, apiUrl, startDate, endDate, category, customerFilter]);

    useEffect(() => {
        if (user?.token) {
            callGAS(apiUrl, 'getCustomersList', {}, user.token)
                .then(res => { if (Array.isArray(res)) setCustomersList(res); })
                .catch(err => console.error("Failed to fetch customers list:", err));
        }
    }, [user.token, apiUrl]);

    const filteredData = data.filter(item => {
        const displayName = productMap[item.productName] || item.productName;
        return String(displayName || '').toLowerCase().includes(searchTerm.toLowerCase());
    });

    const getSortedData = (dataToSort) => {
        return [...dataToSort].sort((a, b) => {
            let aVal, bVal;
            if (sortConfig.key === 'profit') {
                aVal = a.revenue - a.cost;
                bVal = b.revenue - b.cost;
            } else if (sortConfig.key === 'margin') {
                aVal = a.revenue > 0 ? (a.revenue - a.cost) / a.revenue : 0;
                bVal = b.revenue > 0 ? (b.revenue - b.cost) / b.revenue : 0;
            } else if (sortConfig.key === 'name') {
                aVal = productMap[a.productName] || a.productName;
                bVal = productMap[b.productName] || b.productName;
            } else {
                aVal = a[sortConfig.key];
                bVal = b[sortConfig.key];
            }
            if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    };

    const handleSort = (key) => {
        setSortConfig(prev => ({
            key,
            direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc'
        }));
    };

    const SortIcon = ({ columnKey }) => {
        if (sortConfig.key !== columnKey) return <ChevronDown size={14} className="inline opacity-20" />;
        return sortConfig.direction === 'asc' ? <ChevronUp size={14} className="inline text-emerald-500" /> : <ChevronDown size={14} className="inline text-emerald-500" />;
    };

    const displayedData = getSortedData(filteredData);
    const totalRevenue = displayedData.reduce((sum, i) => sum + i.revenue, 0);
    const totalCost = displayedData.reduce((sum, i) => sum + i.cost, 0);
    const totalProfit = totalRevenue - totalCost;
    const avgMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

    return (
        <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-4 md:space-y-6 flex flex-col min-h-[calc(100vh-6rem)]">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shrink-0">
                <div>
                    <h1 className="text-2xl font-bold text-[var(--text-primary)] flex items-center gap-2">
                        <TrendingUp className="text-emerald-600" /> 毛利分析報表
                    </h1>
                    <p className="text-[var(--text-secondary)] text-sm mt-1">針對指定期間內各商品的銷售額、成本與毛利結構</p>
                </div>
                <div className="flex gap-2 md:gap-4">
                    <div className="bg-emerald-50/10 px-3 py-1.5 md:px-4 md:py-2 border border-emerald-200/20 rounded-xl shadow-sm flex-1">
                        <p className="text-[8px] md:text-[10px] text-[var(--text-secondary)] uppercase font-bold text-center">總毛利</p>
                        <p className="text-sm md:text-xl font-bold text-emerald-600 text-center">${totalProfit.toLocaleString()}</p>
                    </div>
                    <div className="bg-blue-50/10 px-3 py-1.5 md:px-4 md:py-2 border border-blue-200/20 rounded-xl shadow-sm flex-1">
                        <p className="text-[8px] md:text-[10px] text-[var(--text-secondary)] uppercase font-bold text-center">平均毛利率</p>
                        <p className="text-sm md:text-xl font-bold text-blue-600 text-center">{avgMargin.toFixed(1)}%</p>
                    </div>
                </div>
            </div>

            <div className="bg-[var(--bg-secondary)] p-4 rounded-xl border border-[var(--border-primary)] shrink-0 flex flex-col xl:flex-row gap-4 shadow-sm">
                <div className="flex flex-wrap items-center gap-3 xl:flex-nowrap">
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                        <input type="date" className="input-field flex-1 sm:w-[140px] text-sm bg-[var(--bg-tertiary)]" value={startDate} onChange={e => setStartDate(e.target.value)} />
                        <span className="text-[var(--text-secondary)] font-bold hidden sm:inline">至</span>
                        <input type="date" className="input-field flex-1 sm:w-[140px] text-sm bg-[var(--bg-tertiary)]" value={endDate} onChange={e => setEndDate(e.target.value)} />
                    </div>
                    
                    <div className="flex-1 w-full sm:w-auto sm:min-w-[180px]">
                        <input 
                            type="text" 
                            list="customer-suggestions"
                            placeholder="輸入客戶名稱以篩選客製毛利..." 
                            className="input-field w-full text-sm bg-[var(--bg-tertiary)]" 
                            value={customerFilter} 
                            onChange={e => setCustomerFilter(e.target.value)} 
                            onKeyDown={e => { if(e.key === 'Enter') fetchData(); }}
                        />
                        <datalist id="customer-suggestions">
                            {customersList.map(c => <option key={c} value={c} />)}
                        </datalist>
                    </div>

                    <button 
                        onClick={fetchData} 
                        className="btn-primary w-full sm:w-auto px-6 py-2 flex items-center justify-center gap-2 whitespace-nowrap text-sm"
                        disabled={loading}
                    >
                        <Search size={16} /> 查詢分析
                    </button>
                </div>
                
                <div className="relative w-full xl:w-[250px] xl:ml-auto">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" size={16} />
                    <input type="text" placeholder="在下方結果中搜尋產品..." className="input-field pl-9 w-full text-sm bg-[var(--bg-tertiary)]" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                </div>
            </div>

            {/* 權限控制：只有老闆可以切換類別 */}
            {user.role === 'BOSS' && (
                <div className="bg-[var(--bg-secondary)] p-2 rounded-xl border border-[var(--border-primary)] shadow-sm flex items-center gap-3">
                    <span className="text-xs font-bold text-[var(--text-secondary)] whitespace-nowrap ml-2">數據類別分流:</span>
                    <div className="flex gap-2 flex-1 md:flex-initial md:w-72">
                        {['全部', '市場', '批發'].map(cat => (
                            <button
                                key={cat}
                                onClick={() => setCategory(cat)}
                                className={`flex-1 py-1.5 px-3 rounded-md text-xs font-bold transition-all ${
                                    category === cat 
                                    ? 'bg-emerald-600 text-white shadow-sm' 
                                    : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                                }`}
                            >
                                {cat}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* 客製化 KPI 與圖表區塊 */}
            {customerStats && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 shrink-0">
                    <div className="lg:col-span-1 bg-indigo-50/40 p-4 rounded-xl border border-indigo-100/50 shadow-sm flex flex-col justify-center">
                        <h3 className="text-sm font-bold text-indigo-800 flex items-center gap-2 mb-4">
                            <Award size={18} className="text-indigo-500" />
                            專屬客戶指標 - {customerFilter}
                        </h3>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <p className="text-[10px] md:text-xs text-slate-500 font-bold uppercase mb-1">總交易次數</p>
                                <p className="text-lg font-bold text-indigo-900">{customerStats.visitCount} <span className="text-sm font-normal text-slate-500">次</span></p>
                            </div>
                            <div>
                                <p className="text-[10px] md:text-xs text-slate-500 font-bold uppercase mb-1">累積消費總額</p>
                                <p className="text-lg font-bold text-indigo-900">${Math.round(customerStats.totalOrderValue).toLocaleString()}</p>
                            </div>
                            <div>
                                <p className="text-[10px] md:text-xs text-slate-500 font-bold uppercase mb-1">平均客單價</p>
                                <p className="text-lg font-bold text-indigo-900">${customerStats.visitCount > 0 ? Math.round(customerStats.totalOrderValue / customerStats.visitCount).toLocaleString() : 0}</p>
                            </div>
                            <div>
                                <p className="text-[10px] md:text-xs text-slate-500 font-bold uppercase mb-1">期內最後交易日</p>
                                <p className="text-sm font-bold text-indigo-900 mt-1">{customerStats.lastVisitDate || '無'}</p>
                            </div>
                        </div>
                    </div>

                    <div className="lg:col-span-2 bg-[var(--bg-secondary)] p-4 rounded-xl border border-[var(--border-primary)] shadow-sm">
                        <h3 className="text-sm font-bold text-[var(--text-primary)] mb-4">Top 3 毛利貢獻商品</h3>
                        <div className="space-y-3">
                            {displayedData
                                .filter(item => (item.revenue - item.cost) > 0)
                                .sort((a, b) => (b.revenue - b.cost) - (a.revenue - a.cost))
                                .slice(0, 3)
                                .map((item, idx) => {
                                    const profit = item.revenue - item.cost;
                                    const maxProfit = Math.max(...displayedData.map(d => d.revenue - d.cost), 1);
                                    let widthPercent = (profit / maxProfit) * 100;
                                    if(widthPercent < 2) widthPercent = 2; // minimum width
                                    const displayName = productMap[item.productName] || item.productName;
                                    return (
                                        <div key={idx} className="flex items-center gap-3">
                                            <div className="w-1/3 text-xs text-[var(--text-secondary)] truncate text-right font-medium">{displayName}</div>
                                            <div className="flex-1 h-5 bg-[var(--bg-tertiary)] rounded-full overflow-hidden flex items-center border border-[var(--border-primary)]">
                                                <div className="h-full bg-emerald-400 rounded-full transition-all duration-1000" style={{ width: `${widthPercent}%` }}></div>
                                            </div>
                                            <div className="w-20 text-xs font-bold text-emerald-600 text-left">${Math.round(profit).toLocaleString()}</div>
                                        </div>
                                    );
                                })}
                            {displayedData.filter(item => (item.revenue - item.cost) > 0).length === 0 && (
                                <p className="text-sm text-[var(--text-tertiary)] italic">無產生正毛利之商品資料。</p>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <div className="bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-primary)] overflow-hidden flex-1 flex flex-col shadow-sm min-h-[500px]">
                <div className="overflow-y-auto flex-1">
                    {/* Desktop View */}
                    <table className="hidden md:table w-full text-left text-sm border-collapse">
                        <thead className="bg-[var(--bg-tertiary)] text-[var(--text-secondary)] text-xs uppercase sticky top-0 z-10 font-bold border-b border-[var(--border-primary)]">
                            <tr>
                                <th className="p-4 whitespace-nowrap cursor-pointer hover:bg-[var(--bg-hover)] transition-colors" onClick={() => handleSort('name')}>
                                    產品名稱 <SortIcon columnKey="name" />
                                </th>
                                <th className="p-4 text-right whitespace-nowrap cursor-pointer hover:bg-[var(--bg-hover)] transition-colors" onClick={() => handleSort('revenue')}>
                                    銷售收入 <SortIcon columnKey="revenue" />
                                </th>
                                <th className="p-4 text-right whitespace-nowrap cursor-pointer hover:bg-[var(--bg-hover)] transition-colors" onClick={() => handleSort('cost')}>
                                    成本 <SortIcon columnKey="cost" />
                                </th>
                                <th className="p-4 text-right whitespace-nowrap cursor-pointer hover:bg-[var(--bg-hover)] transition-colors" onClick={() => handleSort('profit')}>
                                    毛利額 <SortIcon columnKey="profit" />
                                </th>
                                <th className="p-4 text-right whitespace-nowrap cursor-pointer hover:bg-[var(--bg-hover)] transition-colors" onClick={() => handleSort('margin')}>
                                    毛利率 <SortIcon columnKey="margin" />
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border-primary)]">
                            {loading ? (
                                <tr><td colSpan="5" className="p-20 text-center text-[var(--text-secondary)]">
                                    <div className="flex flex-col items-center gap-2">
                                        <RefreshCw className="animate-spin text-emerald-500" />
                                        <span>正在計算毛利數據...</span>
                                    </div>
                                </td></tr>
                            ) : displayedData.length > 0 ? (
                                displayedData.map((item, idx) => {
                                    const profit = item.revenue - item.cost;
                                    const margin = item.revenue > 0 ? (profit / item.revenue) * 100 : 0;
                                    const displayName = productMap[item.productName] || item.productName;

                                    return (
                                        <tr key={idx} className="hover:bg-[var(--bg-hover)] transition-colors group">
                                            <td className="p-4 font-bold text-[var(--text-primary)]">
                                                <div className="flex flex-col">
                                                    <span>{displayName}</span>
                                                    {productMap[item.productName] && (
                                                        <span className="text-[10px] text-[var(--text-tertiary)] font-normal mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                            ID: {item.productName.substring(0, 8)}...
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="p-4 text-right font-mono text-[var(--text-secondary)]">
                                                ${Math.round(item.revenue).toLocaleString()}
                                            </td>
                                            <td className="p-4 text-right font-mono text-rose-600/80">
                                                ${Math.round(item.cost).toLocaleString()}
                                            </td>
                                            <td className={`p-4 text-right font-mono font-bold ${profit >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                                                {profit < 0 ? '-' : ''}${Math.abs(Math.round(profit)).toLocaleString()}
                                            </td>
                                            <td className="p-4 text-right">
                                                <span className={`inline-block px-2 py-1 rounded text-xs font-bold min-w-[50px] text-center ${margin >= 30 ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' :
                                                    margin >= 10 ? 'bg-blue-100 text-blue-700 border border-blue-200' :
                                                        'bg-rose-100 text-rose-700 border border-rose-200'
                                                    }`}>
                                                    {margin.toFixed(1)}%
                                                </span>
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
                        {/* Mobile Sorting Controls */}
                        <div className="p-3 bg-[var(--bg-tertiary)] flex justify-between items-center text-xs font-bold text-[var(--text-secondary)] border-b border-[var(--border-primary)]">
                            <span onClick={() => handleSort('name')} className="cursor-pointer hover:text-[var(--text-primary)]">產品排序 <SortIcon columnKey="name" /></span>
                            <div className="flex gap-4">
                                <span onClick={() => handleSort('profit')} className="cursor-pointer hover:text-[var(--text-primary)]">毛利額 <SortIcon columnKey="profit" /></span>
                                <span onClick={() => handleSort('margin')} className="cursor-pointer hover:text-[var(--text-primary)]">毛利率 <SortIcon columnKey="margin" /></span>
                            </div>
                        </div>

                        {loading ? (
                            <div className="p-10 text-center text-[var(--text-secondary)] italic">正在計算毛利數據...</div>
                        ) : displayedData.length > 0 ? (
                            displayedData.map((item, idx) => {
                                const profit = item.revenue - item.cost;
                                const margin = item.revenue > 0 ? (profit / item.revenue) * 100 : 0;
                                const displayName = productMap[item.productName] || item.productName;

                                return (
                                    <div key={idx} className="p-4 bg-[var(--bg-secondary)] active:bg-[var(--bg-hover)] transition-colors">
                                        <div className="flex justify-between items-start mb-2">
                                            <div className="text-sm font-bold text-[var(--text-primary)] max-w-[65%] leading-tight">{displayName}</div>
                                            <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${margin >= 30 ? 'bg-emerald-100 text-emerald-700' :
                                                margin >= 10 ? 'bg-blue-100 text-blue-700' : 'bg-rose-100 text-rose-700'
                                                }`}>
                                                {margin.toFixed(1)}%
                                            </span>
                                        </div>
                                        <div className="grid grid-cols-3 gap-2 mt-3">
                                            <div className="space-y-1">
                                                <p className="text-[10px] text-[var(--text-tertiary)] font-bold uppercase">收入</p>
                                                <p className="text-xs font-mono font-bold text-[var(--text-secondary)]">${Math.round(item.revenue).toLocaleString()}</p>
                                            </div>
                                            <div className="space-y-1">
                                                <p className="text-[10px] text-[var(--text-tertiary)] font-bold uppercase">成本</p>
                                                <p className="text-xs font-mono font-bold text-rose-500/80">${Math.round(item.cost).toLocaleString()}</p>
                                            </div>
                                            <div className="space-y-1">
                                                <p className="text-[10px] text-[var(--text-tertiary)] font-bold uppercase">毛利</p>
                                                <p className={`text-xs font-mono font-bold ${profit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                    ${Math.abs(Math.round(profit)).toLocaleString()}
                                                </p>
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
