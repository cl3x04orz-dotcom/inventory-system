import React, { useState, useEffect, useCallback } from 'react';
import { callGAS } from '../utils/api';
import {
  Building2, Plus, RefreshCw, CheckCircle, XCircle, AlertCircle,
  Users, Calendar, Loader2, X, Edit2, Trash2, LogIn, ToggleLeft, ToggleRight, Save
} from 'lucide-react';

function formatDate(dateStr) {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

export default function SuperAdminPage({ user, apiUrl }) {
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingTenant, setEditingTenant] = useState(null); // { storeCode, name, status }
  const [deleteTarget, setDeleteTarget] = useState(null);   // { storeCode, name }
  const [form, setForm] = useState({ storeCode: '', name: '', adminUsername: '', adminPassword: '' });
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null);

  const fetchTenants = useCallback(async () => {
    setLoading(true);
    try {
      const result = await callGAS(apiUrl, 'getTenants', {}, user.token);
      if (result?.error) throw new Error(result.error);
      setTenants(result || []);
    } catch (e) {
      setMessage({ type: 'error', text: e.message });
    } finally {
      setLoading(false);
    }
  }, [apiUrl, user.token]);

  useEffect(() => { fetchTenants(); }, [fetchTenants]);

  const showMsg = (type, text) => setMessage({ type, text });

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.storeCode || !form.name || !form.adminUsername || !form.adminPassword) {
      showMsg('error', '請填寫所有欄位'); return;
    }
    setSubmitting(true);
    try {
      const result = await callGAS(apiUrl, 'createTenant', form, user.token);
      if (result?.error) throw new Error(result.error);
      showMsg('success', result?.message || '店鋪開通成功！');
      setShowCreateModal(false);
      setForm({ storeCode: '', name: '', adminUsername: '', adminPassword: '' });
      fetchTenants();
    } catch (e) { showMsg('error', e.message); }
    finally { setSubmitting(false); }
  };

  const handleUpdate = async () => {
    if (!editingTenant?.name) { showMsg('error', '店鋪名稱不能為空'); return; }
    setSubmitting(true);
    try {
      const result = await callGAS(apiUrl, 'updateTenant', {
        storeCode: editingTenant.storeCode,
        name: editingTenant.name,
        status: editingTenant.status,
      }, user.token);
      if (result?.error) throw new Error(result.error);
      showMsg('success', '更新成功！');
      setEditingTenant(null);
      fetchTenants();
    } catch (e) { showMsg('error', e.message); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async (force = false) => {
    setSubmitting(true);
    try {
      const result = await callGAS(apiUrl, 'deleteTenant', { storeCode: deleteTarget.storeCode, force }, user.token);
      if (result?.error) throw new Error(result.error);
      showMsg('success', result?.message);
      setDeleteTarget(null);
      fetchTenants();
    } catch (e) { showMsg('error', e.message); }
    finally { setSubmitting(false); }
  };

  const handleImpersonate = async (storeCode, storeName) => {
    try {
      const result = await callGAS(apiUrl, 'impersonateTenant', { storeCode }, user.token);
      if (result?.error) throw new Error(result.error);
      // 儲存目前 SUPER_ADMIN 的完整 user 物件，以便以後回來
      sessionStorage.setItem('superAdminBackup', JSON.stringify(user));
      // 寫入新的 user 物件（含新店鋪 token）到 inventory_user
      const impersonatedUser = {
        ...result,
        token: result.token,
        permissions: result.permissions || [],
      };
      sessionStorage.setItem('inventory_user', JSON.stringify(impersonatedUser));
      showMsg('success', `正在進入 ${storeName}（${storeCode}）...`);
      setTimeout(() => window.location.reload(), 800);
    } catch (e) { showMsg('error', e.message); }
  };

  const statusBadge = (status) => {
    const isActive = status === 'active';
    return (
      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-500'}`}>
        {isActive ? <CheckCircle size={10} /> : <XCircle size={10} />}
        {isActive ? '運營中' : '已停用'}
      </span>
    );
  };

  const inputStyle = { borderColor: '#e2e8f0', backgroundColor: '#f8fafc', color: '#1e293b' };

  return (
    <div className="p-6 max-w-6xl mx-auto" style={{ color: '#1e293b' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg">
              <Building2 size={20} className="text-white" />
            </div>
            <h1 className="text-2xl font-bold" style={{ color: '#1e293b' }}>租戶管理後台</h1>
          </div>
          <p className="text-sm" style={{ color: '#64748b' }}>SaaS 平台控制中心 · 僅限超級管理員</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={fetchTenants} disabled={loading}
            className="flex items-center gap-2 px-4 py-2 text-sm rounded-xl border transition-all shadow-sm hover:bg-slate-50"
            style={{ color: '#475569', backgroundColor: '#fff', borderColor: '#e2e8f0' }}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />重新整理
          </button>
          <button onClick={() => { setShowCreateModal(true); setMessage(null); }}
            className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-gradient-to-r from-violet-500 to-purple-600 rounded-xl hover:from-violet-600 hover:to-purple-700 transition-all shadow-md active:scale-95">
            <Plus size={16} />開通新店鋪
          </button>
        </div>
      </div>

      {/* Message */}
      {message && (
        <div className={`flex items-center gap-3 p-4 rounded-xl mb-6 text-sm font-medium ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {message.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
          {message.text}
          <button onClick={() => setMessage(null)} className="ml-auto opacity-60 hover:opacity-100"><X size={14} /></button>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {[
          { label: '總店鋪數', value: tenants.length, gradient: 'from-blue-500 to-cyan-500' },
          { label: '運營中', value: tenants.filter(t => t.status === 'active').length, gradient: 'from-emerald-500 to-teal-500' },
          { label: '已停用', value: tenants.filter(t => t.status !== 'active').length, gradient: 'from-red-400 to-rose-500' },
        ].map(stat => (
          <div key={stat.label} className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
            <div className={`text-3xl font-black bg-gradient-to-r ${stat.gradient} bg-clip-text text-transparent`}>{stat.value}</div>
            <div className="text-xs mt-1 font-medium" style={{ color: '#64748b' }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-sm" style={{ color: '#334155' }}>所有店鋪列表</h2>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-20" style={{ color: '#94a3b8' }}>
            <Loader2 size={24} className="animate-spin mr-3" /><span className="text-sm">載入中...</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ color: '#94a3b8', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', borderBottom: '1px solid #f1f5f9' }}>
                  <th className="text-left px-6 py-3 font-medium">店鋪代號</th>
                  <th className="text-left px-6 py-3 font-medium">店鋪名稱</th>
                  <th className="text-left px-6 py-3 font-medium">狀態</th>
                  <th className="text-left px-6 py-3 font-medium"><span className="flex items-center gap-1"><Users size={11} />用戶數</span></th>
                  <th className="text-left px-6 py-3 font-medium"><span className="flex items-center gap-1"><Calendar size={11} />開通日期</span></th>
                  <th className="text-right px-6 py-3 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {tenants.map((tenant) => (
                  <tr key={tenant.storeCode} className="transition-colors hover:bg-slate-50" style={{ borderTop: '1px solid #f1f5f9' }}>
                    <td className="px-6 py-4">
                      <code className="font-mono font-bold px-2 py-0.5 rounded-md text-xs" style={{ color: '#7c3aed', backgroundColor: '#f5f3ff' }}>
                        {tenant.storeCode}
                      </code>
                    </td>
                    <td className="px-6 py-4 font-semibold" style={{ color: '#334155' }}>{tenant.name}</td>
                    <td className="px-6 py-4">{statusBadge(tenant.status)}</td>
                    <td className="px-6 py-4"><span className="flex items-center gap-1.5" style={{ color: '#64748b' }}><Users size={13} />{tenant.userCount}</span></td>
                    <td className="px-6 py-4 text-xs" style={{ color: '#94a3b8' }}>{formatDate(tenant.createdAt)}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* 進入此店 */}
                        <button
                          onClick={() => handleImpersonate(tenant.storeCode, tenant.name)}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white rounded-lg transition-all hover:shadow-md active:scale-95"
                          style={{ background: 'linear-gradient(to right, #6366f1, #8b5cf6)' }}
                          title="以此店老闆身分登入"
                        >
                          <LogIn size={12} />進入
                        </button>
                        {/* 編輯 */}
                        <button
                          onClick={() => { setEditingTenant({ ...tenant }); setMessage(null); }}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all hover:bg-slate-100"
                          style={{ color: '#475569', borderColor: '#e2e8f0' }}
                          title="編輯店鋪"
                        >
                          <Edit2 size={12} />編輯
                        </button>
                        {/* 刪除 */}
                        <button
                          onClick={() => setDeleteTarget(tenant)}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all hover:bg-red-50"
                          style={{ color: '#ef4444', borderColor: '#fecaca' }}
                          title="刪除店鋪"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 編輯 Modal */}
      {editingTenant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setEditingTenant(null)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl p-6 border border-slate-200" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-lg flex items-center gap-2" style={{ color: '#1e293b' }}>
                <Edit2 size={18} className="text-violet-500" />編輯店鋪
              </h3>
              <button onClick={() => setEditingTenant(null)} style={{ color: '#94a3b8' }}><X size={20} /></button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: '#64748b' }}>店鋪代號（不可更改）</label>
                <div className="px-4 py-2.5 rounded-xl border text-sm font-mono font-bold" style={{ borderColor: '#e2e8f0', backgroundColor: '#f1f5f9', color: '#7c3aed' }}>
                  {editingTenant.storeCode}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: '#64748b' }}>店鋪名稱</label>
                <input
                  value={editingTenant.name}
                  onChange={e => setEditingTenant(t => ({ ...t, name: e.target.value }))}
                  className="w-full px-4 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                  style={inputStyle}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: '#64748b' }}>狀態</label>
                <div className="flex gap-3">
                  {['active', 'inactive'].map(s => (
                    <button key={s} onClick={() => setEditingTenant(t => ({ ...t, status: s }))}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-all ${editingTenant.status === s ? (s === 'active' ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : 'bg-red-50 border-red-300 text-red-600') : 'border-slate-200 text-slate-400 hover:bg-slate-50'}`}>
                      {s === 'active' ? '✅ 運營中' : '⛔ 已停用'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setEditingTenant(null)} className="flex-1 py-2.5 text-sm rounded-xl font-medium" style={{ color: '#475569', backgroundColor: '#f1f5f9' }}>取消</button>
              <button onClick={handleUpdate} disabled={submitting}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-violet-500 to-purple-600 rounded-xl hover:from-violet-600 hover:to-purple-700 disabled:opacity-60 shadow-md">
                {submitting ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}儲存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 刪除確認 Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setDeleteTarget(null)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl p-6 border border-slate-200" onClick={e => e.stopPropagation()}>
            <div className="text-center mb-6">
              <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
                <Trash2 size={24} className="text-red-500" />
              </div>
              <h3 className="font-bold text-lg mb-2" style={{ color: '#1e293b' }}>刪除店鋪</h3>
              <p className="text-sm" style={{ color: '#64748b' }}>
                你確定要操作 <strong style={{ color: '#7c3aed' }}>{deleteTarget.storeCode}</strong> ({deleteTarget.name}) 嗎？
              </p>
            </div>

            <div className="space-y-3">
              <button onClick={() => handleDelete(false)} disabled={submitting}
                className="w-full py-2.5 text-sm font-semibold rounded-xl border transition-all hover:bg-orange-50"
                style={{ color: '#f97316', borderColor: '#fed7aa' }}>
                ⚠️ 停用此店鋪（保留資料，可日後恢復）
              </button>
              <button onClick={() => handleDelete(true)} disabled={submitting}
                className="w-full py-2.5 text-sm font-semibold text-white rounded-xl transition-all active:scale-95"
                style={{ backgroundColor: '#ef4444' }}>
                {submitting ? '處理中...' : '🗑 永久刪除（包含所有帳號，不可復原）'}
              </button>
              <button onClick={() => setDeleteTarget(null)} className="w-full py-2 text-sm rounded-xl" style={{ color: '#94a3b8' }}>取消</button>
            </div>
          </div>
        </div>
      )}

      {/* 新增店鋪 Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowCreateModal(false)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl p-6 border border-slate-200" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-bold text-lg flex items-center gap-2" style={{ color: '#1e293b' }}>
                <Plus size={18} className="text-violet-500" />開通新店鋪
              </h3>
              <button onClick={() => setShowCreateModal(false)} style={{ color: '#94a3b8' }}><X size={20} /></button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              {[
                { key: 'storeCode', label: '店鋪代號', placeholder: '例：MILI003', hint: '建立後無法更改' },
                { key: 'name', label: '店鋪名稱', placeholder: '例：秘密客三店' },
                { key: 'adminUsername', label: '管理員帳號', placeholder: '請輸入登入帳號' },
                { key: 'adminPassword', label: '管理員預設密碼', placeholder: '請輸入預設密碼', type: 'password' },
              ].map(field => (
                <div key={field.key}>
                  <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: '#64748b' }}>
                    {field.label}
                    {field.hint && <span className="ml-2 text-orange-400 normal-case font-normal">· {field.hint}</span>}
                  </label>
                  <input type={field.type || 'text'} value={form[field.key]}
                    onChange={e => setForm(f => ({ ...f, [field.key]: e.target.value }))}
                    placeholder={field.placeholder}
                    className="w-full px-4 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                    style={inputStyle} />
                </div>
              ))}

              {message && (
                <div className={`flex items-center gap-2 p-3 rounded-xl text-xs font-medium ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                  {message.type === 'success' ? <CheckCircle size={13} /> : <AlertCircle size={13} />}
                  {message.text}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowCreateModal(false)} className="flex-1 py-2.5 text-sm rounded-xl font-medium" style={{ color: '#475569', backgroundColor: '#f1f5f9' }}>取消</button>
                <button type="submit" disabled={submitting}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-violet-500 to-purple-600 rounded-xl hover:from-violet-600 hover:to-purple-700 disabled:opacity-60 shadow-md">
                  {submitting ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                  {submitting ? '開通中...' : '立即開通'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
