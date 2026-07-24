import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  ShoppingCart,
  Plus,
  Minus,
  CheckCircle,
  Package,
  MapPin,
  Phone,
  User,
  FileText,
  ArrowRight,
  RefreshCw,
  ChevronLeft,
  ChevronDown,
  CreditCard,
  Banknote,
  Smartphone,
  Clock,
  History,
  RotateCcw,
  Home,
  Wallet,
  Calendar,
} from "lucide-react";
import { callGAS, memberApi } from "../utils/api";
import logoImg from "../assets/logo.png";
import logoLiff from "../assets/logo_liff.jpg";

// ── 品牌 Logo 元件 ──────────────────────────────────────────────
const MilkZeroWasteLogo = () => (
  <img
    src={logoLiff}
    alt="米立微 Logo"
    className="h-10 w-auto flex-shrink-0 object-contain"
    style={{ aspectRatio: "728/197" }}
  />
);

// ── 店家設定（改這裡就好）─────────────────────────────────────
const BANK_INFO = {
  bank: "玉山銀行 (808)",
  account: "0934979271826",
  name: "張庭瑜",
};
const LINE_PAY_URL = "https://line.me/ti/p/kjGUUdBqLE";
const LINE_CONTACT_URL = "https://line.me/R/ti/p/@839rpabi";
const LS_KEY = "mlw_customer"; // LocalStorage key

// 自動補 0 輔助函數 (針對 Google Sheets 可能將 09xx 當成數字導致遺失首 0)
const formatTaiwanPhone = (phone) => {
  if (!phone) return "";
  let str = String(phone).replace(/\D/g, "");
  if (str.length === 9 && str.startsWith("9")) {
    str = "0" + str;
  }
  return str;
};

// 全域鎖：防止 React 嚴格模式或重複 Render 觸發多次 LIFF 初始化與登入轉址
let isLiffInitStarted = false;
let isLiffInitialized = false;

export default function LiffOrderPage({ user, apiUrl }) {
  // ── 鎖定 body / html 避免 iOS 橡皮筋 & 網址列跳動 ──────────────
  useEffect(() => {
    document.title = "米立微 MilkZeroWaste";
    document.documentElement.classList.add("liff-order-active");
    document.body.classList.add("liff-order-active");
    return () => {
      document.documentElement.classList.remove("liff-order-active");
      document.body.classList.remove("liff-order-active");
    };
  }, []);


  // ── 自訂美化彈窗提示 ──────────────────────────────────────────
  const [alertModal, setAlertModal] = useState({ show: false, message: '', callback: null });
  const alert = (message, callback = null) => {
    setAlertModal({ show: true, message, callback });
  };
  const [confirmModal, setConfirmModal] = useState({ 
    show: false, 
    message: '', 
    onConfirm: null, 
    onCancel: null,
    confirmText: '確定',
    cancelText: '取消'
  });

  // ── 商品 state ───────────────────────────────────────────────
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState({});

  // ── 團購 V2 狀態 ───────────────────────────────────────────────
  const [isGroupOrder, setIsGroupOrder] = useState(false);
  const [activeRecipient, setActiveRecipient] = useState("");
  const [groupCart, setGroupCart] = useState({});
  const [groupGiftSelections, setGroupGiftSelections] = useState({}); // { [memberName]: { [promoId]: { [productId]: qty } } }
  const [activeGroupMember, setActiveGroupMember] = useState("");
  const [commonRecipients, setCommonRecipients] = useState(() => {
    try {
      const saved = localStorage.getItem("mlw_common_recipients");
      return saved ? JSON.parse(saved) : [];
    } catch (_) {
      return [];
    }
  });
  const [showAddRecipientModal, setShowAddRecipientModal] = useState(false);
  const [newRecipientName, setNewRecipientName] = useState("");

  const [activeCategory, setActiveCategory] = useState("");
  const [sourceGroup, setSourceGroup] = useState("");
  const [animatingProductId, setAnimatingProductId] = useState(null);
  const tabBarRef = useRef(null);
  const listRef = useRef(null);
  const sectionRefs = useRef({});
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const searchInputRef = useRef(null);
  const isManualScrollRef = useRef(false);
  const manualScrollTimeoutRef = useRef(null);
  // 記錄這次表單 Session 進入時的原始配送區域（用來比較所有區域變更警語）
  const originalCommunityIdRef = useRef("");

  // ── 口味規格 state ─────────────────────────────────────────────
  const [flavorSelections, setFlavorSelections] = useState({}); // { [productId]: { [flavor]: qty } }
  const [groupFlavorSelections, setGroupFlavorSelections] = useState({}); // { [recipientName]: { [productId]: { [flavor]: qty } } }
  const [giftSelections, setGiftSelections] = useState({}); // { [promoId]: { [productId]: qty } }
  const [showGiftModal, setShowGiftModal] = useState(null); // promoId
  const [flavorModalProduct, setFlavorModalProduct] = useState(null);
  const [tempFlavorQty, setTempFlavorQty] = useState({});

  // ── 步驟機制 ─────────────────────────────────────────────────
  // 'shop' | 'form' | 'confirm' | 'success' | 'orders' | 'cart' | 'member'
  const [step, setStep] = useState(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const liffState = params.get("liff.state") || "";
      const stepParam = params.get("step") || params.get("page_step") || (window.GAS_PARAMETERS && window.GAS_PARAMETERS.step);
      if (stepParam === "orders" || liffState.includes("step=orders") || liffState.includes("/orders") || window.location.hash.includes("orders") || params.has("orders")) {
        return "orders";
      }
      if (stepParam === "cart" || liffState.includes("step=cart") || window.location.hash.includes("cart") || params.has("cart")) {
        return "cart";
      }
      if (stepParam === "member" || liffState.includes("step=member") || window.location.hash.includes("member") || params.has("member")) {
        return "member";
      }
    } catch (_) {}
    return "shop";
  });

  // ── 表單 state ───────────────────────────────────────────────
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [note, setNote] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("現金");
  const [transferLastFive, setTransferLastFive] = useState("");
  const [useWallet, setUseWallet] = useState(false);

  // ── 送出 state ───────────────────────────────────────────────
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderId, setOrderId] = useState("");
  const [orderTime, setOrderTime] = useState("");
  const [copied, setCopied] = useState(false);

  const handleCopy = (text) => {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(err => {
      console.error("Failed to copy:", err);
    });
  };

  // ── 大樓群組綁定與管理員 State ──────────────────────────────
  const [groupBindings, setGroupBindings] = useState({});
  const [selectedBuilding, setSelectedBuilding] = useState(() => {
    try {
      const savedStr = localStorage.getItem("inventory_liff_order");
      if (savedStr) {
        const savedObj = JSON.parse(savedStr);
        if (savedObj.building) return savedObj.building;
      }
    } catch (_) {}
    return "一般用戶";
  });
  const [otherBuildingText, setOtherBuildingText] = useState("");
  const [detailAddress, setDetailAddress] = useState("");
  const [companyName, setCompanyName] = useState("");

  // ── 新增：網址大樓參數、大樓時段設定與下單資訊 ───────────────
  const [urlBuilding, setUrlBuilding] = useState("");
  const [buildingSettings, setBuildingSettings] = useState([]);
  const [tick, setTick] = useState(0);
  const [successOrderTotal, setSuccessOrderTotal] = useState(0);
  const [successOrderItems, setSuccessOrderItems] = useState([]);
  const [successCartTotal, setSuccessCartTotal] = useState(0);
  const [successShippingFee, setSuccessShippingFee] = useState(0);
  const [successWalletDeduction, setSuccessWalletDeduction] = useState(0);
  const [successDeliveryDate, setSuccessDeliveryDate] = useState("");
  const [successDeliveryTime, setSuccessDeliveryTime] = useState("");
  const [isDetailExpanded, setIsDetailExpanded] = useState(true);
  const [isNightOrder, setIsNightOrder] = useState(false);
  const [isReorder, setIsReorder] = useState(false);
  const [isMsgSentAuto, setIsMsgSentAuto] = useState(false);

  // 會員中心狀態
  const [memberProfile, setMemberProfile] = useState(null);
  const [orders, setOrders] = useState([]);
  const [isMemberLoading, setIsMemberLoading] = useState(false);
  const [lineUserId, setLineUserId] = useState("");
  const [linePictureUrl, setLinePictureUrl] = useState("");

  // V2 架構狀態
  const [currentCommunity, setCurrentCommunity] = useState(null);
  const [allCommunities, setAllCommunities] = useState([]);
  const [selectedCity, setSelectedCity] = useState("");
  const [selectedCommunityId, setSelectedCommunityId] = useState("");
  const [showAreaModal, setShowAreaModal] = useState(false);
  const [activeCampaign, setActiveCampaign] = useState(null);
  const [nextOpenTime, setNextOpenTime] = useState(null);

  useEffect(() => {
    const timer = setInterval(() => {
      setTick((t) => t + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // 雙軌狀態同步：當 isGroupOrder 啟用時，自動加總 groupCart 的每一項商品數量至 cart
  useEffect(() => {
    if (!isGroupOrder) return;
    const newCart = {};
    Object.values(groupCart).forEach((recipientItems) => {
      if (recipientItems && typeof recipientItems === "object") {
        Object.entries(recipientItems).forEach(([productId, qty]) => {
          newCart[productId] = (newCart[productId] || 0) + qty;
        });
      }
    });
    setCart(newCart);
  }, [groupCart, isGroupOrder]);

  // 監聽網址參數與 Hash 變化（支援官方 LINE 圖文選單直接連動到指定分頁：訂單、購物車、會員等）
  useEffect(() => {
    const handleUrlCheck = () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const liffState = params.get("liff.state") || "";
        const stepParam = params.get("step") || params.get("page_step");
        if (stepParam === "orders" || liffState.includes("step=orders") || liffState.includes("/orders") || window.location.hash.includes("orders") || params.has("orders")) {
          setStep("orders");
        } else if (stepParam === "cart" || liffState.includes("step=cart") || window.location.hash.includes("cart") || params.has("cart")) {
          setStep("cart");
        } else if (stepParam === "member" || liffState.includes("step=member") || window.location.hash.includes("member") || params.has("member")) {
          setStep("member");
        }
      } catch (_) {}
    };
    handleUrlCheck();
    window.addEventListener("hashchange", handleUrlCheck);
    return () => window.removeEventListener("hashchange", handleUrlCheck);
  }, []);

  // 當進入「訂單」步驟且已取得 lineUserId 時，自動載入我的訂單列表
  useEffect(() => {
    if (step === "orders" && lineUserId) {
      setIsMemberLoading(true);
      memberApi.getOrders(apiUrl, { userId: lineUserId }).then(res => {
        if (res && res.success) setOrders(res.orders || []);
        setIsMemberLoading(false);
      }).catch(err => setIsMemberLoading(false));
    }
  }, [step, lineUserId, apiUrl]);

  const renderBottomNav = () => {
    if (step === "success") return null;
    return (
      <div className="flex-shrink-0 bg-[var(--bg-secondary)] border-t border-[var(--border-primary)] flex justify-around items-center h-[60px] pb-safe z-50 shadow-[0_-4px_10px_rgba(0,0,0,0.05)]">
        <button onClick={() => setStep("shop")} className={`flex flex-col items-center justify-center flex-1 h-full ${step === 'shop' ? 'text-blue-600' : 'text-[var(--text-tertiary)]'}`}>
          <Home size={22} />
          <span className="text-[10px] mt-1 font-bold">首頁</span>
        </button>
        <button onClick={() => {
            if (Object.keys(cart).length === 0) {
                alert('購物車是空的');
                return;
            }
            handleProceedToForm();
        }} className={`flex flex-col items-center justify-center flex-1 h-full relative ${step === 'form' || step === 'confirm' ? 'text-blue-600' : 'text-[var(--text-tertiary)]'}`}>
          <div className="relative">
            <ShoppingCart size={22} />
            {Object.keys(cart).length > 0 && (
              <span className="absolute -top-1 -right-2 bg-rose-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full border border-[var(--bg-secondary)]">
                {Object.values(cart).reduce((a, b) => a + b, 0)}
              </span>
            )}
          </div>
          <span className="text-[10px] mt-1 font-bold">購物車</span>
        </button>
        <button onClick={() => {
            if (lineUserId) {
                setIsMemberLoading(true);
                memberApi.getOrders(apiUrl, { userId: lineUserId }).then(res => {
                    if (res && res.success) setOrders(res.orders || []);
                    setIsMemberLoading(false);
                }).catch(err => setIsMemberLoading(false));
            }
            setStep("orders");
        }} className={`flex flex-col items-center justify-center flex-1 h-full ${step === 'orders' ? 'text-blue-600' : 'text-[var(--text-tertiary)]'}`}>
          <FileText size={22} />
          <span className="text-[10px] mt-1 font-bold">訂單</span>
        </button>
        <button onClick={() => setStep("member")} className={`flex flex-col items-center justify-center flex-1 h-full ${step === 'member' ? 'text-blue-600' : 'text-[var(--text-tertiary)]'}`}>
          <User size={22} />
          <span className="text-[10px] mt-1 font-bold">會員</span>
        </button>
      </div>
    );
  };

  // ── 載入商品與初始化資料（單次 API，後端已過濾） ─────────────────────────────────────────
  const loadAllData = async (overrideBuilding = '') => {
    setLoading(true);
    try {
      const params = new URLSearchParams(window.location.search);

      // 解析 liff.state（LIFF 外部瀏覽器時，原始 query 藏在 liff.state 裡）
      let liffStateParams = null;
      const liffState = params.get('liff.state');
      if (liffState) {
        try {
          const stateStr = liffState.startsWith('?') ? liffState.slice(1) : liffState;
          liffStateParams = new URLSearchParams(stateStr);
        } catch (e) {}
      }
      const getP = (key) => liffStateParams?.get(key) || params.get(key) || '';

      const cParam = getP("c");
      const urlGrp = getP("grp");
      let buildingParam = (typeof overrideBuilding === 'string' ? overrideBuilding : '') || getP("building");
      if (!buildingParam) {
        try {
          const savedStr = localStorage.getItem(LS_KEY);
          if (savedStr) {
            const savedObj = JSON.parse(savedStr);
            if (savedObj.building) buildingParam = savedObj.building;
          }
        } catch (_) {}
      }

      const initData = await callGAS(
        apiUrl,
        "v2_getLiffInitData",
        {
          c: cParam,
          grp: urlGrp,
          building: buildingParam
        },
        user?.token
      );
      if (initData) {
        // V2 回傳包裝在 data 屬性內
        const resData = initData.data || initData;
        
        // A. 處理商品
        if (Array.isArray(resData.products)) {
          const activeProds = resData.products.filter((p) => p.isActive);
          setProducts(activeProds);

          // 自動將第一個分類設為 Active
          const cats = activeProds.map((p) => p.category?.trim() || "其他");
          const unique = [...new Set(cats)];
          const firstCat =
            unique.filter((c) => c !== "其他")[0] ||
            (unique.includes("其他") ? "其他" : "");
          if (firstCat) {
            setActiveCategory(firstCat);
          }
        }
        // B. 處理 V2 社區與檔期資料
        if (resData.community) {
          setCurrentCommunity(resData.community);
          setSelectedBuilding(resData.community.CommunityName);
          
          const isVirtual = ["線上下單", "一般散客", "一般用戶", "上線下單", "一般常態", "常態零售"].includes(resData.community.CommunityName);
          if (isVirtual) {
            // 嘗試從 localStorage 帶入上次記錄的區域
            try {
              const prevSaved = JSON.parse(localStorage.getItem(LS_KEY) || "{}");
              const savedCities = prevSaved.city || "";
              const savedCommId = prevSaved.communityId || "";
              // 確認 savedCommId 在可用社區清單中（以 resData.allCommunities 驗證）
              const validComms = Array.isArray(resData.allCommunities) ? resData.allCommunities : [];
              const isValidSaved = savedCommId && validComms.some(c => c.CommunityId === savedCommId);
              if (isValidSaved) {
                setSelectedCity(savedCities);
                setSelectedCommunityId(savedCommId);
                setShowAreaModal(false); // 有舊資料，直接跳過彈窗
              } else {
                setSelectedCommunityId("");
                setSelectedCity("");
                setShowAreaModal(true);
              }
            } catch (_) {
              setSelectedCommunityId("");
              setSelectedCity("");
              setShowAreaModal(true);
            }
          } else {
            setSelectedCommunityId(resData.community.CommunityId || "");
            if (resData.community.CommunityName.startsWith("台南市")) {
              setSelectedCity("台南市");
            } else if (resData.community.CommunityName.startsWith("高雄市")) {
              setSelectedCity("高雄市");
            }
          }
        }
        if (Array.isArray(resData.allCommunities)) {
          setAllCommunities(resData.allCommunities);
        }
        if (resData.activeCampaign) {
          setActiveCampaign(resData.activeCampaign);
        }
        if (resData.nextOpenTime) {
          setNextOpenTime(resData.nextOpenTime);
        }
        if (Array.isArray(resData.buildingSettings)) {
          setBuildingSettings(resData.buildingSettings);
        }
        if (resData.groupBindings && typeof resData.groupBindings === "object") {
          setGroupBindings(resData.groupBindings);
        }
      }
    } catch (err) {
      console.error("Failed to load initialization data:", err);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const isTimeInWeeklyWindow = (nowDate, openDay, openTimeStr, closeDay, closeTimeStr) => {
    if (openDay === undefined || openDay === '' || !openTimeStr || closeDay === undefined || closeDay === '' || !closeTimeStr) {
      return false;
    }
    const [openH, openM] = openTimeStr.split(':').map(Number);
    const [closeH, closeM] = closeTimeStr.split(':').map(Number);
    const getWeekMinute = (day, hour, min) => day * 1440 + hour * 60 + min;
    const openMin = getWeekMinute(Number(openDay), openH, openM);
    const closeMin = getWeekMinute(Number(closeDay), closeH, closeM);
    const curDay = nowDate.getDay();
    const curMin = getWeekMinute(curDay, nowDate.getHours(), nowDate.getMinutes());

    if (openMin < closeMin) {
      return curMin >= openMin && curMin <= closeMin;
    } else if (openMin > closeMin) {
      return curMin >= openMin || curMin <= closeMin;
    }
    return false;
  };

  const getGroupBuyStatus = () => {
    const currentBuildingName = (selectedBuilding && selectedBuilding !== "其它") ? selectedBuilding : "一般散客";
    const setting = buildingSettings.find(s => s.building === currentBuildingName);
    if (!setting) return { status: 'open', message: '' };

    const { start_time, end_time, is_auto, auto_open_day, auto_open_time, auto_close_day, auto_close_time } = setting;
    const now = new Date();
    const nowTime = now.getTime();
    const dayNames = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];

    // 1. 先檢測自動開關團
    let isAutoOpen = false;
    if (is_auto) {
      isAutoOpen = isTimeInWeeklyWindow(now, auto_open_day, auto_open_time, auto_close_day, auto_close_time);
    }

    // 2. 檢測手動加開開關團
    let isManualOpen = false;
    let isManualUpcoming = false;
    let isManualEnded = false;

    if (start_time && end_time) {
      const start = new Date(start_time.replace(/\//g, '-'));
      const end = new Date(end_time.replace(/\//g, '-'));
      if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
        if (nowTime >= start.getTime() && nowTime <= end.getTime()) {
          isManualOpen = true;
        } else if (nowTime < start.getTime()) {
          isManualUpcoming = true;
        } else if (nowTime > end.getTime()) {
          isManualEnded = true;
        }
      }
    }

    // 3. 彙整狀態輸出
    if (isAutoOpen) {
      const autoEndStr = `${dayNames[auto_close_day]} ${auto_close_time}`;
      
      // 計算倒數時間
      const [closeH, closeM] = auto_close_time.split(':').map(Number);
      const targetDate = new Date(now.getTime());
      targetDate.setHours(closeH, closeM, 0, 0);
      
      const currentDay = targetDate.getDay();
      let dayDiff = Number(auto_close_day) - currentDay;
      if (dayDiff < 0 || (dayDiff === 0 && now.getTime() > targetDate.getTime())) {
        dayDiff += 7;
      }
      targetDate.setDate(targetDate.getDate() + dayDiff);
      
      const diffMs = targetDate.getTime() - now.getTime();
      let countdownStr = '';
      if (diffMs > 0) {
        const diffDays = Math.floor(diffMs / 86400000);
        const diffHrs = Math.floor((diffMs % 86400000) / 3600000);
        const diffMins = Math.floor((diffMs % 3600000) / 60000);
        const diffSecs = Math.floor((diffMs % 60000) / 1000);
        const dayStr = diffDays > 0 ? `${diffDays} 天 ` : '';
        countdownStr = `${dayStr}${diffHrs} 小時 ${diffMins} 分 ${diffSecs} 秒`;
      }

      return {
        status: 'open',
        message: `⏰ 團購熱烈進行中！距離結單還剩：${countdownStr || '0 秒'} (每週 ${autoEndStr} 結單)`,
        endTime: autoEndStr
      };
    }

    if (isManualOpen) {
      const end = new Date(end_time.replace(/\//g, '-'));
      const diffMs = end.getTime() - now.getTime();
      let countdownStr = '';
      if (diffMs > 0) {
        const diffHrs = Math.floor(diffMs / 3600000);
        const diffMins = Math.floor((diffMs % 3600000) / 60000);
        const diffSecs = Math.floor((diffMs % 60000) / 1000);
        countdownStr = `${diffHrs} 小時 ${diffMins} 分 ${diffSecs} 秒`;
      }
      return {
        status: 'open',
        message: `⏰ 限時開團中！距離結單還剩：${countdownStr || '0 秒'} (將於 ${end_time} 結單)`,
        endTime: end_time
      };
    }

    if (isManualUpcoming) {
      return {
        status: 'upcoming',
        message: `⚠️ 本期限時開團尚未開始！開團時間為：${start_time}，敬請期待。`,
        startTime: start_time
      };
    }

    if (is_auto) {
      // 雖然啟用自動但目前時間未到
      const autoStartStr = `${dayNames[auto_open_day]} ${auto_open_time}`;
      const autoEndStr = `${dayNames[auto_close_day]} ${auto_close_time}`;
      return {
        status: 'ended',
        message: `🛑 目前非開團時段。每週自動開團時間：${autoStartStr} 至 ${autoEndStr}。`
      };
    }

    if (isManualEnded) {
      return {
        status: 'ended',
        message: `🛑 本期限時開團已截止下單！謝謝大家的支持。`,
        endTime: end_time
      };
    }

    // 若都沒設，預設為開放
    return { status: 'open', message: '' };
  };

  const gbStatus = getGroupBuyStatus();

  const initLiffAndFetchInfo = async () => {
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const isInClient = window.liff && window.liff.isInClient();

    if (isLocalhost && !isInClient) {
      console.warn("[Localhost Test] Skip LIFF SDK initialization entirely to avoid URL redirects.");
      setLineUserId("test-guest-id");
      setCustomerName("本地測試訪客");
      setCustomerPhone("0912345678");
      return true;
    }

    if (!window.liff) {
      console.warn("LINE LIFF SDK is not loaded.");
      return true; // Standalone browser test fallback
    }
    try {
      const params = new URLSearchParams(window.location.search);
      const liffId = import.meta.env.VITE_LIFF_ID || params.get("liffId") || "2010308873-ur2zL2cc";
      await window.liff.init({ liffId });
      isLiffInitialized = true;

      // ★ 關鍵：在 login redirect 之前先抓 context，存入 sessionStorage
      // 因為 login redirect 後會跳到外部瀏覽器，getContext() 就失效了
      const context = window.liff.getContext();
      if (context) {
        const gid = context.groupId || context.roomId || "";
        if (gid) {
          sessionStorage.setItem("liff_group_id", gid);
          setSourceGroup(gid);
        }
      }

      // login redirect 後回來，從 sessionStorage 還原 groupId
      if (!window.liff.getContext()?.groupId) {
        const savedGid = sessionStorage.getItem("liff_group_id");
        if (savedGid) setSourceGroup(savedGid);
      }

      if (!window.liff.isLoggedIn()) {
        window.liff.login();
        return false; // Redirecting, abort active requests
      }

      // 1. 獲取 LINE 使用者資訊
      const profile = await window.liff.getProfile();
      if (profile?.userId) {
        setLineUserId(profile.userId);
        if (profile.pictureUrl) setLinePictureUrl(profile.pictureUrl);
        
        // 呼叫後端 API 取得會員資料
        try {
          const mRes = await memberApi.getMember(apiUrl, {
            userId: profile.userId,
            displayName: profile.displayName || "",
            pictureUrl: profile.pictureUrl || ""
          });
          if (mRes && mRes.success && mRes.member) {
            setMemberProfile(mRes.member);
            // 雲端資料與本地 LocalStorage 進行合併
            const savedStr = localStorage.getItem(LS_KEY);
            let savedObj = savedStr ? JSON.parse(savedStr) : {};
            
            // 後端若有存檔，以後端為主
            if (mRes.member.ReceiverName) {
              setCustomerName(mRes.member.ReceiverName);
              savedObj.name = mRes.member.ReceiverName;
            } else if (profile.displayName && !savedObj.name) {
              setCustomerName(profile.displayName);
              savedObj.name = profile.displayName;
            } else if (savedObj.name) {
              setCustomerName(savedObj.name);
            }
            
            if (mRes.member.Phone) {
              const formattedPhone = formatTaiwanPhone(mRes.member.Phone);
              setCustomerPhone(formattedPhone);
              savedObj.phone = formattedPhone;
            } else if (savedObj.phone) setCustomerPhone(formatTaiwanPhone(savedObj.phone));
            
            if (lockedBuilding) {
              setSelectedBuilding(lockedBuilding);
              savedObj.building = lockedBuilding;
            } else if (mRes.member.Community) {
              setSelectedBuilding(mRes.member.Community);
              savedObj.building = mRes.member.Community;
            } else if (savedObj.building) {
              setSelectedBuilding(savedObj.building);
            }
            
            if (mRes.member.FloorRoom) {
              setDetailAddress(mRes.member.FloorRoom);
              savedObj.detailAddress = mRes.member.FloorRoom;
            } else if (savedObj.detailAddress) setDetailAddress(savedObj.detailAddress);
            
            localStorage.setItem(LS_KEY, JSON.stringify(savedObj));
          }
        } catch (mErr) {
          console.error("Fetch member failed:", mErr);
          // Fallback 至純本地機制
          if (profile.displayName) {
            const saved = localStorage.getItem(LS_KEY);
            if (!saved) setCustomerName(profile.displayName);
          }
        }
      }

      // 2. 再次確認 groupId（in-client 環境下 context 應該有值）
      const ctx2 = window.liff.getContext();
      if (ctx2) {
        const gid2 = ctx2.groupId || ctx2.roomId || "";
        if (gid2) {
          sessionStorage.setItem("liff_group_id", gid2);
          setSourceGroup(gid2);
        }
      }
      return true;
    } catch (err) {
      console.error("LIFF init failed:", err);
      return true;
    }
  };

  const syncMemberToCloud = async () => {
    if (!lineUserId) return;
    try {
      await memberApi.saveMember(apiUrl, {
        userId: lineUserId,
        displayName: customerName,
        pictureUrl: linePictureUrl,
        receiverName: customerName,
        phone: customerPhone,
        community: selectedBuilding,
        floorRoom: detailAddress,
        remark: note
      });
    } catch (err) {
      console.warn("Sync member failed", err);
    }
  };

  // 會員資料自動同步 (Debounce)
  useEffect(() => {
    if (!lineUserId || step !== "form") return;
    const timer = setTimeout(() => {
      syncMemberToCloud();
    }, 1500);
    return () => clearTimeout(timer);
  }, [customerName, customerPhone, selectedBuilding, detailAddress, note, step, lineUserId]);

  useEffect(() => {
    let active = true;
    const init = async () => {
      if (isLiffInitStarted) return;
      isLiffInitStarted = true;

      // 先解析 URL 參數，讓 loadAllData 能帶正確的 building/grp
      const params = new URLSearchParams(window.location.search);

      // ★ LIFF 特殊行為：在外部瀏覽器開啟時，原始 query 會被放進 liff.state
      // 例如：?page=liffOrder&liff.state=?building=清景麟
      // 需要先解析 liff.state，再 fallback 到頂層 params
      let liffStateParams = null;
      const liffState = params.get('liff.state');
      if (liffState) {
        try {
          // liff.state 值可能是 ?building=xxx 或 building=xxx
          const stateStr = liffState.startsWith('?') ? liffState.slice(1) : liffState;
          liffStateParams = new URLSearchParams(stateStr);
        } catch (e) {
          console.warn('Failed to parse liff.state:', e);
        }
      }

      const getParam = (key) =>
        (liffStateParams?.get(key)) || params.get(key) || '';

      const buildingParam = getParam("building");
      const urlGrp = getParam("grp");
      if (buildingParam) {
        setUrlBuilding(buildingParam);
        setSelectedBuilding(buildingParam);
        try {
          const savedStr = localStorage.getItem(LS_KEY);
          let savedObj = savedStr ? JSON.parse(savedStr) : {};
          savedObj.building = buildingParam;
          localStorage.setItem(LS_KEY, JSON.stringify(savedObj));
        } catch (e) {
          console.error("Failed to save urlBuilding to localStorage:", e);
        }
      }
      if (urlGrp) {
        setSourceGroup(urlGrp);
      }

      let liffReady = false;
      let loadError = null;

      // ★ 並行：LIFF init 與 GAS API 同時跑，互不阻塞
      // 使用獨立 Promise，不使用 Promise.all 承接，以防其中一個 reject 影響另一個
      const p1 = initLiffAndFetchInfo()
        .then((res) => {
          liffReady = res;
        })
        .catch((err) => {
          console.error("LIFF init error in background:", err);
        });

      const p2 = loadAllData(buildingParam)
        .catch((err) => {
          loadError = err;
        });

      await Promise.all([p1, p2]);

      if (!active) return;

      // 如果正在重導向跳轉到 LINE 登入頁，直接忽略所有 API 載入錯誤，因為頁面即將銷毀
      if (!liffReady) {
        console.log("LIFF is redirecting, ignoring API load error.");
        return;
      }

      // 如果 LIFF 已就緒（沒有跳轉），但資料載入失敗，才彈出警告
      if (loadError) {
        console.error("Initialization data load failed:", loadError);
        alert("載入資料失敗: " + loadError.message);
      }
    };
    init();

    return () => {
      active = false;
    };
  }, [apiUrl, user?.token]);

  // ── 鎖定與已知大樓邏輯 ──────────────────────────────────────────
  const lockedBuilding = useMemo(() => {
    if (urlBuilding && urlBuilding !== "一般散客") return urlBuilding;
    if (sourceGroup && groupBindings[sourceGroup] && groupBindings[sourceGroup] !== "一般散客") {
      return groupBindings[sourceGroup];
    }
    // 如果 URL 沒有，但 localStorage 有儲存社區大樓且非一般用戶/散客，也將其視為 lockedBuilding
    try {
      const savedStr = localStorage.getItem("inventory_liff_order");
      if (savedStr) {
        const savedObj = JSON.parse(savedStr);
        const b = savedObj.building;
        const isVirtual = ["線上下單", "一般散客", "一般用戶", "上線下單", "線上下單", "一般常態", "常態零售"].includes(b);
        if (b && !isVirtual) {
          return b;
        }
      }
    } catch (_) {}
    return "";
  }, [urlBuilding, sourceGroup, groupBindings]);

  const knownBuildings = useMemo(() => {
    const list = new Set();
    buildingSettings.forEach((s) => {
      if (s.building && s.building !== "一般散客") list.add(s.building);
    });
    Object.values(groupBindings).forEach((b) => {
      if (b && b !== "一般散客") list.add(b);
    });
    if (urlBuilding && urlBuilding !== "一般散客") list.add(urlBuilding);
    return Array.from(list);
  }, [buildingSettings, groupBindings, urlBuilding]);

  useEffect(() => {
    if (urlBuilding) {
      const matchedGid = Object.keys(groupBindings).find(
        (key) => groupBindings[key] === urlBuilding
      );
      if (matchedGid) {
        setSourceGroup(matchedGid);
      } else {
        setSourceGroup(urlBuilding);
      }
    }
  }, [urlBuilding, groupBindings]);

  useEffect(() => {
    if (lockedBuilding) {
      setSelectedBuilding(lockedBuilding);
    }
  }, [lockedBuilding]);

  const displayGroupName = useMemo(() => {
    if (!sourceGroup) return "";
    if (groupBindings[sourceGroup]) return groupBindings[sourceGroup];
    const isRawId = sourceGroup.includes("-") || (sourceGroup.length > 15 && /^[a-zA-Z0-9_-]+$/.test(sourceGroup));
    if (isRawId) {
      if (selectedBuilding && !["線上下單", "一般散客", "一般用戶", "上線下單", "一般常態", "常態零售"].includes(selectedBuilding)) {
        return selectedBuilding;
      }
      if (currentCommunity?.CommunityName && !["線上下單", "一般散客", "一般用戶", "上線下單", "一般常態", "常態零售"].includes(currentCommunity.CommunityName)) {
        return currentCommunity.CommunityName;
      }
    }
    return sourceGroup;
  }, [sourceGroup, groupBindings, selectedBuilding, currentCommunity]);

  const isGeneralUser = 
    selectedBuilding === "一般用戶" || 
    selectedBuilding === "一般散客" || 
    selectedBuilding === "上線下單" || 
    selectedBuilding === "線上下單" || 
    selectedBuilding === "一般常態" ||
    selectedBuilding === "常態零售";

  // ── 搜尋過濾邏輯 ───────────────────────────────────────────────
  const filteredProducts = useMemo(() => {
    if (!searchQuery.trim()) return products;
    const query = searchQuery.toLowerCase().trim();
    return products.filter((p) => p.name.toLowerCase().includes(query));
  }, [products, searchQuery]);

  // ── 分類邏輯 ─────────────────────────────────────────────────
  const categories = useMemo(() => {
    const cats = filteredProducts.map((p) => p.category?.trim() || "其他");
    const unique = [...new Set(cats)];
    const without = unique.filter((c) => c !== "其他");
    return [...without, ...(unique.includes("其他") ? ["其他"] : [])];
  }, [filteredProducts]);

  const groupedProducts = useMemo(() => {
    const map = {};
    filteredProducts.forEach((p) => {
      const cat = p.category?.trim() || "其他";
      if (!map[cat]) map[cat] = [];
      map[cat].push(p);
    });
    return categories
      .map((cat) => ({ cat, items: map[cat] || [] }))
      .filter((g) => g.items.length > 0);
  }, [filteredProducts, categories]);

  // 當分類變更時，若當前分類已失效，自動指向第一個可用分類
  useEffect(() => {
    if (categories.length > 0 && !categories.includes(activeCategory)) {
      setActiveCategory(categories[0]);
    }
  }, [categories, activeCategory]);

  // 當展開搜尋欄時，自動聚焦到輸入框上
  useEffect(() => {
    if (isSearchExpanded && searchInputRef.current) {
      const timer = setTimeout(() => {
        searchInputRef.current.focus();
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [isSearchExpanded]);

  const handleCategoryChange = (cat) => {
    setActiveCategory(cat);

    // 標記為手動點擊滾動，避免滾動監聽自動切換造成震盪
    isManualScrollRef.current = true;
    if (manualScrollTimeoutRef.current)
      clearTimeout(manualScrollTimeoutRef.current);
    manualScrollTimeoutRef.current = setTimeout(() => {
      isManualScrollRef.current = false;
    }, 800); // 800ms 平滑滾動結束後恢復監聽

    // Tab 捲至中央
    if (tabBarRef.current) {
      const btn = tabBarRef.current.querySelector(
        `[data-cat="${CSS.escape(cat)}"]`,
      );
      if (btn) {
        const bar = tabBarRef.current;
        bar.scrollTo({
          left: btn.offsetLeft - bar.offsetWidth / 2 + btn.offsetWidth / 2,
          behavior: "smooth",
        });
      }
    }
    // 捲至對應分類區塊（使用容器 scrollTo 代替 scrollIntoView，防止瀏覽器抖動與視窗位移）
    const targetEl = sectionRefs.current[cat];
    if (targetEl && listRef.current) {
      listRef.current.scrollTo({
        top: targetEl.offsetTop,
        behavior: "smooth",
      });
    }
  };

  // ── 滾動監聽 (Scroll Spy) ──────────────────────────────────────────
  const handleScroll = useCallback((e) => {
    if (isManualScrollRef.current) return;

    const container = e.currentTarget;
    const containerScrollTop = container.scrollTop;

    const groupElements = Object.entries(sectionRefs.current)
      .map(([cat, el]) => ({ cat, el }))
      .filter((g) => g.el != null);

    if (groupElements.length === 0) return;

    // 當前滾動位置 (加一點偏移量 offset 做精準選中)
    const currentScrollTop = containerScrollTop + 15;

    let targetCat = groupElements[0].cat;
    for (let i = 0; i < groupElements.length; i++) {
      const g = groupElements[i];
      if (g.el.offsetTop <= currentScrollTop) {
        targetCat = g.cat;
      } else {
        break;
      }
    }

    if (targetCat && targetCat !== activeCategory) {
      setActiveCategory(targetCat);
      if (tabBarRef.current) {
        const btn = tabBarRef.current.querySelector(
          `[data-cat="${CSS.escape(targetCat)}"]`,
        );
        if (btn) {
          const bar = tabBarRef.current;
          bar.scrollTo({
            left: btn.offsetLeft - bar.offsetWidth / 2 + btn.offsetWidth / 2,
            behavior: "smooth",
          });
        }
      }
    }
  }, [activeCategory]);

  // ── 購物車 ───────────────────────────────────────────────────
  const handleUpdateQty = (pid, delta) => {
    setAnimatingProductId(pid);
    setTimeout(() => {
      setAnimatingProductId((prev) => (prev === pid ? null : prev));
    }, 150);

    if (isGroupOrder) {
      if (!activeRecipient) {
        alert("請先選擇或新增團員姓名！");
        return;
      }
      setGroupCart((prev) => {
        const recipientItems = prev[activeRecipient] || {};
        const currentQty = recipientItems[pid] || 0;
        const qty = Math.max(0, currentQty + delta);
        const nextItems = { ...recipientItems };
        if (qty === 0) {
          delete nextItems[pid];
        } else {
          nextItems[pid] = qty;
        }
        return {
          ...prev,
          [activeRecipient]: nextItems,
        };
      });
    } else {
      setCart((prev) => {
        const qty = Math.max(0, (prev[pid] || 0) + delta);
        const next = { ...prev };
        if (qty === 0) delete next[pid];
        else next[pid] = qty;
        return next;
      });
    }
  };

  const handleSetQty = (pid, valStr) => {
    let qty;
    if (valStr === "") {
      qty = "";
    } else {
      qty = parseInt(valStr, 10);
      if (isNaN(qty)) qty = 0;
      qty = Math.max(0, Math.min(99, qty));
    }

    setAnimatingProductId(pid);
    setTimeout(() => {
      setAnimatingProductId((prev) => (prev === pid ? null : prev));
    }, 150);

    if (isGroupOrder) {
      if (!activeRecipient) {
        alert("請先選擇或新增團員姓名！");
        return;
      }
      setGroupCart((prev) => {
        const recipientItems = prev[activeRecipient] || {};
        const nextItems = { ...recipientItems };
        if (qty === 0 || qty === "") {
          delete nextItems[pid];
        } else {
          nextItems[pid] = qty;
        }
        return {
          ...prev,
          [activeRecipient]: nextItems,
        };
      });
    } else {
      setCart((prev) => {
        const next = { ...prev };
        if (qty === 0 || qty === "") {
          delete next[pid];
        } else {
          next[pid] = qty;
        }
        return next;
      });
    }
  };

  const handleProductAction = (product, isPlus) => {
    const statusInfo = getGroupBuyStatus();
    if (statusInfo.status === 'upcoming' || statusInfo.status === 'ended') {
      alert(statusInfo.message);
      return;
    }
    if (product.has_flavor_attributes) {
      if (isGroupOrder && !activeRecipient) {
        alert("請先選擇或新增團員姓名！");
        return;
      }
      setFlavorModalProduct(product);
      const currentFlavors = (isGroupOrder && activeRecipient)
        ? (groupFlavorSelections[activeRecipient]?.[product.id] || {})
        : (flavorSelections[product.id] || {});
      const initialTemp = {};
      product.flavor_choices.forEach((f) => {
        initialTemp[f] = currentFlavors[f] || 0;
      });
      const currentTotal = Object.values(initialTemp).reduce(
        (a, b) => a + b,
        0,
      );
      if (isPlus && currentTotal === 0 && product.flavor_choices.length > 0) {
        initialTemp[product.flavor_choices[0]] = 1;
      }
      setTempFlavorQty(initialTemp);
    } else {
      handleUpdateQty(product.id, isPlus ? 1 : -1);
    }
  };

  const handleUpdateTempFlavorQty = (flavor, delta) => {
    setTempFlavorQty((prev) => {
      const val = Math.max(0, Math.min(99, (prev[flavor] || 0) + delta));
      return { ...prev, [flavor]: val };
    });
  };

  const handleSetTempFlavorQty = (flavor, valStr) => {
    let val;
    if (valStr === "") {
      val = "";
    } else {
      val = parseInt(valStr, 10);
      if (isNaN(val)) val = 0;
    }
    setTempFlavorQty((prev) => ({ ...prev, [flavor]: val }));
  };

  const calcProductSubtotal = (product, qty) => {
    if (!product || !qty) return 0;
    const singlePrice = Number(product.single_price) || Number(product.price) || 0;
    if (product.has_volume_pricing && product.volume_pricing_settings) {
      const targetQty = Number(product.volume_pricing_settings.target_quantity) || 1;
      const packagePrice = Number(product.volume_pricing_settings.package_price) || 0;
      const groupCount = Math.floor(qty / targetQty);
      const remainderCount = qty % targetQty;
      return groupCount * packagePrice + remainderCount * singlePrice;
    }
    return singlePrice * qty;
  };

  const getFlavorRemark = (productId, pFlavorSelections, pGroupFlavorSelections = null, pIsGroupOrder = false) => {
    if (pIsGroupOrder && pGroupFlavorSelections && typeof pGroupFlavorSelections === "object") {
      const combinedMap = {};
      Object.values(pGroupFlavorSelections).forEach((recipientMap) => {
        if (recipientMap && recipientMap[productId]) {
          Object.entries(recipientMap[productId]).forEach(([flavor, qty]) => {
            const num = Number(qty) || 0;
            if (num > 0) {
              combinedMap[flavor] = (combinedMap[flavor] || 0) + num;
            }
          });
        }
      });
      const items = Object.entries(combinedMap)
        .filter(([_, qty]) => qty > 0)
        .map(([flavor, qty]) => `${flavor}x${qty}`);
      if (items.length === 0) return "";
      return `【口味備註：${items.join(", ")}】`;
    }

    const selections = pFlavorSelections[productId];
    if (!selections) return "";
    const items = Object.entries(selections)
      .filter(([_, qty]) => qty > 0)
      .map(([flavor, qty]) => `${flavor}x${qty}`);
    if (items.length === 0) return "";
    return `【口味備註：${items.join(", ")}】`;
  };

  const handleConfirmFlavors = () => {
    if (!flavorModalProduct) return;
    const pid = flavorModalProduct.id;

    // 清理臨時口味數量，將空字串 "" 轉為 0，並限制上限為 99
    const cleanedTempFlavorQty = {};
    Object.entries(tempFlavorQty).forEach(([f, val]) => {
      const parsed = parseInt(val, 10) || 0;
      cleanedTempFlavorQty[f] = Math.max(0, Math.min(99, parsed));
    });

    const total = Object.values(cleanedTempFlavorQty).reduce((a, b) => a + b, 0);

    setAnimatingProductId(pid);
    setTimeout(() => {
      setAnimatingProductId((prev) => (prev === pid ? null : prev));
    }, 150);

    if (isGroupOrder) {
      if (!activeRecipient) {
        alert("請先選擇或新增團員姓名！");
        return;
      }
      setGroupCart((prev) => {
        const recipientItems = prev[activeRecipient] || {};
        const nextItems = { ...recipientItems };
        if (total === 0) {
          delete nextItems[pid];
        } else {
          nextItems[pid] = total;
        }
        return {
          ...prev,
          [activeRecipient]: nextItems,
        };
      });
      setGroupFlavorSelections((prev) => {
        const recipientFlavors = prev[activeRecipient] || {};
        const nextFlavors = { ...recipientFlavors };
        if (total === 0) {
          delete nextFlavors[pid];
        } else {
          nextFlavors[pid] = cleanedTempFlavorQty;
        }
        return {
          ...prev,
          [activeRecipient]: nextFlavors,
        };
      });
    } else {
      setCart((prev) => {
        const next = { ...prev };
        if (total === 0) {
          delete next[pid];
        } else {
          next[pid] = total;
        }
        return next;
      });
      setFlavorSelections((prev) => {
        const next = { ...prev };
        if (total === 0) {
          delete next[pid];
        } else {
          next[pid] = cleanedTempFlavorQty;
        }
        return next;
      });
    }

    setFlavorModalProduct(null);
  };

  const totalQty = Object.values(cart).reduce((s, q) => s + q, 0);

  const { cartItems, cartTotal, discountDetails, availableGiftCredits, memberGiftCredits } = useMemo(() => {
    let tempItems = Object.entries(cart).map(([pid, qty]) => {
      const p = products.find((x) => x.id === pid);
      return {
        id: pid,
        name: p?.name ?? pid,
        price: Number(p?.single_price || p?.price || 0),
        qty: qty,
        freeQty: 0,
        subtotal: 0,
        product: p,
        remark: p?.has_flavor_attributes ? getFlavorRemark(pid, flavorSelections, groupFlavorSelections, isGroupOrder) : "",
        imageUrl: p?.imageUrl ?? "",
        isGift: false
      };
    }).filter(item => item.product);

    let totalAmount = 0;
    const discounts = [];
    const availableGiftCredits = {}; // { [promoId]: { earned: number, selected: number } }
    const memberGiftCredits = {}; // { [memberName]: { [promoId]: { earned: number, selected: number } } }
    const finalCartItems = [];

    // 分組
    const promoGroups = {}; // promoId -> items
    const standaloneItems = [];

    for (const item of tempItems) {
      if (item.product?.promoId && item.product?.promotion?.isActive) {
        const pId = item.product.promoId;
        if (!promoGroups[pId]) promoGroups[pId] = { promotion: item.product.promotion, items: [] };
        promoGroups[pId].items.push(item);
      } else {
        standaloneItems.push(item);
      }
    }

    // 處理促銷群組
    for (const pId in promoGroups) {
      const group = promoGroups[pId];
      const promo = group.promotion;

      if (promo.promoType === 'BUY_X_GET_Y') {
        const mode = promo.rewardSelectionMode || 'AUTO_LOWEST_PRICE';
        const rawTiers = Array.isArray(promo.tiers) && promo.tiers.length > 0
          ? promo.tiers
          : [{ buyQty: Number(promo.buyQty), freeQty: Number(promo.freeQty) }];
        const sortedTiers = [...rawTiers]
          .map(t => ({ buyQty: Number(t.buyQty) || 0, freeQty: Number(t.freeQty) || 0 }))
          .filter(t => t.buyQty > 0)
          .sort((a, b) => b.buyQty - a.buyQty);

        let totalQtyInGroup = group.items.reduce((sum, item) => sum + item.qty, 0);

        if (mode === 'AUTO_LOWEST_PRICE') {
           let totalFreeAllowed = 0;
           let totalSavedAmount = 0;

           if (isGroupOrder && groupCart && typeof groupCart === 'object') {
             for (const [memberName, memberItems] of Object.entries(groupCart)) {
               if (!memberItems || typeof memberItems !== 'object') continue;
               let memberExpandedUnits = [];
               for (const item of group.items) {
                 const mQty = Number(memberItems[item.id] || 0);
                 for (let i = 0; i < mQty; i++) {
                   memberExpandedUnits.push({ ...item, unitPrice: item.price });
                 }
               }
               let remainingQty = memberExpandedUnits.length;
               let memberFree = 0;
               for (const tier of sortedTiers) {
                 const groupSize = tier.buyQty + tier.freeQty;
                 if (groupSize > 0 && remainingQty >= groupSize) {
                   const sets = Math.floor(remainingQty / groupSize);
                   memberFree += sets * tier.freeQty;
                   remainingQty -= sets * groupSize;
                 }
               }
               memberExpandedUnits.sort((a, b) => a.unitPrice - b.unitPrice);
               for (let i = 0; i < memberFree; i++) {
                 if (memberExpandedUnits[i]) {
                   totalSavedAmount += memberExpandedUnits[i].unitPrice;
                 }
               }
               totalFreeAllowed += memberFree;
             }
             for (const item of group.items) {
               finalCartItems.push({ ...item, qty: item.qty, subtotal: item.qty * item.price, isGift: false });
               totalAmount += item.qty * item.price;
             }
           } else {
             let remainingQty = totalQtyInGroup;
             for (const tier of sortedTiers) {
               const groupSize = tier.buyQty + tier.freeQty;
               if (groupSize > 0 && remainingQty >= groupSize) {
                 const sets = Math.floor(remainingQty / groupSize);
                 totalFreeAllowed += sets * tier.freeQty;
                 remainingQty -= sets * groupSize;
               }
             }
             let expandedUnits = [];
             for (const item of group.items) {
               for (let i = 0; i < item.qty; i++) {
                 expandedUnits.push({ ...item, unitPrice: item.price });
               }
             }
             expandedUnits.sort((a, b) => a.unitPrice - b.unitPrice);
             for (let i = 0; i < expandedUnits.length; i++) {
                expandedUnits[i].isFree = i < totalFreeAllowed;
             }
             for (const item of group.items) {
                const unitsOfThisItem = expandedUnits.filter(u => u.id === item.id);
                const freeCount = unitsOfThisItem.filter(u => u.isFree).length;
                const paidCount = unitsOfThisItem.filter(u => !u.isFree).length;
                if (paidCount > 0) {
                    finalCartItems.push({ ...item, qty: paidCount, subtotal: paidCount * item.price, isGift: false });
                    totalAmount += paidCount * item.price;
                }
                if (freeCount > 0) {
                    finalCartItems.push({ ...item, qty: freeCount, subtotal: 0, price: 0, isGift: true, remark: item.remark ? `${item.remark} (贈品)` : "贈品" });
                }
             }
             totalSavedAmount = expandedUnits.filter(u => u.isFree).reduce((sum, u) => sum + u.unitPrice, 0);
           }
           
           if (totalFreeAllowed > 0) {
              discounts.push(`✨ [${promo.name}] 已自動折抵 ${totalFreeAllowed} 件免費商品 (省 $${totalSavedAmount})`);
           }

        } else if (mode === 'CUSTOMER_SELECT') {
           let earnedGifts = 0;
           if (isGroupOrder && groupCart && typeof groupCart === 'object') {
             for (const [memberName, memberItems] of Object.entries(groupCart)) {
               if (!memberItems || typeof memberItems !== 'object') continue;
               let memberGroupQty = 0;
               for (const item of group.items) {
                 memberGroupQty += Number(memberItems[item.id] || 0);
               }
               let remaining = memberGroupQty;
               let mEarned = 0;
               for (const tier of sortedTiers) {
                 if (tier.buyQty > 0 && remaining >= tier.buyQty) {
                   const sets = Math.floor(remaining / tier.buyQty);
                   mEarned += sets * tier.freeQty;
                   remaining -= sets * tier.buyQty;
                 }
               }
               earnedGifts += mEarned;

               // 計算該成員已選取贈品
               const mSelections = groupGiftSelections[memberName]?.[pId] || {};
               const mSelectedCount = Object.values(mSelections).reduce((a, b) => a + Number(b), 0);
               if (!memberGiftCredits[memberName]) memberGiftCredits[memberName] = {};
               memberGiftCredits[memberName][pId] = { earned: mEarned, selected: mSelectedCount, promoName: promo.name };
             }
           } else {
             let remaining = totalQtyInGroup;
             for (const tier of sortedTiers) {
               if (tier.buyQty > 0 && remaining >= tier.buyQty) {
                 const sets = Math.floor(remaining / tier.buyQty);
                 earnedGifts += sets * tier.freeQty;
                 remaining -= sets * tier.buyQty;
               }
             }
           }
           
           for (const item of group.items) {
               finalCartItems.push({ ...item, qty: item.qty, subtotal: item.qty * item.price, isGift: false });
               totalAmount += item.qty * item.price;
           }
           
           let selectedGiftsCount = 0;
           if (isGroupOrder && groupCart && typeof groupCart === 'object') {
             const aggregatedGifts = {}; // { [gPid]: totalQty }
             Object.entries(groupGiftSelections || {}).forEach(([memberName, mGifts]) => {
               const selections = mGifts?.[pId] || {};
               Object.entries(selections).forEach(([gPid, gQty]) => {
                 if (gQty > 0) {
                   selectedGiftsCount += gQty;
                   aggregatedGifts[gPid] = (aggregatedGifts[gPid] || 0) + gQty;
                 }
               });
             });

             Object.entries(aggregatedGifts).forEach(([gPid, totalGQty]) => {
               const gProd = products.find(p => p.id === gPid);
               if (gProd) {
                 finalCartItems.push({
                   id: gPid,
                   name: gProd.name,
                   price: 0,
                   qty: totalGQty,
                   freeQty: 0,
                   subtotal: 0,
                   product: gProd,
                   remark: "免費贈品",
                   imageUrl: gProd.imageUrl || "",
                   isGift: true
                 });
               }
             });
           } else {
             const selections = giftSelections[pId] || {};
             for (const [gPid, gQty] of Object.entries(selections)) {
                 if (gQty > 0) {
                     selectedGiftsCount += gQty;
                     const gProd = products.find(p => p.id === gPid);
                     if (gProd) {
                         finalCartItems.push({
                             id: gPid,
                             name: gProd.name,
                             price: 0,
                             qty: gQty,
                             freeQty: 0,
                             subtotal: 0,
                             product: gProd,
                             remark: "贈品",
                             imageUrl: gProd.imageUrl || "",
                             isGift: true
                         });
                     }
                 }
             }
           }
           
           availableGiftCredits[pId] = { earned: earnedGifts, selected: selectedGiftsCount, promoName: promo.name };
           if (earnedGifts > 0) {
               discounts.push(`✨ [${promo.name}] 獲得 ${earnedGifts} 件贈品額度 (已選 ${selectedGiftsCount} 件)`);
           }

        } else if (mode === 'SAME_PRODUCT') {
           for (const item of group.items) {
               let totalItemFree = 0;
               if (isGroupOrder && groupCart && typeof groupCart === 'object') {
                 for (const [memberName, memberItems] of Object.entries(groupCart)) {
                   if (!memberItems || typeof memberItems !== 'object') continue;
                   let memberItemQty = Number(memberItems[item.id] || 0);
                   let remaining = memberItemQty;
                   for (const tier of sortedTiers) {
                     if (tier.buyQty > 0 && remaining >= tier.buyQty) {
                       const sets = Math.floor(remaining / tier.buyQty);
                       totalItemFree += sets * tier.freeQty;
                       remaining -= sets * tier.buyQty;
                     }
                   }
                 }
               } else {
                 let remaining = item.qty;
                 for (const tier of sortedTiers) {
                   if (tier.buyQty > 0 && remaining >= tier.buyQty) {
                     const sets = Math.floor(remaining / tier.buyQty);
                     totalItemFree += sets * tier.freeQty;
                     remaining -= sets * tier.buyQty;
                   }
                 }
               }
               
               finalCartItems.push({ ...item, qty: item.qty, subtotal: item.qty * item.price, isGift: false });
               totalAmount += item.qty * item.price;
               
               if (totalItemFree > 0) {
                   finalCartItems.push({ ...item, qty: totalItemFree, subtotal: 0, price: 0, isGift: true, remark: item.remark ? `${item.remark} (贈品)` : "贈品" });
                   discounts.push(`✨ [${promo.name}] ${item.name} 滿贈獲得 ${totalItemFree} 件贈品`);
               }
           }
        }

      } else if (promo.promoType === 'BUNDLE_PRICE') {
         const targetQty = Number(promo.buyQty);
         const packagePrice = Number(promo.bundlePrice);
         
         const totalQtyInGroup = group.items.reduce((sum, item) => sum + item.qty, 0);
         const sets = Math.floor(totalQtyInGroup / targetQty);
         
         let expandedUnits = [];
         for (const item of group.items) {
           for (let i = 0; i < item.qty; i++) {
             expandedUnits.push({ ...item, unitPrice: item.price });
           }
         }
         expandedUnits.sort((a, b) => b.unitPrice - a.unitPrice);
         
         for (let i = 0; i < expandedUnits.length; i++) {
            expandedUnits[i].isPartOfBundle = i < sets * targetQty;
         }
         
         const groupSubtotal = sets * packagePrice;
         
         for (const item of group.items) {
           const unitsOfThisItem = expandedUnits.filter(u => u.id === item.id);
           const bundleCount = unitsOfThisItem.filter(u => u.isPartOfBundle).length;
           const remainCount = unitsOfThisItem.filter(u => !u.isPartOfBundle).length;
           
           let itemSub = remainCount * item.price;
           if (bundleCount > 0 && sets * targetQty > 0) {
             itemSub += (bundleCount / (sets * targetQty)) * groupSubtotal;
           }
           item.subtotal = Math.round(itemSub);
         }
         
         let sumOfItemSubtotals = group.items.reduce((sum, item) => sum + item.subtotal, 0);
         const expectedTotal = groupSubtotal + expandedUnits.filter(u => !u.isPartOfBundle).reduce((sum, u) => sum + u.unitPrice, 0);
         
         if (sumOfItemSubtotals !== expectedTotal && group.items.length > 0) {
            group.items[0].subtotal += (expectedTotal - sumOfItemSubtotals);
         }
         
         totalAmount += expectedTotal;
         
         for (const item of group.items) {
             finalCartItems.push({ ...item, isGift: false });
         }

         if (sets > 0) {
            const originalPriceForBundled = expandedUnits.filter(u => u.isPartOfBundle).reduce((sum, u) => sum + u.unitPrice, 0);
            const savedAmount = originalPriceForBundled - groupSubtotal;
            discounts.push(`✨ [${promo.name}] 組合優惠 (省 $${savedAmount})`);
         }
      }
    }

    // 處理獨立商品 (舊版商品層級促銷)
    for (const item of standaloneItems) {
      const p = item.product;
      const singlePrice = item.price;
      
      let legacyFreeQty = 0;
      if (Array.isArray(p.promotions) && p.promotions.length > 0) {
        let bestFree = 0;
        for (const promo of p.promotions) {
          const bx = Number(promo.buyX);
          const gy = Number(promo.getY);
          if (bx > 0 && gy > 0) {
            const free = Math.floor(item.qty / (bx + gy)) * gy;
            if (free > bestFree) bestFree = free;
          }
        }
        legacyFreeQty = bestFree;
        item.freeQty = legacyFreeQty;
        item.subtotal = singlePrice * (item.qty - legacyFreeQty); 
      } else if (p.has_volume_pricing && p.volume_pricing_settings) {
        const targetQty = Number(p.volume_pricing_settings.target_quantity);
        const packagePrice = Number(p.volume_pricing_settings.package_price);
        const groupCount = Math.floor(item.qty / targetQty);
        const remainderCount = item.qty % targetQty;
        item.subtotal = groupCount * packagePrice + remainderCount * singlePrice;
      } else {
        item.subtotal = singlePrice * item.qty;
      }
      totalAmount += item.subtotal;
      
      if (legacyFreeQty > 0) {
          // split legacy free items as well
          const paidQty = item.qty - legacyFreeQty;
          if (paidQty > 0) {
              finalCartItems.push({ ...item, qty: paidQty, isGift: false });
          }
          finalCartItems.push({ ...item, qty: legacyFreeQty, subtotal: 0, price: 0, isGift: true, remark: item.remark ? `${item.remark} (贈品)` : "贈品" });
      } else {
          finalCartItems.push({ ...item, isGift: false });
      }
    }

    return { cartItems: finalCartItems, cartTotal: totalAmount, discountDetails: discounts, availableGiftCredits, memberGiftCredits };
  }, [cart, giftSelections, groupGiftSelections, products, flavorSelections, groupFlavorSelections, isGroupOrder, groupCart]);

  const shippingFee = useMemo(() => {
    if (!isGeneralUser) return 0;
    let activeComm = currentCommunity;
    if (selectedCommunityId && allCommunities.length > 0) {
      const match = allCommunities.find(c => c.CommunityId === selectedCommunityId);
      if (match) activeComm = match;
    }
    if (!activeComm || activeComm.DefaultFreeShipping) return 0;
    const fee = Number(activeComm.ShippingFee) || 0;
    if (fee <= 0) return 0;
    const freeMin = Number(activeComm.FreeShippingMin) || 0;
    if (freeMin > 0 && cartTotal >= freeMin) return 0;
    return fee;
  }, [isGeneralUser, currentCommunity, selectedCommunityId, allCommunities, cartTotal]);

  const orderTotal = cartTotal + shippingFee;

  // (已移至元件頂部)

  const getFullAddress = () => {
    const bName =
      selectedBuilding === "其它" ? otherBuildingText.trim() : selectedBuilding;
    
    const isGeneral = 
      bName === "一般用戶" || 
      bName === "一般散客" || 
      bName === "上線下單" || 
      bName === "線上下單" || 
      bName === "一般常態" ||
      bName === "常態零售";

    // 如果是一般散客用戶，大樓名是散客標籤，後面拼上完整外送地址與公司名稱
    if (isGeneral) {
      let districtPrefix = "";
      if (selectedCommunityId && allCommunities.length > 0) {
        const match = allCommunities.find(c => c.CommunityId === selectedCommunityId);
        if (match) districtPrefix = match.CommunityName; // "台南市佳里區"
      }

      let baseAddr = detailAddress.trim();
      // 如果輸入的地址不以已選取的行政區開頭，拼上行政區前綴
      if (districtPrefix && !baseAddr.startsWith(districtPrefix)) {
        baseAddr = districtPrefix + baseAddr;
      }

      const comp = companyName.trim();
      if (comp) {
        return `${bName} ${baseAddr} (${comp})`;
      }
      return `${bName} ${baseAddr}`;
    }

    if (!bName) return detailAddress.trim();
    return `${bName} - ${detailAddress.trim()}`;
  };



  // ── 進入填寫步驟：從 LocalStorage 自動帶入舊資料 ─────────────
  const handleProceedToForm = async () => {
    // 🛡️ 檢查是否有未完成之贈品額度，若有則阻止前往填寫資料並立刻開出 Bottom Sheet
    for (const [pId, credit] of Object.entries(availableGiftCredits)) {
      if (credit.earned > 0 && credit.selected < credit.earned) {
        setShowGiftModal(pId);
        alert(`⚠️ 請先完成贈品選擇！還有 ${credit.earned - credit.selected} 件贈品尚未選擇。`);
        return;
      }
    }
    try {
      const saved = JSON.parse(localStorage.getItem(LS_KEY) || "{}");
      if (saved.name) {
        setCustomerName(saved.name);
      } else {
        // 如果沒有儲存的名字，嘗試抓取 LINE 暱稱作為預填
        if (isLiffInitialized && window.liff && window.liff.isLoggedIn()) {
          try {
            const profile = await window.liff.getProfile();
            if (profile.displayName) setCustomerName(profile.displayName);
          } catch (e) {
            console.warn("Failed to get LIFF profile for prepopulating:", e);
          }
        }
      }
      if (saved.phone) setCustomerPhone(formatTaiwanPhone(saved.phone));

      const isLocked = !!lockedBuilding;

      if (saved.building !== undefined || saved.detailAddress !== undefined) {
        const savedBuilding = saved.building || "";
        let savedDetail = saved.detailAddress || "";
        const savedCompany = saved.companyName || "";

        // 去除任何可能殘留的行政區前綴
        if (allCommunities.length > 0) {
          for (const c of allCommunities) {
            if (savedDetail.startsWith(c.CommunityName)) {
              savedDetail = savedDetail.substring(c.CommunityName.length).trim();
              break;
            }
          }
        }

        if (isLocked) {
          setSelectedBuilding(lockedBuilding);
          setDetailAddress(savedDetail);
          setCompanyName(savedCompany);
        } else {
          if (knownBuildings.includes(savedBuilding)) {
            setSelectedBuilding(savedBuilding);
            setDetailAddress(savedDetail);
            setCompanyName(savedCompany);
          } else if (savedBuilding) {
            setSelectedBuilding("其它");
            setOtherBuildingText(savedBuilding);
            setDetailAddress(savedDetail);
            setCompanyName(savedCompany);
          } else {
            setDetailAddress(savedDetail);
            setCompanyName(savedCompany);
          }
        }
      } else if (saved.address) {
        let addr = String(saved.address).trim();
        // 去除任何可能殘留的行政區前綴
        if (allCommunities.length > 0) {
          for (const c of allCommunities) {
            if (addr.startsWith(c.CommunityName)) {
              addr = addr.substring(c.CommunityName.length).trim();
              break;
            }
          }
        }
        let matched = false;

        if (isLocked) {
          setSelectedBuilding(lockedBuilding);
          if (addr.startsWith(lockedBuilding)) {
            setDetailAddress(addr.slice(lockedBuilding.length).trim());
          } else {
            let foundOther = false;
            for (const bName of knownBuildings) {
              if (bName && addr.startsWith(bName)) {
                setDetailAddress(addr.slice(bName.length).trim());
                foundOther = true;
                break;
              }
            }
            if (!foundOther) {
              setDetailAddress(addr);
            }
          }
        } else {
          for (const bName of knownBuildings) {
            if (bName && addr.startsWith(bName)) {
              setSelectedBuilding(bName);
              setDetailAddress(addr.slice(bName.length).trim());
              matched = true;
              break;
            }
          }
          if (!matched) {
            setSelectedBuilding("其它");
            setOtherBuildingText(addr);
            setDetailAddress("");
          }
        }
      }

      // 一般散客：僅在當前未選取時才從上次紀錄帶入（優先使用本次下單選取的區域）
      if (!selectedCity && saved.city) setSelectedCity(saved.city);
      if (!selectedCommunityId && saved.communityId) setSelectedCommunityId(saved.communityId);

      // 記錄這次 session 的原始配送區域（給 confirmModal 比較用）
      originalCommunityIdRef.current = selectedCommunityId || saved.communityId || "";

    } catch (_) { }

    // 💡 團購模式 Clean Up：只保留有購買商品的成員
    if (isGroupOrder) {
      setGroupCart((prev) => {
        const cleanedCart = {};
        Object.entries(prev).forEach(([name, items]) => {
          if (items && typeof items === "object") {
            const hasItems = Object.values(items).some((qty) => Number(qty) > 0);
            if (hasItems) {
              cleanedCart[name] = items;
            }
          }
        });
        return cleanedCart;
      });
    }

    setStep("form");
  };

  // ── 送出訂單 ─────────────────────────────────────────────────
  const handleSubmitOrder = async () => {
    // 🛡️ 強制贈品未完成檢查
    for (const [pId, credit] of Object.entries(availableGiftCredits)) {
      if (credit.earned > 0 && credit.selected < credit.earned) {
        setIsSubmitting(false);
        setShowGiftModal(pId);
        alert(`⚠️ 請先完成贈品選擇！還有 ${credit.earned - credit.selected} 件贈品尚未選擇。`);
        return;
      }
    }

    const successItemsSnap = [...cartItems];
    setIsSubmitting(true);
    try {
      // 儲存客戶資料到 LocalStorage（下次自動帶入）
      // 正規化 detailAddress：去除行政區前綴再存，避免下次疊加
      let saveDetail = detailAddress.trim();
      if (isGeneralUser && selectedCommunityId && allCommunities.length > 0) {
        const commMatch = allCommunities.find(c => c.CommunityId === selectedCommunityId);
        if (commMatch && saveDetail.startsWith(commMatch.CommunityName)) {
          saveDetail = saveDetail.substring(commMatch.CommunityName.length).trim();
        }
      }
      localStorage.setItem(
        LS_KEY,
        JSON.stringify({
          name: customerName,
          phone: customerPhone,
          building: selectedBuilding === "其它" ? otherBuildingText.trim() : selectedBuilding,
          detailAddress: saveDetail,
          companyName: isGeneralUser ? companyName.trim() : "",
          city: isGeneralUser ? selectedCity : "",
          communityId: isGeneralUser ? selectedCommunityId : "",
          address: getFullAddress(),
        }),
      );

      let lineDisplayName = "";
      let finalLineUserId = lineUserId || "";
      if (isLiffInitialized && window.liff && window.liff.isLoggedIn()) {
        try {
          const profile = await window.liff.getProfile();
          lineDisplayName = profile.displayName || "";
          finalLineUserId = profile.userId || "";
        } catch (e) {
          console.warn("Failed to get LIFF profile for submitting order:", e);
        }
      }

      const maxDeduction = Math.min(memberProfile?.WalletBalance || 0, cartTotal);

      const res = await callGAS(
        apiUrl,
        "v2_createOrder",
        {
          customerName,
          customerPhone,
          deliveryAddress: getFullAddress(),
          CommunityId: (isGeneralUser && selectedCommunityId) ? selectedCommunityId : (currentCommunity?.CommunityId || ""),
          CampaignId: activeCampaign?.CampaignId || "",
          sourceGroup: (() => {
            if (isGeneralUser && selectedCommunityId) {
              const match = allCommunities.find(c => c.CommunityId === selectedCommunityId);
              if (match) return match.CommunityName;
            }
            return selectedBuilding === "其它" ? otherBuildingText.trim() : (selectedBuilding || "一般散客");
          })(),
          note,
          paymentMethod,
          transferLastFive,
          lineDisplayName,
          lineUserId: finalLineUserId,
          useWalletDeduction: useWallet,
          walletDeductionAmount: maxDeduction,
          shippingFee,
          isGroupOrder,
          groupCart: isGroupOrder ? groupCart : undefined,
          groupDetails: isGroupOrder ? (() => {
            const details = {};
            if (groupCart && typeof groupCart === "object") {
              Object.entries(groupCart).forEach(([name, recipientItems]) => {
                const validEntries = recipientItems && typeof recipientItems === "object"
                  ? Object.entries(recipientItems).filter(([_, qty]) => Number(qty) > 0)
                  : [];
                const mGifts = groupGiftSelections[name] || {};

                if (validEntries.length > 0 || Object.keys(mGifts).length > 0) {
                  details[name] = validEntries.map(([pid, qty]) => {
                    const prod = products.find(p => p.id === pid);
                    const sub = prod ? calcProductSubtotal(prod, qty) : 0;
                    const price = qty > 0 ? Math.round(sub / qty) : (prod ? (Number(prod.single_price) || Number(prod.price)) : 0);
                    const rem = prod?.has_flavor_attributes ? getFlavorRemark(pid, {}, { [name]: groupFlavorSelections[name] }, true) : "";
                    return {
                      productId: pid,
                      productName: prod?.name || pid,
                      qty: Number(qty),
                      price: price,
                      subtotal: sub,
                      remark: rem
                    };
                  });

                  // 🎁 將該團員特有的贈品寫入 groupDetails
                  Object.entries(mGifts).forEach(([pId, gObj]) => {
                    if (gObj && typeof gObj === 'object') {
                      Object.entries(gObj).forEach(([gPid, gQty]) => {
                        if (Number(gQty) > 0) {
                          const gProd = products.find(p => p.id === gPid);
                          details[name].push({
                            productId: gPid,
                            productName: gProd?.name || gPid,
                            qty: Number(gQty),
                            price: 0,
                            subtotal: 0,
                            remark: "贈品"
                          });
                        }
                      });
                    }
                  });
                }
              });
            }
            return details;
          })() : undefined,
          items: cartItems.map((i) => ({
            productId: i.id,
            productName: i.name,
            unitPrice: i.price,
            qty: i.qty + (i.freeQty || 0),
            subtotal: i.subtotal,
            remark: i.remark,
          })),
        },
        user.token,
      );

      if (res?.error) throw new Error(res.error);

      if (useWallet && memberProfile) {
        setMemberProfile(prev => prev ? {
          ...prev,
          WalletBalance: Math.max(0, Number(prev.WalletBalance) - maxDeduction)
        } : null);
      }

      setOrderId(res.orderId || "");
      setOrderTime(new Date().toLocaleString("zh-TW", { hour12: false }));
      
      const finalTotal = useWallet ? Math.max(0, orderTotal - maxDeduction) : orderTotal;
      setSuccessOrderTotal(finalTotal);

      // 自動背景發送明細：僅限一般散客，且在 1對1 官方聊天室 (utou) 中點開
      const isGeneral = isGeneralUser || !selectedBuilding || selectedBuilding === "其它";
      if (isGeneral && isLiffInitialized && window.liff && window.liff.isInClient()) {
        const context = window.liff.getContext();
        if (context && context.type === 'utou') {
          try {
            const text = `訂單已提交！\n【付款方式】${paymentMethod}\n【訂單編號】#${res.orderId || ""}\n【訂購姓名】${customerName}\n【合計金額】$${finalTotal}\n【轉帳後五碼】${transferLastFive || "無"}\n※ 詳細明細小幫手已在後台收到囉！`;
            await window.liff.sendMessages([
              {
                type: "text",
                text: text
              }
            ]);
            setIsMsgSentAuto(true);
            console.log("LIFF message sent automatically in 1-on-1 chat");
          } catch (e) {
            console.error("Failed to auto-send LIFF message:", e);
          }
        }
      }

      setSuccessOrderItems(successItemsSnap);
      setSuccessCartTotal(cartTotal);
      setSuccessShippingFee(shippingFee);
      setSuccessWalletDeduction(useWallet ? maxDeduction : 0);
      setSuccessDeliveryDate(activeCampaign?.DeliveryDate || "");
      setSuccessDeliveryTime(
        activeCampaign?.DeliveryStartTime && activeCampaign?.DeliveryEndTime
          ? `${activeCampaign.DeliveryStartTime}~${activeCampaign.DeliveryEndTime}`
          : ""
      );

      setCart({});
      setStep("success");
    } catch (err) {
      alert("送出訂單失敗: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };



  const getOaMessageUrl = () => {
    const text = `訂單已提交！\n【付款方式】${paymentMethod}\n【訂單編號】#${orderId}\n【訂購姓名】${customerName}\n【合計金額】$${successOrderTotal || 0}\n【轉帳後五碼】${transferLastFive || "無"}\n※ 詳細明細小幫手已在後台收到囉！`;
    return `https://line.me/R/oaMessage/@839rpabi/?text=${encodeURIComponent(text)}`;
  };

  // ════════════════════════════════════════════════════════════
  // 感謝頁
  // ════════════════════════════════════════════════════════════
  if (step === "success") {
    const generateGroupOrderShareText = () => {
      let text = `📋 【米立微團購】訂單對帳單 (單號: ${orderId})\n`;
      text += `----------------------------------\n`;

      let grandTotalQty = 0;
      let grandTotalAmount = 0;

      Object.entries(groupCart).forEach(([name, items]) => {
        if (!items || typeof items !== 'object') return;
        const validItems = Object.entries(items).filter(([_, qty]) => Number(qty) > 0);
        const mGifts = groupGiftSelections[name] || {};
        const giftList = [];
        Object.entries(mGifts).forEach(([pId, gObj]) => {
          if (gObj && typeof gObj === 'object') {
            Object.entries(gObj).forEach(([gPid, gQty]) => {
              if (Number(gQty) > 0) {
                const gProd = products.find(p => p.id === gPid);
                if (gProd) {
                  giftList.push({ name: gProd.name, qty: Number(gQty) });
                }
              }
            });
          }
        });

        if (validItems.length === 0 && giftList.length === 0) return;

        text += `👤 ${name}\n`;
        let recipientSubtotal = 0;
        validItems.forEach(([productId, qty]) => {
          const product = products.find((p) => p.id === productId);
          const subtotal = product ? calcProductSubtotal(product, qty) : 0;
          const rem = product?.has_flavor_attributes ? getFlavorRemark(productId, {}, { [name]: groupFlavorSelections[name] }, true) : "";
          const remDisplay = rem ? ` ${rem}` : "";

          recipientSubtotal += subtotal;
          grandTotalQty += qty;
          text += `   - ${product ? product.name : productId}${remDisplay} x ${qty} ($${subtotal})\n`;
        });

        giftList.forEach((g) => {
          grandTotalQty += g.qty;
          text += `   - 🎁 [贈品] ${g.name} x ${g.qty} ($0)\n`;
        });

        text += `   💰 小計：$${recipientSubtotal}\n`;
        text += `----------------------------------\n`;
        grandTotalAmount += recipientSubtotal;
      });

      if (successShippingFee > 0) {
        text += `🚚 運費：$${successShippingFee}\n`;
        grandTotalAmount += Number(successShippingFee);
      }

      text += `總計：${grandTotalQty} 件商品，共 $${grandTotalAmount} 元。\n`;
      text += `(本文字由米立微系統自動產生，請團員確認無誤後向團長繳款)`;
      return text;
    };

    return (
      <div className="max-w-md mx-auto flex flex-col h-[100dvh] relative overflow-hidden bg-[var(--bg-primary)]">
        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-6 pb-10">
          {/* 成功 Header */}
          <div className="flex flex-col items-center text-center pt-8 pb-4">
            <div className="w-24 h-24 bg-emerald-100 dark:bg-emerald-950/40 rounded-full flex items-center justify-center mb-5 text-emerald-600 dark:text-emerald-400 shadow-md shadow-emerald-500/5 animate-bounce-subtle">
              <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h2 className="text-2xl font-black text-[var(--text-primary)] tracking-wide">
              訂單成立
            </h2>
            <p className="text-sm font-bold text-[var(--text-secondary)] mt-2">
              感謝您的訂購！
            </p>
            <p className="text-xs text-[var(--text-tertiary)] mt-1.5 max-w-[280px] leading-relaxed">
              我們已收到您的訂單，配送前將透過 LINE 通知您。
            </p>
          </div>

          {/* 📋 訂單資訊 Card */}
          <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-2xl p-5 shadow-sm space-y-3.5 text-sm font-mono">
            <div className="text-xs font-bold text-[var(--text-secondary)] font-sans flex items-center gap-1.5 mb-1.5">
              📋 訂單資訊
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[var(--text-secondary)] font-medium font-sans">訂單編號</span>
              <span className="font-bold text-[var(--text-primary)]">{orderId}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[var(--text-secondary)] font-medium font-sans">建立時間</span>
              <span className="text-[var(--text-primary)]">{orderTime}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[var(--text-secondary)] font-medium font-sans">付款方式</span>
              <span className="font-semibold text-[var(--text-primary)] font-sans">{paymentMethod}</span>
            </div>
          </div>

          {/* 🛒 商品明細 Card */}
          {successOrderItems.length > 0 && (
            <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-2xl shadow-sm text-sm">
              <div 
                onClick={() => setIsDetailExpanded(!isDetailExpanded)}
                className="px-5 py-4 flex justify-between items-center cursor-pointer hover:bg-[var(--bg-hover)] transition-colors select-none rounded-t-2xl"
              >
                <span className="font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                  🛒 商品明細 (共 {successOrderItems.reduce((sum, item) => sum + item.qty, 0)} 件)
                </span>
                <ChevronDown 
                  size={18} 
                  className={`text-[var(--text-secondary)] transition-transform duration-300 ${isDetailExpanded ? 'rotate-180' : ''}`} 
                />
              </div>
              {isDetailExpanded && (
                <div className="divide-y divide-[var(--border-primary)] border-t border-[var(--border-primary)]">
                  {successOrderItems.map((item) => (
                    <div key={item.id} className="flex items-center gap-3 px-5 py-3.5">
                      {/* 商品圖片 */}
                      <div className="w-10 h-10 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-primary)] overflow-hidden shrink-0 flex items-center justify-center">
                        {item.imageUrl ? (
                          <img
                            src={item.imageUrl}
                            alt={item.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Package size={16} className="text-[var(--text-tertiary)]" />
                        )}
                      </div>

                      {/* 名稱與備註 */}
                      <div className="flex-1 min-w-0">
                        <span className="font-semibold text-[var(--text-primary)] block truncate">
                          {item.name}
                        </span>
                        {item.remark && (
                          <span className="text-xs text-blue-600 block mt-0.5 truncate">
                            {item.remark}
                          </span>
                        )}
                      </div>

                      {/* 數量與金額 */}
                      <div className="text-right shrink-0 flex flex-col items-end">
                        <div className="flex items-center">
                          <span className="text-xs text-[var(--text-secondary)] mr-2 font-mono">
                            x{item.qty}
                          </span>
                          <span className="font-mono font-bold text-[var(--text-primary)]">
                            ${item.subtotal}
                          </span>
                        </div>
                        {item.freeQty > 0 && (
                          <span className="text-[10px] font-bold text-emerald-600 mt-0.5">
                            (內含贈品: {item.freeQty}件)
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 💰 金額摘要 Card */}
          <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-2xl p-5 shadow-sm space-y-3 text-sm">
            <div className="text-xs font-bold text-[var(--text-secondary)] flex items-center gap-1.5 mb-1">
              💰 金額摘要
            </div>
            <div className="flex justify-between text-[var(--text-secondary)] font-medium">
              <span>商品金額</span>
              <span className="font-mono">${successCartTotal}</span>
            </div>
            <div className="flex justify-between text-[var(--text-secondary)] font-medium">
              <span>運費</span>
              {successShippingFee > 0 ? (
                <span className="font-mono">+${successShippingFee}</span>
              ) : (
                <span className="text-emerald-600 font-semibold">免運</span>
              )}
            </div>
            {successWalletDeduction > 0 && (
              <div className="flex justify-between text-rose-500 font-medium">
                <span>折扣 (奶包金折抵)</span>
                <span className="font-mono">-${successWalletDeduction}</span>
              </div>
            )}
            <div className="pt-3 border-t border-[var(--border-primary)] flex justify-between items-center font-bold text-[var(--text-primary)]">
              <span className="text-base">合計</span>
              <span className="font-mono text-xl font-extrabold text-blue-600">${successOrderTotal}</span>
            </div>
          </div>

          {/* 👥 團購對帳單分享 Card */}
          {isGroupOrder && (
            <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-2xl p-5 shadow-sm space-y-3 text-sm">
              <div className="text-xs font-bold text-[var(--text-secondary)] flex items-center gap-1.5 mb-1">
                👥 團員對帳單 (Line 分享專用)
              </div>
              <div className="bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-xl p-3.5 font-mono text-xs text-[var(--text-primary)] whitespace-pre-wrap max-h-[220px] overflow-y-auto">
                {generateGroupOrderShareText()}
              </div>
              <button
                onClick={() => handleCopy(generateGroupOrderShareText())}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-blue-500/15"
              >
                {copied ? "✅ 已複製對帳單！" : "📋 複製對帳單文字"}
              </button>
            </div>
          )}

          {/* 📢 配送提醒 Card */}
          <div className="bg-amber-50/55 border border-amber-200/85 rounded-2xl p-5 shadow-sm space-y-3 text-xs text-amber-900">
            <div className="font-extrabold text-sm flex items-center gap-1.5 text-amber-800">
              📢 配送注意事項
            </div>
            <div className="space-y-2 font-medium text-amber-800/90">
              {paymentMethod === "現金" && (
                <div className="flex items-start gap-2">
                  <span className="text-amber-500 mt-0.5">✓</span>
                  <span>採現金支付，<strong>請自備零錢</strong>，現場恕不找零。</span>
                </div>
              )}
              {paymentMethod === "轉帳" && (
                <div className="bg-white/80 border border-blue-100 rounded-xl p-3.5 space-y-2.5 text-xs text-blue-900 mb-2 font-sans">
                  <p className="font-bold text-blue-800 flex items-center gap-1">🏦 請轉帳至以下帳戶</p>
                  <div className="space-y-1.5">
                    <div className="flex justify-between">
                      <span className="text-blue-700/80">銀行</span>
                      <span className="font-semibold text-blue-950">{BANK_INFO.bank}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-blue-700/80">帳號</span>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-bold tracking-wider text-blue-950">{BANK_INFO.account}</span>
                        <button
                          onClick={() => handleCopy(BANK_INFO.account)}
                          className="text-[10px] bg-blue-100 hover:bg-blue-200 text-blue-600 px-2 py-0.5 rounded font-bold"
                        >
                          {copied ? "已複製！" : "複製"}
                        </button>
                      </div>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-blue-700/80">戶名</span>
                      <span className="font-semibold text-blue-950">{BANK_INFO.name}</span>
                    </div>
                  </div>
                </div>
              )}
              <div className="flex items-start gap-2">
                <span className="text-amber-500 mt-0.5">✓</span>
                <span>配送前一天將透過 LINE 訊息與您聯絡通知。</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-amber-500 mt-0.5">✓</span>
                <span>如需修改訂購項目或地址，請直接聯絡 LINE 客服。</span>
              </div>
            </div>
          </div>

          {/* 客服與行動引導按鈕 */}
          <div className="w-full flex flex-col gap-3 pt-2">
            {paymentMethod === "LINE Pay" && (
              <button
                onClick={() => window.open(LINE_PAY_URL, "_blank")}
                className="w-full py-4 rounded-xl font-bold flex items-center justify-center gap-2 text-white shadow-md shadow-emerald-500/20 hover:opacity-95 active:scale-95 transition-all flex-shrink-0"
                style={{ background: "#06C755" }}
              >
                聯繫米立微小編付款 ➔
              </button>
            )}

            {/* 聯繫客服按鈕 */}
            {(() => {
              const isGeneral = isGeneralUser || !selectedBuilding || selectedBuilding === "其它";
              const actionUrl = isGeneral ? getOaMessageUrl() : LINE_CONTACT_URL;
              const isMsgSent = isGeneral && isMsgSentAuto;

              if (isMsgSent) {
                return (
                  <div className="w-full py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 text-emerald-600 bg-emerald-50 border border-emerald-200 text-sm select-none">
                    <CheckCircle size={18} />
                    訂單明細已自動發送給客服
                  </div>
                );
              }

              return (
                <button
                  onClick={() => window.open(actionUrl, "_blank")}
                  className="w-full py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 shadow-sm active:scale-95 transition-all flex-shrink-0"
                >
                  <span className="text-sm flex items-center gap-1.5">
                    💬 有問題？立即聯絡 LINE 客服
                  </span>
                </button>
              );
            })()}

            {/* 下方行動按鈕組 */}
            <div className="grid grid-cols-2 gap-3 w-full">
              <button
                onClick={() => {
                  setStep("shop");
                  setCustomerName("");
                  setCustomerPhone("");
                  setDeliveryAddress("");
                  setNote("");
                  setPaymentMethod("現金");
                  setTransferLastFive("");
                  setIsNightOrder(false);
                  setIsMsgSentAuto(false);
                  setSuccessOrderItems([]);
                  setSuccessCartTotal(0);
                  setSuccessShippingFee(0);
                  setSuccessWalletDeduction(0);
                  setSuccessDeliveryDate("");
                  setSuccessDeliveryTime("");
                  setIsDetailExpanded(true);
                }}
                className="py-3 rounded-xl font-bold text-sm bg-blue-50 hover:bg-blue-100 text-blue-600 border border-blue-100 active:scale-95 transition-all"
              >
                🛍 再次購買
              </button>
              <button
                onClick={() => {
                  setStep("shop");
                  setCustomerName("");
                  setCustomerPhone("");
                  setDeliveryAddress("");
                  setNote("");
                  setPaymentMethod("現金");
                  setTransferLastFive("");
                  setIsNightOrder(false);
                  setIsMsgSentAuto(false);
                  setSuccessOrderItems([]);
                  setSuccessCartTotal(0);
                  setSuccessShippingFee(0);
                  setSuccessWalletDeduction(0);
                  setSuccessDeliveryDate("");
                  setSuccessDeliveryTime("");
                  setIsDetailExpanded(true);
                }}
                className="py-3 rounded-xl font-bold text-sm btn-secondary active:scale-95 transition-all"
              >
                🏠 返回首頁
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── 🎁 贈品選擇 Bottom Sheet 抽屜組件 ─────────────────────────────
  // ── 🎁 贈品選擇 Bottom Sheet 抽屜組件 ─────────────────────────────
  const renderGiftModal = () => {
    if (!showGiftModal) return null;
    const pId = showGiftModal;
    const promoItems = products.filter(p => p.promoId === pId);
    const promo = promoItems[0]?.promotion;

    if (isGroupOrder) {
      const membersWithGifts = Object.keys(groupCart || {}).filter(
        name => (memberGiftCredits[name]?.[pId]?.earned || 0) > 0
      );

      if (membersWithGifts.length === 0) return null;

      const currMember = (activeGroupMember && membersWithGifts.includes(activeGroupMember))
        ? activeGroupMember
        : (membersWithGifts.find(name => (memberGiftCredits[name]?.[pId]?.selected || 0) < (memberGiftCredits[name]?.[pId]?.earned || 0)) || membersWithGifts[0]);

      const mCredits = memberGiftCredits[currMember]?.[pId] || { earned: 0, selected: 0 };
      const mSelections = groupGiftSelections[currMember]?.[pId] || {};
      const mRemaining = mCredits.earned - mCredits.selected;

      const handleSetGroupGift = (prodId, num) => {
        const current = mSelections[prodId] || 0;
        const diff = num - current;
        if (num < 0) return;
        if (diff > 0 && mRemaining < diff) return;

        setGroupGiftSelections(prev => ({
          ...prev,
          [currMember]: {
            ...(prev[currMember] || {}),
            [pId]: {
              ...(prev[currMember]?.[pId] || {}),
              [prodId]: num
            }
          }
        }));
      };

      const nextIncomplete = membersWithGifts.find(
        name => name !== currMember && (memberGiftCredits[name]?.[pId]?.selected || 0) < (memberGiftCredits[name]?.[pId]?.earned || 0)
      );

      return (
        <div className="fixed inset-0 z-[9999] flex flex-col justify-end p-3 pb-[75px]">
          {/* 遮罩背景 */}
          <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity animate-fadeIn"
            onClick={() => setShowGiftModal(null)}
          />

          {/* Bottom Sheet 抽屜卡片 */}
          <div className="relative z-50 bg-[var(--bg-secondary)] rounded-[28px] border border-[var(--border-primary)] shadow-2xl w-full max-w-md mx-auto flex flex-col overflow-hidden max-h-[80vh] animate-slideUp">
            {/* 頂部拖拽條與 Header */}
            <div className="pt-3 pb-2 px-4 border-b border-[var(--border-primary)] bg-[var(--bg-tertiary)] flex flex-col items-center relative">
              <div className="w-12 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mb-2 cursor-pointer" onClick={() => setShowGiftModal(null)} />
              <div className="w-full flex justify-between items-center">
                <div>
                  <h3 className="text-base font-extrabold text-blue-700 dark:text-blue-400 flex items-center gap-1.5">
                    <span>🎉 選擇 👤【{currMember}】的贈品</span>
                  </h3>
                  <p className="text-xs text-amber-600 dark:text-amber-400 font-bold mt-0.5">
                    {promo?.name} ｜ 額度: {mCredits.earned} 件 / 已選: {mCredits.selected} 件 {mRemaining > 0 ? `(尚餘 ${mRemaining} 件)` : '✅ 已選完'}
                  </p>
                </div>
                <button
                  onClick={() => setShowGiftModal(null)}
                  className="text-[var(--text-secondary)] hover:text-red-500 p-1.5 rounded-lg hover:bg-[var(--bg-hover)] shrink-0"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
              </div>
            </div>

            {/* 👥 團員頁籤切換 Bar */}
            <div className="flex gap-2 p-2.5 overflow-x-auto border-b border-[var(--border-primary)] bg-[var(--bg-tertiary)] shrink-0 no-scrollbar">
              {membersWithGifts.map(name => {
                const mc = memberGiftCredits[name]?.[pId] || { earned: 0, selected: 0 };
                const isDone = mc.selected >= mc.earned;
                const isActive = currMember === name;
                return (
                  <button
                    key={name}
                    onClick={() => setActiveGroupMember(name)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 transition-all flex items-center gap-1 ${
                      isActive
                        ? 'bg-blue-600 text-white shadow-md'
                        : isDone
                        ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-300 dark:border-emerald-700'
                        : 'bg-amber-500/10 text-amber-600 border border-amber-300 dark:border-amber-700 animate-pulse'
                    }`}
                  >
                    <span>👤 {name}</span>
                    <span>{isDone ? `✅ (${mc.selected}/${mc.earned})` : `(${mc.selected}/${mc.earned})`}</span>
                  </button>
                );
              })}
            </div>

            {/* 贈品品項列表 */}
            <div className="p-4 overflow-y-auto space-y-3 bg-[var(--bg-secondary)] min-h-[140px] max-h-[45vh]">
              {promoItems.map((prod) => {
                const qty = mSelections[prod.id] || 0;
                return (
                  <div key={prod.id} className="flex items-center justify-between p-3.5 border border-[var(--border-primary)] rounded-2xl hover:border-blue-200 hover:bg-blue-50/30 transition-all">
                    <div className="font-bold text-sm text-[var(--text-primary)] pr-2 line-clamp-2">
                      {prod.name}
                    </div>
                    <div className="flex items-center gap-2 bg-[var(--bg-tertiary)] rounded-xl p-1 border border-[var(--border-primary)] shadow-sm shrink-0">
                      <button
                        onClick={() => handleSetGroupGift(prod.id, qty - 1)}
                        disabled={qty === 0}
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-600 hover:bg-slate-200 active:scale-95 disabled:opacity-30 transition-all font-extrabold"
                      >
                        <Minus size={14} />
                      </button>
                      <span className="w-6 text-center font-extrabold font-mono text-base text-[var(--text-primary)]">
                        {qty}
                      </span>
                      <button
                        onClick={() => handleSetGroupGift(prod.id, qty + 1)}
                        disabled={mRemaining === 0}
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-600 hover:bg-slate-200 active:scale-95 disabled:opacity-30 transition-all font-extrabold"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 底部完成 / 下一步按鈕 */}
            <div className="p-4 border-t border-[var(--border-primary)] bg-[var(--bg-tertiary)]">
              <button
                onClick={() => {
                  if (mRemaining === 0 && nextIncomplete) {
                    setActiveGroupMember(nextIncomplete);
                  } else {
                    setShowGiftModal(null);
                  }
                }}
                className={`w-full py-3.5 rounded-xl font-extrabold text-sm transition-all shadow-md active:scale-95 flex items-center justify-center gap-1 text-white ${
                  mRemaining === 0 && nextIncomplete
                    ? 'bg-amber-500 hover:bg-amber-600 animate-pulse'
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {mRemaining > 0 ? (
                  `確認 👤【${currMember}】的選取 (尚有 ${mRemaining} 件未選)`
                ) : nextIncomplete ? (
                  `下一步：選擇 👤【${nextIncomplete}】的贈品 ➔`
                ) : (
                  '完成全體團員贈品選取 ✅'
                )}
              </button>
            </div>
          </div>
        </div>
      );
    }

    const credits = availableGiftCredits[pId] || { earned: 0, selected: 0 };
    const selections = giftSelections[pId] || {};
    const remaining = credits.earned - credits.selected;

    const handleSetGift = (prodId, num) => {
       const current = selections[prodId] || 0;
       const diff = num - current;
       if (num < 0) return;
       if (diff > 0 && remaining < diff) return;
       
       setGiftSelections(prev => ({
           ...prev,
           [pId]: {
               ...(prev[pId] || {}),
               [prodId]: num
           }
       }));
    };

    return (
      <div className="fixed inset-0 z-[9999] flex flex-col justify-end p-3 pb-[75px]">
        {/* 遮罩背景 */}
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity animate-fadeIn"
          onClick={() => setShowGiftModal(null)}
        />

        {/* Bottom Sheet 抽屜卡片 */}
        <div className="relative z-50 bg-[var(--bg-secondary)] rounded-[28px] border border-[var(--border-primary)] shadow-2xl w-full max-w-md mx-auto flex flex-col overflow-hidden max-h-[75vh] animate-slideUp">
          {/* 頂部拖拽條與 Header */}
          <div className="pt-3 pb-3 px-4 border-b border-[var(--border-primary)] bg-[var(--bg-tertiary)] flex flex-col items-center relative">
            <div className="w-12 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mb-3 cursor-pointer" onClick={() => setShowGiftModal(null)} />
            <div className="w-full flex justify-between items-center">
              <div>
                <h3 className="text-base font-extrabold text-blue-700 dark:text-blue-400">
                  🎉 請選擇贈品: {promo?.name}
                </h3>
                <p className="text-xs text-amber-600 dark:text-amber-400 font-bold mt-0.5">
                  已獲額度: {credits.earned} 件 / 已選: {credits.selected} 件 {remaining > 0 ? `(尚餘 ${remaining} 件)` : '✅ 已選完'}
                </p>
              </div>
              <button
                onClick={() => setShowGiftModal(null)}
                className="text-[var(--text-secondary)] hover:text-red-500 p-1.5 rounded-lg hover:bg-[var(--bg-hover)]"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>
          </div>

          {/* 贈品品項列表 */}
          <div className="p-4 overflow-y-auto space-y-3 bg-[var(--bg-secondary)] min-h-[140px] max-h-[45vh]">
            {promoItems.map((prod) => {
              const qty = selections[prod.id] || 0;
              return (
                <div key={prod.id} className="flex items-center justify-between p-3.5 border border-[var(--border-primary)] rounded-2xl hover:border-blue-200 hover:bg-blue-50/30 transition-all">
                  <div className="font-bold text-sm text-[var(--text-primary)] pr-2 line-clamp-2">
                    {prod.name}
                  </div>
                  <div className="flex items-center gap-2 bg-[var(--bg-tertiary)] rounded-xl p-1 border border-[var(--border-primary)] shadow-sm shrink-0">
                    <button
                      onClick={() => handleSetGift(prod.id, qty - 1)}
                      disabled={qty === 0}
                      className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-600 hover:bg-slate-200 active:scale-95 disabled:opacity-30 transition-all font-extrabold"
                    >
                      <Minus size={14} />
                    </button>
                    <span className="w-6 text-center font-extrabold font-mono text-base text-[var(--text-primary)]">
                      {qty}
                    </span>
                    <button
                      onClick={() => handleSetGift(prod.id, qty + 1)}
                      disabled={remaining === 0}
                      className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-600 hover:bg-slate-200 active:scale-95 disabled:opacity-30 transition-all font-extrabold"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* 底部完成按鈕 */}
          <div className="p-4 border-t border-[var(--border-primary)] bg-[var(--bg-tertiary)]">
            <button
              onClick={() => setShowGiftModal(null)}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3.5 rounded-xl font-extrabold text-sm transition-all shadow-md active:scale-95 flex items-center justify-center gap-1"
            >
              確認選取 {remaining > 0 ? `(尚有 ${remaining} 件未選)` : '✅'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ════════════════════════════════════════════════════════════
  // 訂單確認頁
  // ════════════════════════════════════════════════════════════
  if (step === "confirm") {
    if (cartItems.length === 0) {
      setStep("shop");
      return null;
    }

    return (
      <div className="max-w-md mx-auto flex flex-col h-[100dvh] relative overflow-hidden bg-[var(--bg-primary)]">
        <div 
          className="p-4 bg-[var(--bg-secondary)] border-b border-[var(--border-primary)] flex items-center gap-3 flex-shrink-0"
          style={{ touchAction: "none" }}
        >
          <button
            onClick={() => setStep("shop")}
            className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            <ChevronLeft size={20} />
          </button>
          <h2 className="text-lg font-bold text-[var(--text-primary)]">
            確認購物清單
          </h2>
        </div>

        <div key="page-confirm" className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* 商品清單 */}
          <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-2xl overflow-hidden">
            <div className="px-4 py-2.5 border-b border-[var(--border-primary)] text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">
              訂購商品
            </div>
            {cartItems.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border-primary)] last:border-0 text-sm"
              >
                {/* 圖片展示 */}
                <div className="w-12 h-12 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-primary)] overflow-hidden shrink-0 flex items-center justify-center">
                  {item.imageUrl ? (
                    <img
                      src={item.imageUrl}
                      alt={item.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Package size={20} className="text-[var(--text-tertiary)]" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start">
                    <span className="font-semibold text-[var(--text-primary)] truncate">
                      {item.name}
                    </span>
                    <span className="font-mono font-bold text-[var(--text-primary)] ml-2 shrink-0">
                      ${item.subtotal}
                    </span>
                  </div>
                  <div className="flex justify-between items-center mt-1 text-xs text-[var(--text-secondary)]">
                    <div className="flex flex-col gap-1">
                      <span>單價 ${item.price}</span>
                      {item.isGift && (
                        <div className="flex flex-col gap-0.5">
                          <span className="text-amber-600 font-bold bg-amber-100 px-2 py-0.5 rounded w-fit">🎁 免費贈品</span>
                        </div>
                      )}
                    </div>
                    {(() => {
                      if (item.isGift) {
                        return (
                          <span className="w-8 text-center font-extrabold font-mono text-sm text-[var(--text-primary)] mr-2">
                             x{item.qty}
                          </span>
                        );
                      }
                      const product = products.find(p => p.id === item.id);
                      if (!product) return null;
                      return (
                        <div className="flex items-center bg-[var(--bg-tertiary)] rounded-xl p-0.5 border border-[var(--border-primary)] shadow-sm select-none">
                          <button
                            onClick={() => handleProductAction(product, false)}
                            className="w-7 h-7 flex items-center justify-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition-all duration-100 active:scale-90"
                          >
                            <Minus size={12} />
                          </button>
                          {product.has_flavor_attributes ? (
                            <span className="w-8 text-center font-extrabold font-mono text-sm text-[var(--text-primary)]">
                              {item.qty}
                            </span>
                          ) : (
                            <input
                              type="number"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              min="0"
                              max="99"
                              value={item.qty}
                              onChange={(e) => handleSetQty(product.id, e.target.value)}
                              onBlur={(e) => {
                                if (e.target.value === "" || isNaN(parseInt(e.target.value, 10))) {
                                  handleSetQty(product.id, 0);
                                }
                              }}
                              onFocus={(e) => e.target.select()}
                              className="w-8 text-center font-extrabold font-mono text-sm text-[var(--text-primary)] bg-transparent border-0 p-0 focus:ring-0 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                          )}
                          <button
                            onClick={() => handleProductAction(product, true)}
                            className="w-7 h-7 flex items-center justify-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition-all duration-100 active:scale-90"
                          >
                            <Plus size={12} />
                          </button>
                        </div>
                      );
                    })()}
                  </div>
                  {item.remark && (
                    <div className="text-xs text-blue-600 font-medium mt-1">
                      {item.remark}
                    </div>
                  )}
                  {isGroupOrder && (
                    <div className="mt-1.5 pt-1.5 border-t border-dashed border-[var(--border-primary)] space-y-1">
                      {item.isGift ? (
                        // 🎁 贈品品項：合併展示選取此款贈品之各團員與選取數量
                        Object.entries(groupGiftSelections || {}).map(([name, pObj]) => {
                          let gQty = 0;
                          Object.values(pObj || {}).forEach(selections => {
                            if (selections && selections[item.id]) gQty += Number(selections[item.id]);
                          });
                          if (gQty === 0) return null;
                          return (
                            <div key={name} className="flex justify-between items-center text-[11px] text-[var(--text-secondary)] font-sans">
                              <span>👤 {name}</span>
                              <span className="font-semibold font-mono">x{gQty}</span>
                            </div>
                          );
                        })
                      ) : (
                        // 🛒 一般付費商品：顯示各團員付費購買之數量
                        Object.entries(groupCart).map(([name, items]) => {
                          if (!items || typeof items !== 'object') return null;
                          const qty = items[item.id] || 0;
                          if (qty === 0) return null;
                          return (
                            <div key={name} className="flex justify-between items-center text-[11px] text-[var(--text-secondary)] font-sans">
                              <span>👤 {name}</span>
                              <span className="font-semibold font-mono">x{qty}</span>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
            
            {/* 贈品挑選區塊 */}
            {Object.entries(availableGiftCredits || {}).map(([pId, credits]) => {
              if (credits.earned > 0) {
                const promo = products.find(p => p.promoId === pId)?.promotion;
                const remaining = credits.earned - credits.selected;
                return (
                  <div key={pId} className="px-4 py-3 bg-blue-50 border-t border-[var(--border-primary)]">
                    <div className="flex justify-between items-center">
                      <div className="flex flex-col">
                        <span className="font-bold text-blue-800 text-sm">🎉 {promo?.name || '促銷活動'} 贈品</span>
                        <span className="text-xs text-blue-600 mt-0.5">已獲得 {credits.earned} 件，尚未挑選 {remaining} 件</span>
                      </div>
                      <button 
                        onClick={() => setShowGiftModal(pId)}
                        className={`px-3 py-1.5 rounded-lg font-bold text-xs shadow-sm transition-all ${remaining > 0 ? 'bg-blue-600 text-white hover:bg-blue-700 animate-pulse' : 'bg-blue-200 text-blue-700'}`}
                      >
                        {remaining > 0 ? '🎁 點此挑選贈品' : '✅ 重新挑選'}
                      </button>
                    </div>
                  </div>
                );
              }
              return null;
            })}
            {/* 運費進度條與費用明細 */}
            {(() => {
              let activeComm = currentCommunity;
              if (isGeneralUser && selectedCommunityId && allCommunities.length > 0) {
                const match = allCommunities.find(c => c.CommunityId === selectedCommunityId);
                if (match) activeComm = match;
              }

              const hasShipping = isGeneralUser && activeComm && !activeComm.DefaultFreeShipping && Number(activeComm.ShippingFee) > 0;
              const freeMin = Number(activeComm?.FreeShippingMin) || 0;
              const fee = Number(activeComm?.ShippingFee) || 0;
              const gap = freeMin > 0 ? Math.max(0, freeMin - cartTotal) : 0;
              const progress = freeMin > 0 ? Math.min(100, Math.round((cartTotal / freeMin) * 100)) : 100;
              const isFree = shippingFee === 0;

              return hasShipping ? (
                <div className="px-4 pt-3 pb-1 space-y-2">
                  {/* 進度條 */}
                  {freeMin > 0 && (
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center text-xs font-bold">
                        {isFree ? (
                          <span className="text-emerald-600 flex items-center gap-1">🎉 已達成免運門檻！已享免運</span>
                        ) : (
                          <span className="text-[var(--text-secondary)]">
                            🚚 再買 <strong className="text-orange-500 font-extrabold font-mono">${gap}</strong> 即可免運
                          </span>
                        )}
                        <span className="text-[10px] text-slate-400 font-mono font-normal">門檻 ${freeMin}</span>
                      </div>
                      {/* 軌道與小車車 */}
                      <div className="relative w-full h-1.5 bg-slate-100 rounded-full border border-slate-200/60 overflow-visible">
                        {/* 進度填充 */}
                        <div 
                          className={`h-full rounded-full transition-all duration-300 ${isFree ? 'bg-emerald-500' : 'bg-gradient-to-r from-orange-400 to-amber-500'}`}
                          style={{ width: `${progress}%` }}
                        />
                        {/* 小車車圖示 */}
                        <span 
                          className="absolute -top-[7px] text-base transition-all duration-300 pointer-events-none select-none"
                          style={{ 
                            left: `calc(${progress}% - 9px)`, 
                            transform: 'scaleX(-1)' // 將車車開的方向轉為朝右
                          }}
                        >
                          🚚
                        </span>
                      </div>
                    </div>
                  )}
                  {/* 費用明細 */}
                  <div className="flex justify-between items-center text-sm text-[var(--text-secondary)]">
                    <span>商品小計</span>
                    <span className="font-mono">${cartTotal}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className={isFree ? 'text-emerald-600 font-semibold' : 'text-[var(--text-secondary)]'}>運費</span>
                    {isFree ? (
                      <span className="font-mono text-emerald-600 font-bold">免運</span>
                    ) : (
                      <span className="font-mono text-orange-500 font-semibold">+${fee}</span>
                    )}
                  </div>
                </div>
              ) : null;
            })()}

            <div className="flex justify-between items-center px-4 py-3 bg-[var(--bg-tertiary)]">
              <span className="font-bold text-[var(--text-primary)]">應付總金額</span>
              <span className="font-mono text-xl font-extrabold text-blue-600">
                ${orderTotal}
              </span>
            </div>
          </div>

          {/* 👥 團員代訂明細 (團購模式專屬) */}
          {isGroupOrder && (
            <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-2xl overflow-hidden shadow-sm">
              <div className="px-4 py-2.5 border-b border-[var(--border-primary)] text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider flex items-center justify-between">
                <span>👥 團員代訂明細</span>
                <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-bold">每人小計</span>
              </div>
              <div className="divide-y divide-[var(--border-primary)] max-h-[300px] overflow-y-auto">
                {Object.entries(groupCart).map(([name, items]) => {
                  if (!items || typeof items !== 'object') return null;
                  const validItems = Object.entries(items).filter(([_, qty]) => Number(qty) > 0);
                  if (validItems.length === 0) return null;

                  let memberTotal = 0;
                  return (
                    <div key={name} className="p-4 space-y-1.5 bg-[var(--bg-secondary)]">
                      <div className="flex justify-between items-center text-sm font-bold text-[var(--text-primary)]">
                        <span>👤 {name}</span>
                      </div>
                      <div className="space-y-1 pl-4">
                        {validItems.map(([productId, qty]) => {
                          const product = products.find((p) => p.id === productId);
                          const singlePrice = product ? (Number(product.single_price) || Number(product.price)) : 0;
                          
                          let subtotal = 0;
                          if (product && product.has_volume_pricing && product.volume_pricing_settings) {
                            const targetQty = Number(product.volume_pricing_settings.target_quantity);
                            const packagePrice = Number(product.volume_pricing_settings.package_price);
                            const groupCount = Math.floor(qty / targetQty);
                            const remainderCount = qty % targetQty;
                            subtotal = groupCount * packagePrice + remainderCount * singlePrice;
                          } else {
                            subtotal = singlePrice * qty;
                          }
                          memberTotal += subtotal;

                          return (
                            <div key={productId} className="flex justify-between items-center text-xs text-[var(--text-secondary)] font-mono">
                              <span className="font-sans">{product ? product.name : productId} x{qty}</span>
                              <span>${subtotal}</span>
                            </div>
                          );
                        })}
                        {/* 🎁 展示該團員所選取的贈品明細 */}
                        {(() => {
                          const mGifts = groupGiftSelections[name] || {};
                          const giftList = [];
                          Object.entries(mGifts).forEach(([pId, gObj]) => {
                            if (gObj && typeof gObj === 'object') {
                              Object.entries(gObj).forEach(([gPid, gQty]) => {
                                if (Number(gQty) > 0) {
                                  const gProd = products.find(p => p.id === gPid);
                                  if (gProd) {
                                    giftList.push({ id: gPid, name: gProd.name, qty: gQty });
                                  }
                                }
                              });
                            }
                          });
                          if (giftList.length === 0) return null;
                          return giftList.map((g, idx) => (
                            <div key={idx} className="flex justify-between items-center text-xs text-amber-700 dark:text-amber-300 font-bold bg-amber-500/10 px-2.5 py-1 rounded-lg mt-1">
                              <span className="font-sans flex items-center gap-1">
                                <span>🎁</span>
                                <span>[贈品] {g.name} x{g.qty}</span>
                              </span>
                              <span className="font-mono text-amber-600 dark:text-amber-400 font-extrabold">$0</span>
                            </div>
                          ));
                        })()}
                      </div>
                      <div className="flex justify-end items-center text-xs font-bold text-blue-600 pt-1">
                        <span>小計：${memberTotal} 元</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        </div>

        <div 
          className="p-4 bg-[var(--bg-secondary)] border-t border-[var(--border-primary)] grid grid-cols-2 gap-3 flex-shrink-0"
          style={{ touchAction: "none" }}
        >
          <button
            onClick={() => setStep("shop")}
            className="btn-secondary py-3 rounded-xl font-bold"
          >
            返回修改商品
          </button>
          <button
            onClick={handleProceedToForm}
            className="btn-primary py-3 rounded-xl font-bold flex items-center justify-center gap-1 shadow-md shadow-blue-500/20"
          >
            前往填寫資料 <ArrowRight size={16} />
          </button>
        </div>
        {renderGiftModal()}
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════
  // 填寫資料頁
  // ════════════════════════════════════════════════════════════
  if (step === "form") {
    const safePhone = String(customerPhone || "");
    const safeName = String(customerName || "");
    const safeAddress = String(detailAddress || "");
    const safeOther = String(otherBuildingText || "");
    const safeTransfer = String(transferLastFive || "");

    // 奶包金抵扣計算（以含運費的 orderTotal 為基準，但運費不可折抵）
    const hasWallet = memberProfile?.WalletBalance > 0;
    const maxDeduction = hasWallet ? Math.min(Number(memberProfile.WalletBalance), cartTotal) : 0;
    const payAmount = useWallet ? Math.max(0, orderTotal - maxDeduction) : orderTotal;
    const isFullyCovered = useWallet && payAmount === 0;

    const isPhoneValid = /^09\d{8}$/.test(safePhone.trim());
    const isBuildingValid =
      isGeneralUser || (
        selectedBuilding &&
        (selectedBuilding !== "其它" || safeOther.trim())
      );
    
    // 找出目前選中的行政區前綴
    let communityPrefix = "";
    if (selectedCommunityId && allCommunities.length > 0) {
      const match = allCommunities.find(c => c.CommunityId === selectedCommunityId);
      if (match) communityPrefix = match.CommunityName;
    }

    // 計算去除行政區前綴後的自填路名門牌
    let userEnteredStreet = safeAddress.trim();
    if (communityPrefix && userEnteredStreet.startsWith(communityPrefix)) {
      userEnteredStreet = userEnteredStreet.substring(communityPrefix.length).trim();
    }

    // 如果是一般散客，配送地址與外送區域皆為必填，且「路名門牌自填部分」不可為空
    const isGeneralAddressValid = !isGeneralUser || (
      selectedCity !== "" &&
      selectedCommunityId !== "" &&
      userEnteredStreet !== ""
    );

    const canProceed =
      safeName.trim() &&
      isPhoneValid &&
      isBuildingValid &&
      isGeneralAddressValid &&
      (isFullyCovered || paymentMethod !== "轉帳" || safeTransfer.trim().length === 5);

    const paymentOptions = isFullyCovered
      ? [
          {
            value: "奶包金扣抵",
            Icon: Wallet,
            label: "奶包金全額扣抵",
          }
        ]
      : [
          {
            value: "現金",
            Icon: Banknote,
            label: "現金",
          },
          {
            value: "轉帳",
            Icon: CreditCard,
            label: "銀行轉帳",
          },
          {
            value: "LINE Pay",
            Icon: Smartphone,
            label: "LINE Pay",
          },
        ];

    return (
      <div className="max-w-md mx-auto flex flex-col h-[100dvh] relative overflow-hidden bg-[var(--bg-primary)]">
        {/* Header */}
        <div 
          className="p-4 bg-[var(--bg-secondary)] border-b border-[var(--border-primary)] flex items-center gap-3 flex-shrink-0"
          style={{ touchAction: "none" }}
        >
          <button
            onClick={() => setStep("confirm")}
            className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            <ChevronLeft size={20} />
          </button>
          <div>
            <h2 className="text-lg font-bold text-[var(--text-primary)]">
              配送資訊
            </h2>
            <p className="text-xs text-[var(--text-secondary)]">
              {totalQty} 件商品，合計 ${orderTotal}{shippingFee > 0 ? `（含運 $${shippingFee}）` : ''}
            </p>
          </div>
        </div>

        <div key="page-info" className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* 收件資訊 */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">
              收件資訊
            </h3>
            <div className="space-y-1">
              <label className="text-xs font-bold text-[var(--text-secondary)] flex items-center gap-1">
                <User size={12} /> 收件人姓名{" "}
                <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                className="input-field w-full p-2.5 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-secondary)]"
                placeholder="請輸入收件人姓名"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-[var(--text-secondary)] flex items-center gap-1">
                <Phone size={12} /> 聯絡電話 <span className="text-red-500">*</span>
              </label>
              <input
                type="tel"
                className="input-field w-full p-2.5 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-secondary)]"
                placeholder="請輸入 10 位數手機號碼 (如：0912345678)"
                value={customerPhone}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, ""); // 只允許數字
                  setCustomerPhone(val);
                }}
                maxLength={10}
              />
              {safePhone.trim() && !/^09\d{8}$/.test(safePhone.trim()) && (
                <p className="text-[11px] text-red-500 font-medium">
                  ⚠️ 請輸入正確的 10 位數手機號碼 (09 開頭)
                </p>
              )}
            </div>

            {/* 根據一般用戶與大樓用戶分流顯示 */}
            {isGeneralUser ? (
              <>
                {/* 一般用戶：兩段式選擇縣市與外送區域、顯示地址與公司，隱藏大外框與任何大樓欄位 */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-[var(--text-secondary)] flex items-center gap-1">
                    <MapPin size={12} className="text-blue-500" /> 選擇縣市 <span className="text-red-500">*</span>
                  </label>
                  <select
                    className="input-field w-full p-2.5 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] text-sm font-bold"
                    value={selectedCity}
                    onChange={(e) => {
                      setSelectedCity(e.target.value);
                      setSelectedCommunityId(""); // 切換縣市時重設已選區域
                      setDetailAddress(""); // 切換縣市時重置地址
                    }}
                  >
                    <option value="">-- 請選擇縣市 --</option>
                    <option value="台南市">台南市</option>
                    <option value="高雄市">高雄市</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-[var(--text-secondary)] flex items-center gap-1">
                    <MapPin size={12} className="text-emerald-500" /> 配送區域 <span className="text-red-500">*</span>
                  </label>
                  <select
                    className="input-field w-full p-2.5 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] text-sm font-bold"
                    value={selectedCommunityId}
                    onChange={(e) => {
                      const commId = e.target.value;

                      // 如果「這次 session 的原始區域」存在，且這次選的不同 → 跳出運費警語
                      if (originalCommunityIdRef.current && commId && commId !== originalCommunityIdRef.current) {
                        const oldComm = allCommunities.find(c => c.CommunityId === originalCommunityIdRef.current);
                        const newComm = allCommunities.find(c => c.CommunityId === commId);
                        if (oldComm && newComm) {
                          const oldFee = Number(oldComm.ShippingFee) || 0;
                          const newFee = Number(newComm.ShippingFee) || 0;
                          const oldMin = Number(oldComm.FreeShippingMin) || 0;
                          const newMin = Number(newComm.FreeShippingMin) || 0;
                          const feeText = (fee, min) => fee > 0 ? `$${fee}（滿$${min}免運）` : '免運';
                          const freeNote = (fee, min) => {
                            if (fee === 0) return '✅ 此區免運';
                            if (min > 0 && cartTotal >= min) return `✅ 已達免運門檻（購物車 $${cartTotal} ≥ $${min}）`;
                            if (min > 0) return `❌ 未達免運（差 $${min - cartTotal} 即免運）`;
                            return '';
                          };
                          const applyChange = () => {
                            originalCommunityIdRef.current = commId; // 更新基準區域
                            setSelectedCommunityId(commId);
                            // 智慧前綴帶入/替換邏輯
                            const prefix = newComm.CommunityName;
                            const currentAddr = detailAddress || "";
                            if (!currentAddr.trim()) {
                              setDetailAddress(prefix);
                            } else {
                              let replaced = false;
                              for (const c of allCommunities) {
                                if (currentAddr.startsWith(c.CommunityName)) {
                                  const rest = currentAddr.substring(c.CommunityName.length);
                                  setDetailAddress(prefix + rest);
                                  replaced = true;
                                  break;
                                }
                              }
                              if (!replaced) setDetailAddress(prefix + currentAddr);
                            }
                          };
                          setConfirmModal({
                            show: true,
                            message: `⚠️ 更改配送區域將影響運費

原區域：${oldComm.CommunityName}
運費：${feeText(oldFee, oldMin)}
${freeNote(oldFee, oldMin)}

新區域：${newComm.CommunityName}
運費：${feeText(newFee, newMin)}
${freeNote(newFee, newMin)}

確定要變更嗎？`,
                            onConfirm: applyChange,
                            onCancel: null,
                            confirmText: '確定變更',
                            cancelText: '取消'
                          });
                          return; // 先不套用，等使用者確認
                        }
                      }

                      // 首次選或相同區域直接套用
                      setSelectedCommunityId(commId);
                      
                      // 智慧前綴帶入/替換邏輯
                      if (commId) {
                        const target = allCommunities.find(c => c.CommunityId === commId);
                        if (target) {
                          const prefix = target.CommunityName; // 例如 "台南市永康區"
                          const currentAddr = detailAddress || "";

                          // 1. 如果原本是空的，直接帶入
                          if (!currentAddr.trim()) {
                            setDetailAddress(prefix);
                          } else {
                            // 2. 檢查原本地址是否已經有其他選取區域的前綴，如果有，直接替換成新的前綴
                            let replaced = false;
                            for (const c of allCommunities) {
                              if (currentAddr.startsWith(c.CommunityName)) {
                                const rest = currentAddr.substring(c.CommunityName.length);
                                setDetailAddress(prefix + rest);
                                replaced = true;
                                break;
                              }
                            }
                            // 3. 如果原本有打字但沒有包含舊的行政區前綴，就把新前綴塞在最前面
                            if (!replaced) {
                              setDetailAddress(prefix + currentAddr);
                            }
                          }
                        }
                      }
                    }}
                    disabled={!selectedCity}
                  >
                    <option value="">{selectedCity ? "-- 請選擇外送區域 --" : "-- 請先選取縣市 --"}</option>
                    {selectedCity && allCommunities
                      .filter(c => !["線上下單", "一般散客", "一般用戶", "上線下單", "一般常態", "常態零售"].includes(c.CommunityName))
                      .filter(c => c.CommunityName.startsWith(selectedCity))
                      .map((c) => {
                        // 去除「台南市」、「高雄市」前綴以縮短長度
                        let shortName = c.CommunityName.replace("台南市", "").replace("高雄市", "");
                        const fee = Number(c.ShippingFee) || 0;
                        const min = Number(c.FreeShippingMin) || 0;
                        
                        // 縮短運費文字描述
                        const ruleText = fee > 0 ? `$${fee}/滿$${min}免運` : '免運';
                        
                        return (
                          <option key={c.CommunityId} value={c.CommunityId}>
                            {shortName} ({ruleText})
                          </option>
                        );
                      })}
                  </select>
                </div>
                 <div className="space-y-1">
                  <label className="text-xs font-bold text-[var(--text-secondary)] flex items-center gap-1">
                    公司 / 機關單位 / 大樓名稱 <span className="text-[var(--text-secondary)] text-[10px] font-normal">(選填)</span>
                  </label>
                  <input
                    type="text"
                    className="input-field w-full p-2.5 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] text-sm font-semibold"
                    placeholder="例：xx醫院x樓護理站、xx大樓A棟 (若無免填)"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-[var(--text-secondary)] flex items-center gap-1">
                    <MapPin size={12} className="text-emerald-500" /> 外送地址 <span className="text-red-500">*</span>
                  </label>
                  <div className="flex items-center border border-[var(--border-primary)] rounded-xl bg-[var(--bg-secondary)] overflow-hidden shadow-sm">
                    {/* 鎖定不可修改的行政區前綴 */}
                    {(() => {
                      if (selectedCommunityId && allCommunities.length > 0) {
                        const match = allCommunities.find(c => c.CommunityId === selectedCommunityId);
                        if (match) {
                          return (
                            <span className="bg-slate-100 dark:bg-slate-800 text-[var(--text-primary)] font-extrabold text-sm px-3.5 py-2.5 border-r border-[var(--border-primary)] select-none shrink-0">
                              {match.CommunityName}
                            </span>
                          );
                        }
                      }
                      return null;
                    })()}
                    <input
                      type="text"
                      className="w-full p-2.5 bg-transparent text-sm font-semibold focus:outline-none placeholder:font-normal"
                      placeholder="請輸入收件路名、門牌與樓層"
                      value={(() => {
                        // 如果 detailAddress 中已經包含選中行政區的前綴，我們將其切掉，只在輸入框展示路名門牌
                        let displayVal = detailAddress || "";
                        if (selectedCommunityId && allCommunities.length > 0) {
                          const match = allCommunities.find(c => c.CommunityId === selectedCommunityId);
                          if (match && displayVal.startsWith(match.CommunityName)) {
                            displayVal = displayVal.substring(match.CommunityName.length);
                          }
                        }
                        return displayVal;
                      })()}
                      onChange={(e) => {
                        const val = e.target.value;
                        // 當用戶輸入時，只保存路名門牌，我們會在送出及驗證時利用 getFullAddress 自動拼裝
                        setDetailAddress(val);
                      }}
                    />
                  </div>
                  {selectedCommunityId && !userEnteredStreet && (
                    <p className="text-[11px] text-red-500 font-medium mt-1">
                      ⚠️ 請輸入詳細收件路名與門牌資訊
                    </p>
                  )}
                </div>
              </>
            ) : (
              /* 大樓用戶：與收件人姓名電話同層級展示，移除大外框與底色 */
              <>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-[var(--text-secondary)] flex items-center gap-1">
                    <MapPin size={12} /> 送達大樓 / 社區 / 單位 <span className="text-red-500">*</span>
                  </label>
                  <div className="w-full bg-[var(--bg-secondary)] p-3 rounded-xl border border-[var(--border-primary)] text-sm font-bold text-[var(--text-primary)] select-none">
                    {selectedBuilding}
                  </div>
                </div>

                {selectedBuilding === "其它" && (
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-[var(--text-secondary)]">
                      自填大樓名稱 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      className="input-field w-full p-2.5 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] text-sm"
                      placeholder="請輸入大樓/社區名稱"
                      value={otherBuildingText}
                      onChange={(e) => setOtherBuildingText(e.target.value)}
                    />
                  </div>
                )}

                <div className="space-y-1">
                  <label className="text-xs font-bold text-[var(--text-secondary)] flex items-center gap-1">
                    <MapPin size={12} /> 樓層 / 戶號 / 科室 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    className="input-field w-full p-2.5 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] text-sm"
                    placeholder="例：A棟12樓之3、3樓305室、5樓總務部辦公室"
                    value={detailAddress}
                    onChange={(e) => setDetailAddress(e.target.value)}
                  />
                </div>
              </>
            )}
            <div className="space-y-1">
              <label className="text-xs font-bold text-[var(--text-secondary)] flex items-center gap-1">
                <FileText size={12} /> 備註
              </label>
              <textarea
                className="input-field w-full p-2.5 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-secondary)]"
                rows={2}
                placeholder=""
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          </div>

          {/* 奶包金抵扣小卡 */}
          {hasWallet && (
            <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-2xl p-4 space-y-3 shadow-sm">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center text-amber-600 shrink-0">
                    <Wallet size={16} />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-amber-800 flex items-center gap-1.5">
                      錢包折抵 
                      <span className="text-[10px] bg-amber-200 text-amber-800 px-1.5 py-0.5 rounded-full">
                        餘額 ${Number(memberProfile.WalletBalance)}
                      </span>
                    </div>
                    <p className="text-[10px] text-amber-700/70">
                      本筆消費最多可折抵 ${maxDeduction} 元
                    </p>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useWallet}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setUseWallet(checked);
                      if (checked && cartTotal - maxDeduction === 0) {
                        setPaymentMethod("奶包金扣抵");
                      } else if (paymentMethod === "奶包金扣抵") {
                        setPaymentMethod("現金");
                      }
                    }}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500"></div>
                </label>
              </div>

              {useWallet && (
                <div className="border-t border-amber-200/50 pt-2.5 grid grid-cols-2 gap-y-1 text-xs">
                  <div className="text-amber-700">商品小計：</div>
                  <div className="text-right font-mono font-bold text-slate-700">${cartTotal}</div>
                  {shippingFee > 0 && (<>
                    <div className="text-amber-700">運費：</div>
                    <div className="text-right font-mono font-bold text-orange-500">+${shippingFee}</div>
                  </>)}
                  {shippingFee === 0 && (() => {
                    let activeComm = currentCommunity;
                    if (isGeneralUser && selectedCommunityId && allCommunities.length > 0) {
                      const match = allCommunities.find(c => c.CommunityId === selectedCommunityId);
                      if (match) activeComm = match;
                    }
                    return isGeneralUser && activeComm && !activeComm.DefaultFreeShipping && Number(activeComm.ShippingFee) > 0;
                  })() && (<>
                    <div className="text-amber-700">運費：</div>
                    <div className="text-right font-mono font-bold text-emerald-600">免運</div>
                  </>)}
                  <div className="text-amber-700">奶包金折抵：</div>
                  <div className="text-right font-mono font-bold text-red-600">-${maxDeduction}</div>
                  <div className="text-amber-800 font-bold border-t border-dashed border-amber-200/60 pt-1.5">賸餘應付：</div>
                  <div className="text-right font-mono font-black text-blue-600 text-sm border-t border-dashed border-amber-200/60 pt-1.5">${payAmount}</div>
                </div>
              )}
            </div>
          )}

          {/* 付款方式 */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">
              付款方式
            </h3>
            <div className="space-y-2">
              {paymentOptions.map(({ value, Icon, label: optLabel }) => {
                const active = paymentMethod === value;
                return (
                  <div
                    key={value}
                    className={`flex flex-col rounded-xl border transition-all overflow-hidden ${active
                        ? "border-blue-500 bg-blue-50"
                        : "border-[var(--border-primary)] bg-[var(--bg-secondary)] hover:border-blue-300"
                      }`}
                  >
                    <label className="flex items-center gap-3 p-3.5 cursor-pointer">
                      <input
                        type="radio"
                        name="payment"
                        value={value}
                        checked={active}
                        onChange={() => setPaymentMethod(value)}
                        className="hidden"
                      />
                      <div
                        className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${active ? "bg-blue-600 text-white" : "bg-[var(--bg-tertiary)] text-[var(--text-secondary)]"}`}
                      >
                        <Icon size={18} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm text-[var(--text-primary)]">
                          {optLabel}
                        </div>
                      </div>
                      <div
                        className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${active ? "border-blue-500" : "border-[var(--border-primary)]"}`}
                      >
                        {active && (
                          <div className="w-2 h-2 rounded-full bg-blue-500" />
                        )}
                      </div>
                    </label>

                    {/* 抽屜伸縮內容 */}
                    {active && (
                      <div className="px-4 pb-3.5 border-t border-blue-100 pt-3 bg-white/40">
                        {value === "現金" && (
                          <div className="text-xs text-amber-700 font-medium">
                            ※ 採現金支付，請自備零錢，現場不找零。
                          </div>
                        )}
                        {value === "轉帳" && (
                          <div className="space-y-1.5">
                            <label className="text-xs font-bold text-blue-800">
                              您的帳戶後 5 碼 <span className="text-red-500">*</span>
                            </label>
                            <input
                              type="tel"
                              maxLength={5}
                              className="input-field w-full p-3 rounded-xl border border-blue-300 bg-white text-center font-mono tracking-[0.5em] text-lg focus:bg-white focus:outline-none"
                              placeholder="_ _ _ _ _"
                              value={transferLastFive}
                              onChange={(e) =>
                                setTransferLastFive(
                                  e.target.value.replace(/\D/g, "").slice(0, 5),
                                )
                              }
                            />
                          </div>
                        )}
                        {value === "LINE Pay" && (
                          <div className="text-xs text-emerald-700 font-medium">
                            ※ 送出訂單後，下一頁將引導您手動點擊進行付款。
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* 下一步 */}
        <div 
          className="p-4 bg-[var(--bg-secondary)] border-t border-[var(--border-primary)] flex-shrink-0"
          style={{ touchAction: "none" }}
        >
          <button
            onClick={() => {
              if (canProceed && !isSubmitting) {
                syncMemberToCloud();
                handleSubmitOrder();
              }
            }}
            disabled={!canProceed || isSubmitting}
            className={`w-full py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${
              canProceed && !isSubmitting
                ? "btn-primary shadow-md shadow-blue-500/20 active:scale-98"
                : "bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] cursor-not-allowed"
            }`}
          >
            {isSubmitting ? (
              <>
                <RefreshCw className="animate-spin" size={16} /> 送出中...
              </>
            ) : (
              <>
                確認送出訂單 <CheckCircle size={16} />
              </>
            )}
          </button>
        </div>

        {/* ⚠️ 配送區域變更確認 Dialog（form step 專用） */}
        {confirmModal.show && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-[var(--bg-secondary)] w-full max-w-[300px] rounded-2xl p-5 shadow-2xl border border-[var(--border-primary)] flex flex-col gap-4 animate-in zoom-in-95 duration-200">
              <p className="text-sm font-bold text-[var(--text-primary)] leading-relaxed whitespace-pre-line text-center">
                {confirmModal.message}
              </p>
              <div className="flex gap-2.5">
                <button
                  onClick={() => {
                    setConfirmModal({ show: false, message: '', onConfirm: null, onCancel: null });
                    if (confirmModal.onCancel) confirmModal.onCancel();
                  }}
                  className="flex-1 py-2.5 px-4 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-tertiary)] text-[var(--text-primary)] text-xs font-bold transition-all active:scale-95"
                >
                  取消
                </button>
                <button
                  onClick={() => {
                    const fn = confirmModal.onConfirm;
                    setConfirmModal({ show: false, message: '', onConfirm: null, onCancel: null });
                    if (fn) fn();
                  }}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-bold transition-all shadow-md shadow-blue-500/15"
                >
                  確定變更
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (step === "member") {
    return (
      <div className="max-w-md mx-auto flex flex-col h-[100dvh] relative overflow-hidden bg-[var(--bg-primary)]">
        <div className="h-[60px] px-4 flex items-center bg-[var(--bg-secondary)] border-b border-[var(--border-primary)] shadow-sm">
          <button onClick={() => setStep("shop")} className="p-2 -ml-2 text-[var(--text-secondary)]">
            <ChevronLeft size={24} />
          </button>
          <h2 className="ml-2 font-bold text-lg">會員中心</h2>
        </div>
        <div className="flex-1 overflow-y-auto pb-6" style={{ WebkitOverflowScrolling: "touch" }}>
          {/* Profile & Greeting Section */}
          <div className="bg-[var(--bg-secondary)] px-6 pt-6 pb-6 mb-2 border-b border-[var(--border-primary)] flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-[var(--text-primary)] flex items-center gap-2">
                  👋 {memberProfile?.DisplayName || customerName || "會員您好"}
                </div>
                <div className="text-sm text-[var(--text-secondary)] mt-1">歡迎回來！</div>
              </div>
              <div className="w-14 h-14 rounded-full overflow-hidden bg-gray-200 border-2 border-white shadow flex-shrink-0">
                {linePictureUrl ? (
                  <img src={linePictureUrl} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-400">
                    <User size={28} />
                  </div>
                )}
              </div>
            </div>

            {/* 配送日小卡 */}
            <div className="mt-1 bg-blue-50/80 border border-blue-200 rounded-xl p-4 flex justify-between items-center shadow-sm relative overflow-hidden">
              <div>
                <div className="text-xs text-blue-700 font-bold mb-1 flex items-center gap-1.5">
                  今天配送日
                  <span className="text-[9px] bg-blue-100 text-blue-700 px-1 py-0.5 rounded font-bold scale-90">開發中</span>
                </div>
                <div className="text-lg font-black text-blue-900">6/28</div>
                <div className="text-xs text-blue-800/80">下午15:00~17:00</div>
              </div>
              <Package size={32} className="text-blue-500/80" />
            </div>

            {/* 奶包金 & 會員卡 */}
            <div className="flex gap-3 mt-1">
              <div className="flex-1 bg-amber-50/80 border border-amber-200 rounded-xl p-4 shadow-sm relative overflow-hidden">
                <div className="text-xs text-amber-800 font-bold flex items-center justify-between mb-1">
                  <span className="flex items-center gap-1"><Banknote size={14}/> 奶包金餘額</span>
                  <span className="text-[9px] bg-amber-100 text-amber-800 px-1 py-0.5 rounded font-bold scale-90">開發中</span>
                </div>
                <div className="text-2xl font-black text-amber-700 font-mono">${memberProfile?.WalletBalance || 0}</div>
              </div>
              <div className="flex-1 bg-slate-50/80 border border-slate-200 rounded-xl p-4 flex flex-col justify-between shadow-sm">
                <div className="text-xs text-slate-700 font-bold flex items-center gap-1"><CheckCircle size={14}/> 會員等級</div>
                <div className="text-base font-black text-slate-800 mt-1">{
                  !memberProfile?.MemberLevel || memberProfile.MemberLevel.trim().toUpperCase() === 'GENERAL' ? '一般會員' : 
                  memberProfile.MemberLevel.trim().toUpperCase() === 'VIP' ? 'VIP 會員' : 
                  memberProfile.MemberLevel.trim().toUpperCase() === 'VVIP' ? 'VVIP 會員' : 
                  memberProfile.MemberLevel
                }</div>
              </div>
            </div>

            {/* 快捷操作按鈕 */}
            <div className="flex gap-3 mt-1">
              <button onClick={() => {
                  if (lineUserId) {
                      setIsMemberLoading(true);
                      memberApi.getOrders(apiUrl, { userId: lineUserId }).then(res => {
                          if (res && res.success) setOrders(res.orders || []);
                          setIsMemberLoading(false);
                      }).catch(err => setIsMemberLoading(false));
                  }
                  setStep("orders");
                }} className="flex-1 py-3 bg-[var(--bg-tertiary)] hover:bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl flex flex-col items-center justify-center gap-2 transition-colors">
                <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center"><RotateCcw size={20}/></div>
                <span className="text-xs font-bold text-[var(--text-primary)]">再訂一次</span>
              </button>
              <button onClick={() => {
                  if (lineUserId) {
                      setIsMemberLoading(true);
                      memberApi.getOrders(apiUrl, { userId: lineUserId }).then(res => {
                          if (res && res.success) setOrders(res.orders || []);
                          setIsMemberLoading(false);
                      }).catch(err => setIsMemberLoading(false));
                  }
                  setStep("orders");
                }} className="flex-1 py-3 bg-[var(--bg-tertiary)] hover:bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl flex flex-col items-center justify-center gap-2 transition-colors">
                <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center"><History size={20}/></div>
                <span className="text-xs font-bold text-[var(--text-primary)]">查看訂單</span>
              </button>
              <button className="flex-1 py-3 bg-[var(--bg-tertiary)] hover:bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl flex flex-col items-center justify-center gap-2 transition-colors relative overflow-hidden">
                <div className="absolute top-0 right-0 w-full h-full bg-gradient-to-tr from-transparent to-rose-500/10 pointer-events-none"></div>
                <div className="absolute top-0 right-0 bg-rose-500 text-white text-[8px] font-bold px-1.5 py-0.5 rounded-bl">
                  開發中
                </div>
                <div className="w-10 h-10 rounded-full bg-rose-50 text-rose-600 border border-rose-100 flex items-center justify-center"><Package size={20}/></div>
                <span className="text-xs font-bold text-[var(--text-primary)]">最新優惠</span>
              </button>
            </div>
          </div>
        </div>
        {renderBottomNav()}
      </div>
    );
  }

  if (step === "orders") {
    return (
      <div className="max-w-md mx-auto flex flex-col h-[100dvh] relative overflow-hidden bg-[var(--bg-primary)]">
        <div className="h-[60px] px-4 flex items-center bg-[var(--bg-secondary)] border-b border-[var(--border-primary)] shadow-sm">
          <h2 className="font-bold text-lg">我的訂單</h2>
        </div>
        <div className="flex-1 overflow-y-auto pb-6 pt-4" style={{ WebkitOverflowScrolling: "touch" }}>
          <div className="px-3 flex flex-col gap-3">
            {isMemberLoading ? (
              <div className="py-10 flex flex-col items-center justify-center text-[var(--text-tertiary)]">
                <RefreshCw size={24} className="animate-spin mb-2" />
                <span className="text-sm">載入中...</span>
              </div>
            ) : orders.length === 0 ? (
              <div className="py-10 text-center text-[var(--text-tertiary)] bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-primary)]">
                <Package size={32} className="mx-auto mb-2 opacity-50" />
                沒有訂單紀錄
              </div>
            ) : (
              orders.map(o => (
                <div key={o.OrderId} className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl overflow-hidden shadow-sm">
                  <div className="px-4 py-3 border-b border-[var(--border-primary)] flex justify-between items-center bg-[var(--bg-tertiary)]">
                    <span className="text-sm font-medium text-[var(--text-secondary)]">{o.OrderId}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                      o.Status === 'CONFIRMED' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
                    }`}>{o.Status}</span>
                  </div>
                  <div className="p-4 flex flex-col gap-2 text-sm text-[var(--text-secondary)]">
                    <div className="flex gap-2"><Clock size={16} className="mt-0.5 opacity-70 flex-shrink-0"/> <span>{new Date(o.CreatedAt).toLocaleString()}</span></div>
                    {o.ExpectedDeliveryDate && (
                      <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1 rounded-lg border border-emerald-200 dark:border-emerald-800/60">
                        <Calendar size={16} className="flex-shrink-0"/>
                        <span>預計出貨/配送日：{o.ExpectedDeliveryDate}</span>
                      </div>
                    )}
                    <div className="flex gap-2"><MapPin size={16} className="mt-0.5 opacity-70 flex-shrink-0"/> <span className="line-clamp-2">{o.DeliveryAddress}</span></div>
                    <div className="flex gap-2"><CreditCard size={16} className="mt-0.5 opacity-70 flex-shrink-0"/> <span>{o.PaymentMethod} ({o.PaymentStatus || '未付款'})</span></div>
                    {o.Note && <div className="flex gap-2"><FileText size={16} className="mt-0.5 opacity-70 flex-shrink-0"/> <span>{o.Note}</span></div>}
                    
                    <div className="mt-2 pt-2 border-t border-[var(--border-primary)]">
                      <div className="font-bold text-[var(--text-primary)] mb-2 flex justify-between">
                        <span>{o.recipients && o.recipients.length > 0 ? "訂單總明細" : "訂單內容"}</span>
                        <span className="text-blue-600 font-mono font-bold">Total: ${o.TotalAmount}</span>
                      </div>
                      <div className="flex flex-col gap-1">
                        {o.items?.map((item, i) => (
                          <div key={i} className="text-xs flex justify-between text-[var(--text-secondary)]">
                            <span className="truncate flex-1">{item.ProductName} {item.Remark ? `(${item.Remark})` : ''}</span>
                            <span className="flex-shrink-0 ml-2 font-mono">x {item.Qty}</span>
                          </div>
                        ))}
                        {Number(o.ShippingFee) > 0 && (
                          <div className="text-xs flex justify-between text-[var(--text-secondary)] mt-1.5 pt-1.5 border-t border-dashed border-[var(--border-primary)]">
                            <span>運費</span>
                            <span className="font-mono font-semibold">+${o.ShippingFee}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {o.recipients && o.recipients.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-dashed border-[var(--border-primary)]">
                        <div className="font-bold text-[var(--text-primary)] text-xs mb-2">
                          👥 團員訂購明細
                        </div>
                        <div className="space-y-2">
                          {o.recipients.map((r, ri) => {
                            const rTotal = (r.items || []).reduce((sum, item) => sum + (item.subtotal != null && Number(item.subtotal) > 0 ? Number(item.subtotal) : (Number(item.price) * Number(item.qty))), 0);
                            return (
                              <div key={ri} className="bg-[var(--bg-tertiary)] p-2.5 rounded-xl border border-[var(--border-primary)]/50">
                                <div className="font-bold text-xs text-[var(--text-primary)] mb-1.5 flex justify-between items-center">
                                  <span>👤 {r.recipientName}</span>
                                  <span className="text-blue-600 font-mono font-bold">${rTotal}</span>
                                </div>
                                <div className="space-y-1 pl-3.5 border-l-2 border-slate-200 dark:border-slate-700">
                                  {(r.items || []).map((item, ii) => {
                                    const itemSub = item.subtotal != null && Number(item.subtotal) > 0 ? Number(item.subtotal) : (Number(item.price) * Number(item.qty));
                                    const pNameDisplay = item.productName + (item.remark && !String(item.productName || '').includes(item.remark) ? ` (${item.remark})` : '');
                                    return (
                                      <div key={ii} className="flex justify-between text-[11px] text-[var(--text-secondary)]">
                                        <span className="truncate flex-1 pr-2">{pNameDisplay}</span>
                                        <span className="flex-shrink-0 font-mono">x {item.qty} (${itemSub})</span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="p-3 border-t border-[var(--border-primary)] bg-[var(--bg-tertiary)]">
                    <button 
                      onClick={async () => {
                        setIsMemberLoading(true);
                        try {
                          const res = await memberApi.reorder(apiUrl, { orderId: o.OrderId, userId: lineUserId });
                          if (res && res.success) {
                            const newCart = {};
                            const newFlavorSelections = {};
                            
                            // 雙重保險：優先使用 res.items 重組購物車與口味選擇，防止後端 cart 缺漏或大小寫對不上
                            if (Array.isArray(res.items) && res.items.length > 0) {
                              res.items.forEach(item => {
                                const pid = item.ProductId || item.productId;
                                if (!pid) return;
                                
                                const qty = Number(item.Qty || item.qty || 1);
                                newCart[pid] = (newCart[pid] || 0) + qty;
                                
                                // 解析 Remark 內的口味備註，例如 "【口味備註：原味x2, 巧克力x1】"
                                const remarkStr = item.Remark || item.remark || '';
                                if (remarkStr) {
                                  const cleanRemark = remarkStr.replace(/【口味備註：(.*?)】/, '$1');
                                  const parts = cleanRemark.split(/[,，\s+]/);
                                  const flavorMap = {};
                                  
                                  parts.forEach(part => {
                                    // 匹配 "規格x數量" (如 "原味x2", "(巧克力)x1")
                                    const match = part.trim().match(/^\(?([^\s*x:：)]+)\)?\s*[*xX:：]\s*(\d+)$/);
                                    if (match) {
                                      const flavor = match[1];
                                      const fQty = Number(match[2]);
                                      if (flavor && fQty > 0) {
                                        flavorMap[flavor] = (flavorMap[flavor] || 0) + fQty;
                                      }
                                    }
                                  });
                                  
                                  if (Object.keys(flavorMap).length > 0) {
                                    newFlavorSelections[pid] = {
                                      ...(newFlavorSelections[pid] || {}),
                                      ...flavorMap
                                    };
                                  }
                                }
                              });
                            }
                            
                            const finalCart = Object.keys(newCart).length > 0 ? newCart : (res.cart || {});
                            setCart(finalCart);
                            setFlavorSelections(newFlavorSelections);
                            
                            if (o.recipients && o.recipients.length > 0) {
                              const nextGroupCart = {};
                              const nextGroupFlavors = {};
                              o.recipients.forEach(r => {
                                if (!r.recipientName) return;
                                nextGroupCart[r.recipientName] = {};
                                (r.items || []).forEach(ri => {
                                  const pid = ri.productId || ri.ProductId;
                                  if (!pid) return;
                                  nextGroupCart[r.recipientName][pid] = Number(ri.qty || ri.Qty || 0);
                                  const remStr = ri.remark || ri.Remark || '';
                                  if (remStr) {
                                    const cleanRemark = remStr.replace(/【口味備註：(.*?)】/, '$1');
                                    const parts = cleanRemark.split(/[,，\s+]/);
                                    const flavorMap = {};
                                    parts.forEach(part => {
                                      const match = part.trim().match(/^\(?([^\s*x:：)]+)\)?\s*[*xX:：]\s*(\d+)$/);
                                      if (match) {
                                        const flavor = match[1];
                                        const fQty = Number(match[2]);
                                        if (flavor && fQty > 0) {
                                          flavorMap[flavor] = (flavorMap[flavor] || 0) + fQty;
                                        }
                                      }
                                    });
                                    if (Object.keys(flavorMap).length > 0) {
                                      if (!nextGroupFlavors[r.recipientName]) nextGroupFlavors[r.recipientName] = {};
                                      nextGroupFlavors[r.recipientName][pid] = flavorMap;
                                    }
                                  }
                                });
                              });
                              setGroupCart(nextGroupCart);
                              setGroupFlavorSelections(nextGroupFlavors);
                              setIsGroupOrder(true);
                            }

                            if (res.delivery) {
                              setSelectedBuilding(res.delivery.community || "");
                              setDetailAddress(res.delivery.floorRoom || "");
                            }
                            if (res.payment) setPaymentMethod(res.payment.method || "");
                            if (res.remark) setNote(res.remark.note || "");
                            
                            setIsReorder(true);
                            setStep("confirm");
                          } else {
                            alert("讀取訂單失敗");
                          }
                        } catch (err) {
                          alert("網路連線錯誤");
                        } finally {
                          setIsMemberLoading(false);
                        }
                      }}
                      className="w-full py-2 flex items-center justify-center gap-2 rounded-lg font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors"
                    >
                      <RotateCcw size={16} /> 再訂一次
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
        {renderBottomNav()}
      </div>
    );
  }

  if (step === "member") {
    return (
      <div className="max-w-md mx-auto flex flex-col h-[100dvh] relative overflow-hidden bg-[var(--bg-primary)]">
        <div className="h-[60px] px-4 flex items-center bg-[var(--bg-secondary)] border-b border-[var(--border-primary)] shadow-sm">
          <h2 className="font-bold text-lg">會員中心</h2>
        </div>
        <div className="flex-1 overflow-y-auto pb-6" style={{ WebkitOverflowScrolling: "touch" }}>
          {/* Profile & Greeting Section */}
          <div className="bg-[var(--bg-secondary)] px-6 pt-6 pb-6 mb-2 border-b border-[var(--border-primary)] flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-[var(--text-primary)] flex items-center gap-2">
                  👋 {memberProfile?.DisplayName || customerName || "會員您好"}
                </div>
                <div className="text-sm text-[var(--text-secondary)] mt-1">歡迎回來！</div>
              </div>
              <div className="w-14 h-14 rounded-full overflow-hidden bg-gray-200 border-2 border-white shadow flex-shrink-0">
                {linePictureUrl ? (
                  <img src={linePictureUrl} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-400">
                    <User size={28} />
                  </div>
                )}
              </div>
            </div>

            {/* 配送日小卡 */}
            <div className="mt-1 bg-blue-50 border border-blue-100 rounded-xl p-4 flex justify-between items-center relative overflow-hidden">
              <div>
                <div className="text-xs text-blue-600 font-bold mb-1 flex items-center gap-1.5">
                  今天配送日
                  <span className="text-[9px] bg-blue-100 text-blue-700 px-1 py-0.5 rounded font-bold scale-90">開發中</span>
                </div>
                <div className="text-lg font-bold text-[var(--text-primary)]">6/28</div>
                <div className="text-xs text-[var(--text-secondary)]">下午15:00~17:00</div>
              </div>
              <Package size={32} className="text-blue-200" />
            </div>

            {/* 奶包金 & 會員卡 */}
            <div className="flex gap-3 mt-1">
              <div className="flex-1 bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-100 rounded-xl p-4 relative overflow-hidden">
                <div className="text-xs text-amber-700 font-bold flex items-center justify-between mb-1">
                  <span className="flex items-center gap-1"><Banknote size={14}/> 奶包金餘額</span>
                  <span className="text-[9px] bg-amber-100 text-amber-800 px-1 py-0.5 rounded font-bold scale-90">開發中</span>
                </div>
                <div className="text-2xl font-black text-amber-600">${memberProfile?.WalletBalance || 0}</div>
              </div>
              <div className="flex-1 bg-gradient-to-br from-gray-50 to-slate-50 border border-gray-200 rounded-xl p-4 flex flex-col justify-between">
                <div className="text-xs text-gray-500 font-bold flex items-center gap-1"><CheckCircle size={14}/> 會員等級</div>
                <div className="text-base font-bold text-[var(--text-primary)] mt-1">{
                  !memberProfile?.MemberLevel || memberProfile.MemberLevel.trim().toUpperCase() === 'GENERAL' ? '一般會員' : 
                  memberProfile.MemberLevel.trim().toUpperCase() === 'VIP' ? 'VIP 會員' : 
                  memberProfile.MemberLevel.trim().toUpperCase() === 'VVIP' ? 'VVIP 會員' : 
                  memberProfile.MemberLevel
                }</div>
              </div>
            </div>

            {/* 快捷操作按鈕 */}
            <div className="flex gap-3 mt-1">
              <button onClick={() => setStep("shop")} className="flex-1 py-3 bg-[var(--bg-tertiary)] hover:bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl flex flex-col items-center justify-center gap-2 transition-colors">
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600"><RotateCcw size={20}/></div>
                <span className="text-xs font-bold text-[var(--text-primary)]">再訂一次</span>
              </button>
              <button onClick={() => setStep("orders")} className="flex-1 py-3 bg-[var(--bg-tertiary)] hover:bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl flex flex-col items-center justify-center gap-2 transition-colors">
                <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600"><History size={20}/></div>
                <span className="text-xs font-bold text-[var(--text-primary)]">查看訂單</span>
              </button>
              <button className="flex-1 py-3 bg-[var(--bg-tertiary)] hover:bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl flex flex-col items-center justify-center gap-2 transition-colors relative overflow-hidden">
                <div className="absolute top-0 right-0 w-full h-full bg-gradient-to-tr from-transparent to-rose-500/10 pointer-events-none"></div>
                <div className="absolute top-0 right-0 bg-rose-500 text-white text-[8px] font-bold px-1.5 py-0.5 rounded-bl">
                  開發中
                </div>
                <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center text-rose-600"><Package size={20}/></div>
                <span className="text-xs font-bold text-[var(--text-primary)]">最新優惠</span>
              </button>
            </div>
          </div>
        </div>
        {renderBottomNav()}
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto flex flex-col h-[100dvh] relative overflow-hidden bg-[var(--bg-primary)]">
      {/* 頂部固定導覽列 */}

      <div 
        className="flex-shrink-0 flex flex-col z-10 bg-[var(--bg-secondary)] border-b border-[var(--border-primary)] shadow-sm"
        style={{ touchAction: "pan-x" }}
      >
        {/* Header */}
        <div className="h-[60px] px-3 flex justify-between items-center">
          <div className="flex-1 flex justify-start items-center gap-3">
            <MilkZeroWasteLogo />
            {isGeneralUser ? (
              <button
                onClick={() => setShowAreaModal(true)}
                className={`text-xs font-bold px-2.5 py-1.5 rounded-xl border flex items-center gap-1.5 transition-all active:scale-95 duration-100 ${
                  selectedCommunityId
                    ? "bg-emerald-50 text-emerald-600 border-emerald-200"
                    : "bg-blue-600 text-white border-blue-700 animate-pulse shadow shadow-blue-500/20"
                }`}
              >
                <span>📍</span>
                <span>
                  {(() => {
                    if (selectedCommunityId && allCommunities.length > 0) {
                      const match = allCommunities.find(c => c.CommunityId === selectedCommunityId);
                      if (match) {
                        return match.CommunityName.replace("台南市", "").replace("高雄市", "");
                      }
                    }
                    return "選擇配送地區";
                  })()}
                </span>
              </button>
            ) : (
              sourceGroup && (
                <span className="text-xs bg-blue-50 text-blue-600 font-bold px-2 py-0.5 rounded-lg border border-blue-100">
                  {displayGroupName}
                </span>
              )
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => {
                const nextExpanded = !isSearchExpanded;
                setIsSearchExpanded(nextExpanded);
                if (!nextExpanded) {
                  setSearchQuery("");
                }
              }}
              className={`p-1.5 rounded-lg transition-colors duration-100 ${
                isSearchExpanded
                  ? "bg-blue-50 text-blue-600 dark:bg-blue-950/40"
                  : "bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
            </button>
            <button
              onClick={() => loadAllData()}
              className="p-1.5 rounded-lg bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        {/* 團購限時防呆 Banner 提示 */}
        {gbStatus.message && (
          <div className={`px-4 py-2 text-xs font-bold flex flex-col items-center justify-center border-t border-[var(--border-primary)] ${
              gbStatus.status === 'upcoming'
                ? 'bg-amber-500/10 text-amber-600 border-amber-500/20'
                : gbStatus.status === 'ended'
                  ? 'bg-rose-500/10 text-rose-600 border-rose-500/20'
                  : 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
            }`}>
            {gbStatus.message.includes(' (') ? (
              <>
                <div className="flex items-center justify-center gap-1">
                  <span>{gbStatus.message.split(' (')[0]}</span>
                </div>
                <div className="text-[10px] opacity-90 mt-0.5 font-normal tracking-wide">
                  ({gbStatus.message.split(' (')[1].replace(')', '')})
                </div>
              </>
            ) : (
              <div className="text-center">{gbStatus.message}</div>
            )}
          </div>
        )}

        {/* 團購代訂控制區 */}
        <div className="px-4 py-2.5 bg-[var(--bg-secondary)] border-t border-[var(--border-primary)] flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-extrabold text-[var(--text-primary)]">👥 團購代訂模式</span>
            </div>
            <button
              onClick={() => {
                const nextVal = !isGroupOrder;
                setIsGroupOrder(nextVal);
                if (nextVal && commonRecipients.length > 0 && !activeRecipient) {
                  setActiveRecipient(commonRecipients[0]);
                }
              }}
              className={`px-3 py-1 rounded-full text-xs font-bold transition-all border ${
                isGroupOrder
                  ? "bg-blue-600 text-white border-transparent"
                  : "bg-transparent border-[var(--border-primary)] text-[var(--text-secondary)]"
              }`}
            >
              {isGroupOrder ? "已啟用" : "啟用代訂"}
            </button>
          </div>

          {isGroupOrder && (
            <div className="flex flex-col gap-2 mt-1">
              <div className="flex items-center gap-2">
                <span className="text-xs text-[var(--text-secondary)] whitespace-nowrap font-medium">當前團員:</span>
                <div className="flex-1 relative">
                  <select
                    value={activeRecipient}
                    onChange={(e) => setActiveRecipient(e.target.value)}
                    className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded-lg pl-2.5 pr-8 py-1.5 text-xs font-bold text-[var(--text-primary)] focus:outline-none appearance-none"
                  >
                    {commonRecipients.map((name) => {
                      const qty = Object.values(groupCart[name] || {}).reduce((a, b) => a + b, 0);
                      return (
                        <option key={name} value={name}>
                          👤 {name} {qty > 0 ? `(已選購 ${qty} 件)` : "(未購)"}
                        </option>
                      );
                    })}
                  </select>
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--text-secondary)]">
                    <ChevronDown size={14} />
                  </div>
                </div>
                <button
                  onClick={() => setShowAddRecipientModal(true)}
                  className="px-2 py-1.5 bg-blue-50 text-blue-600 text-xs font-bold rounded-lg border border-blue-100 whitespace-nowrap"
                >
                  ➕ 新增團員
                </button>
              </div>

              {/* 常用成員快速切換 Tab 區 */}
              {commonRecipients.length > 0 && (
                <div className="flex items-center gap-1.5 overflow-x-auto py-1 scrollbar-none" style={{ WebkitOverflowScrolling: "touch" }}>
                  {commonRecipients.map((name) => {
                    const qty = Object.values(groupCart[name] || {}).reduce((a, b) => a + b, 0);
                    const isActive = activeRecipient === name;
                    return (
                      <div
                        key={name}
                        className={`flex items-center gap-1 flex-shrink-0 px-2.5 py-1 rounded-lg text-xs font-bold border transition-all ${
                          isActive
                            ? "bg-blue-50 text-blue-600 border-blue-300"
                            : "bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border-[var(--border-primary)]"
                        }`}
                      >
                        <button
                          onClick={() => setActiveRecipient(name)}
                          className="flex items-center gap-1.5 focus:outline-none"
                        >
                          <span>{name}</span>
                          {qty > 0 && <span className="px-1.5 bg-blue-600 text-white rounded-full text-[9px] font-bold">{qty}</span>}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmModal({
                              show: true,
                              message: `確認刪除成員「${name}」？`,
                              confirmText: "確定",
                              cancelText: "取消",
                              onConfirm: () => {
                                const updated = commonRecipients.filter(x => x !== name);
                                setCommonRecipients(updated);
                                localStorage.setItem("mlw_common_recipients", JSON.stringify(updated));
                                
                                setGroupCart(prev => {
                                  const next = { ...prev };
                                  delete next[name];
                                  return next;
                                });

                                if (activeRecipient === name) {
                                  setActiveRecipient(updated.length > 0 ? updated[0] : "");
                                }
                              },
                              onCancel: null
                            });
                          }}
                          className="text-slate-400 hover:text-red-500 ml-1.5 select-none font-sans font-bold flex items-center justify-center w-3 h-3 hover:bg-red-100 rounded-full"
                          style={{ fontSize: "11px" }}
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 展開式搜尋欄位 */}
        <div 
          className={`overflow-hidden transition-all duration-300 ease-in-out ${
            isSearchExpanded 
              ? "max-h-[60px] opacity-100 py-2 border-t border-[var(--border-primary)]" 
              : "max-h-0 opacity-0 py-0 border-t-0"
          } px-4 bg-[var(--bg-secondary)]`}
        >
          <div className="relative flex items-center">
            <input
              ref={searchInputRef}
              type="text"
              placeholder="搜尋商品名稱..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-8 py-2 text-xs font-semibold rounded-xl border border-[var(--border-primary)] bg-[var(--bg-tertiary)] text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all duration-150"
            />
            <div className="absolute left-3 text-[var(--text-tertiary)] flex items-center pointer-events-none">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
            </div>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 p-1 rounded-full text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-all"
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* 分類 Tab 列 */}
        {!loading && categories.length > 1 && (
          <div className="relative">
            <div
              ref={tabBarRef}
              className="h-12 px-3 border-t border-[var(--border-primary)] flex items-center gap-1.5 overflow-x-auto relative scrollbar-none"
              style={{
                WebkitOverflowScrolling: "touch",
                scrollbarWidth: "none",
                msOverflowStyle: "none",
              }}
            >
              {categories.map((cat) => (
                <button
                  key={cat}
                  data-cat={cat}
                  onClick={() => handleCategoryChange(cat)}
                  className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-sm font-semibold transition-all duration-200 whitespace-nowrap border ${activeCategory === cat
                      ? "bg-[var(--text-primary)] text-[var(--bg-primary)] border-transparent shadow-sm"
                      : "bg-transparent border-[var(--border-primary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    }`}
                >
                  {cat}
                </button>
              ))}
            </div>
            <div className="absolute right-0 top-[1px] bottom-0 w-8 bg-gradient-to-l from-[var(--bg-secondary)] to-transparent pointer-events-none z-10" />
          </div>
        )}
      </div>

      {/* 主內容區 */}
      {loading ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-[var(--text-secondary)]">
          <RefreshCw className="animate-spin text-blue-500" size={32} />
          <span>商品載入中...</span>
        </div>
      ) : (
        <>
          {/* 商品列表 */}
          <div
            ref={listRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto pb-28 relative overscroll-contain"
          >
            {products.length === 0 ? (
              <div className="text-center py-16 text-[var(--text-secondary)]">
                目前沒有商品
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="text-center py-16 text-[var(--text-secondary)]">
                找不到符合「{searchQuery}」的商品
              </div>
            ) : (
              groupedProducts.map(({ cat, items }) => (
                <div
                  key={cat}
                  ref={(el) => {
                    sectionRefs.current[cat] = el;
                  }}
                  data-category={cat}
                >
                  <div className="flex items-center gap-3 px-4 pt-5 pb-2.5">
                    <span className="text-base font-extrabold text-[var(--text-primary)] whitespace-nowrap">
                      {cat}
                    </span>
                    <div className="flex-1 h-px bg-[var(--border-primary)]" />
                  </div>
                  <div className="px-4 space-y-2.5">
                    {items.map((product) => {
                      const qty = isGroupOrder ? (groupCart[activeRecipient]?.[product.id] || 0) : (cart[product.id] || 0);
                      const itemInCart = cartItems.find(i => i.id === product.id);
                      const freeQty = itemInCart ? itemInCart.freeQty : 0;
                      return (
                        <div
                          key={product.id}
                          className={`flex bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-2xl overflow-hidden shadow-[0_3px_10px_rgba(0,0,0,0.04)],0,0,0.2)] transition-all duration-150 ${animatingProductId === product.id ? "scale-95" : "scale-100"}`}
                        >
                          <div
                            className="w-[100px] flex-shrink-0 bg-[var(--bg-tertiary)]"
                            style={{ minHeight: 100 }}
                          >
                            {product.imageUrl ? (
                              <img
                                src={product.imageUrl}
                                alt={product.name}
                                className="w-full h-full object-cover"
                                style={{ minHeight: 100 }}
                                onError={(e) => {
                                  e.target.style.display = "none";
                                  e.target.parentNode.classList.add(
                                    "flex",
                                    "items-center",
                                    "justify-center",
                                  );
                                }}
                              />
                            ) : (
                              <div
                                className="w-full h-full flex items-center justify-center"
                                style={{ minHeight: 100 }}
                              >
                                <Package
                                  className="text-[var(--text-tertiary)]"
                                  size={28}
                                />
                              </div>
                            )}
                          </div>

                          <div className="flex-1 p-3 flex flex-col justify-between min-w-0">
                            <div>
                              <div className="flex flex-wrap items-center gap-1.5">
                                <h3 className="font-extrabold text-[18px] text-[var(--text-primary)] leading-snug">
                                  {product.name}
                                </h3>
                                {product.isBundle && (
                                  <span className="text-[10px] text-amber-800 bg-amber-500/10 border border-amber-200/30 px-1 py-0.5 rounded font-bold shrink-0">
                                    捆裝 {product.bundleSize}入
                                  </span>
                                )}
                                {(() => {
                                  // 1. 優先使用綁定的團購促銷活動 (product.promotion)
                                  const groupPromo = product.promotion;
                                  if (groupPromo && groupPromo.isActive !== false) {
                                    if (groupPromo.promoType === 'BUY_X_GET_Y') {
                                      let tierText = '';
                                      if (Array.isArray(groupPromo.tiers) && groupPromo.tiers.length > 0) {
                                        tierText = groupPromo.tiers.map(t => `買 ${t.buyQty} 送 ${t.freeQty}`).join(' 🔥 ');
                                      } else if (groupPromo.buyQty > 0 && groupPromo.freeQty > 0) {
                                        tierText = `買 ${groupPromo.buyQty} 送 ${groupPromo.freeQty}`;
                                      }
                                      if (tierText) {
                                        return (
                                          <span className="text-[10px] text-emerald-800 bg-emerald-500/10 border border-emerald-200/30 px-1.5 py-0.5 rounded font-bold shrink-0">
                                            🔥 {tierText}
                                          </span>
                                        );
                                      }
                                    } else if (groupPromo.promoType === 'BUNDLE_PRICE') {
                                      return (
                                        <span className="text-[10px] text-purple-800 bg-purple-500/10 border border-purple-200/30 px-1.5 py-0.5 rounded font-bold shrink-0">
                                          🎉 任選 {groupPromo.buyQty} 件 ${groupPromo.bundlePrice}
                                        </span>
                                      );
                                    }
                                  }

                                  // 2. 次之使用 product.promotions 陣列
                                  if (Array.isArray(product.promotions) && product.promotions.length > 0) {
                                    return product.promotions.map((promo, idx) => {
                                      let text = '';
                                      if (Array.isArray(promo.tiers) && promo.tiers.length > 0) {
                                        text = promo.tiers.map(t => `買 ${t.buyQty} 送 ${t.freeQty}`).join(' 🔥 ');
                                      } else if (promo.buyX > 0 && promo.getY > 0) {
                                        text = `買 ${promo.buyX} 送 ${promo.getY}`;
                                      }
                                      if (!text) return null;
                                      return (
                                        <span key={idx} className="text-[10px] text-emerald-800 bg-emerald-500/10 border border-emerald-200/30 px-1.5 py-0.5 rounded font-bold shrink-0">
                                          🔥 {text}
                                        </span>
                                      );
                                    });
                                  }

                                  // 3. 舊版單一商品欄位 (product.buy_x)
                                  if (product.buy_x > 0 && product.get_y > 0) {
                                    return (
                                      <span className="text-[10px] text-emerald-800 bg-emerald-500/10 border border-emerald-200/30 px-1.5 py-0.5 rounded font-bold shrink-0">
                                        🔥 買 {product.buy_x} 送 {product.get_y}
                                      </span>
                                    );
                                  }

                                  return null;
                                })()}
                              </div>
                              {product.expiryDate && (
                                <span className="inline-block text-[10px] text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded mt-1">
                                  有效: {product.expiryDate}
                                </span>
                              )}
                            </div>
                            <div className="flex flex-col mt-1.5">
                              <div className="flex justify-between items-center">
                                <div className="flex flex-col">
                                  <span className="text-sm font-bold text-blue-600 font-mono flex items-center gap-1.5">
                                    <span>
                                      $
                                      {product.single_price || product.price}
                                    </span>
                                    {qty > 0 && freeQty > 0 && (
                                      <span className="text-[10px] text-emerald-600 font-bold bg-emerald-50 border border-emerald-100 px-1 py-0.5 rounded leading-none flex items-center">
                                        贈{freeQty},共{qty + freeQty}件
                                      </span>
                                    )}
                                  </span>
                                  {product.has_volume_pricing &&
                                    product.volume_pricing_settings && (
                                      <span className="text-[10px] text-red-500 font-bold leading-none mt-0.5">
                                        任選{" "}
                                        {
                                          product.volume_pricing_settings
                                            .target_quantity
                                        }{" "}
                                        入 $
                                        {
                                          product.volume_pricing_settings
                                            .package_price
                                        }
                                      </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-0.5">
                                  {qty > 0 && (
                                    <>
                                      <button
                                        onClick={() =>
                                          handleProductAction(product, false)
                                        }
                                        className="w-7 h-7 flex items-center justify-center rounded-lg border border-[var(--border-primary)] bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-all duration-100 active:scale-90"
                                      >
                                        <Minus size={13} />
                                      </button>
                                      {product.has_flavor_attributes ? (
                                        <span className="w-7 text-center font-bold font-mono text-sm">
                                          {qty}
                                        </span>
                                      ) : (
                                        <input
                                          type="number"
                                          inputMode="numeric"
                                          pattern="[0-9]*"
                                          min="0"
                                          max="99"
                                          value={qty}
                                          onChange={(e) => handleSetQty(product.id, e.target.value)}
                                          onBlur={(e) => {
                                            if (e.target.value === "" || isNaN(parseInt(e.target.value, 10))) {
                                              handleSetQty(product.id, 0);
                                            }
                                          }}
                                          onFocus={(e) => e.target.select()}
                                          className="w-7 text-center font-bold font-mono text-sm bg-transparent border-0 p-0 focus:ring-0 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                        />
                                      )}
                                    </>
                                  )}
                                  <button
                                    onClick={() =>
                                      handleProductAction(product, true)
                                    }
                                    className={`w-7 h-7 flex items-center justify-center rounded-lg shadow-sm transition-all duration-100 active:scale-90 ${qty > 0
                                        ? "bg-slate-700 text-white hover:bg-slate-800"
                                        : "bg-blue-500 text-white hover:bg-blue-600"
                                      }`}
                                  >
                                    <Plus size={13} />
                                  </button>
                                </div>
                              </div>

                              {qty > 0 && product.has_flavor_attributes && (
                                <div
                                  className="text-[10px] text-blue-600 font-medium mt-1.5 select-none cursor-pointer"
                                  onClick={() =>
                                    handleProductAction(product, true)
                                  }
                                >
                                  {getFlavorRemark(
                                    product.id,
                                    flavorSelections,
                                    isGroupOrder ? groupFlavorSelections : null,
                                    isGroupOrder
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
            <div className="h-4" />
          </div>

          {/* 浮動購物車 */}
          {totalQty > 0 && (
            <div
              className="absolute bottom-[60px] left-0 right-0 bg-[var(--bg-secondary)]/95 backdrop-blur-sm border-t border-[var(--border-primary)] shadow-2xl flex flex-col"
              style={{ touchAction: "none" }}
            >
              {/* 免運進度小車車 (僅散客且有設定免運規則時顯示) */}
              {isGeneralUser && (
                <div className="w-full px-4 pt-3 pb-1 border-b border-[var(--border-primary)]/40 select-none">
                  {(() => {
                    let activeComm = null;
                    if (selectedCommunityId && allCommunities.length > 0) {
                      activeComm = allCommunities.find(c => c.CommunityId === selectedCommunityId);
                    }

                    if (!activeComm) {
                      return (
                        <div 
                          onClick={() => setShowAreaModal(true)}
                          className="flex justify-between items-center text-xs font-semibold text-blue-600 cursor-pointer hover:underline py-0.5 animate-pulse"
                        >
                          <span className="flex items-center gap-1.5">
                            <span>🚚</span>
                            <span>請先點擊設定送貨地區以計算免運</span>
                          </span>
                          <span className="text-[10px] bg-blue-100 px-1.5 py-0.5 rounded font-bold">點我設定</span>
                        </div>
                      );
                    }

                    const freeMin = Number(activeComm.FreeShippingMin) || 0;
                    const fee = Number(activeComm.ShippingFee) || 0;
                    
                    // 如果運費是 0 或者沒有免運門檻 (預設免運)
                    if (fee === 0 || activeComm.DefaultFreeShipping) {
                      return (
                        <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 py-0.5">
                          <span>🎉</span>
                          <span>此地區外送一律免運費！</span>
                        </div>
                      );
                    }

                    const isFree = cartTotal >= freeMin;
                    const gap = Math.max(0, freeMin - cartTotal);
                    const progress = Math.min(100, Math.round((cartTotal / freeMin) * 100));

                    return (
                      <div className="space-y-1.5">
                        <div className="flex justify-between items-center text-xs font-bold">
                          {isFree ? (
                            <span className="text-emerald-600 flex items-center gap-1">🎉 已達成免運門檻！已享免運</span>
                          ) : (
                            <span className="text-[var(--text-secondary)]">
                              🚚 再買 <strong className="text-orange-500 font-extrabold font-mono">${gap}</strong> 即可免運
                            </span>
                          )}
                          <span className="text-[10px] text-slate-400 font-mono font-normal">門檻 ${freeMin}</span>
                        </div>
                        {/* 軌道與小車車 */}
                        <div className="relative w-full h-1.5 bg-slate-100 rounded-full border border-slate-200/60 overflow-visible">
                          {/* 進度填充 */}
                          <div 
                            className={`h-full rounded-full transition-all duration-300 ${isFree ? 'bg-emerald-500' : 'bg-gradient-to-r from-orange-400 to-amber-500'}`}
                            style={{ width: `${progress}%` }}
                          />
                          {/* 小車車圖示 */}
                          <span 
                            className="absolute -top-[7px] text-base transition-all duration-300 pointer-events-none select-none"
                            style={{ 
                              left: `calc(${progress}% - 9px)`, 
                              transform: 'scaleX(-1)' // 將車車開的方向轉為朝右
                            }}
                          >
                            🚚
                          </span>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* 🎁 促銷達標不打斷提示 Banner */}
              {Object.entries(availableGiftCredits).map(([pId, credit]) => {
                if (credit.earned <= 0) return null;
                const isComplete = credit.selected >= credit.earned;
                return (
                  <div key={pId} className="w-full px-4 py-2 bg-amber-500/10 border-b border-amber-200/50 flex justify-between items-center text-xs font-bold text-amber-800 select-none">
                    <span className="flex items-center gap-1 truncate mr-2">
                      <span className="text-sm">🎉</span>
                      <span className="truncate">已符合「{credit.promoName || '促銷優惠'}」，請選擇 {credit.earned} 件贈品</span>
                    </span>
                    <button
                      onClick={() => setShowGiftModal(pId)}
                      className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] font-extrabold flex items-center gap-1 transition-all ${isComplete ? 'bg-emerald-600 text-white' : 'bg-amber-500 text-white animate-pulse'}`}
                    >
                      🎁 {isComplete ? `贈品已選 (${credit.selected}/${credit.earned})` : `選擇贈品 (${credit.selected}/${credit.earned})`}
                    </button>
                  </div>
                );
              })}

              {/* 購物車核心按鈕列 */}
              <div className="px-4 py-3 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="relative bg-blue-100 text-blue-600 p-2.5 rounded-full">
                    <ShoppingCart size={20} />
                    <span className="absolute -top-1 -right-1.5 bg-red-500 text-white text-[10px] w-5 h-5 rounded-full flex items-center justify-center font-bold border-2 border-white">
                      {totalQty}
                    </span>
                  </div>
                  <div>
                    <div className="text-[10px] text-[var(--text-secondary)] font-semibold">
                      已選 {totalQty} 件
                    </div>
                    <div className="text-2xl font-black text-blue-600 font-mono">
                      ${cartTotal}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setStep("confirm")}
                  className="btn-primary px-5 py-2.5 rounded-xl font-bold flex items-center gap-1 shadow-md shadow-blue-500/20"
                >
                  前往結帳 <ArrowRight size={16} />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* 🎁 贈品選擇 Bottom Sheet 抽屜選單 */}
      {renderGiftModal()}

      {/* 多規格口味選擇彈窗 */}
      {flavorModalProduct && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-[var(--bg-secondary)] rounded-2xl border border-[var(--border-primary)] shadow-2xl w-full max-w-sm flex flex-col overflow-hidden glass-panel">
            <div className="p-4 border-b border-[var(--border-primary)] flex justify-between items-center bg-[var(--bg-tertiary)]">
              <div>
                <h3 className="text-base font-bold text-[var(--text-primary)]">
                  {flavorModalProduct.name}
                </h3>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                  請選擇規格口味與數量
                </p>
              </div>
              <button
                onClick={() => setFlavorModalProduct(null)}
                className="text-[var(--text-secondary)] hover:text-red-500 p-1.5 rounded-lg hover:bg-[var(--bg-hover)]"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>

            <div className="p-4 space-y-4 max-h-[50vh] overflow-y-auto">
              {flavorModalProduct.flavor_choices.map((flavor) => {
                const count = tempFlavorQty[flavor] || 0;
                return (
                  <div
                    key={flavor}
                    className="flex justify-between items-center py-1"
                  >
                    <span className="font-semibold text-sm text-[var(--text-primary)]">
                      {flavor}
                    </span>
                    <div className="flex items-center gap-1 bg-[var(--bg-primary)] rounded-lg p-0.5 border border-[var(--border-primary)] shadow-sm">
                      <button
                        type="button"
                        onClick={() => handleUpdateTempFlavorQty(flavor, -1)}
                        className="w-7 h-7 flex items-center justify-center rounded-md text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-all duration-100 active:scale-90"
                      >
                        <Minus size={12} />
                      </button>
                      <input
                        type="number"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        min="0"
                        max="99"
                        value={count}
                        onChange={(e) => handleSetTempFlavorQty(flavor, e.target.value)}
                        onBlur={(e) => {
                          if (e.target.value === "" || isNaN(parseInt(e.target.value, 10))) {
                            handleSetTempFlavorQty(flavor, 0);
                          }
                        }}
                        onFocus={(e) => e.target.select()}
                        className="w-8 text-center font-bold font-mono text-sm bg-transparent border-0 p-0 focus:ring-0 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <button
                        type="button"
                        onClick={() => handleUpdateTempFlavorQty(flavor, 1)}
                        className="w-7 h-7 flex items-center justify-center rounded-md text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-all duration-100 active:scale-90"
                      >
                        <Plus size={12} />
                      </button>
                    </div>
                  </div>
                );
              })}

              {/* 總計與優惠提示 */}
              <div className="bg-[var(--bg-tertiary)] p-3 rounded-xl border border-[var(--border-primary)] text-xs space-y-1 mt-2">
                <div className="flex justify-between font-bold text-[var(--text-primary)]">
                  <span>本次已選總數：</span>
                  <span className="font-mono text-sm text-blue-600">
                    {Object.values(tempFlavorQty).reduce((a, b) => a + b, 0)} 件
                  </span>
                </div>
                {flavorModalProduct.has_volume_pricing &&
                  flavorModalProduct.volume_pricing_settings && (
                    <div className="text-red-500 font-semibold mt-1">
                      ※ 本商品享組合價：任選{" "}
                      {
                        flavorModalProduct.volume_pricing_settings
                          .target_quantity
                      }{" "}
                      入 $
                      {flavorModalProduct.volume_pricing_settings.package_price}
                      （可口味混搭）
                    </div>
                  )}
              </div>
            </div>

            <div className="p-4 border-t border-[var(--border-primary)] flex gap-3 bg-[var(--bg-tertiary)]">
              <button
                onClick={() => setFlavorModalProduct(null)}
                className="btn-secondary py-2.5 rounded-xl text-sm font-bold flex-1 transition-all duration-100 active:scale-95"
              >
                取消
              </button>
              <button
                onClick={handleConfirmFlavors}
                className="btn-primary py-2.5 rounded-xl text-sm font-bold flex-1 shadow-md shadow-blue-500/20 transition-all duration-100 active:scale-95"
              >
                確認加入
              </button>
            </div>
          </div>
        </div>
      )}
      {renderBottomNav()}
      
      {/* 自訂美化彈窗提示 */}
      {alertModal.show && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[var(--bg-secondary)] w-full max-w-[280px] rounded-2xl p-5 shadow-2xl border border-[var(--border-primary)] flex flex-col items-center gap-4 text-center animate-in zoom-in-95 duration-200">
            <p className="text-sm font-bold text-[var(--text-primary)] leading-relaxed whitespace-pre-line">
              {alertModal.message}
            </p>
            <button
              onClick={() => {
                const cb = alertModal.callback;
                setAlertModal({ show: false, message: '', callback: null });
                if (cb) cb();
              }}
              className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-bold transition-all shadow-md shadow-blue-500/15"
            >
              確定
            </button>
          </div>
        </div>
      )}

      {/* 確認 Dialog（有取消/確定雙按鈕）*/}
      {confirmModal.show && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[var(--bg-secondary)] w-full max-w-[300px] rounded-2xl p-5 shadow-2xl border border-[var(--border-primary)] flex flex-col gap-4 animate-in zoom-in-95 duration-200">
            <p className="text-sm font-bold text-[var(--text-primary)] leading-relaxed whitespace-pre-line text-center">
              {confirmModal.message}
            </p>
            <div className="flex gap-2.5">
              <button
                onClick={() => {
                  setConfirmModal({ show: false, message: '', onConfirm: null, onCancel: null, confirmText: '確定', cancelText: '取消' });
                  if (confirmModal.onCancel) confirmModal.onCancel();
                }}
                className="flex-1 py-2.5 px-4 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-tertiary)] text-[var(--text-primary)] text-xs font-bold transition-all active:scale-95"
              >
                {confirmModal.cancelText || '取消'}
              </button>
              <button
                onClick={() => {
                  const fn = confirmModal.onConfirm;
                  setConfirmModal({ show: false, message: '', onConfirm: null, onCancel: null, confirmText: '確定', cancelText: '取消' });
                  if (fn) fn();
                }}
                className="flex-1 py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-bold transition-all shadow-md shadow-blue-500/15"
              >
                {confirmModal.confirmText || '確定'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 👥 新增團員彈窗 (AddRecipientModal) */}
      {showAddRecipientModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[var(--bg-secondary)] w-full max-w-[320px] rounded-2xl p-5 shadow-2xl border border-[var(--border-primary)] flex flex-col gap-4 animate-in zoom-in-95 duration-200">
            <div className="text-center">
              <h3 className="text-base font-extrabold text-[var(--text-primary)] flex items-center justify-center gap-1.5">
                👥 新增團購成員
              </h3>
              <p className="text-xs text-[var(--text-secondary)] mt-1.5">
                請輸入成員姓名，以便進行代訂與對帳。
              </p>
            </div>

            <input
              type="text"
              placeholder="輸入成員姓名 (例如: 王小明)"
              value={newRecipientName}
              onChange={(e) => setNewRecipientName(e.target.value)}
              className="w-full p-2.5 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] text-sm font-bold focus:outline-none text-[var(--text-primary)]"
            />

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowAddRecipientModal(false);
                  setNewRecipientName("");
                }}
                className="flex-1 py-2.5 px-4 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-tertiary)] text-[var(--text-primary)] text-xs font-bold transition-all active:scale-95"
              >
                取消
              </button>
              <button
                onClick={() => {
                  const name = newRecipientName.trim();
                  if (!name) {
                    alert("姓名不得為空");
                    return;
                  }
                  if (commonRecipients.includes(name)) {
                    alert("該成員已存在於名單中");
                    return;
                  }
                  const updatedRecipients = [...commonRecipients, name];
                  setCommonRecipients(updatedRecipients);
                  localStorage.setItem("mlw_common_recipients", JSON.stringify(updatedRecipients));
                  setActiveRecipient(name);
                  setShowAddRecipientModal(false);
                  setNewRecipientName("");
                }}
                className="flex-1 py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-bold transition-all shadow-md shadow-blue-500/15"
              >
                確定新增
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 📍 外送地區設定彈窗 (AreaModal) */}
      {showAreaModal && isGeneralUser && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[var(--bg-secondary)] w-full max-w-[320px] rounded-2xl p-5 shadow-2xl border border-[var(--border-primary)] flex flex-col gap-4 animate-in zoom-in-95 duration-200">
            <div className="text-center">
              <h3 className="text-base font-extrabold text-[var(--text-primary)] flex items-center justify-center gap-1.5">
                <MapPin size={18} className="text-blue-500" />
                設定送貨地區
              </h3>
              <p className="text-xs text-[var(--text-secondary)] mt-1.5">
                請先選擇您所在的縣市區域以計算運費
              </p>
            </div>

            {/* 兩段式選單 */}
            <div className="space-y-3 py-1">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase">選擇縣市</label>
                <select
                  className="input-field w-full p-2.5 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] text-sm font-bold"
                  value={selectedCity}
                  onChange={(e) => {
                    setSelectedCity(e.target.value);
                    setSelectedCommunityId(""); // 重置區域
                    setDetailAddress(""); // 重置地址
                  }}
                >
                  <option value="">-- 請選擇縣市 --</option>
                  <option value="台南市">台南市</option>
                  <option value="高雄市">高雄市</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase">配送區域</label>
                <select
                  className="input-field w-full p-2.5 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] text-sm font-bold"
                  value={selectedCommunityId}
                  onChange={(e) => {
                    const commId = e.target.value;
                    setSelectedCommunityId(commId);
                    
                    // 智慧前綴地址預填
                    if (commId) {
                      const target = allCommunities.find(c => c.CommunityId === commId);
                      if (target) {
                        const prefix = target.CommunityName;
                        const currentAddr = detailAddress || "";
                        if (!currentAddr.trim()) {
                          setDetailAddress(prefix);
                        } else {
                          let replaced = false;
                          for (const c of allCommunities) {
                            if (currentAddr.startsWith(c.CommunityName)) {
                              const rest = currentAddr.substring(c.CommunityName.length);
                              setDetailAddress(prefix + rest);
                              replaced = true;
                              break;
                            }
                          }
                          if (!replaced) {
                            setDetailAddress(prefix + currentAddr);
                          }
                        }
                      }
                    }
                  }}
                  disabled={!selectedCity}
                >
                  <option value="">{selectedCity ? "-- 請選擇外送區域 --" : "-- 請先選取縣市 --"}</option>
                  {selectedCity && allCommunities
                    .filter(c => !["線上下單", "一般散客", "一般用戶", "上線下單", "一般常態", "常態零售"].includes(c.CommunityName))
                    .filter(c => c.CommunityName.startsWith(selectedCity))
                    .map((c) => {
                      let shortName = c.CommunityName.replace("台南市", "").replace("高雄市", "");
                      const fee = Number(c.ShippingFee) || 0;
                      const min = Number(c.FreeShippingMin) || 0;
                      const ruleText = fee > 0 ? `$${fee}/滿$${min}免運` : '免運';
                      return (
                        <option key={c.CommunityId} value={c.CommunityId}>
                          {shortName} ({ruleText})
                        </option>
                      );
                    })}
                </select>
              </div>
            </div>

            {/* 運費規則預覽 */}
            {selectedCommunityId && (() => {
              const match = allCommunities.find(c => c.CommunityId === selectedCommunityId);
              if (match) {
                const fee = Number(match.ShippingFee) || 0;
                const min = Number(match.FreeShippingMin) || 0;
                return (
                  <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-xs text-blue-700 font-semibold space-y-1">
                    <p className="flex items-center gap-1">
                      <span>🚚</span>
                      <span>此區運費：<strong>${fee} 元</strong></span>
                    </p>
                    {min > 0 ? (
                      <p className="flex items-center gap-1 text-[11px] text-slate-500 font-medium">
                        <span>💡</span>
                        <span>單筆商品滿 <strong>${min} 元</strong> 即可享免運！</span>
                      </p>
                    ) : (
                      <p className="flex items-center gap-1 text-[11px] text-slate-500 font-medium">
                        <span>💡</span>
                        <span>此區無免運優惠門檻。</span>
                      </p>
                    )}
                  </div>
                );
              }
              return null;
            })()}

            {/* 送出與關閉 */}
            <div className="flex gap-2.5 pt-1.5">
              {/* 如果已經有選過的區域，才允許按取消關閉 */}
              {selectedCommunityId && (
                <button
                  type="button"
                  onClick={() => setShowAreaModal(false)}
                  className="btn-secondary py-2.5 rounded-xl text-xs font-bold flex-1 transition-all active:scale-95"
                >
                  取消
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  if (!selectedCity || !selectedCommunityId) {
                    alert("請確實選擇縣市與配送區域！");
                    return;
                  }
                  setShowAreaModal(false);
                }}
                disabled={!selectedCity || !selectedCommunityId}
                className="btn-primary py-2.5 rounded-xl text-xs font-bold flex-1 shadow-md shadow-blue-500/20 transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
              >
                確認送出
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
