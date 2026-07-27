import React, { useState, useEffect, useCallback } from 'react';
import { callGAS } from '../utils/api';
import { Building2, Plus, RefreshCw, CheckCircle, XCircle, AlertCircle, Users, Calendar, Loader2, X } from 'lucide-react';

function formatDate(dateStr) {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

export default function SuperAdminPage({ user, apiUrl }) {
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ storeCode: '', name: '', adminUsername: '', adminPassword: '' });
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null); // { type: 'success' | 'error', text: '' }

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

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.storeCode || !form.name || !form.adminUsername || !form.adminPassword) {
      setMessage({ type: 'error', text: '請填寫所有欄位' });
      return;
    }
    setSubmitting(true);
    setMessage(null);
    try {
      const result = await callGAS(apiUrl, 'createTenant', form, user.token);
      if (result?.error) throw new Error(result.error);
      setMessage({ type: 'success', text: result?.message || '店鋪開通成功！' });
      setShowModal(false);
      setForm({ storeCode: '', name: '', adminUsername: '', adminPassword: '' });
      fetchTenants();
    } catch (e) {
      setMessage({ type: 'error', text: e.message });
    } finally {
      setSubmitting(false);
    }
  };

  const statusBadge = (status) => {
    const isActive = status === 'active';
    return (
      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${isActive ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>
        {isActive ? <CheckCircle size={10} /> : <XCircle size={10} />}
        {isActive ? '運營中' : '已停用'}
      </span>
    );
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg">
              <Building2 size={20} className="text-white" />
            </div>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-white">租戶管理後台</h1>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 ml-13">SaaS 平台控制中心 · 僅限超級管理員</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchTenants}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 text-sm text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-all shadow-sm"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            重新整理
          </button>
          <button
            onClick={() => { setShowModal(true); setMessage(null); }}
            className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-gradient-to-r from-violet-500 to-purple-600 rounded-xl hover:from-violet-600 hover:to-purple-700 transition-all shadow-md hover:shadow-lg active:scale-95"
          >
            <Plus size={16} />
            開通新店鋪
          </button>
        </div>
      </div>

      {/* Message */}
      {message && (
        <div className={`flex items-center gap-3 p-4 rounded-xl mb-6 text-sm font-medium ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/30 dark:border-emerald-800 dark:text-emerald-400' : 'bg-red-50 text-red-700 border border-red-200 dark:bg-red-900/30 dark:border-red-800 dark:text-red-400'}`}>
          {message.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
          {message.text}
          <button onClick={() => setMessage(null)} className="ml-auto"><X size={14} /></button>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-8">
        {[
          { label: '總店鋪數', value: tenants.length, color: 'from-blue-500 to-cyan-500' },
          { label: '運營中', value: tenants.filter(t => t.status === 'active').length, color: 'from-emerald-500 to-teal-500' },
          { label: '已停用', value: tenants.filter(t => t.status !== 'active').length, color: 'from-slate-400 to-slate-500' },
        ].map(stat => (
          <div key={stat.label} className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-slate-100 dark:border-slate-700 shadow-sm">
            <div className={`text-3xl font-black bg-gradient-to-r ${stat.color} bg-clip-text text-transparent`}>{stat.value}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700">
          <h2 className="font-semibold text-slate-700 dark:text-slate-200 text-sm">所有店鋪列表</h2>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-400">
            <Loader2 size={24} className="animate-spin mr-3" />
            <span className="text-sm">載入中...</span>
          </div>
        ) : tenants.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <Building2 size={40} className="mb-3 opacity-30" />
            <p className="text-sm">尚無店鋪資料</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                  <th className="text-left px-6 py-3 font-medium">店鋪代號</th>
                  <th className="text-left px-6 py-3 font-medium">店鋪名稱</th>
                  <th className="text-left px-6 py-3 font-medium">狀態</th>
                  <th className="text-left px-6 py-3 font-medium">
                    <span className="flex items-center gap-1"><Users size={11} />用戶數</span>
                  </th>
                  <th className="text-left px-6 py-3 font-medium">
                    <span className="flex items-center gap-1"><Calendar size={11} />開通日期</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-700/50">
                {tenants.map((tenant, i) => (
                  <tr key={tenant.storeCode} className={`transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/30 ${i === 0 ? 'bg-violet-50/30 dark:bg-violet-900/10' : ''}`}>
                    <td className="px-6 py-4">
                      <code className="font-mono font-bold text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/30 px-2 py-0.5 rounded-md text-xs">
                        {tenant.storeCode}
                      </code>
                    </td>
                    <td className="px-6 py-4 font-semibold text-slate-700 dark:text-slate-200">{tenant.name}</td>
                    <td className="px-6 py-4">{statusBadge(tenant.status)}</td>
                    <td className="px-6 py-4">
                      <span className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                        <Users size={13} />
                        {tenant.userCount}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-400 dark:text-slate-500 text-xs">{formatDate(tenant.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative w-full max-w-md bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-6 border border-slate-200 dark:border-slate-700" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
                  <Plus size={16} className="text-white" />
                </div>
                <h3 className="font-bold text-slate-800 dark:text-white text-lg">開通新店鋪</h3>
              </div>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {[
                { key: 'storeCode', label: '店鋪代號', placeholder: '例：MILI003（英大寫+數字）', hint: '建立後無法更改' },
                { key: 'name', label: '店鋪名稱', placeholder: '例：秘密客三店' },
                { key: 'adminUsername', label: '管理員帳號', placeholder: '請輸入登入帳號' },
                { key: 'adminPassword', label: '管理員預設密碼', placeholder: '請輸入預設密碼', type: 'password' },
              ].map(field => (
                <div key={field.key}>
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                    {field.label}
                    {field.hint && <span className="ml-2 text-orange-400 normal-case font-normal tracking-normal">· {field.hint}</span>}
                  </label>
                  <input
                    type={field.type || 'text'}
                    value={form[field.key]}
                    onChange={e => setForm(f => ({ ...f, [field.key]: e.target.value }))}
                    placeholder={field.placeholder}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent text-sm transition-all"
                  />
                </div>
              ))}

              {message && (
                <div className={`flex items-center gap-2 p-3 rounded-xl text-xs font-medium ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                  {message.type === 'success' ? <CheckCircle size={13} /> : <AlertCircle size={13} />}
                  {message.text}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 px-4 py-2.5 text-sm text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-600 transition-all font-medium">
                  取消
                </button>
                <button type="submit" disabled={submitting} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-violet-500 to-purple-600 rounded-xl hover:from-violet-600 hover:to-purple-700 disabled:opacity-60 transition-all shadow-md">
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
