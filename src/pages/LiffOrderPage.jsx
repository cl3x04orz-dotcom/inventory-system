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
  CreditCard,
  Banknote,
  Smartphone,
  Clock,
  History,
  RotateCcw,
  Home,
  Wallet,
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
  const [confirmModal, setConfirmModal] = useState({ show: false, message: '', onConfirm: null, onCancel: null });

  // ── 商品 state ───────────────────────────────────────────────
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState({});
  const [activeCategory, setActiveCategory] = useState("");
  const [sourceGroup, setSourceGroup] = useState("");
  const [animatingProductId, setAnimatingProductId] = useState(null);
  const tabBarRef = useRef(null);
  const listRef = useRef(null);
  const sectionRefs = useRef({});
  const isManualScrollRef = useRef(false);
  const manualScrollTimeoutRef = useRef(null);
  // 記錄這次表單 Session 進入時的原始配送區域（用來比較所有區域變更警語）
  const originalCommunityIdRef = useRef("");

  // ── 口味規格 state ─────────────────────────────────────────────
  const [flavorSelections, setFlavorSelections] = useState({}); // { [productId]: { [flavor]: qty } }
  const [flavorModalProduct, setFlavorModalProduct] = useState(null);
  const [tempFlavorQty, setTempFlavorQty] = useState({});

  // ── 步驟機制 ─────────────────────────────────────────────────
  // 'shop' | 'form' | 'confirm' | 'success'
  const [step, setStep] = useState("shop");

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
  const [selectedBuilding, setSelectedBuilding] = useState("一般用戶");
  const [otherBuildingText, setOtherBuildingText] = useState("");
  const [detailAddress, setDetailAddress] = useState("");
  const [companyName, setCompanyName] = useState("");

  // ── 新增：網址大樓參數、大樓時段設定與下單資訊 ───────────────
  const [urlBuilding, setUrlBuilding] = useState("");
  const [buildingSettings, setBuildingSettings] = useState([]);
  const [tick, setTick] = useState(0);
  const [successOrderTotal, setSuccessOrderTotal] = useState(0);
  const [isNightOrder, setIsNightOrder] = useState(false);
  const [isReorder, setIsReorder] = useState(false);
  const [isMsgSentAuto, setIsMsgSentAuto] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setTick((t) => t + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // 會員中心狀態
  const [memberProfile, setMemberProfile] = useState(null);
  const [orders, setOrders] = useState([]);
  const [isMemberLoading, setIsMemberLoading] = useState(false);
  const [lineUserId, setLineUserId] = useState("");
  const [linePictureUrl, setLinePictureUrl] = useState("");

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

  // ── 新增：V2 架構狀態 ─────────────────────────────────────────
  const [currentCommunity, setCurrentCommunity] = useState(null);
  const [allCommunities, setAllCommunities] = useState([]);
  const [selectedCity, setSelectedCity] = useState("");
  const [selectedCommunityId, setSelectedCommunityId] = useState("");
  const [showAreaModal, setShowAreaModal] = useState(false);
  const [activeCampaign, setActiveCampaign] = useState(null);
  const [nextOpenTime, setNextOpenTime] = useState(null);

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
      const buildingParam = (typeof overrideBuilding === 'string' ? overrideBuilding : '') || getP("building");

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
            
            if (mRes.member.Community) {
              setSelectedBuilding(mRes.member.Community);
              savedObj.building = mRes.member.Community;
            } else if (savedObj.building) setSelectedBuilding(savedObj.building);
            
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

  const isGeneralUser = 
    selectedBuilding === "一般用戶" || 
    selectedBuilding === "一般散客" || 
    selectedBuilding === "上線下單" || 
    selectedBuilding === "線上下單" || 
    selectedBuilding === "一般常態" ||
    selectedBuilding === "常態零售";

  // ── 分類邏輯 ─────────────────────────────────────────────────
  const categories = useMemo(() => {
    const cats = products.map((p) => p.category?.trim() || "其他");
    const unique = [...new Set(cats)];
    const without = unique.filter((c) => c !== "其他");
    return [...without, ...(unique.includes("其他") ? ["其他"] : [])];
  }, [products]);

  const groupedProducts = useMemo(() => {
    const map = {};
    products.forEach((p) => {
      const cat = p.category?.trim() || "其他";
      if (!map[cat]) map[cat] = [];
      map[cat].push(p);
    });
    return categories
      .map((cat) => ({ cat, items: map[cat] || [] }))
      .filter((g) => g.items.length > 0);
  }, [products, categories]);

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
    setCart((prev) => {
      const qty = Math.max(0, (prev[pid] || 0) + delta);
      const next = { ...prev };
      if (qty === 0) delete next[pid];
      else next[pid] = qty;
      return next;
    });
  };

  const handleProductAction = (product, isPlus) => {
    const statusInfo = getGroupBuyStatus();
    if (statusInfo.status === 'upcoming' || statusInfo.status === 'ended') {
      alert(statusInfo.message);
      return;
    }
    if (product.has_flavor_attributes) {
      setFlavorModalProduct(product);
      const currentFlavors = flavorSelections[product.id] || {};
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
      const val = Math.max(0, (prev[flavor] || 0) + delta);
      return { ...prev, [flavor]: val };
    });
  };

  const getFlavorRemark = (productId, pFlavorSelections) => {
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
    const total = Object.values(tempFlavorQty).reduce((a, b) => a + b, 0);

    setAnimatingProductId(pid);
    setTimeout(() => {
      setAnimatingProductId((prev) => (prev === pid ? null : prev));
    }, 150);

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
        next[pid] = tempFlavorQty;
      }
      return next;
    });

    setFlavorModalProduct(null);
  };

  const totalQty = Object.values(cart).reduce((s, q) => s + q, 0);

  const cartTotal = useMemo(
    () =>
      Object.entries(cart).reduce((s, [pid, qty]) => {
        const p = products.find((x) => x.id === pid);
        if (!p) return s;
        if (p.has_volume_pricing && p.volume_pricing_settings) {
          const targetQty = Number(p.volume_pricing_settings.target_quantity);
          const packagePrice = Number(p.volume_pricing_settings.package_price);
          const singlePrice = Number(p.single_price) || Number(p.price);

          const groupCount = Math.floor(qty / targetQty);
          const remainderCount = qty % targetQty;
          return s + groupCount * packagePrice + remainderCount * singlePrice;
        } else {
          const singlePrice = Number(p.single_price) || Number(p.price);
          return s + singlePrice * qty;
        }
      }, 0),
    [cart, products],
  );

  // ── 運費計算 ──────────────────────────────────────────────────
  const shippingFee = useMemo(() => {
    // 只有一般散客群才需要計算運費，其餘社區大樓一律免運 (0元)
    if (!isGeneralUser) return 0;

    // 優先尋找使用者手動選定的社區
    let activeComm = currentCommunity;
    if (selectedCommunityId && allCommunities.length > 0) {
      const match = allCommunities.find(c => c.CommunityId === selectedCommunityId);
      if (match) {
        activeComm = match;
      }
    }

    if (!activeComm) return 0;
    if (activeComm.DefaultFreeShipping) return 0;
    const min = Number(activeComm.FreeShippingMin) || 0;
    const fee = Number(activeComm.ShippingFee) || 0;
    if (fee === 0) return 0; // 未設定運費視為免運
    return cartTotal >= min ? 0 : fee;
  }, [cartTotal, currentCommunity, isGeneralUser, selectedCommunityId, allCommunities]);

  const orderTotal = cartTotal + shippingFee;

  const cartItems = useMemo(
    () =>
      Object.entries(cart).map(([pid, qty]) => {
        const p = products.find((x) => x.id === pid);
        let subtotal = 0;
        let displayPrice = p?.price ?? 0;

        if (p) {
          const singlePrice = Number(p.single_price) || Number(p.price);
          if (p.has_volume_pricing && p.volume_pricing_settings) {
            const targetQty = Number(p.volume_pricing_settings.target_quantity);
            const packagePrice = Number(
              p.volume_pricing_settings.package_price,
            );

            const groupCount = Math.floor(qty / targetQty);
            const remainderCount = qty % targetQty;
            subtotal = groupCount * packagePrice + remainderCount * singlePrice;
          } else {
            subtotal = singlePrice * qty;
          }
          displayPrice = qty > 0 ? subtotal / qty : singlePrice;
        }

        const remark = p?.has_flavor_attributes
          ? getFlavorRemark(pid, flavorSelections)
          : "";
        return {
          id: pid,
          name: p?.name ?? pid,
          price: displayPrice,
          qty,
          remark,
          subtotal,
          imageUrl: p?.imageUrl ?? "",
        };
      }),
    [cart, products, flavorSelections],
  );

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
    setStep("confirm");
  };

  // ── 送出訂單 ─────────────────────────────────────────────────
  const handleSubmitOrder = async () => {
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
          items: cartItems.map((i) => ({
            productId: i.id,
            productName: i.name,
            unitPrice: i.price,
            qty: i.qty,
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
    return (
      <div className="max-w-md mx-auto flex flex-col h-[100dvh] relative overflow-hidden bg-[var(--bg-primary)]">
        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5 pb-10">
          <div className="flex flex-col items-center text-center pt-6 pb-2">
            <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mb-4 text-emerald-600">
              <CheckCircle size={44} />
            </div>
            <h2 className="text-2xl font-bold text-[var(--text-primary)]">
              感謝您的購買！
            </h2>
            <p className="text-sm text-[var(--text-secondary)] mt-1">
              我們已收到您的訂單，請耐心等候。
            </p>
          </div>

          {/* 訂單資訊 */}
          <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-2xl divide-y divide-[var(--border-primary)] text-sm font-mono">
            {[
              { label: "訂單編號", value: orderId, bold: true },
              { label: "完成時間", value: orderTime },
              { label: "付款方式", value: paymentMethod },
            ].map(({ label, value, bold }) => (
              <div key={label} className="flex justify-between px-4 py-3">
                <span className="text-[var(--text-secondary)]">{label}</span>
                <span
                  className={`text-[var(--text-primary)] ${bold ? "font-bold" : ""}`}
                >
                  {value}
                </span>
              </div>
            ))}
          </div>



          {/* 付款說明 */}
          {paymentMethod === "現金" && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
              <p className="font-bold mb-1">現金注意事項</p>
              <p>採現金支付，請自備零錢，現場不找零。</p>
            </div>
          )}
          {paymentMethod === "轉帳" && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
              <p className="font-bold text-sm text-blue-800">
                請轉帳至以下帳戶
              </p>
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between text-[var(--text-primary)]">
                  <span className="text-[var(--text-secondary)]">銀行</span>
                  <span className="font-semibold">{BANK_INFO.bank}</span>
                </div>
                <div className="flex justify-between items-center text-[var(--text-primary)]">
                  <span className="text-[var(--text-secondary)]">帳號</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold tracking-wider">
                      {BANK_INFO.account}
                    </span>
                    <button
                      onClick={() => handleCopy(BANK_INFO.account)}
                      className="text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded-lg font-semibold"
                    >
                      {copied ? "已複製！" : "複製"}
                    </button>
                  </div>
                </div>
                <div className="flex justify-between text-[var(--text-primary)]">
                  <span className="text-[var(--text-secondary)]">戶名</span>
                  <span className="font-semibold">{BANK_INFO.name}</span>
                </div>
              </div>
            </div>
          )}


          {/* 聯繫 LINE */}
          <p className="text-center text-xs text-[var(--text-secondary)]">
            若訂單有任何疑問，歡迎透過 LINE 與我們聯繫。
          </p>
          <div className="w-full flex flex-col gap-3">
            {/* 1. 如果選擇 LINE Pay，一律提供付款按鈕 */}
            {paymentMethod === "LINE Pay" && (
              <div className="w-full">
                <button
                  onClick={() => window.open(LINE_PAY_URL, "_blank")}
                  className="w-full py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 text-white shadow-md shadow-emerald-500/20 hover:opacity-95 active:scale-95 transition-all flex-shrink-0"
                  style={{ background: "#06C755" }}
                >
                  前往官方 LINE 付款 ➔
                </button>
              </div>
            )}

            {/* 2. 一般散客：顯示明細發送狀態（已自動發送或引導手動發送） */}
            {(isGeneralUser || !selectedBuilding || selectedBuilding === "其它") && (
              <div className="w-full">
                {isMsgSentAuto ? (
                  <div className="w-full py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 text-emerald-600 bg-emerald-50 border border-emerald-200 text-sm select-none">
                    <CheckCircle size={18} />
                    訂單明細已自動發送給客服
                  </div>
                ) : (
                  <button
                    onClick={() => window.open(getOaMessageUrl(), "_blank")}
                    className="w-full py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 text-white shadow-md shadow-emerald-500/20 hover:opacity-95 active:scale-95 transition-all flex-shrink-0"
                    style={{ background: "#06C755" }}
                  >
                    {/* LINE icon */}
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                      <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63h2.386c.349 0 .63.285.63.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63.349 0 .631.285.631.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.281.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
                    </svg>
                    傳送訂單明細至官方 LINE
                  </button>
                )}
              </div>
            )}

            {/* 3. 大樓用戶且為現金/轉帳：顯示一般的 LINE 客服按鈕 */}
            {!(isGeneralUser || !selectedBuilding || selectedBuilding === "其它") && paymentMethod !== "LINE Pay" && (
              <div className="w-full">
                <button
                  onClick={() => window.open(LINE_CONTACT_URL, "_blank")}
                  className="w-full py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 text-white flex-shrink-0 active:scale-95 transition-all"
                  style={{ background: "#06C755" }}
                >
                  {/* LINE icon */}
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                    <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63h2.386c.349 0 .63.285.63.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63.349 0 .631.285.631.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.281.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
                  </svg>
                  前往官方 LINE 客服
                </button>
              </div>
            )}
          </div>
          <div className="w-full">
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
              }}
              className="w-full py-3 rounded-xl font-bold btn-secondary flex-shrink-0"
            >
              繼續購物
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════
  // 訂單確認頁
  // ════════════════════════════════════════════════════════════
  if (step === "confirm") {
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
                    <span>單價 ${item.price}</span>
                    <span className="font-bold bg-[var(--bg-tertiary)] px-2 py-0.5 rounded border border-[var(--border-primary)]">
                      × {item.qty}
                    </span>
                  </div>
                  {item.remark && (
                    <div className="text-xs text-blue-600 font-medium mt-1">
                      {item.remark}
                    </div>
                  )}
                </div>
              </div>
            ))}
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
            onClick={() => setStep("form")}
            className="btn-primary py-3 rounded-xl font-bold flex items-center justify-center gap-1 shadow-md shadow-blue-500/20"
          >
            前往填寫資料 <ArrowRight size={16} />
          </button>
        </div>
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
      selectedBuilding &&
      (selectedBuilding !== "其它" || safeOther.trim());
    
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
            className={`w-full py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${canProceed && !isSubmitting
                ? "btn-primary shadow-md shadow-blue-500/20"
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
            <div className="mt-1 bg-blue-50/80 border border-blue-200 rounded-xl p-4 flex justify-between items-center shadow-sm">
              <div>
                <div className="text-xs text-blue-700 font-bold mb-1">今天配送日</div>
                <div className="text-lg font-black text-blue-900">6/28</div>
                <div className="text-xs text-blue-800/80">下午15:00~17:00</div>
              </div>
              <Package size={32} className="text-blue-500/80" />
            </div>

            {/* 奶包金 & 會員卡 */}
            <div className="flex gap-3 mt-1">
              <div className="flex-1 bg-amber-50/80 border border-amber-200 rounded-xl p-4 shadow-sm">
                <div className="text-xs text-amber-800 font-bold flex items-center gap-1 mb-1"><Banknote size={14}/> 奶包金餘額</div>
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
                    <div className="flex gap-2"><MapPin size={16} className="mt-0.5 opacity-70 flex-shrink-0"/> <span className="line-clamp-2">{o.DeliveryAddress}</span></div>
                    <div className="flex gap-2"><CreditCard size={16} className="mt-0.5 opacity-70 flex-shrink-0"/> <span>{o.PaymentMethod} ({o.PaymentStatus || '未付款'})</span></div>
                    {o.Note && <div className="flex gap-2"><FileText size={16} className="mt-0.5 opacity-70 flex-shrink-0"/> <span>{o.Note}</span></div>}
                    
                    <div className="mt-2 pt-2 border-t border-[var(--border-primary)]">
                      <div className="font-bold text-[var(--text-primary)] mb-2 flex justify-between">
                        <span>訂單內容</span>
                        <span className="text-blue-600">Total: ${o.TotalAmount}</span>
                      </div>
                      <div className="flex flex-col gap-1">
                        {o.items?.map((item, i) => (
                          <div key={i} className="text-xs flex justify-between">
                            <span className="truncate flex-1">{item.ProductName} {item.Remark ? `(${item.Remark})` : ''}</span>
                            <span className="flex-shrink-0 ml-2">x {item.Qty}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="p-3 border-t border-[var(--border-primary)] bg-[var(--bg-tertiary)]">
                    <button 
                      onClick={async () => {
                        setIsMemberLoading(true);
                        try {
                          const res = await memberApi.reorder(apiUrl, { orderId: o.OrderId });
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
            <div className="mt-1 bg-blue-50 border border-blue-100 rounded-xl p-4 flex justify-between items-center">
              <div>
                <div className="text-xs text-blue-600 font-bold mb-1">今天配送日</div>
                <div className="text-lg font-bold text-[var(--text-primary)]">6/28</div>
                <div className="text-xs text-[var(--text-secondary)]">下午15:00~17:00</div>
              </div>
              <Package size={32} className="text-blue-200" />
            </div>

            {/* 奶包金 & 會員卡 */}
            <div className="flex gap-3 mt-1">
              <div className="flex-1 bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-100 rounded-xl p-4">
                <div className="text-xs text-amber-700 font-bold flex items-center gap-1 mb-1"><Banknote size={14}/> 奶包金餘額</div>
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
                  {groupBindings[sourceGroup] || sourceGroup}
                </span>
              )
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
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
                      const qty = cart[product.id] || 0;
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
                              <h3 className="font-extrabold text-[18px] text-[var(--text-primary)] leading-snug">
                                {product.name}
                              </h3>
                              {product.expiryDate && (
                                <span className="inline-block text-[10px] text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded mt-1">
                                  有效: {product.expiryDate}
                                </span>
                              )}
                              {product.isBundle && (
                                <span className="inline-block text-[10px] text-amber-800 bg-amber-500/10 border border-amber-200/30 px-1.5 py-0.5 rounded ml-1 font-bold">
                                  捆裝 {product.bundleSize}入
                                </span>
                              )}
                            </div>
                            <div className="flex flex-col mt-1.5">
                              <div className="flex justify-between items-center">
                                <div className="flex flex-col">
                                  <span className="text-sm font-bold text-blue-600 font-mono">
                                    $
                                    {product.single_price || product.price}
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
                                      <span className="w-7 text-center font-bold font-mono text-sm">
                                        {qty}
                                      </span>
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
                  onClick={handleProceedToForm}
                  className="btn-primary px-5 py-2.5 rounded-xl font-bold flex items-center gap-1 shadow-md shadow-blue-500/20"
                >
                  前往結帳 <ArrowRight size={16} />
                </button>
              </div>
            </div>
          )}
        </>
      )}

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
                      <span className="w-8 text-center font-bold font-mono text-sm">
                        {count}
                      </span>
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

      {/* 📍 外送地區設定彈窗 (AreaModal) */}
      {showAreaModal && (
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
