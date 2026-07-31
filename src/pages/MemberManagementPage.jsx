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
  Check,
  Copy,
  LayoutGrid,
  List,
  Phone,
  Calendar,
  ShoppingBag,
  ShieldCheck,
  ChevronRight,
  TrendingUp,
} from "lucide-react";
import { callGAS } from "../utils/api";

export default function MemberManagementPage({ user, apiUrl }) {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [levelFilter, setLevelFilter] = useState("ALL");
  const [sortBy, setSortBy] = useState("balance_desc"); // balance_desc, spend_desc, newest
  const [viewMode, setViewMode] = useState("grid"); // "grid" or "table"
  
  const [selectedMember, setSelectedMember] = useState(null);
  const [copiedPhone, setCopiedPhone] = useState(null);
  
  // Modals state
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showSpendModal, setShowSpendModal] = useState(false);
  
  // Spend Adjust Form state
  const [targetRedeemableBalance, setTargetRedeemableBalance] = useState("");
  const [targetTotalSpend, setTargetTotalSpend] = useState("");
  const [spendSubmitting, setSpendSubmitting] = useState(false);
  
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
        const newBalance = selectedMember.walletBalance + finalAmount;
        setSuccessMessage(`成功為 ${selectedMember.displayName || "該會員"} ${adjustType === "add" ? "儲值" : "扣除"} $${amountNum.toLocaleString()}！最新餘額：$${newBalance.toLocaleString()}`);
        setAdjustAmount("");
        setAdjustNote("");
        fetchMembers(); // 重新整理列表
        
        // 延遲關閉 modal
        setTimeout(() => {
          setSuccessMessage("");
          setShowAdjustModal(false);
          setSelectedMember(null);
        }, 1800);
      } else {
        alert(res?.error || "調整失敗");
      }
    } catch (err) {
      alert("網路連線錯誤");
    } finally {
      setAdjustSubmitting(false);
    }
  };

  const handleAdjustMemberSpend = async (e) => {
    e.preventDefault();
    if (!selectedMember) return;

    setSpendSubmitting(true);
    try {
      const res = await callGAS(
        apiUrl,
        "admin_adjustMemberSpend",
        {
          memberId: selectedMember.memberId,
          redeemableSpendBalance: Number(targetRedeemableBalance) || 0,
          totalLifetimeSpend: Number(targetTotalSpend) || 0
        },
        user.token
      );

      if (res && res.success) {
        setSuccessMessage(`已更新 ${selectedMember.displayName || "該會員"} 的可用累積額度為 $${Number(targetRedeemableBalance).toLocaleString()}`);
        fetchMembers();
        setTimeout(() => {
          setSuccessMessage("");
          setShowSpendModal(false);
          setSelectedMember(null);
        }, 1500);
      } else {
        alert(res?.error || "設定失敗");
      }
    } catch (err) {
      alert("連線錯誤");
    } finally {
      setSpendSubmitting(false);
    }
  };

  const copyToClipboard = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedPhone(id);
    setTimeout(() => setCopiedPhone(null), 2000);
  };

  // 篩選與排序會員
  const filteredMembers = members
    .filter((m) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        (m.displayName || "").toLowerCase().includes(q) ||
        (m.receiverName || "").toLowerCase().includes(q) ||
        (m.phone || "").includes(q) ||
        (m.memberId || "").toLowerCase().includes(q);

      const matchesLevel =
        levelFilter === "ALL" ||
        (levelFilter === "General" && (!m.memberLevel || m.memberLevel === "General")) ||
        (m.memberLevel || "").toUpperCase() === levelFilter.toUpperCase();

      return matchesSearch && matchesLevel;
    })
    .sort((a, b) => {
      if (sortBy === "balance_desc") return (b.walletBalance || 0) - (a.walletBalance || 0);
      if (sortBy === "spend_desc") return (b.totalAmount || 0) - (a.totalAmount || 0);
      if (sortBy === "newest") return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
      return 0;
    });

  // 計算統計數據
  const totalBalance = members.reduce((s, m) => s + (m.walletBalance || 0), 0);
  const avgBalance = members.length > 0 ? Math.round(totalBalance / members.length) : 0;

  return (
    <div className="max-w-7xl mx-auto min-h-[calc(100vh-6rem)] flex flex-col p-3 sm:p-5 gap-4 overflow-y-auto pb-20">
      {/* 頁面標頭區塊 */}
      <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center bg-[var(--bg-secondary)] p-4 sm:p-6 rounded-2xl border border-[var(--border-primary)] shadow-sm gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black flex items-center gap-2.5 text-[var(--text-primary)] tracking-tight">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
              <Wallet size={24} />
            </div>
            會員儲值管理 (奶包金)
          </h1>
          <p className="text-xs sm:text-sm text-[var(--text-secondary)] mt-1 font-medium">
            一目瞭然管理會員錢包餘額、快速儲值奶包金，並即時查閱交易歷史明細。
          </p>
        </div>
        <button
          onClick={fetchMembers}
          disabled={loading}
          className="btn-secondary px-4 py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 shadow-sm disabled:opacity-55 active:scale-95 shrink-0 text-sm cursor-pointer"
        >
          <RefreshCw className={loading ? "animate-spin text-blue-500" : "text-blue-500"} size={16} />
          重新整理列表
        </button>
      </div>

      {/* 關鍵數據指標看板 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 flex-shrink-0">
        <div className="bg-gradient-to-br from-emerald-500/10 via-[var(--bg-secondary)] to-[var(--bg-secondary)] border border-emerald-500/20 rounded-2xl p-4 flex justify-between items-center shadow-xs">
          <div>
            <div className="text-xs text-emerald-600 dark:text-emerald-400 font-bold uppercase tracking-wider">總註冊會員數</div>
            <div className="text-2xl sm:text-3xl font-black text-emerald-700 dark:text-emerald-300 font-mono mt-1">
              {members.length} <span className="text-sm font-bold text-emerald-600/70">人</span>
            </div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500">
            <User size={24} />
          </div>
        </div>

        <div className="bg-gradient-to-br from-amber-500/10 via-[var(--bg-secondary)] to-[var(--bg-secondary)] border border-amber-500/20 rounded-2xl p-4 flex justify-between items-center shadow-xs">
          <div>
            <div className="text-xs text-amber-600 dark:text-amber-400 font-bold uppercase tracking-wider">奶包金發放總餘額</div>
            <div className="text-2xl sm:text-3xl font-black text-amber-700 dark:text-amber-300 font-mono mt-1">
              ${totalBalance.toLocaleString()}
            </div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500">
            <Wallet size={24} />
          </div>
        </div>

        <div className="bg-gradient-to-br from-blue-500/10 via-[var(--bg-secondary)] to-[var(--bg-secondary)] border border-blue-500/20 rounded-2xl p-4 flex justify-between items-center shadow-xs">
          <div>
            <div className="text-xs text-blue-600 dark:text-blue-400 font-bold uppercase tracking-wider">平均會員餘額</div>
            <div className="text-2xl sm:text-3xl font-black text-blue-700 dark:text-blue-300 font-mono mt-1">
              ${avgBalance.toLocaleString()}
            </div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-500">
            <TrendingUp size={24} />
          </div>
        </div>
      </div>

      {/* 控制工具列：搜尋、過濾與視圖切換 */}
      <div className="bg-[var(--bg-secondary)] p-3 sm:p-4 rounded-2xl border border-[var(--border-primary)] shadow-sm flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        {/* 搜尋框 */}
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" size={18} />
          <input
            type="text"
            placeholder="搜尋 LINE 暱稱、收件姓名、手機電話或 ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-sm font-semibold focus:outline-none focus:border-blue-500 transition-all placeholder:text-[var(--text-tertiary)]"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] p-1"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* 篩選條件 & 視圖切換 */}
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap justify-between md:justify-end">
          {/* 等級過濾 */}
          <select
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value)}
            className="input-field text-xs sm:text-sm px-3 py-2 font-bold bg-[var(--bg-primary)] border-[var(--border-primary)] rounded-xl text-[var(--text-primary)] cursor-pointer"
          >
            <option value="ALL">全部會員等級</option>
            <option value="General">一般會員</option>
            <option value="VIP">VIP 會員</option>
            <option value="VVIP">VVIP 尊榮會員</option>
          </select>

          {/* 排序方式 */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="input-field text-xs sm:text-sm px-3 py-2 font-bold bg-[var(--bg-primary)] border-[var(--border-primary)] rounded-xl text-[var(--text-primary)] cursor-pointer"
          >
            <option value="balance_desc">餘額高至低 💰</option>
            <option value="spend_desc">消費最高 🛍️</option>
            <option value="newest">最新註冊 🕒</option>
          </select>

          {/* 視圖切換按鈕 (卡片 / 表格) */}
          <div className="flex items-center bg-[var(--bg-tertiary)] p-1 rounded-xl border border-[var(--border-primary)] shrink-0">
            <button
              onClick={() => setViewMode("grid")}
              className={`p-1.5 rounded-lg transition-all text-xs font-bold flex items-center gap-1 cursor-pointer ${
                viewMode === "grid"
                  ? "bg-[var(--bg-secondary)] text-blue-600 dark:text-blue-400 shadow-xs"
                  : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
              }`}
              title="大卡片視圖"
            >
              <LayoutGrid size={16} />
              <span className="hidden sm:inline">卡片</span>
            </button>
            <button
              onClick={() => setViewMode("table")}
              className={`p-1.5 rounded-lg transition-all text-xs font-bold flex items-center gap-1 cursor-pointer ${
                viewMode === "table"
                  ? "bg-[var(--bg-secondary)] text-blue-600 dark:text-blue-400 shadow-xs"
                  : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
              }`}
              title="表格列表視圖"
            >
              <List size={16} />
              <span className="hidden sm:inline">列表</span>
            </button>
          </div>
        </div>
      </div>

      {/* 會員內容區塊 */}
      {loading && members.length === 0 ? (
        <div className="py-20 text-center text-[var(--text-tertiary)] bg-[var(--bg-secondary)] rounded-2xl border border-[var(--border-primary)]">
          <RefreshCw className="animate-spin mx-auto mb-3 text-blue-500" size={32} />
          <p className="font-bold text-base">正在載入會員資料庫...</p>
        </div>
      ) : filteredMembers.length === 0 ? (
        <div className="py-20 text-center text-[var(--text-tertiary)] bg-[var(--bg-secondary)] rounded-2xl border border-[var(--border-primary)]">
          <User className="mx-auto mb-3 opacity-30" size={40} />
          <p className="font-bold text-base text-[var(--text-secondary)]">沒有符合搜尋或篩選條件的會員。</p>
          <p className="text-xs mt-1">請嘗試變更搜尋關鍵字或清除過濾條件。</p>
        </div>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* 🎴 視圖一：大尺寸卡片網格 (Grid View) - 極清晰易讀 */}
          {filteredMembers.map((m) => {
            const isVIP = m.memberLevel?.toUpperCase() === "VIP";
            const isVVIP = m.memberLevel?.toUpperCase() === "VVIP";

            return (
              <div
                key={m.memberId}
                className="bg-[var(--bg-secondary)] rounded-2xl border border-[var(--border-primary)] shadow-sm hover:shadow-md hover:border-blue-500/40 transition-all p-5 flex flex-col justify-between gap-4 relative overflow-hidden group"
              >
                {/* 卡片頂部：頭像、LINE暱稱與等級標籤 */}
                <div>
                  <div className="flex items-start gap-3.5 justify-between">
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className="w-13 h-13 rounded-2xl overflow-hidden bg-[var(--bg-tertiary)] border-2 border-[var(--border-primary)] shrink-0 flex items-center justify-center shadow-inner">
                        {m.pictureUrl ? (
                          <img src={m.pictureUrl} alt={m.displayName} className="w-full h-full object-cover" />
                        ) : (
                          <User size={24} className="text-[var(--text-tertiary)]" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="font-black text-lg text-[var(--text-primary)] truncate tracking-tight">
                          {m.displayName || "LINE 用戶"}
                        </div>
                        <div className="text-[11px] text-[var(--text-tertiary)] font-mono mt-0.5 flex items-center gap-1">
                          <span className="bg-[var(--bg-tertiary)] px-1.5 py-0.2 rounded border border-[var(--border-primary)] font-bold text-[9px]">ID</span>
                          <span className="truncate max-w-[130px]">{m.memberId}</span>
                        </div>
                      </div>
                    </div>

                    {/* 等級標籤 */}
                    <span
                      className={`text-[11px] px-2.5 py-1 rounded-xl font-extrabold uppercase tracking-wider shrink-0 shadow-2xs ${
                        isVVIP
                          ? "bg-gradient-to-r from-rose-500 to-pink-600 text-white border border-rose-400"
                          : isVIP
                          ? "bg-gradient-to-r from-amber-500 to-yellow-600 text-white border border-amber-400"
                          : "bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border border-[var(--border-primary)]"
                      }`}
                    >
                      {m.memberLevel === "General" || !m.memberLevel ? "一般會員" : m.memberLevel}
                    </span>
                  </div>

                  {/* 💰 核心亮點：奶包金餘額特寫看板 */}
                  <div className="mt-4 bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-transparent border border-emerald-500/25 rounded-2xl p-3.5 flex items-center justify-between">
                    <div>
                      <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-extrabold flex items-center gap-1 uppercase tracking-wider">
                        <Wallet size={14} /> 奶包金餘額
                      </div>
                      <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 font-mono mt-0.5 tracking-tight">
                        ${m.walletBalance.toLocaleString()}
                      </div>
                    </div>

                    <div className="text-right border-l border-emerald-500/20 pl-3">
                      <div className="text-[10px] text-[var(--text-tertiary)] font-bold">可用累積金額</div>
                      <div className="text-sm font-black text-blue-600 dark:text-blue-400 font-mono mt-0.5">
                        ${(m.redeemableSpendBalance || 0).toLocaleString()}
                      </div>
                      <div className="text-[10px] text-[var(--text-tertiary)] font-bold mt-0.5">
                        歷史總額: ${(m.totalLifetimeSpend || m.totalAmount || 0).toLocaleString()}
                      </div>
                    </div>
                  </div>

                  {/* 收件人與聯絡電話細節區塊 */}
                  <div className="mt-3 bg-[var(--bg-tertiary)]/50 rounded-xl p-3 border border-[var(--border-primary)]/60 text-xs space-y-1.5">
                    <div className="flex items-center justify-between text-[var(--text-secondary)]">
                      <span className="font-bold flex items-center gap-1 text-[var(--text-tertiary)]">
                        <User size={13} /> 收件姓名：
                      </span>
                      <span className="font-extrabold text-[var(--text-primary)] text-sm">
                        {m.receiverName || <span className="text-[var(--text-tertiary)] font-normal italic">未填寫</span>}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[var(--text-secondary)]">
                      <span className="font-bold flex items-center gap-1 text-[var(--text-tertiary)]">
                        <Phone size={13} /> 聯絡電話：
                      </span>
                      {m.phone ? (
                        <div className="flex items-center gap-1.5 font-mono font-bold text-[var(--text-primary)] text-sm">
                          <span>{m.phone}</span>
                          <button
                            onClick={() => copyToClipboard(m.phone, m.memberId)}
                            className="p-1 text-[var(--text-tertiary)] hover:text-blue-500 transition-colors rounded hover:bg-[var(--bg-primary)] cursor-pointer"
                            title="複製電話"
                          >
                            {copiedPhone === m.memberId ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
                          </button>
                        </div>
                      ) : (
                        <span className="text-[var(--text-tertiary)] font-normal italic">未填寫</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* 卡片底部巨型雙按鈕 */}
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[var(--border-primary)]/50 mt-1">
                  <button
                    onClick={() => {
                      setSelectedMember(m);
                      setAdjustType("add");
                      setShowAdjustModal(true);
                    }}
                    className="py-2.5 px-3 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white rounded-xl text-xs font-black flex items-center justify-center gap-1.5 shadow-md shadow-emerald-500/10 active:scale-95 transition-all cursor-pointer"
                  >
                    <Plus size={14} className="stroke-[3]" /> 儲值 / 調整
                  </button>

                  <button
                    onClick={() => {
                      setSelectedMember(m);
                      setShowHistoryModal(true);
                    }}
                    className="py-2.5 px-3 bg-[var(--bg-tertiary)] hover:bg-[var(--bg-primary)] text-[var(--text-primary)] border border-[var(--border-primary)] rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer"
                  >
                    <History size={14} /> 交易歷史
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-[var(--bg-secondary)] rounded-2xl border border-[var(--border-primary)] overflow-hidden shadow-sm">
          {/* 📋 視圖二：大清晰度表格 (Table View) */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[var(--bg-tertiary)] text-[var(--text-secondary)] text-xs font-extrabold uppercase tracking-wider border-b border-[var(--border-primary)]">
                  <th className="py-4 px-5">會員 LINE 資訊</th>
                  <th className="py-4 px-5">收件姓名與電話</th>
                  <th className="py-4 px-5">會員等級</th>
                  <th className="py-4 px-5 text-right">奶包金餘額</th>
                  <th className="py-4 px-5 text-right">累計消費金額</th>
                  <th className="py-4 px-5 text-center">儲值與歷史操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-primary)]/40 text-sm">
                {filteredMembers.map((m) => (
                  <tr key={m.memberId} className="hover:bg-[var(--bg-tertiary)]/30 transition-colors">
                    <td className="py-3.5 px-5">
                      <div className="flex items-center gap-3.5">
                        <div className="w-11 h-11 rounded-2xl overflow-hidden bg-[var(--bg-tertiary)] border border-[var(--border-primary)] shrink-0 flex items-center justify-center shadow-inner">
                          {m.pictureUrl ? (
                            <img src={m.pictureUrl} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <User size={20} className="text-[var(--text-tertiary)]" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="font-extrabold text-base text-[var(--text-primary)] truncate">
                            {m.displayName || "LINE 用戶"}
                          </div>
                          <div className="text-[11px] text-[var(--text-tertiary)] font-mono truncate max-w-[160px]">
                            ID: {m.memberId}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-5">
                      {m.receiverName || m.phone ? (
                        <div>
                          <div className="font-extrabold text-sm text-[var(--text-primary)]">{m.receiverName || "未填姓名"}</div>
                          <div className="text-xs font-mono font-bold text-blue-600 dark:text-blue-400 mt-0.5">{m.phone}</div>
                        </div>
                      ) : (
                        <span className="text-xs text-[var(--text-tertiary)] italic">未填寫聯絡資料</span>
                      )}
                    </td>
                    <td className="py-3.5 px-5">
                      <span className={`text-xs px-2.5 py-1 rounded-xl font-bold uppercase tracking-wider ${
                        m.memberLevel?.toUpperCase() === 'VIP' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30' :
                        m.memberLevel?.toUpperCase() === 'VVIP' ? 'bg-rose-500/10 text-rose-600 dark:text-rose-450 border border-rose-500/30' :
                        'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border border-[var(--border-primary)]'
                      }`}>
                        {m.memberLevel === 'General' || !m.memberLevel ? '一般會員' : m.memberLevel}
                      </span>
                    </td>
                    <td className="py-3.5 px-5 text-right font-mono font-black text-emerald-600 dark:text-emerald-400 text-lg">
                      ${m.walletBalance.toLocaleString()}
                    </td>
                    <td className="py-3.5 px-5 text-right font-mono">
                      <div className="font-extrabold text-base text-blue-600 dark:text-blue-400">
                        ${(m.redeemableSpendBalance || 0).toLocaleString()}
                      </div>
                      <div className="text-[11px] text-[var(--text-tertiary)] font-bold mt-0.5">
                        歷史總額: ${(m.totalLifetimeSpend || m.totalAmount || 0).toLocaleString()}
                      </div>
                    </td>
                    <td className="py-3.5 px-5">
                      <div className="flex items-center justify-center gap-1.5 flex-wrap">
                        <button
                          onClick={() => {
                            setSelectedMember(m);
                            setTargetRedeemableBalance(m.redeemableSpendBalance || 0);
                            setTargetTotalSpend(m.totalLifetimeSpend || m.totalAmount || 0);
                            setShowSpendModal(true);
                          }}
                          className="px-2.5 py-1 bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 rounded-xl text-xs font-extrabold border border-blue-500/30 flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          <TrendingUp size={13} /> 測試改累積額度
                        </button>
                        <button
                          onClick={() => {
                            setSelectedMember(m);
                            setAdjustType("add");
                            setShowAdjustModal(true);
                          }}
                          className="px-2.5 py-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/30 rounded-xl text-xs font-extrabold flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          <Plus size={13} /> 儲值/調整
                        </button>
                        <button
                          onClick={() => {
                            setSelectedMember(m);
                            setShowHistoryModal(true);
                          }}
                          className="px-2.5 py-1 bg-[var(--bg-tertiary)] text-[var(--text-primary)] hover:bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-xl text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          <History size={13} /> 交易歷史
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL 1: 奶包金儲值與額度調整 */}
      {showAdjustModal && selectedMember && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-[var(--bg-secondary)] rounded-2xl border border-[var(--border-primary)] shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="px-5 py-4 border-b border-[var(--border-primary)] flex justify-between items-center bg-[var(--bg-tertiary)]">
              <div>
                <h3 className="font-black text-base text-[var(--text-primary)] flex items-center gap-1.5">
                  <Wallet size={18} className="text-emerald-500" /> 奶包金儲值與額度調整
                </h3>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5 font-bold">
                  對象：<span className="text-blue-600 dark:text-blue-400">{selectedMember.displayName || "LINE 用戶"}</span>
                </p>
              </div>
              <button
                onClick={() => {
                  if (!adjustSubmitting) {
                    setShowAdjustModal(false);
                    setSelectedMember(null);
                  }
                }}
                className="text-[var(--text-secondary)] hover:text-rose-500 p-1.5 rounded-lg hover:bg-[var(--bg-primary)] cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Form Content */}
            <form onSubmit={handleAdjustWallet} className="p-5 space-y-4 bg-[var(--bg-secondary)]">
              {successMessage ? (
                <div className="py-6 flex flex-col items-center justify-center text-emerald-600 dark:text-emerald-400 space-y-2">
                  <div className="w-14 h-14 rounded-full bg-emerald-500/10 flex items-center justify-center border-2 border-emerald-500">
                    <Check size={28} className="stroke-[3]" />
                  </div>
                  <div className="font-extrabold text-base text-center px-4">{successMessage}</div>
                </div>
              ) : (
                <>
                  {/* 當前餘額資訊看板 */}
                  <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3.5 flex justify-between items-center">
                    <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300">目前奶包金餘額：</span>
                    <span className="text-xl font-black font-mono text-emerald-600 dark:text-emerald-400">
                      ${selectedMember.walletBalance.toLocaleString()}
                    </span>
                  </div>

                  {/* 增減類型切換 */}
                  <div className="grid grid-cols-2 gap-2 bg-[var(--bg-tertiary)] rounded-xl p-1">
                    <button
                      type="button"
                      onClick={() => setAdjustType("add")}
                      className={`py-2.5 rounded-lg text-xs font-black flex items-center justify-center gap-1 transition-all cursor-pointer ${
                        adjustType === "add"
                          ? "bg-[var(--bg-secondary)] text-emerald-600 dark:text-emerald-400 shadow-xs border border-emerald-500/30"
                          : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                      }`}
                    >
                      <Plus size={14} className="stroke-[3]" /> 手動儲值 (增加)
                    </button>
                    <button
                      type="button"
                      onClick={() => setAdjustType("sub")}
                      className={`py-2.5 rounded-lg text-xs font-black flex items-center justify-center gap-1 transition-all cursor-pointer ${
                        adjustType === "sub"
                          ? "bg-[var(--bg-secondary)] text-rose-600 dark:text-rose-400 shadow-xs border border-rose-500/30"
                          : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                      }`}
                    >
                      <Minus size={14} className="stroke-[3]" /> 扣額更正 (減少)
                    </button>
                  </div>

                  {/* 快捷金額選擇 */}
                  <div>
                    <label className="text-xs font-bold text-[var(--text-secondary)] mb-1.5 block">快捷選擇金額：</label>
                    <div className="flex gap-1.5 flex-wrap">
                      {[100, 500, 1000, 2000, 5000].map((amt) => (
                        <button
                          key={amt}
                          type="button"
                          onClick={() => setAdjustAmount(String(amt))}
                          className="px-2.5 py-1 bg-[var(--bg-tertiary)] hover:bg-blue-500/10 hover:text-blue-600 text-[var(--text-primary)] border border-[var(--border-primary)] rounded-lg text-xs font-extrabold font-mono transition-colors cursor-pointer"
                        >
                          +${amt}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 金額輸入 */}
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-[var(--text-secondary)]">
                      變更金額 (TWD) <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-black text-[var(--text-tertiary)] text-lg">$</span>
                      <input
                        type="number"
                        placeholder="請輸入儲值或扣除金額"
                        required
                        min="1"
                        value={adjustAmount}
                        onChange={(e) => setAdjustAmount(e.target.value)}
                        className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-lg font-mono font-black focus:outline-none focus:border-blue-500 transition-all"
                      />
                    </div>
                  </div>

                  {/* 預算與結果試算 */}
                  {adjustAmount && !isNaN(Number(adjustAmount)) && Number(adjustAmount) > 0 && (
                    <div className="bg-[var(--bg-tertiary)] p-3 rounded-xl border border-[var(--border-primary)] text-xs flex justify-between items-center font-bold">
                      <span className="text-[var(--text-secondary)]">調整後預計餘額：</span>
                      <span className="font-mono text-base font-black text-blue-600 dark:text-blue-400">
                        ${(selectedMember.walletBalance + (adjustType === "add" ? Number(adjustAmount) : -Number(adjustAmount))).toLocaleString()}
                      </span>
                    </div>
                  )}

                  {/* 備註說明 */}
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-[var(--text-secondary)]">
                      交易備註說明 (選填)
                    </label>
                    <input
                      type="text"
                      placeholder={adjustType === "add" ? "例：現金現場儲值、活動贈送" : "例：手動扣除更正"}
                      value={adjustNote}
                      onChange={(e) => setAdjustNote(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-xs font-semibold focus:outline-none focus:border-blue-500 transition-all"
                    />
                  </div>

                  {/* 操作按鈕 */}
                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      disabled={adjustSubmitting}
                      onClick={() => {
                        setShowAdjustModal(false);
                        setSelectedMember(null);
                      }}
                      className="flex-1 py-2.5 bg-[var(--bg-tertiary)] hover:bg-[var(--bg-primary)] text-[var(--text-secondary)] rounded-xl text-xs font-bold transition-all disabled:opacity-50 cursor-pointer"
                    >
                      取消
                    </button>
                    <button
                      type="submit"
                      disabled={adjustSubmitting || !adjustAmount}
                      className={`flex-1 py-2.5 rounded-xl text-xs font-black text-white transition-all flex items-center justify-center gap-1.5 shadow-md cursor-pointer ${
                        adjustType === "add"
                          ? "bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 shadow-emerald-500/20"
                          : "bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700 shadow-rose-500/20"
                      } disabled:opacity-50`}
                    >
                      {adjustSubmitting ? (
                        <RefreshCw className="animate-spin" size={16} />
                      ) : (
                        "確認執行送出"
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
          <div className="bg-[var(--bg-secondary)] rounded-2xl border border-[var(--border-primary)] shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[85vh]">
            {/* Header */}
            <div className="px-5 py-4 border-b border-[var(--border-primary)] flex justify-between items-center bg-[var(--bg-tertiary)] flex-shrink-0">
              <div>
                <h3 className="font-black text-base text-[var(--text-primary)] flex items-center gap-1.5">
                  <History size={18} className="text-blue-500" /> 錢包交易歷史紀錄
                </h3>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5 font-bold">
                  會員：<span className="text-blue-600 dark:text-blue-400">{selectedMember.displayName || "LINE 用戶"}</span> (餘額: ${selectedMember.walletBalance.toLocaleString()})
                </p>
              </div>
              <button
                onClick={() => {
                  setShowHistoryModal(false);
                  setSelectedMember(null);
                }}
                className="text-[var(--text-secondary)] hover:text-rose-500 p-1.5 rounded-lg hover:bg-[var(--bg-primary)] cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Content List */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 bg-[var(--bg-secondary)]">
              {!selectedMember.transactions || selectedMember.transactions.length === 0 ? (
                <div className="py-16 text-center text-[var(--text-tertiary)]">
                  <History className="mx-auto mb-2 opacity-30" size={36} />
                  <p className="font-bold text-sm">目前無任何交易歷史明細紀錄。</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {selectedMember.transactions.map((t) => {
                    const isPositive = t.amount >= 0;
                    return (
                      <div
                        key={t.transactionId}
                        className="p-3.5 border border-[var(--border-primary)] bg-[var(--bg-tertiary)]/40 rounded-xl flex justify-between items-center gap-4 hover:border-blue-500/30 transition-colors"
                      >
                        <div className="min-w-0">
                          <div className="font-extrabold text-sm text-[var(--text-primary)] truncate">
                            {t.description || (isPositive ? "手動儲值" : "消費扣抵")}
                          </div>
                          <div className="text-[11px] text-[var(--text-tertiary)] font-mono mt-0.5">
                            {new Date(t.createdAt).toLocaleString()}
                          </div>
                        </div>
                        <div className={`font-mono text-lg font-black shrink-0 ${
                          isPositive ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                        }`}>
                          {isPositive ? "+" : ""}${t.amount.toLocaleString()}
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
                className="px-5 py-2 bg-[var(--bg-secondary)] hover:bg-[var(--bg-primary)] text-[var(--text-primary)] border border-[var(--border-primary)] rounded-xl text-xs font-extrabold transition-all cursor-pointer"
              >
                關閉視窗
              </button>
            </div>
          </div>
        </div>
      )}
      {/* MODAL 3: 測試手動修改會員累積金額 */}
      {showSpendModal && selectedMember && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-[var(--bg-secondary)] rounded-2xl border border-[var(--border-primary)] shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-5 py-4 border-b border-[var(--border-primary)] flex justify-between items-center bg-[var(--bg-tertiary)]">
              <div>
                <h3 className="font-black text-base text-[var(--text-primary)] flex items-center gap-1.5">
                  <TrendingUp size={18} className="text-blue-500" /> 調整滿額累積額度 (測試專用)
                </h3>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5 font-bold">
                  對象：<span className="text-blue-600 dark:text-blue-400">{selectedMember.displayName || "LINE 用戶"}</span> (ID: {selectedMember.memberId})
                </p>
              </div>
              <button
                onClick={() => {
                  if (!spendSubmitting) {
                    setShowSpendModal(false);
                    setSelectedMember(null);
                  }
                }}
                className="text-[var(--text-secondary)] hover:text-rose-500 p-1.5 rounded-lg hover:bg-[var(--bg-primary)] cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAdjustMemberSpend} className="p-5 space-y-4 bg-[var(--bg-secondary)]">
              {successMessage ? (
                <div className="py-6 flex flex-col items-center justify-center text-emerald-600 dark:text-emerald-400 space-y-2">
                  <div className="w-14 h-14 rounded-full bg-emerald-500/10 flex items-center justify-center border-2 border-emerald-500">
                    <Check size={28} className="stroke-[3]" />
                  </div>
                  <div className="font-extrabold text-base text-center px-4">{successMessage}</div>
                </div>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <label className="text-xs font-extrabold text-[var(--text-secondary)]">可用累積金額 (Redeemable Spend Balance)：</label>
                    <input
                      type="number"
                      value={targetRedeemableBalance}
                      onChange={(e) => setTargetRedeemableBalance(e.target.value)}
                      placeholder="例如: 5000 或 10000"
                      className="w-full p-3 bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded-xl text-sm font-mono font-bold text-[var(--text-primary)] focus:outline-none focus:border-blue-500"
                      required
                    />
                    <p className="text-[11px] text-[var(--text-tertiary)]">這是在 LIFF 下單時可用來觸發滿額折抵的剩餘額度。</p>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-extrabold text-[var(--text-secondary)]">歷史總消費金額 (Total Lifetime Spend)：</label>
                    <input
                      type="number"
                      value={targetTotalSpend}
                      onChange={(e) => setTargetTotalSpend(e.target.value)}
                      placeholder="例如: 12000"
                      className="w-full p-3 bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded-xl text-sm font-mono font-bold text-[var(--text-primary)] focus:outline-none focus:border-blue-500"
                      required
                    />
                  </div>

                  <div className="pt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowSpendModal(false);
                        setSelectedMember(null);
                      }}
                      className="flex-1 py-2.5 bg-[var(--bg-tertiary)] hover:bg-[var(--bg-primary)] text-[var(--text-secondary)] font-bold rounded-xl text-xs border border-[var(--border-primary)]"
                    >
                      取消
                    </button>
                    <button
                      type="submit"
                      disabled={spendSubmitting}
                      className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-extrabold rounded-xl text-xs shadow-md disabled:opacity-50"
                    >
                      {spendSubmitting ? "更新中..." : "儲存新額度"}
                    </button>
                  </div>
                </>
              )}
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
