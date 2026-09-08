import React, { useState, useEffect } from 'react';
import { Activity, Calendar, Filter, RefreshCw, User, Eye, Search } from 'lucide-react';
import { callGAS } from '../utils/api';
import { getLocalDateString } from '../utils/constants';

export default function ActivityLogPage({ user, apiUrl }) {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(false);
    const [filters, setFilters] = useState({
        startDate: getLocalDateString(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)), // 預設最近 7 天
        endDate: getLocalDateString(new Date()),
        username: '',
        actionType: ''
    });
    const [expandedLog, setExpandedLog] = useState(null);

    const actionTypes = [
        { value: '', label: '全部' },
        { value: 'LOGIN', label: '登入' },
        { value: 'LOGOUT', label: '登出' },
        { value: 'PAGE_VIEW', label: '頁面瀏覽' },
        { value: 'DATA_EDIT', label: '資料編輯' },
        { value: 'ERROR', label: '錯誤' }
    ];

    const fetchLogs = async () => {
        setLoading(true);
        try {
            const data = await callGAS(apiUrl, 'getActivityLogs', filters, user.token);
            setLogs(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error('Failed to fetch activity logs:', error);
            alert('無法載入操作紀錄');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLogs();
    }, []);

    const formatTimestamp = (timestamp) => {
        const date = new Date(timestamp);
        return date.toLocaleString('zh-TW', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    };

    const pageNames = {
        'sales': '銷售登錄',
        'inventory': '庫存檢視',
        'purchase': '進貨作業',
        'report': '銷售查詢',
        'purchaseHistory': '進貨查詢',
        'adjustHistory': '異動查詢',
        'valuation': '庫存估值',
        'stocktake': '庫存盤點',
        'stocktakeHistory': '盤點歷史',
        'receivable': '應收帳款',
        'payable': '應付帳款',
        'salesRanking': '商品銷售排行',
        'customerRanking': '客戶銷售排行',
        'profitAnalysis': '毛利分析報表',
        'turnoverRate': '庫存周轉率',
        'costCalculation': '成本計算分析',
        'expenditureManagement': '支出登錄',
        'incomeStatement': '損益表',
        'permissionControl': '權限控管',
        'payroll': '薪資結算',
        'activityLog': '操作紀錄'
    };

    const getPageLabel = (page) => {
        return pageNames[page] || page || '-';
    };

    const formatDetails = (details) => {
        if (!details) return '-';
        try {
            const obj = JSON.parse(details);
            const translations = {
                'action': '動作',
                'page': '頁面',
                'customer': '客戶',
                'totalAmount': '總金額',
                'paymentMethod': '付款方式',
                'productCount': '產品數量',
                'type': '類型',
                'product': '產品',
                'quantity': '數量',
                'adjustType': '調整類型',
                'vendorCount': '供應商數量',
                'totalPrice': '總價',
                'itemCount': '項目數量',
                'hasDifferences': '是否有差異',
                'totalDiff': '總計差異',
                'note': '備註',
                'recordId': '紀錄ID',
                'vendor': '供應商',
                'targetUser': '對象使用者',
                'role': '角色',
                'period': '期間',
                'date': '日期',
                'value': '數值'
            };

            return Object.entries(obj).map(([k, v]) => {
                const label = translations[k] || k;
                const value = typeof v === 'object' ? JSON.stringify(v) : String(v);
                return `${label}: ${value}`;
            }).join('\n');
        } catch (e) {
            return details;
        }
    };

    const getActionTypeLabel = (type) => {
        const found = actionTypes.find(at => at.value === type);
        return found ? found.label : type;
    };

    const getActionTypeColor = (type) => {
        switch (type) {
            case 'LOGIN': return 'bg-emerald-50 text-emerald-600 border-emerald-200';
            case 'LOGOUT': return 'bg-rose-50 text-rose-600 border-rose-200';
            case 'PAGE_VIEW': return 'bg-blue-50 text-blue-600 border-blue-200';
            case 'DATA_EDIT': return 'bg-amber-50 text-amber-600 border-amber-200';
            case 'ERROR': return 'bg-rose-100 text-rose-700 border-rose-300';
            default: return 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border-[var(--border-primary)]';
        }
    };

    return (
        <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6 h-[calc(100vh-6rem)] flex flex-col">
            {/* Header */}
            <div className="flex justify-between items-center shrink-0">
                <div>
                    <h1 className="text-lg md:text-2xl font-bold text-[var(--text-primary)] flex items-center gap-2">
                        <Activity className="text-[var(--accent-blue)]" size={24} />
                        操作紀錄查詢
                    </h1>
                    <p className="text-xs md:text-sm text-[var(--text-secondary)] mt-1">查看系統使用者活動記錄</p>
                </div>
                <button
                    onClick={fetchLogs}
                    className="btn-secondary p-2 rounded-xl"
                    disabled={loading}
                >
                    <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                </button>
            </div>

            {/* Filters */}
            <div className="glass-panel p-4 shrink-0">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    {/* 開始日期 */}
                    <div>
                        <label className="text-xs text-[var(--text-secondary)] font-bold block mb-1">開始日期</label>
                        <input
                            type="date"
                            value={filters.startDate}
                            onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                            className="input-field w-full"
                        />
                    </div>

                    {/* 結束日期 */}
                    <div>
                        <label className="text-xs text-[var(--text-secondary)] font-bold block mb-1">結束日期</label>
                        <input
                            type="date"
                            value={filters.endDate}
                            onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                            className="input-field w-full"
                        />
                    </div>

                    {/* 動作類型 */}
                    <div>
                        <label className="text-xs text-[var(--text-secondary)] font-bold block mb-1">動作類型</label>
                        <select
                            value={filters.actionType}
                            onChange={(e) => setFilters({ ...filters, actionType: e.target.value })}
                            className="input-field w-full"
                        >
                            {actionTypes.map(at => (
                                <option key={at.value} value={at.value}>{at.label}</option>
                            ))}
                        </select>
                    </div>

                    {/* 使用者 (僅 BOSS/ADMIN 可見) */}
                    {(user.role === 'BOSS' || user.role === 'ADMIN') && (
                        <div>
                            <label className="text-xs text-[var(--text-secondary)] font-bold block mb-1">使用者</label>
                            <input
                                type="text"
                                value={filters.username}
                                onChange={(e) => setFilters({ ...filters, username: e.target.value })}
                                placeholder="全部使用者"
                                className="input-field w-full"
                            />
                        </div>
                    )}

                    {/* 查詢按鈕 */}
                    <div className="flex items-end">
                        <button
                            onClick={fetchLogs}
                            className="btn-primary w-full flex items-center justify-center gap-2"
                            disabled={loading}
                        >
                            <Search size={16} />
                            查詢
                        </button>
                    </div>
                </div>
            </div>

            {/* Logs List */}
            <div className="glass-panel flex-1 overflow-hidden flex flex-col">
                <div className="p-4 border-b border-[var(--border-primary)]">
                    <div className="text-sm text-[var(--text-secondary)]">
                        共 <span className="font-bold text-[var(--accent-blue)]">{logs.length}</span> 筆記錄
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto">
                    {loading ? (
                        <div className="flex items-center justify-center h-full">
                            <RefreshCw className="animate-spin text-[var(--accent-blue)]" size={32} />
                        </div>
                    ) : logs.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-[var(--text-tertiary)]">
                            <Activity size={48} className="mb-2" />
                            <p>無操作紀錄</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-[var(--border-primary)]">
                            {logs.map((log, idx) => (
                                <div
                                    key={idx}
                                    className="p-4 hover:bg-[var(--bg-secondary)] transition-colors cursor-pointer"
                                    onClick={() => setExpandedLog(expandedLog === idx ? null : idx)}
                                >
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-2">
                                                <span className={`px-2 py-1 rounded text-xs font-bold border ${getActionTypeColor(log.actionType)}`}>
                                                    {getActionTypeLabel(log.actionType)}
                                                </span>
                                                <span className="text-sm font-bold text-[var(--text-primary)]">{log.username}</span>
                                                <span className="text-xs text-[var(--text-secondary)]">{formatTimestamp(log.timestamp)}</span>
                                            </div>
                                            <div className="text-sm text-[var(--text-secondary)]">
                                                頁面: <span className="font-medium text-[var(--text-primary)]">{getPageLabel(log.page)}</span>
                                            </div>
                                        </div>
                                        <button className="text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]">
                                            <Eye size={16} />
                                        </button>
                                    </div>

                                    {/* 展開詳細資訊 */}
                                    {expandedLog === idx && (
                                        <div className="mt-3 pt-3 border-t border-[var(--border-primary)] space-y-2 text-xs">
                                            <div className="grid grid-cols-2 gap-2">
                                                <div>
                                                    <span className="text-[var(--text-tertiary)]">螢幕解析度:</span>
                                                    <span className="ml-2 font-medium text-[var(--text-secondary)]">{log.screenResolution || '-'}</span>
                                                </div>
                                                <div>
                                                    <span className="text-[var(--text-tertiary)]">IP 位址:</span>
                                                    <span className="ml-2 font-medium text-[var(--text-secondary)]">{log.ipAddress || '-'}</span>
                                                </div>
                                            </div>
                                            {log.details && (
                                                <div>
                                                    <span className="text-[var(--text-tertiary)]">詳細資訊:</span>
                                                    <pre className="mt-1 p-2 bg-[var(--bg-tertiary)] text-[var(--text-secondary)] rounded text-xs overflow-x-auto whitespace-pre-wrap border border-[var(--border-primary)]">
                                                        {formatDetails(log.details)}
                                                    </pre>
                                                </div>
                                            )}
                                            {log.userAgent && (
                                                <div>
                                                    <span className="text-[var(--text-tertiary)]">User Agent:</span>
                                                    <div className="mt-1 p-2 bg-[var(--bg-tertiary)] text-[var(--text-secondary)] rounded text-xs break-all border border-[var(--border-primary)]">
                                                        {log.userAgent}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
