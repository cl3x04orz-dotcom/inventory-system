import React, { useState, useEffect } from 'react';
import { Shield, UserPlus, Trash2, Save, RefreshCw, AlertTriangle, CheckSquare } from 'lucide-react';
import { callGAS } from '../utils/api';

export default function PermissionControlPage({ user, apiUrl }) {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [newUser, setNewUser] = useState({ username: '', password: '', role: 'VIEWER' });
    const [editingUser, setEditingUser] = useState(null); // The user currently being edited for permissions

    const AVAILABLE_PERMISSIONS = [
        {
            group: '銷售管理',
            items: [
                { key: 'sales_entry', label: '商品銷售登錄' },
                { key: 'sales_report', label: '銷售查詢報表' }
            ]
        },
        {
            group: '進貨管理',
            items: [
                { key: 'purchase_entry', label: '進貨資料登錄' },
                { key: 'purchase_history', label: '進貨歷史紀錄' }
            ]
        },
        {
            group: '庫存管理',
            items: [
                { key: 'inventory_adjust', label: '庫存異動作業' },
                { key: 'inventory_stocktake', label: '現場盤點作業' },
                { key: 'inventory_valuation', label: '庫存估值報告' },
                { key: 'inventory_history', label: '異動/盤點紀錄查詢' }
            ]
        },
        {
            group: '財務帳務',
            items: [
                { key: 'finance_expenditure', label: '外場支出作業' },
                { key: 'finance_receivable', label: '應收帳款管理' },
                { key: 'finance_payable', label: '應付帳款管理' },
                { key: 'finance_income', label: '簡易損益表' },
                { key: 'finance_cost', label: '成本計算分析' }
            ]
        },
        {
            group: '數據分析',
            items: [
                { key: 'analytics_sales', label: '商品銷售排行' },
                { key: 'analytics_customer', label: '客戶銷售排行' },
                { key: 'analytics_profit', label: '毛利分析報表' },
                { key: 'analytics_turnover', label: '庫存周轉率' }
            ]
        },
        {
            group: '系統管理',
            items: [
                { key: 'system_config', label: '權限控管表' }
            ]
        }
    ];

    // ... existing code ...
    const fetchUsers = async () => {
        setLoading(true);
        try {
            // Assumes backend has 'getUsers' handler
            const data = await callGAS(apiUrl, 'getUsers', {}, user.token);
            if (Array.isArray(data)) {
                // Ensure permissions are parsed
                const parsedData = data.map(u => {
                    let perms = u.permissions;
                    if (typeof perms === 'string') {
                        try {
                            perms = JSON.parse(perms);
                        } catch (e) {
                            console.error(`Failed to parse permissions for ${u.username}`, e);
                            perms = [];
                        }
                    }
                    return { ...u, permissions: Array.isArray(perms) ? perms : [] };
                });
                setUsers(parsedData);
            } else {
                console.warn('Backend returned non-array for users or not implemented');
            }
        } catch (error) {
            console.error('Failed to fetch users:', error);
            alert('無法載入使用者列表 (請確認後端是否支援 getUsers)');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (user?.token) fetchUsers();
    }, [user.token, apiUrl]);

    const handleAddUser = async () => {
        if (!newUser.username || !newUser.password) {
            alert('請輸入帳號與密碼');
            return;
        }
        try {
            await callGAS(apiUrl, 'addUser', newUser, user.token);
            alert('新增成功');
            setNewUser({ username: '', password: '', role: 'VIEWER' });
            fetchUsers();
        } catch (error) {
            alert('新增失敗: ' + error.message);
        }
    };

    const handleDeleteUser = async (targetUsername) => {
        if (!window.confirm(`確定要刪除使用者 ${targetUsername}?`)) return;
        try {
            await callGAS(apiUrl, 'deleteUser', { username: targetUsername }, user.token);
            alert('刪除成功');
            fetchUsers();
        } catch (error) {
            alert('刪除失敗: ' + error.message);
        }
    };

    const handleSavePermissions = async () => {
        if (!editingUser) return;
        setLoading(true);
        try {
            // Send updated permissions to backend
            // Payload: { username: '...', permissions: ['sales', 'inventory'] }
            await callGAS(apiUrl, 'updateUserPermissions', {
                username: editingUser.username,
                permissions: editingUser.permissions
            }, user.token);

            alert('權限權限更新成功');
            setEditingUser(null);
            fetchUsers();
        } catch (error) {
            console.error(error);
            alert('更新失敗: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const togglePermission = (key) => {
        if (!editingUser) return;
        const currentPerms = editingUser.permissions || [];
        if (currentPerms.includes(key)) {
            setEditingUser({ ...editingUser, permissions: currentPerms.filter(p => p !== key) });
        } else {
            setEditingUser({ ...editingUser, permissions: [...currentPerms, key] });
        }
    };

    const toggleGroup = (groupItems) => {
        if (!editingUser) return;
        const currentPerms = editingUser.permissions || [];
        const groupKeys = groupItems.map(item => item.key);
        const allSelected = groupKeys.every(key => currentPerms.includes(key));

        if (allSelected) {
            // Deselect all in group
            setEditingUser({ ...editingUser, permissions: currentPerms.filter(p => !groupKeys.includes(p)) });
        } else {
            // Select all in group
            const otherPerms = currentPerms.filter(p => !groupKeys.includes(p));
            setEditingUser({ ...editingUser, permissions: [...otherPerms, ...groupKeys] });
        }
    };

    return (
        <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-6 flex flex-col h-[calc(100vh-6rem)]">
            <div className="flex justify-between items-center shrink-0">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                        <Shield className="text-rose-400" /> 權限控管表 (Permission Control)
                    </h1>
                    <p className="text-slate-400 text-sm mt-1">管理系統使用者與訪問權限</p>
                </div>
                <button onClick={fetchUsers} className="btn-secondary p-2 rounded-xl">
                    <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
                </button>
            </div>

            {/* Add User Panel */}
            <div className="glass-panel p-6 border-l-4 border-l-emerald-500 shrink-0">
                <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                    <UserPlus size={20} className="text-emerald-400" /> 新增使用者
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                    <div className="space-y-1">
                        <label className="text-xs text-slate-500 uppercase font-bold px-1">帳號 (Username)</label>
                        <input
                            type="text"
                            className="input-field w-full"
                            value={newUser.username}
                            onChange={e => setNewUser({ ...newUser, username: e.target.value })}
                            placeholder="輸入帳號"
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs text-slate-500 uppercase font-bold px-1">密碼 (Password)</label>
                        <input
                            type="password"
                            className="input-field w-full"
                            value={newUser.password}
                            onChange={e => setNewUser({ ...newUser, password: e.target.value })}
                            placeholder="輸入密碼"
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs text-slate-500 uppercase font-bold px-1">權限角色 (Role)</label>
                        <select
                            className="input-field w-full"
                            value={newUser.role}
                            onChange={e => setNewUser({ ...newUser, role: e.target.value })}
                        >
                            <option value="BOSS">老闆 (BOSS)</option>
                            <option value="ADMIN">管理員 (ADMIN)</option>
                            <option value="EMPLOYEE">員工 (EMPLOYEE)</option>
                            <option value="VIEWER">檢視者 (VIEWER)</option>
                        </select>
                    </div>
                    <button onClick={handleAddUser} className="btn-primary flex justify-center items-center gap-2">
                        <Save size={18} /> 新增
                    </button>
                </div>
            </div>

            {/* User List */}
            <div className="glass-panel p-0 overflow-hidden flex-1 flex flex-col">
                <div className="overflow-y-auto flex-1">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-800 text-slate-400 text-xs uppercase sticky top-0 z-10">
                            <tr>
                                <th className="p-4">帳號 (Username)</th>
                                <th className="p-4">角色 (Role)</th>
                                <th className="p-4 text-center">狀態 (Status)</th>
                                <th className="p-4 text-center">操作</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {users.length > 0 ? (
                                users.map((u, idx) => (
                                    <tr key={idx} className="hover:bg-slate-800/30 transition-colors">
                                        <td className="p-4 text-white font-bold">{u.username}</td>
                                        <td className="p-4">
                                            <span className={`px-2 py-1 rounded text-xs font-bold border ${u.role === 'BOSS' ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' :
                                                u.role === 'ADMIN' ? 'bg-rose-500/10 text-rose-500 border-rose-500/20' :
                                                    u.role === 'EMPLOYEE' ? 'bg-blue-500/10 text-blue-500 border-blue-500/20' :
                                                        u.role === 'VIEWER' ? 'bg-slate-500/10 text-slate-500 border-slate-500/20' :
                                                            'bg-slate-500/10 text-slate-500 border-slate-500/20'
                                                }`}>
                                                {u.role}
                                            </span>
                                        </td>
                                        <td className="p-4 text-center">
                                            {u.status === 'ACTIVE' ? (
                                                <span className="flex items-center justify-center gap-2 text-emerald-400 font-bold text-xs">
                                                    <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]"></span> ACTIVE
                                                </span>
                                            ) : (
                                                <span className="flex items-center justify-center gap-2 text-slate-500 font-bold text-xs">
                                                    <span className="w-2 h-2 rounded-full bg-slate-500"></span> {u.status || 'UNKNOWN'}
                                                </span>
                                            )}
                                        </td>

                                        <td className="p-4 text-center flex items-center justify-center gap-2">
                                            {u.username !== 'admin' && (
                                                <>
                                                    <button
                                                        onClick={() => {
                                                            // [Migration Logic] Convert old permissions to new granular ones
                                                            let currentPerms = Array.isArray(u.permissions) ? [...u.permissions] : [];
                                                            const legacyMap = {
                                                                'sales': ['sales_entry', 'sales_report'],
                                                                'purchase': ['purchase_entry', 'purchase_history'],
                                                                'inventory': ['inventory_adjust', 'inventory_stocktake', 'inventory_valuation', 'inventory_history'],
                                                                'finance': ['finance_expenditure', 'finance_receivable', 'finance_payable', 'finance_income', 'finance_cost'],
                                                                'analytics': ['analytics_sales', 'analytics_customer', 'analytics_profit', 'analytics_turnover'],
                                                                'system': ['system_config']
                                                            };

                                                            let hasMigration = false;
                                                            Object.keys(legacyMap).forEach(legacyKey => {
                                                                if (currentPerms.includes(legacyKey)) {
                                                                    hasMigration = true;
                                                                    // Remove legacy key
                                                                    currentPerms = currentPerms.filter(p => p !== legacyKey);
                                                                    // Add all new granular keys (avoid duplicates)
                                                                    legacyMap[legacyKey].forEach(newKey => {
                                                                        if (!currentPerms.includes(newKey)) {
                                                                            currentPerms.push(newKey);
                                                                        }
                                                                    });
                                                                }
                                                            });

                                                            setEditingUser({
                                                                username: u.username,
                                                                permissions: currentPerms
                                                            });
                                                        }}
                                                        className="p-2 text-slate-400 hover:text-blue-400 transition-colors"
                                                        title="設定權限"
                                                    >
                                                        <Shield size={16} />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteUser(u.username)}
                                                        className="p-2 text-slate-400 hover:text-rose-400 transition-colors"
                                                        title="刪除"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan="4" className="p-20 text-center text-slate-500">
                                        {loading ? '載入中...' : '無使用者資料'}
                                    </td>
                                </tr>
                            )}
                        </tbody>

                    </table>
                </div>
            </div >

            {/* Permission Editor Modal */}
            {editingUser && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200">
                        <div className="p-6 border-b border-slate-800 bg-slate-800/50">
                            <h3 className="text-xl font-bold text-white flex items-center gap-2">
                                <Shield className="text-blue-400" /> 設定權限 ({editingUser.username})
                            </h3>
                            <p className="text-slate-400 text-sm mt-1">勾選該使用者可存取的功能模組 (BOSS 擁有預設全權限)</p>
                        </div>

                        <div className="p-6 space-y-6 max-h-[65vh] overflow-y-auto custom-scrollbar">
                            {AVAILABLE_PERMISSIONS.map(group => {
                                const groupKeys = group.items.map(i => i.key);
                                const isGroupAllSelected = groupKeys.every(k => editingUser.permissions?.includes(k));
                                const isGroupSomeSelected = groupKeys.some(k => editingUser.permissions?.includes(k)) && !isGroupAllSelected;

                                return (
                                    <div key={group.group} className="space-y-3">
                                        <div
                                            className="flex items-center justify-between px-1 cursor-pointer group/title"
                                            onClick={() => toggleGroup(group.items)}
                                        >
                                            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2 group-hover/title:text-blue-400 transition-colors">
                                                {group.group}
                                            </h4>
                                            <span className="text-[10px] text-blue-500 font-bold opacity-0 group-hover/title:opacity-100 transition-opacity">
                                                {isGroupAllSelected ? '取消全選' : '全選'}
                                            </span>
                                        </div>

                                        <div className="grid grid-cols-1 gap-2">
                                            {group.items.map(perm => (
                                                <label
                                                    key={perm.key}
                                                    className={`flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer group ${editingUser.permissions?.includes(perm.key)
                                                        ? 'bg-blue-500/10 border-blue-500/50 shadow-[0_0_15px_rgba(59,130,246,0.1)]'
                                                        : 'bg-slate-800/30 border-slate-700/50 hover:bg-slate-800 hover:border-slate-600'
                                                        }`}
                                                >
                                                    <div className={`w-5 h-5 rounded-lg border flex items-center justify-center transition-all ${editingUser.permissions?.includes(perm.key)
                                                        ? 'bg-blue-500 border-blue-500 text-white scale-110'
                                                        : 'bg-slate-900 border-slate-600 group-hover:border-blue-500/50'
                                                        }`}>
                                                        {editingUser.permissions?.includes(perm.key) && <CheckSquare size={12} fill="currentColor" />}
                                                    </div>
                                                    <input
                                                        type="checkbox"
                                                        className="hidden"
                                                        checked={editingUser.permissions?.includes(perm.key)}
                                                        onChange={() => togglePermission(perm.key)}
                                                    />
                                                    <span className={`text-sm transition-colors ${editingUser.permissions?.includes(perm.key) ? 'text-white font-bold' : 'text-slate-400'
                                                        }`}>
                                                        {perm.label}
                                                    </span>
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="p-6 border-t border-slate-800 flex justify-end gap-3 bg-slate-900/50">
                            <button
                                onClick={() => setEditingUser(null)}
                                className="px-4 py-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
                            >
                                取消
                            </button>
                            <button
                                onClick={handleSavePermissions}
                                className="btn-primary px-6 py-2"
                            >
                                儲存設定
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div >
    );
}
