import React, { useState, useEffect } from "react";
import {
  Search,
  Wallet,
  History,
  Plus,
  Minus,
  RefreshCw,
  User,
  X,
  TrendingUp,
  ClipboardList,
  Check,
} from "lucide-react";
import { callGAS } from "../utils/api";

export default function MemberManagementPage({ user, apiUrl }) {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMember, setSelectedMember] = useState(null);
  
  // Modals state
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  
  // Wallet Adjust Form state
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustType, setAdjustType] = useState("add"); // "add" or "sub"
  const [adjustNote, setAdjustNote] = useState("");
  const [adjustSubmitting, setAdjustSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  const fetchMembers = async () => {
    setLoading(true);
    try {
      const res = await callGAS(apiUrl, "admin_getMembers", {}, user.token);
      if (Array.isArray(res)) {
        setMembers(res);
      } else if (res?.error) {
        console.error("Failed to load members:", res.error);
      }
    } catch (err) {
      console.error("Failed to fetch members:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMembers();
  }, []);

  const handleAdjustWallet = async (e) => {
    e.preventDefault();
    if (!selectedMember || !adjustAmount) return;

    const amountNum = Number(adjustAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      alert("請輸入大於 0 的有效金額");
      return;
    }

    const finalAmount = adjustType === "add" ? amountNum : -amountNum;
    
    setAdjustSubmitting(true);
    try {
      const res = await callGAS(
        apiUrl,
        "admin_adjustWallet",
        {
          memberId: selectedMember.memberId,
          amount: finalAmount,
          description: adjustNote.trim() || (adjustType === "add" ? "管理員手動儲值" : "管理員扣抵調整")
        },
        user.token
      );

      if (res && res.success) {
        setSuccessMessage(`成功為 ${selectedMember.displayName || "該會員"} ${adjustType === "add" ? "儲值" : "扣除"} $${amountNum}`);
        setAdjustAmount("");
        setAdjustNote("");
        fetchMembers(); // 重新整理列表
        
        // 延遲關閉 modal
        setTimeout(() => {
          setSuccessMessage("");
          setShowAdjustModal(false);
          setSelectedMember(null);
        }, 1500);
      } else {
        alert(res?.error || "調整失敗");
      }
    } catch (err) {
      alert("網路連線錯誤");
    } finally {
      setAdjustSubmitting(false);
    }
  };

  // 篩選會員
  const filteredMembers = members.filter((m) => {
    const q = searchQuery.toLowerCase();
    return (
      (m.displayName || "").toLowerCase().includes(q) ||
      (m.receiverName || "").toLowerCase().includes(q) ||
      (m.phone || "").includes(q) ||
      (m.memberId || "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="max-w-7xl mx-auto h-[calc(100vh-6rem)] flex flex-col p-4 gap-4 overflow-y-auto">
      {/* 頁面標題 */}
      <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center bg-[var(--bg-secondary)] p-4 rounded-xl border border-[var(--border-primary)] shadow-sm gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2 text-[var(--text-primary)]">
            <Wallet className="text-emerald-500" size={24} /> 會員儲值管理 (奶包金)
          </h1>
          <p className="text-xs text-[var(--text-secondary)] mt-1">
            在此管理 LINE LIFF 註冊的會員餘額、儲值奶包金、並核對錢包交易流水。
          </p>
        </div>
        <button
          onClick={fetchMembers}
          disabled={loading}
          className="btn-secondary px-4 py-2 rounded-xl font-bold flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-55 active:scale-95 shrink-0"
        >
          <RefreshCw className={loading ? "animate-spin text-blue-500" : "text-blue-500"} size={15} />
          重新整理
        </button>
      </div>

      {/* 搜尋與數據小卡 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center flex-shrink-0">
        <div className="md:col-span-2 relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" size={16} />
          <input
            type="text"
            placeholder="搜尋 LINE 暱稱、收件姓名、電話..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] text-[var(--text-primary)] text-sm focus:outline-none focus:border-blue-500 transition-all"
          />
        </div>
        
        <div className="bg-emerald-500/5 dark:bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3.5 flex justify-between items-center shadow-sm">
          <div>
            <div className="text-xs text-emerald-600 dark:text-emerald-400 font-bold">總註冊會員</div>
            <div className="text-xl font-black text-emerald-700 dark:text-emerald-300 font-mono mt-1">{members.length} 人</div>
          </div>
          <User className="text-emerald-500/30" size={28} />
        </div>

        <div className="bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/20 rounded-xl p-3.5 flex justify-between items-center shadow-sm">
          <div>
            <div className="text-xs text-amber-600 dark:text-amber-400 font-bold">奶包金發放總額</div>
            <div className="text-xl font-black text-amber-700 dark:text-amber-300 font-mono mt-1">
              ${members.reduce((s, m) => s + (m.walletBalance || 0), 0).toLocaleString()}
            </div>
          </div>
          <Wallet className="text-amber-500/30" size={28} />
        </div>
      </div>

      {/* 會員列表 Table */}
      <div className="bg-[var(--bg-secondary)] rounded-2xl border border-[var(--border-primary)] overflow-hidden shadow-sm flex-1 flex flex-col min-h-0">
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[var(--bg-tertiary)] text-[var(--text-secondary)] text-xs font-bold uppercase tracking-wider border-b border-[var(--border-primary)]">
                <th className="py-3 px-4">會員資訊</th>
                <th className="py-3 px-4">收件姓名 / 電話</th>
                <th className="py-3 px-4">會員等級</th>
                <th className="py-3 px-4 text-right">奶包金餘額</th>
                <th className="py-3 px-4 text-right">累計消費</th>
                <th className="py-3 px-4 text-center">操作項目</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-primary)]/40 text-sm text-[var(--text-secondary)]">
              {loading && members.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-[var(--text-tertiary)]">
                    <RefreshCw className="animate-spin mx-auto mb-2 text-blue-500" size={24} />
                    載入中，請稍候...
                  </td>
                </tr>
              ) : filteredMembers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-[var(--text-tertiary)]">
                    沒有符合搜尋條件的會員。
                  </td>
                </tr>
              ) : (
                filteredMembers.map((m) => (
                  <tr key={m.memberId} className="hover:bg-[var(--bg-tertiary)]/40 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full overflow-hidden bg-[var(--bg-tertiary)] border border-[var(--border-primary)] shrink-0 flex items-center justify-center">
                          {m.pictureUrl ? (
                            <img src={m.pictureUrl} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <User size={16} className="text-[var(--text-tertiary)]" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="font-bold text-[var(--text-primary)] truncate">
                            {m.displayName || "LINE 用戶"}
                          </div>
                          <div className="text-[10px] text-[var(--text-tertiary)] font-mono truncate max-w-[150px]" title={m.memberId}>
                            ID: {m.memberId}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      {m.receiverName ? (
                        <div>
                          <div className="font-medium text-[var(--text-primary)]">{m.receiverName}</div>
                          <div className="text-xs text-[var(--text-secondary)] mt-0.5">{m.phone}</div>
                        </div>
                      ) : (
                        <span className="text-xs text-[var(--text-tertiary)] italic">未填寫聯絡資料</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                        m.memberLevel?.toUpperCase() === 'VIP' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20' :
                        m.memberLevel?.toUpperCase() === 'VVIP' ? 'bg-rose-500/10 text-rose-600 dark:text-rose-450 border border-rose-500/20' :
                        'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border border-[var(--border-primary)]'
                      }`}>
                        {m.memberLevel === 'General' ? '一般會員' : m.memberLevel}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-emerald-600 dark:text-emerald-450 text-base">
                      ${m.walletBalance}
                    </td>
                    <td className="py-3 px-4 text-right font-mono">
                      <div className="text-[var(--text-primary)] font-bold">${m.totalAmount}</div>
                      <div className="text-[10px] text-[var(--text-tertiary)] mt-0.5">{m.totalOrders} 筆訂單</div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => {
                            setSelectedMember(m);
                            setAdjustType("add");
                            setShowAdjustModal(true);
                          }}
                          className="px-2.5 py-1.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20 rounded-lg text-xs font-bold flex items-center gap-0.5 transition-colors"
                        >
                          <Plus size={11} /> 儲值/調整
                        </button>
                        <button
                          onClick={() => {
                            setSelectedMember(m);
                            setShowHistoryModal(true);
                          }}
                          className="px-2.5 py-1.5 bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-lg text-xs font-bold flex items-center gap-1 transition-colors"
                        >
                          <History size={11} /> 交易歷史
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL 1: 奶包金儲值與額度調整 */}
      {showAdjustModal && selectedMember && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-[var(--bg-secondary)] rounded-2xl border border-[var(--border-primary)] shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="px-5 py-4 border-b border-[var(--border-primary)] flex justify-between items-center bg-[var(--bg-tertiary)]">
              <div>
                <h3 className="font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                  <Wallet size={16} className="text-emerald-500" /> 奶包金儲值與調整
                </h3>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                  對象：{selectedMember.displayName || "LINE 用戶"} (目前餘額: ${selectedMember.walletBalance})
                </p>
              </div>
              <button
                onClick={() => {
                  if (!adjustSubmitting) {
                    setShowAdjustModal(false);
                    setSelectedMember(null);
                  }
                }}
                className="text-[var(--text-secondary)] hover:text-red-500 p-1.5 rounded-lg hover:bg-[var(--bg-primary)]"
              >
                <X size={16} />
              </button>
            </div>

            {/* Form Content */}
            <form onSubmit={handleAdjustWallet} className="p-5 space-y-4 bg-[var(--bg-secondary)]">
              {successMessage ? (
                <div className="py-6 flex flex-col items-center justify-center text-emerald-600 dark:text-emerald-450 space-y-2">
                  <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center border-2 border-emerald-500">
                    <Check size={24} className="stroke-[3]" />
                  </div>
                  <div className="font-bold text-base text-center">{successMessage}</div>
                </div>
              ) : (
                <>
                  {/* 增減類型切換 */}
                  <div className="grid grid-cols-2 gap-2 bg-[var(--bg-tertiary)] rounded-xl p-1">
                    <button
                      type="button"
                      onClick={() => setAdjustType("add")}
                      className={`py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-1 transition-all ${
                        adjustType === "add"
                          ? "bg-[var(--bg-secondary)] text-emerald-600 dark:text-emerald-400 shadow-sm"
                          : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                      }`}
                    >
                      <Plus size={13} /> 手動儲值 (增加)
                    </button>
                    <button
                      type="button"
                      onClick={() => setAdjustType("sub")}
                      className={`py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-1 transition-all ${
                        adjustType === "sub"
                          ? "bg-[var(--bg-secondary)] text-rose-600 dark:text-rose-450 shadow-sm"
                          : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                      }`}
                    >
                      <Minus size={13} /> 扣額更正 (減少)
                    </button>
                  </div>

                  {/* 金額 */}
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-[var(--text-secondary)]">
                      金額 (TWD) <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-[var(--text-tertiary)] text-lg">$</span>
                      <input
                        type="number"
                        placeholder="請輸入欲變更之金額"
                        required
                        min="1"
                        value={adjustAmount}
                        onChange={(e) => setAdjustAmount(e.target.value)}
                        className="w-full pl-7 pr-4 py-2.5 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] text-[var(--text-primary)] font-mono text-lg font-bold focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>

                  {/* 備註 */}
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-[var(--text-secondary)] flex justify-between">
                      <span>儲值/扣款備註</span>
                      <span className="text-[10px] text-[var(--text-tertiary)] font-normal">(建檔對帳依據)</span>
                    </label>
                    <input
                      type="text"
                      placeholder={adjustType === "add" ? "例：Line 轉帳儲值、現場收現" : "例：金額輸入錯誤更正、退貨扣抵"}
                      value={adjustNote}
                      onChange={(e) => setAdjustNote(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] text-[var(--text-primary)] text-sm focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  {/* Buttons */}
                  <div className="flex gap-3 pt-2">
                    <button
                      type="button"
                      disabled={adjustSubmitting}
                      onClick={() => {
                        setShowAdjustModal(false);
                        setSelectedMember(null);
                      }}
                      className="flex-1 py-2.5 bg-[var(--bg-tertiary)] hover:bg-[var(--bg-primary)] text-[var(--text-secondary)] rounded-xl text-sm font-bold transition-all disabled:opacity-50"
                    >
                      取消
                    </button>
                    <button
                      type="submit"
                      disabled={adjustSubmitting || !adjustAmount}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-all flex items-center justify-center gap-1.5 shadow-md ${
                        adjustType === "add"
                          ? "bg-emerald-500 hover:bg-emerald-600 shadow-emerald-500/10"
                          : "bg-rose-500 hover:bg-rose-600 shadow-rose-500/10"
                      } disabled:opacity-50`}
                    >
                      {adjustSubmitting ? (
                        <RefreshCw className="animate-spin" size={16} />
                      ) : (
                        "送出執行"
                      )}
                    </button>
                  </div>
                </>
              )}
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: 檢視交易歷史 */}
      {showHistoryModal && selectedMember && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-[var(--bg-secondary)] rounded-2xl border border-[var(--border-primary)] shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[80vh]">
            {/* Header */}
            <div className="px-5 py-4 border-b border-[var(--border-primary)] flex justify-between items-center bg-[var(--bg-tertiary)] flex-shrink-0">
              <div>
                <h3 className="font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                  <History size={16} className="text-blue-500" /> 錢包交易歷史明細
                </h3>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                  對象：{selectedMember.displayName || "LINE 用戶"} (目前餘額: ${selectedMember.walletBalance})
                </p>
              </div>
              <button
                onClick={() => {
                  setShowHistoryModal(false);
                  setSelectedMember(null);
                }}
                className="text-[var(--text-secondary)] hover:text-red-500 p-1.5 rounded-lg hover:bg-[var(--bg-primary)]"
              >
                <X size={16} />
              </button>
            </div>

            {/* Content List */}
            <div className="flex-1 overflow-y-auto p-5 bg-[var(--bg-secondary)]">
              {!selectedMember.transactions || selectedMember.transactions.length === 0 ? (
                <div className="py-12 text-center text-[var(--text-tertiary)]">
                  <ClipboardList className="mx-auto mb-2 opacity-30 animate-pulse" size={32} />
                  目前無交易歷史明細紀錄。
                </div>
              ) : (
                <div className="space-y-3">
                  {selectedMember.transactions.map((t) => {
                    const isPositive = t.amount >= 0;
                    return (
                      <div
                        key={t.transactionId}
                        className="p-3 border border-[var(--border-primary)]/80 bg-[var(--bg-tertiary)]/30 rounded-xl flex justify-between items-center gap-4 hover:border-[var(--border-primary)] transition-colors"
                      >
                        <div className="min-w-0">
                          <div className="font-bold text-sm text-[var(--text-primary)] truncate">
                            {t.description || (isPositive ? "手動儲值" : "消費扣抵")}
                          </div>
                          <div className="text-[10px] text-[var(--text-tertiary)] font-mono mt-0.5">
                            時間：{new Date(t.createdAt).toLocaleString()}
                          </div>
                        </div>
                        <div className={`font-mono text-base font-black shrink-0 ${
                          isPositive ? "text-emerald-600 dark:text-emerald-450" : "text-rose-600 dark:text-rose-450"
                        }`}>
                          {isPositive ? "+" : ""}${t.amount}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-[var(--border-primary)] bg-[var(--bg-tertiary)] flex-shrink-0 flex justify-end">
              <button
                onClick={() => {
                  setShowHistoryModal(false);
                  setSelectedMember(null);
                }}
                className="px-5 py-2 bg-[var(--bg-secondary)] hover:bg-[var(--bg-primary)] text-[var(--text-secondary)] border border-[var(--border-primary)] rounded-xl text-sm font-bold transition-all"
              >
                關閉視窗
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
