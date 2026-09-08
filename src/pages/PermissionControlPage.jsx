import React, { useState, useEffect } from 'react';
import { Shield, UserPlus, Trash2, Save, RefreshCw, AlertTriangle, CheckSquare, KeyRound, Bell, Volume2 } from 'lucide-react';
import { callGAS } from '../utils/api';

function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

export default function PermissionControlPage({ user, apiUrl }) {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [processing, setProcessing] = useState(false);
    const [processMessage, setProcessMessage] = useState('');
    const [newUser, setNewUser] = useState({ username: '', password: '', role: 'VIEWER' });
    const [editingUser, setEditingUser] = useState(null); // The user currently being edited for permissions
    const [passwordModal, setPasswordModal] = useState(null); // { username } when changing password
    const [newPassword, setNewPassword] = useState('');
    const [pushSubscribed, setPushSubscribed] = useState(false);
    const [pushLoading, setPushLoading] = useState(false);

    const AVAILABLE_PERMISSIONS = [
        {
            group: '銷售管理',
            items: [
                { key: 'sales_entry', label: '商品銷售登錄' },
                { key: 'sales_report', label: '銷售查詢報表' }
            ]
        },
        {
            group: '團購管理',
            items: [
                { key: 'sales_liff', label: '團購一鍵下單' },
                { key: 'sales_pending', label: '待確認訂單審核' },
                { key: 'products', label: '商品屬性管理' }
            ]
        },
        {
            group: '進貨管理',
            items: [
                { key: 'purchase_entry', label: '商品進貨登錄' },
                { key: 'purchase_history', label: '進貨查詢報表' },
            ]
        },
        {
            group: '庫存管理',
            items: [
                { key: 'inventory_adjust', label: '庫存檢視' },
                { key: 'inventory_stocktake', label: '庫存盤點' },
                { key: 'inventory_valuation', label: '庫存估值' },
                { key: 'inventory_adjust_history', label: '異動查詢' },
                { key: 'inventory_stocktake_history', label: '盤點歷史' }
            ]
        },
        {
            group: '支出管理',
            items: [
                { key: 'finance_expenditure', label: '支出登錄' }
            ]
        },
        {
            group: '財務帳務',
            items: [
                { key: 'finance_receivable', label: '應收帳款' },
                { key: 'finance_payable', label: '應付帳款' },
                { key: 'finance_income', label: '損益表' },
                { key: 'finance_cost', label: '成本計算分析' },
                { key: 'finance_payroll', label: '薪資結算中心' }
            ]
        },
        {
            group: '數據分析',
            items: [
                { key: 'analytics_sales', label: '商品銷售排行' },
                { key: 'analytics_customer', label: '客戶銷售排行' },
                { key: 'analytics_customer_detail', label: '客戶深度分析' },
                { key: 'analytics_profit', label: '毛利分析報表' },
                { key: 'analytics_turnover', label: '庫存周轉率' }
            ]
        },
        {
            group: '系統管理',
            items: [
                { key: 'system_config', label: '權限控管表' },
                { key: 'system_activity_logs', label: '操作紀錄查詢' }
            ]
        }
    ];

    const playChimeSound = () => {
        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) return;
            const ctx = new AudioCtx();
            const playTone = (freq, startTime, duration) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, ctx.currentTime + startTime);
                gain.gain.setValueAtTime(0, ctx.currentTime + startTime);
                gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + startTime + 0.05);
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startTime + duration);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(ctx.currentTime + startTime);
                osc.stop(ctx.currentTime + startTime + duration);
            };
            playTone(880, 0, 0.3);
            playTone(1320, 0.2, 0.5);
        } catch (e) {
            console.warn('Audio chime play error:', e);
        }
    };

    const handleEnablePushNotificationInPage = async () => {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
            alert('您的瀏覽器不支援 Web Push 離線推播功能');
            return;
        }
        setPushLoading(true);
        try {
            const permission = await Notification.requestPermission();
            if (permission !== 'granted') {
                alert('請在瀏覽器設定中允許「通知」權限，才能啟用離線背景推播！');
                setPushLoading(false);
                return;
            }
            const swUrl = './sw.js';
            const reg = await navigator.serviceWorker.register(swUrl);
            await navigator.serviceWorker.ready;

            const userToken = user?.token;
            const keyRes = await callGAS(apiUrl, 'getWebPushPublicKey', {}, userToken);
            if (!keyRes || !keyRes.success || !keyRes.publicKey) {
                throw new Error('無法取得推播加密公鑰');
            }

            const subscription = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(keyRes.publicKey)
            });

            const subRes = await callGAS(apiUrl, 'subscribeWebPush', { subscription: subscription.toJSON() }, userToken);
            if (!subRes || subRes.success === false) {
                throw new Error(subRes?.message || '後端儲存離線推播訂閱失敗');
            }

            setPushSubscribed(true);
            if (reg.showNotification) {
                reg.showNotification('🎉 離線背景推播啟用成功！', {
                    body: '這台設備已成功綁定！即使完全關閉 WEB 網頁，有人下單時也會跳出音效與通知卡片！',
                    icon: `${import.meta.env.BASE_URL || '/'}logo.png`.replace(/\/+/g, '/'),
                    vibrate: [200, 100, 200]
                });
            }
            alert('🎉 離線背景推播已成功開啟！即使關閉網頁也能收到下單通知！');
        } catch (err) {
            console.error('[WebPush] Enable error:', err);
            alert('離線推播綁定提示: ' + (err.message || '請確認通知權限已開啟'));
        } finally {
            setPushLoading(false);
        }
    };

    useEffect(() => {
        if ('serviceWorker' in navigator && 'PushManager' in window) {
            navigator.serviceWorker.getRegistration('./sw.js').then(reg => {
                if (reg) {
                    reg.pushManager.getSubscription().then(sub => {
                        if (sub) setPushSubscribed(true);
                    });
                }
            });
        }
    }, []);

    const handleAddUser = async () => {
        if (!newUser.username || !newUser.password) {
            alert('請輸入帳號與密碼');
            return;
        }
        setProcessing(true);
        setProcessMessage('資料存檔中 請稍候...');
        try {
            await callGAS(apiUrl, 'addUser', newUser, user.token);
            setNewUser({ username: '', password: '', role: 'VIEWER' });
            await fetchUsers();
            alert('新增成功');
        } catch (error) {
            alert('新增失敗: ' + error.message);
        } finally {
            setProcessing(false);
        }
    };

    const handleDeleteUser = async (targetUsername) => {
        if (!window.confirm(`確定要刪除使用者 ${targetUsername}?`)) return;
        setProcessing(true);
        setProcessMessage('資料刪除中 請稍候...');
        try {
            await callGAS(apiUrl, 'deleteUser', { username: targetUsername }, user.token);
            await fetchUsers();
            alert('刪除成功');
        } catch (error) {
            alert('刪除失敗: ' + error.message);
        } finally {
            setProcessing(false);
        }
    };

    const handleUpdateRole = async (targetUsername, newRole) => {
        setProcessing(true);
        setProcessMessage('更新使用者角色中 請稍候...');
        try {
            const res = await callGAS(apiUrl, 'updateUserRole', { username: targetUsername, role: newRole }, user.token);
            if (res && res.error) throw new Error(res.error);
            await fetchUsers();
            alert(`使用者 ${targetUsername} 的權限角色已成功更新！`);
        } catch (error) {
            alert('角色更新失敗: ' + error.message);
        } finally {
            setProcessing(false);
        }
    };

    const handleChangePassword = async () => {
        if (!newPassword || newPassword.length < 1) {
            alert('請輸入新密碼');
            return;
        }
        setProcessing(true);
        setProcessMessage('密碼更新中 請稍候...');
        try {
            await callGAS(apiUrl, 'updateUserPassword', { username: passwordModal.username, password: newPassword }, user.token);
            setPasswordModal(null);
            setNewPassword('');
            alert(`${passwordModal.username} 的密碼已更新`);
        } catch (error) {
            alert('更新失敗: ' + error.message);
        } finally {
            setProcessing(false);
        }
    };

    const fetchUsers = async () => {
        setLoading(true);
        try {
            const data = await callGAS(apiUrl, 'getUsers', {}, user.token);
            const rawList = Array.isArray(data) ? data : (Array.isArray(data?.list) ? data.list : []);
            if (rawList.length > 0 || data) {
                const parsedData = rawList.map(u => {
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
                console.warn('Backend returned non-array for users');
            }
        } catch (error) {
            console.error('Failed to fetch users:', error);
            alert('無法載入使用者列表');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (user?.token) fetchUsers();
    }, [user.token, apiUrl]);

    const handleSavePermissions = async () => {
        if (!editingUser) return;
        setProcessing(true);
        setProcessMessage('權限更新中 請稍候...');
        try {
            await callGAS(apiUrl, 'updateUserPermissions', {
                username: editingUser.username,
                permissions: editingUser.permissions
            }, user.token);

            setEditingUser(null);
            await fetchUsers();
            alert('權限更新成功');
        } catch (error) {
            console.error(error);
            alert('更新失敗: ' + error.message);
        } finally {
            setProcessing(false);
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
        const isAllSelected = groupKeys.every(key => currentPerms.includes(key));

        if (isAllSelected) {
            setEditingUser({
                ...editingUser,
                permissions: currentPerms.filter(p => !groupKeys.includes(p))
            });
        } else {
            const newPerms = new Set([...currentPerms, ...groupKeys]);
            setEditingUser({
                ...editingUser,
                permissions: Array.from(newPerms)
            });
        }
    };

    const toggleSelectAll = () => {
        if (!editingUser) return;
        const allKeys = AVAILABLE_PERMISSIONS.flatMap(g => g.items.map(i => i.key));
        const currentPerms = editingUser.permissions || [];
        const isAllSelected = allKeys.length > 0 && allKeys.every(k => currentPerms.includes(k));

        if (isAllSelected) {
            setEditingUser({ ...editingUser, permissions: [] });
        } else {
            setEditingUser({ ...editingUser, permissions: allKeys });
        }
    };

    return (
        <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-6 pb-20">
            {/* Global Processing Overlay */}
            {processing && (
                <div className="fixed inset-0 bg-black/30 backdrop-blur-[2px] z-[60] flex items-center justify-center animate-in fade-in duration-200">
                    <div className="bg-[var(--bg-primary)] p-6 rounded-2xl shadow-xl flex flex-col items-center gap-4 min-w-[200px]">
                        <RefreshCw className="animate-spin text-[var(--accent-blue)]" size={32} />
                        <span className="text-[var(--text-primary)] font-bold text-base">{processMessage}</span>
                    </div>
                </div>
            )}

            <div className="flex justify-between items-center shrink-0">
                <div className="flex flex-col">
                    <h1 className="text-lg md:text-2xl font-bold text-[var(--text-primary)] flex items-center gap-2">
                        <Shield className="text-rose-500" size={20} /> 權限控管
                    </h1>
                    <p className="text-[10px] md:text-sm text-[var(--text-tertiary)] font-medium">(Permission Control)</p>
                </div>
                <div className="flex items-center gap-2">
                    {user?.role === 'BOSS' && (
                        <button
                            onClick={() => {
                                const backupUrl = `${apiUrl.replace(/\/$/, '')}/backup?token=${encodeURIComponent(user.token)}`;
                                window.location.href = backupUrl;
                            }}
                            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md shadow-emerald-500/20 active:scale-95 transition-all"
                            title="一鍵備份並下載資料庫 Excel 檔案"
                        >
                            <Save size={14} />
                            下載資料庫備份 (.xlsx)
                        </button>
                    )}
                    <button onClick={fetchUsers} className="btn-secondary p-2 rounded-xl">
                        <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>
            </div>

            {/* 🔔 離線推播與下單音效設定面板 */}
            <div className="glass-panel p-4 md:p-6 border-l-4 border-l-blue-500 shrink-0 space-y-3">
                <h3 className="font-bold text-base md:text-lg flex items-center gap-2 text-[var(--text-primary)]">
                    <Bell size={18} className="text-blue-500" /> 離線推播與下單音效設定
                </h3>
                <p className="text-xs text-[var(--text-tertiary)]">管理此設備的全時段離線背景通知權限與測試下單響聲音效</p>
                <div className="flex flex-wrap items-center gap-3 pt-1">
                    <button
                        onClick={handleEnablePushNotificationInPage}
                        disabled={pushLoading}
                        className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 shadow-md transition-all active:scale-95 border ${
                            pushSubscribed
                                ? "bg-emerald-950/90 text-emerald-300 border-emerald-500/50 hover:bg-emerald-900"
                                : "bg-amber-950/90 text-amber-300 border-amber-500/60 animate-bounce hover:bg-amber-900"
                        }`}
                    >
                        <Bell size={15} className={pushSubscribed ? "" : "animate-spin"} />
                        <span>
                            {pushLoading
                                ? "設定中..."
                                : pushSubscribed
                                ? "✅ 已開啟全時段離線背景推播"
                                : "🔔 點我開啟離線背景推播"}
                        </span>
                    </button>
                    <button
                        onClick={playChimeSound}
                        className="px-4 py-2.5 bg-slate-900/80 text-blue-400 hover:text-white border border-blue-500/40 rounded-xl text-xs font-bold flex items-center gap-2 shadow-md transition-all active:scale-95"
                    >
                        <Volume2 size={15} className="animate-bounce" />
                        <span>🔊 測試下單音效</span>
                    </button>
                </div>
            </div>

            {/* Add User Panel */}
            <div className="glass-panel p-4 md:p-6 border-l-4 border-l-emerald-500 shrink-0">
                <h3 className="font-bold text-base md:text-lg mb-3 flex items-center gap-2 text-[var(--text-primary)]">
                    <UserPlus size={18} className="text-emerald-500" /> 新增使用者
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end relative">
                    <div className="space-y-1">
                        <label className="text-xs text-[var(--text-secondary)] uppercase font-bold px-1">帳號 (Username)</label>
                        <input
                            id="input-new-username"
                            type="text"
                            className="input-field w-full"
                            value={newUser.username}
                            onChange={e => setNewUser({ ...newUser, username: e.target.value })}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === 'ArrowRight') {
                                    e.preventDefault();
                                    document.getElementById('input-new-password')?.focus();
                                }
                            }}
                            placeholder="輸入帳號"
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs text-[var(--text-secondary)] uppercase font-bold px-1">密碼 (Password)</label>
                        <input
                            id="input-new-password"
                            type="password"
                            className="input-field w-full"
                            value={newUser.password}
                            onChange={e => setNewUser({ ...newUser, password: e.target.value })}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === 'ArrowRight') {
                                    e.preventDefault();
                                    document.getElementById('input-new-role')?.focus();
                                } else if (e.key === 'ArrowLeft') {
                                    e.preventDefault();
                                    document.getElementById('input-new-username')?.focus();
                                }
                            }}
                            placeholder="輸入密碼"
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs text-[var(--text-secondary)] uppercase font-bold px-1">權限角色 (Role)</label>
                        <select
                            id="input-new-role"
                            className="input-field w-full cursor-pointer"
                            value={newUser.role}
                            onChange={e => setNewUser({ ...newUser, role: e.target.value })}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === 'ArrowRight') {
                                    e.preventDefault();
                                    document.getElementById('btn-add-user')?.focus();
                                } else if (e.key === 'ArrowLeft') {
                                    e.preventDefault();
                                    document.getElementById('input-new-password')?.focus();
                                }
                            }}
                        >
                            <option value="SUPER_ADMIN">超級管理員 (SUPER_ADMIN)</option>
                            <option value="BOSS">老闆 (BOSS)</option>
                            <option value="ADMIN">管理員 (ADMIN)</option>
                            <option value="EMPLOYEE">員工 (EMPLOYEE)</option>
                            <option value="VIEWER">檢視者 (VIEWER)</option>
                        </select>
                    </div>
                    <button
                        id="btn-add-user"
                        onClick={handleAddUser}
                        onKeyDown={(e) => {
                            if (e.key === 'ArrowLeft') {
                                e.preventDefault();
                                document.getElementById('input-new-role')?.focus();
                            }
                        }}
                        className="btn-primary flex justify-center items-center gap-2"
                        disabled={loading}
                    >
                        <Save size={18} /> 新增
                    </button>
                </div>
            </div>

            {/* User List */}
            <div className="glass-panel p-0 overflow-hidden min-h-[350px]">
                <div className="overflow-x-auto">
                    {/* Desktop Table View */}
                    <table className="hidden md:table w-full text-left text-sm">
                        <thead className="bg-[var(--bg-secondary)] text-[var(--text-secondary)] text-xs uppercase sticky top-0 z-10">
                            <tr>
                                <th className="p-4">帳號 (Username)</th>
                                <th className="p-4">角色 (Role - 點擊切換)</th>
                                <th className="p-4 text-center">狀態 (Status)</th>
                                <th className="p-4 text-center">操作</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border-primary)] bg-[var(--bg-primary)]">
                            {users.length > 0 ? (
                                users.map((u, idx) => (
                                    <tr key={idx} className="hover:bg-[var(--bg-secondary)] transition-colors">
                                        <td className="p-4 text-[var(--text-primary)] font-bold">{u.username}</td>
                                        <td className="p-4">
                                            {u.username === 'admin' ? (
                                                <span className="px-2.5 py-1 rounded text-xs font-bold border bg-purple-950/30 text-purple-400 border-purple-500/40">
                                                    超級管理員 (SUPER_ADMIN)
                                                </span>
                                            ) : (
                                                <select
                                                    value={u.role || 'VIEWER'}
                                                    onChange={(e) => handleUpdateRole(u.username, e.target.value)}
                                                    className={`px-2 py-1 rounded text-xs font-bold border bg-transparent cursor-pointer transition-colors ${
                                                        u.role === 'SUPER_ADMIN' ? 'text-purple-400 border-purple-500/40 bg-purple-950/30' :
                                                        u.role === 'BOSS' ? 'text-amber-400 border-amber-500/40 bg-amber-950/30' :
                                                        u.role === 'ADMIN' ? 'text-rose-400 border-rose-500/40 bg-rose-950/30' :
                                                        u.role === 'EMPLOYEE' ? 'text-blue-400 border-blue-500/40 bg-blue-950/30' :
                                                        'text-slate-400 border-slate-500/40 bg-slate-950/30'
                                                    }`}
                                                >
                                                    <option value="SUPER_ADMIN" className="bg-[var(--bg-primary)] text-purple-400">超級管理員 (SUPER_ADMIN)</option>
                                                    <option value="BOSS" className="bg-[var(--bg-primary)] text-amber-400">老闆 (BOSS)</option>
                                                    <option value="ADMIN" className="bg-[var(--bg-primary)] text-rose-400">管理員 (ADMIN)</option>
                                                    <option value="EMPLOYEE" className="bg-[var(--bg-primary)] text-blue-400">員工 (EMPLOYEE)</option>
                                                    <option value="VIEWER" className="bg-[var(--bg-primary)] text-slate-400">檢視者 (VIEWER)</option>
                                                </select>
                                            )}
                                        </td>
                                        <td className="p-4 text-center">
                                            {u.status === 'ACTIVE' ? (
                                                <span className="flex items-center justify-center gap-2 text-emerald-500 font-bold text-xs">
                                                    <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.3)]"></span> ACTIVE
                                                </span>
                                            ) : (
                                                <span className="flex items-center justify-center gap-2 text-[var(--text-secondary)] font-bold text-xs">
                                                    <span className="w-2 h-2 rounded-full bg-slate-500"></span> {u.status || 'UNKNOWN'}
                                                </span>
                                            )}
                                        </td>

                                        <td className="p-4 text-center flex items-center justify-center gap-2">
                                            {u.username !== 'admin' && (
                                                <div className="flex items-center gap-1">
                                                    <button
                                                        onClick={() => {
                                                            let currentPerms = Array.isArray(u.permissions) ? [...u.permissions] : [];
                                                            const legacyMap = {
                                                                'sales': ['sales_entry', 'sales_report'],
                                                                'purchase': ['purchase_entry', 'purchase_history'],
                                                                'inventory': ['inventory_adjust', 'inventory_stocktake', 'inventory_valuation', 'inventory_adjust_history', 'inventory_stocktake_history'],
                                                                'finance': ['finance_expenditure', 'finance_receivable', 'finance_payable', 'finance_income', 'finance_cost'],
                                                                'analytics': ['analytics_sales', 'analytics_customer', 'analytics_profit', 'analytics_turnover'],
                                                                'system': ['system_config'],
                                                                'inventory_history': ['inventory_adjust_history', 'inventory_stocktake_history']
                                                            };

                                                            Object.keys(legacyMap).forEach(legacyKey => {
                                                                if (currentPerms.includes(legacyKey)) {
                                                                    currentPerms = currentPerms.filter(p => p !== legacyKey);
                                                                    legacyMap[legacyKey].forEach(newKey => {
                                                                        if (!currentPerms.includes(newKey)) currentPerms.push(newKey);
                                                                    });
                                                                }
                                                            });

                                                            setEditingUser({ username: u.username, permissions: currentPerms });
                                                        }}
                                                        className="p-2 text-[var(--text-tertiary)] hover:text-[var(--accent-blue)] transition-colors"
                                                        title="設定權限"
                                                    >
                                                        <Shield size={16} />
                                                    </button>
                                                    <button
                                                        onClick={() => { setPasswordModal({ username: u.username }); setNewPassword(''); }}
                                                        className="p-2 text-[var(--text-tertiary)] hover:text-amber-400 transition-colors"
                                                        title="更改密碼"
                                                    >
                                                        <KeyRound size={16} />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteUser(u.username)}
                                                        className="p-2 text-[var(--text-tertiary)] hover:text-rose-400 transition-colors"
                                                        title="刪除"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan="4" className="p-20 text-center text-[var(--text-secondary)]">
                                        {loading ? '載入中...' : '無使用者資料'}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>

                    {/* Mobile Card Layout */}
                    <div className="md:hidden divide-y divide-[var(--border-primary)]">
                        {users.length > 0 ? (
                            users.map((u, idx) => (
                                <div key={idx} className="p-6 bg-[var(--bg-primary)] hover:bg-[var(--bg-secondary)] transition-colors border-b border-[var(--border-primary)] last:border-0 shadow-sm space-y-3">
                                    <div className="flex justify-between items-center">
                                        <div className="space-y-1">
                                            <div className="text-lg font-extrabold text-[var(--text-primary)] leading-tight">{u.username}</div>
                                            {u.status === 'ACTIVE' ? (
                                                <span className="flex items-center gap-1.5 text-emerald-500 font-bold text-[11px]">
                                                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span> ACTIVE
                                                </span>
                                            ) : (
                                                <span className="flex items-center gap-1.5 text-[var(--text-tertiary)] font-bold text-[11px]">
                                                    <span className="w-2 h-2 rounded-full bg-slate-300"></span> {u.status || 'OFF'}
                                                </span>
                                            )}
                                        </div>

                                        {u.username !== 'admin' && (
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => {
                                                        let currentPerms = Array.isArray(u.permissions) ? [...u.permissions] : [];
                                                        const legacyMap = {
                                                            'sales': ['sales_entry', 'sales_report'],
                                                            'purchase': ['purchase_entry', 'purchase_history'],
                                                            'inventory': ['inventory_adjust', 'inventory_stocktake', 'inventory_valuation', 'inventory_adjust_history', 'inventory_stocktake_history'],
                                                            'finance': ['finance_expenditure', 'finance_receivable', 'finance_payable', 'finance_income', 'finance_cost'],
                                                            'analytics': ['analytics_sales', 'analytics_customer', 'analytics_profit', 'analytics_turnover'],
                                                            'system': ['system_config'],
                                                            'inventory_history': ['inventory_adjust_history', 'inventory_stocktake_history']
                                                        };

                                                        Object.keys(legacyMap).forEach(legacyKey => {
                                                            if (currentPerms.includes(legacyKey)) {
                                                                currentPerms = currentPerms.filter(p => p !== legacyKey);
                                                                legacyMap[legacyKey].forEach(newKey => {
                                                                    if (!currentPerms.includes(newKey)) currentPerms.push(newKey);
                                                                });
                                                            }
                                                        });

                                                        setEditingUser({ username: u.username, permissions: currentPerms });
                                                    }}
                                                    className="p-2 text-[var(--text-tertiary)] hover:text-[var(--accent-blue)] transition-colors"
                                                    title="設定權限"
                                                >
                                                    <Shield size={18} />
                                                </button>
                                                <button
                                                    onClick={() => { setPasswordModal({ username: u.username }); setNewPassword(''); }}
                                                    className="p-2 text-[var(--text-tertiary)] hover:text-amber-400 transition-colors"
                                                    title="更改密碼"
                                                >
                                                    <KeyRound size={18} />
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteUser(u.username)}
                                                    className="p-2 text-[var(--text-tertiary)] hover:text-rose-400 transition-colors"
                                                    title="刪除"
                                                >
                                                    <Trash2 size={18} />
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-[var(--text-secondary)] font-bold">角色：</span>
                                        {u.username === 'admin' ? (
                                            <span className="px-2.5 py-0.5 rounded text-[11px] font-bold border bg-purple-950/30 text-purple-400 border-purple-500/40">
                                                超級管理員 (SUPER_ADMIN)
                                            </span>
                                        ) : (
                                            <select
                                                value={u.role || 'VIEWER'}
                                                onChange={(e) => handleUpdateRole(u.username, e.target.value)}
                                                className={`px-2 py-1 rounded text-xs font-bold border bg-transparent cursor-pointer transition-colors ${
                                                    u.role === 'SUPER_ADMIN' ? 'text-purple-400 border-purple-500/40 bg-purple-950/30' :
                                                    u.role === 'BOSS' ? 'text-amber-400 border-amber-500/40 bg-amber-950/30' :
                                                    u.role === 'ADMIN' ? 'text-rose-400 border-rose-500/40 bg-rose-950/30' :
                                                    u.role === 'EMPLOYEE' ? 'text-blue-400 border-blue-500/40 bg-blue-950/30' :
                                                    'text-slate-400 border-slate-500/40 bg-slate-950/30'
                                                }`}
                                            >
                                                <option value="SUPER_ADMIN" className="bg-[var(--bg-primary)] text-purple-400">超級管理員 (SUPER_ADMIN)</option>
                                                <option value="BOSS" className="bg-[var(--bg-primary)] text-amber-400">老闆 (BOSS)</option>
                                                <option value="ADMIN" className="bg-[var(--bg-primary)] text-rose-400">管理員 (ADMIN)</option>
                                                <option value="EMPLOYEE" className="bg-[var(--bg-primary)] text-blue-400">員工 (EMPLOYEE)</option>
                                                <option value="VIEWER" className="bg-[var(--bg-primary)] text-slate-400">檢視者 (VIEWER)</option>
                                            </select>
                                        )}
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="p-10 text-center text-[var(--text-secondary)]">
                                {loading ? '載入中...' : '無使用者資料'}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Permission Edit Modal */}
            {editingUser && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-150">
                        <div className="p-4 md:p-6 border-b border-[var(--border-primary)] flex justify-between items-center">
                            <div>
                                <h3 className="font-bold text-lg text-[var(--text-primary)]">設定使用者細部權限</h3>
                                <p className="text-xs text-[var(--text-secondary)]">帳號: <span className="font-bold text-[var(--accent-blue)]">{editingUser.username}</span></p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={toggleSelectAll}
                                    className="px-3 py-1.5 bg-[var(--bg-secondary)] hover:bg-[var(--border-primary)] text-[var(--text-primary)] rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors"
                                >
                                    <CheckSquare size={14} />
                                    {AVAILABLE_PERMISSIONS.flatMap(g => g.items.map(i => i.key)).every(k => (editingUser.permissions || []).includes(k))
                                        ? '取消全選'
                                        : '一鍵全選'}
                                </button>
                                <button
                                    onClick={() => setEditingUser(null)}
                                    className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] p-1"
                                >
                                    ✕
                                </button>
                            </div>
                        </div>

                        <div className="p-4 md:p-6 overflow-y-auto flex-1 space-y-6">
                            {AVAILABLE_PERMISSIONS.map((group, gIdx) => {
                                const groupKeys = group.items.map(i => i.key);
                                const currentPerms = editingUser.permissions || [];
                                const isGroupAllSelected = groupKeys.every(k => currentPerms.includes(k));
                                const isGroupSomeSelected = groupKeys.some(k => currentPerms.includes(k)) && !isGroupAllSelected;

                                return (
                                    <div key={gIdx} className="space-y-3 bg-[var(--bg-secondary)]/30 p-4 rounded-xl border border-[var(--border-primary)]/50">
                                        <div className="flex justify-between items-center border-b border-[var(--border-primary)]/50 pb-2">
                                            <h4 className="font-bold text-sm text-[var(--accent-blue)] flex items-center gap-2">
                                                {group.group}
                                            </h4>
                                            <button
                                                onClick={() => toggleGroup(group.items)}
                                                className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-medium flex items-center gap-1"
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={isGroupAllSelected}
                                                    ref={el => { if (el) el.indeterminate = isGroupSomeSelected; }}
                                                    onChange={() => { }}
                                                    className="rounded border-[var(--border-primary)] cursor-pointer"
                                                />
                                                {isGroupAllSelected ? '取消本組' : '全選本組'}
                                            </button>
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            {group.items.map((item, iIdx) => {
                                                const isChecked = currentPerms.includes(item.key);
                                                return (
                                                    <label
                                                        key={iIdx}
                                                        className={`flex items-center gap-3 p-3 rounded-lg border transition-all cursor-pointer select-none ${isChecked
                                                            ? 'bg-[var(--accent-blue)]/10 border-[var(--accent-blue)]/40 text-[var(--text-primary)] font-bold'
                                                            : 'bg-[var(--bg-primary)] border-[var(--border-primary)] text-[var(--text-secondary)] hover:border-[var(--text-tertiary)]'
                                                            }`}
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            checked={isChecked}
                                                            onChange={() => togglePermission(item.key)}
                                                            className="rounded border-[var(--border-primary)] text-[var(--accent-blue)] focus:ring-[var(--accent-blue)]"
                                                        />
                                                        <span className="text-xs">{item.label}</span>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="p-4 md:p-6 border-t border-[var(--border-primary)] flex justify-end gap-3 bg-[var(--bg-secondary)]/20 rounded-b-2xl">
                            <button
                                onClick={() => setEditingUser(null)}
                                className="btn-secondary"
                            >
                                取消
                            </button>
                            <button
                                onClick={handleSavePermissions}
                                className="btn-primary flex items-center gap-2"
                            >
                                <Save size={16} /> 儲存變更
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Password Change Modal */}
            {passwordModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-2xl max-w-md w-full p-6 shadow-2xl animate-in zoom-in-95 duration-150 space-y-4">
                        <h3 className="font-bold text-lg text-[var(--text-primary)]">更改密碼</h3>
                        <p className="text-xs text-[var(--text-secondary)]">使用者: <span className="font-bold text-amber-500">{passwordModal.username}</span></p>

                        <div className="space-y-1">
                            <label className="text-xs text-[var(--text-secondary)] font-bold">新密碼</label>
                            <input
                                type="password"
                                className="input-field w-full"
                                value={newPassword}
                                onChange={e => setNewPassword(e.target.value)}
                                placeholder="輸入新密碼"
                            />
                        </div>

                        <div className="flex justify-end gap-3 pt-2">
                            <button
                                onClick={() => setPasswordModal(null)}
                                className="btn-secondary"
                            >
                                取消
                            </button>
                            <button
                                onClick={handleChangePassword}
                                className="btn-primary"
                            >
                                確定修改
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
