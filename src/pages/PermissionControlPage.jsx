import React, { useState, useEffect } from 'react';
import { Shield, UserPlus, Trash2, Save, RefreshCw, AlertTriangle, CheckSquare } from 'lucide-react';
import { callGAS } from '../utils/api';

export default function PermissionControlPage({ user, apiUrl }) {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [newUser, setNewUser] = useState({ username: '', password: '', role: 'VIEWER' });
    const [editingUser, setEditingUser] = useState(null); // The user currently being edited for permissions

    const AVAILABLE_PERMISSIONS = [
        { key: 'sales', label: '銷售管理 (Sales)' },
        { key: 'purchase', label: '進貨管理 (Purchase)' },
        { key: 'inventory', label: '庫存管理 (Inventory)' },
        { key: 'finance', label: '財務帳務 (Finance)' },
        { key: 'analytics', label: '數據分析 (Analytics)' },
        { key: 'system', label: '系統管理 (System)' }
    ];

    // ... existing code ...
    const fetchUsers = async () => {
        setLoading(true);
        try {
            // Assumes backend has 'getUsers' handler
            const data = await callGAS(apiUrl, 'getUsers', {}, user.token);
            if (Array.isArray(data)) {
                setUsers(data);
            } else {
                console.warn('Backend returned non-array for users or not implemented');
                // Mock data for demo if backend fails or returns empty (optional, remove in prod)
                // setUsers([{ username: 'admin', role: 'ADMIN' }, { username: 'staff', role: 'USER' }]);
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
                                                            setEditingUser({
                                                                username: u.username,
                                                                permissions: Array.isArray(u.permissions) ? u.permissions : []
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

                        <div className="p-6 space-y-3 max-h-[60vh] overflow-y-auto">
                            {AVAILABLE_PERMISSIONS.map(perm => (
                                <label key={perm.key} className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/30 hover:bg-slate-800 border border-slate-700/50 cursor-pointer transition-colors group">
                                    <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${editingUser.permissions?.includes(perm.key)
                                        ? 'bg-blue-500 border-blue-500 text-white'
                                        : 'bg-slate-800 border-slate-600 group-hover:border-blue-500/50'
                                        }`}>
                                        {editingUser.permissions?.includes(perm.key) && <CheckSquare size={12} fill="currentColor" />}
                                    </div>
                                    <input
                                        type="checkbox"
                                        className="hidden"
                                        checked={editingUser.permissions?.includes(perm.key)}
                                        onChange={() => togglePermission(perm.key)}
                                    />
                                    <span className={editingUser.permissions?.includes(perm.key) ? 'text-white font-bold' : 'text-slate-400'}>
                                        {perm.label}
                                    </span>
                                </label>
                            ))}
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
