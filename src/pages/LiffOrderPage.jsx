import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
    ShoppingCart, Plus, Minus, CheckCircle, Package,
    MapPin, Phone, User, FileText, ArrowRight, RefreshCw,
    ChevronLeft, CreditCard, Banknote, Smartphone
} from 'lucide-react';
import { callGAS } from '../utils/api';
import logoImg from '../assets/logo.png';
import logoLiff from '../assets/logo_liff.jpg';

// ── 品牌 Logo 元件 ──────────────────────────────────────────────
const MilkZeroWasteLogo = () => (
    <img 
        src={logoLiff} 
        alt="米立微 Logo" 
        className="h-10 w-auto flex-shrink-0 object-contain" 
        style={{ aspectRatio: '728/197' }}
    />
);

// ── 店家設定（改這裡就好）─────────────────────────────────────
const BANK_INFO = {
    bank: '玉山銀行 (808)',
    account: '0934979271826',
    name: '張庭瑜',
};
const LINE_PAY_URL = 'https://line.me/ti/p/kjGUUdBqLE';
const LINE_CONTACT_URL = 'https://line.me/R/ti/p/@839rpabi';
const LS_KEY = 'mlw_customer'; // LocalStorage key

export default function LiffOrderPage({ user, apiUrl }) {
    // ── 鎖定 body / html 避免 iOS 橡皮筋 & 網址列跳動 ──────────────
    useEffect(() => {
        document.documentElement.classList.add('liff-order-active');
        document.body.classList.add('liff-order-active');
        return () => {
            document.documentElement.classList.remove('liff-order-active');
            document.body.classList.remove('liff-order-active');
        };
    }, []);

    // ── 商品 state ───────────────────────────────────────────────
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [cart, setCart] = useState({});
    const [activeCategory, setActiveCategory] = useState('');
    const [sourceGroup, setSourceGroup] = useState('');
    const [animatingProductId, setAnimatingProductId] = useState(null);
    const tabBarRef = useRef(null);
    const listRef = useRef(null);
    const sectionRefs = useRef({});
    const isManualScrollRef = useRef(false);
    const manualScrollTimeoutRef = useRef(null);

    // ── 口味規格 state ─────────────────────────────────────────────
    const [flavorSelections, setFlavorSelections] = useState({}); // { [productId]: { [flavor]: qty } }
    const [flavorModalProduct, setFlavorModalProduct] = useState(null);
    const [tempFlavorQty, setTempFlavorQty] = useState({});

    // ── 步驟機制 ─────────────────────────────────────────────────
    // 'shop' | 'form' | 'confirm' | 'success'
    const [step, setStep] = useState('shop');

    // ── 表單 state ───────────────────────────────────────────────
    const [customerName, setCustomerName] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');
    const [deliveryAddress, setDeliveryAddress] = useState('');
    const [note, setNote] = useState('');
    const [paymentMethod, setPaymentMethod] = useState('現金');
    const [transferLastFive, setTransferLastFive] = useState('');

    // ── 送出 state ───────────────────────────────────────────────
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [orderId, setOrderId] = useState('');
    const [orderTime, setOrderTime] = useState('');
    const [copied, setCopied] = useState(false);

    // ── 載入商品 ─────────────────────────────────────────────────
    const loadProducts = async () => {
        setLoading(true);
        try {
            const data = await callGAS(apiUrl, 'getProducts', {}, user.token);
            if (Array.isArray(data)) {
                const activeProds = data.filter(p => p.isActive);
                setProducts(activeProds);
                
                // 自動將第一個分類設為 Active
                const cats = activeProds.map(p => p.category?.trim() || '其他');
                const unique = [...new Set(cats)];
                const firstCat = unique.filter(c => c !== '其他')[0] || (unique.includes('其他') ? '其他' : '');
                if (firstCat) {
                    setActiveCategory(firstCat);
                }
            }
        } catch (err) {
            console.error('Failed to load products:', err);
            alert('載入商品失敗: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        setSourceGroup(params.get('grp') || '');
        if (user?.token) loadProducts();
    }, [apiUrl, user?.token]);

    // ── 分類邏輯 ─────────────────────────────────────────────────
    const categories = useMemo(() => {
        const cats = products.map(p => p.category?.trim() || '其他');
        const unique = [...new Set(cats)];
        const without = unique.filter(c => c !== '其他');
        return [...without, ...(unique.includes('其他') ? ['其他'] : [])];
    }, [products]);

    const groupedProducts = useMemo(() => {
        const map = {};
        products.forEach(p => {
            const cat = p.category?.trim() || '其他';
            if (!map[cat]) map[cat] = [];
            map[cat].push(p);
        });
        return categories.map(cat => {
            const sortedItems = [...(map[cat] || [])].sort((a, b) => {
                const aSoldOut = (a.stock !== undefined && a.stock !== null) ? a.stock <= 0 : false;
                const bSoldOut = (b.stock !== undefined && b.stock !== null) ? b.stock <= 0 : false;
                if (aSoldOut && !bSoldOut) return 1;
                if (!aSoldOut && bSoldOut) return -1;
                return 0;
            });
            return { cat, items: sortedItems };
        }).filter(g => g.items.length > 0);
    }, [products, categories]);

    const handleCategoryChange = (cat) => {
        setActiveCategory(cat);

        // 標記為手動點擊滾動，避免滾動監聽自動切換造成震盪
        isManualScrollRef.current = true;
        if (manualScrollTimeoutRef.current) clearTimeout(manualScrollTimeoutRef.current);
        manualScrollTimeoutRef.current = setTimeout(() => {
            isManualScrollRef.current = false;
        }, 800); // 800ms 平滑滾動結束後恢復監聽

        // Tab 捲至中央
        if (tabBarRef.current) {
            const btn = tabBarRef.current.querySelector(`[data-cat="${CSS.escape(cat)}"]`);
            if (btn) {
                const bar = tabBarRef.current;
                bar.scrollTo({ left: btn.offsetLeft - bar.offsetWidth / 2 + btn.offsetWidth / 2, behavior: 'smooth' });
            }
        }
        // 捲至對應分類區塊（使用容器 scrollTo 代替 scrollIntoView，防止瀏覽器抖動與視窗位移）
        const targetEl = sectionRefs.current[cat];
        if (targetEl && listRef.current) {
            listRef.current.scrollTo({
                top: targetEl.offsetTop,
                behavior: 'smooth'
            });
        }
    };

    // ── 滾動監聽 (Scroll Spy) ──────────────────────────────────────────
    useEffect(() => {
        if (loading || products.length === 0 || !listRef.current) return;

        const scrollContainer = listRef.current;

        const observerOptions = {
            root: scrollContainer,
            rootMargin: '-10% 0px -75% 0px', // 只偵測容器頂部下方一小段的區塊
            threshold: 0
        };

        const handleIntersection = (entries) => {
            if (isManualScrollRef.current) return;

            const visibleEntry = entries.find(entry => entry.isIntersecting);
            if (visibleEntry) {
                const cat = visibleEntry.target.getAttribute('data-category');
                if (cat) {
                    setActiveCategory(cat);
                    if (tabBarRef.current) {
                        const btn = tabBarRef.current.querySelector(`[data-cat="${CSS.escape(cat)}"]`);
                        if (btn) {
                            const bar = tabBarRef.current;
                            bar.scrollTo({
                                left: btn.offsetLeft - bar.offsetWidth / 2 + btn.offsetWidth / 2,
                                behavior: 'smooth'
                            });
                        }
                    }
                }
            }
        };

        const observer = new IntersectionObserver(handleIntersection, observerOptions);
        Object.values(sectionRefs.current).forEach(el => {
            if (el) observer.observe(el);
        });

        return () => {
            observer.disconnect();
            if (manualScrollTimeoutRef.current) clearTimeout(manualScrollTimeoutRef.current);
        };
    }, [products, loading]);


    // ── 購物車 ───────────────────────────────────────────────────
    const handleUpdateQty = (pid, delta) => {
        setAnimatingProductId(pid);
        setTimeout(() => {
            setAnimatingProductId(prev => prev === pid ? null : prev);
        }, 150);
        setCart(prev => {
            const qty = Math.max(0, (prev[pid] || 0) + delta);
            const next = { ...prev };
            if (qty === 0) delete next[pid]; else next[pid] = qty;
            return next;
        });
    };

    const handleProductAction = (product, isPlus) => {
        if (product.has_flavor_attributes) {
            setFlavorModalProduct(product);
            const currentFlavors = flavorSelections[product.id] || {};
            const initialTemp = {};
            product.flavor_choices.forEach(f => {
                initialTemp[f] = currentFlavors[f] || 0;
            });
            const currentTotal = Object.values(initialTemp).reduce((a, b) => a + b, 0);
            if (isPlus && currentTotal === 0 && product.flavor_choices.length > 0) {
                initialTemp[product.flavor_choices[0]] = 1;
            }
            setTempFlavorQty(initialTemp);
        } else {
            handleUpdateQty(product.id, isPlus ? 1 : -1);
        }
    };

    const handleUpdateTempFlavorQty = (flavor, delta) => {
        setTempFlavorQty(prev => {
            const val = Math.max(0, (prev[flavor] || 0) + delta);
            return { ...prev, [flavor]: val };
        });
    };

    const getFlavorRemark = (productId, pFlavorSelections) => {
        const selections = pFlavorSelections[productId];
        if (!selections) return '';
        const items = Object.entries(selections)
            .filter(([_, qty]) => qty > 0)
            .map(([flavor, qty]) => `${flavor}x${qty}`);
        if (items.length === 0) return '';
        return `【口味備註：${items.join(', ')}】`;
    };

    const handleConfirmFlavors = () => {
        if (!flavorModalProduct) return;
        const pid = flavorModalProduct.id;
        const total = Object.values(tempFlavorQty).reduce((a, b) => a + b, 0);

        setAnimatingProductId(pid);
        setTimeout(() => {
            setAnimatingProductId(prev => prev === pid ? null : prev);
        }, 150);

        setCart(prev => {
            const next = { ...prev };
            if (total === 0) {
                delete next[pid];
            } else {
                next[pid] = total;
            }
            return next;
        });

        setFlavorSelections(prev => {
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

    const cartTotal = useMemo(() =>
        Object.entries(cart).reduce((s, [pid, qty]) => {
            const p = products.find(x => x.id === pid);
            if (!p) return s;
            if (p.has_volume_pricing && p.volume_pricing_settings) {
                const targetQty = Number(p.volume_pricing_settings.target_quantity);
                const packagePrice = Number(p.volume_pricing_settings.package_price);
                const singlePrice = Number(p.single_price) || Number(p.price);

                const groupCount = Math.floor(qty / targetQty);
                const remainderCount = qty % targetQty;
                return s + (groupCount * packagePrice) + (remainderCount * singlePrice);
            } else {
                const singlePrice = Number(p.single_price) || Number(p.price);
                return s + (singlePrice * qty);
            }
        }, 0),
        [cart, products]);

    const cartItems = useMemo(() =>
        Object.entries(cart).map(([pid, qty]) => {
            const p = products.find(x => x.id === pid);
            let subtotal = 0;
            let displayPrice = p?.price ?? 0;

            if (p) {
                const singlePrice = Number(p.single_price) || Number(p.price);
                if (p.has_volume_pricing && p.volume_pricing_settings) {
                    const targetQty = Number(p.volume_pricing_settings.target_quantity);
                    const packagePrice = Number(p.volume_pricing_settings.package_price);

                    const groupCount = Math.floor(qty / targetQty);
                    const remainderCount = qty % targetQty;
                    subtotal = (groupCount * packagePrice) + (remainderCount * singlePrice);
                } else {
                    subtotal = singlePrice * qty;
                }
                displayPrice = qty > 0 ? (subtotal / qty) : singlePrice;
            }

            const remark = p?.has_flavor_attributes ? getFlavorRemark(pid, flavorSelections) : '';
            return {
                id: pid,
                name: p?.name ?? pid,
                price: displayPrice,
                qty,
                remark,
                subtotal
            };
        }),
        [cart, products, flavorSelections]);

    // ── 進入填寫步驟：從 LocalStorage 自動帶入舊資料 ─────────────
    const handleProceedToForm = () => {
        try {
            const saved = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
            if (saved.name) setCustomerName(saved.name);
            if (saved.phone) setCustomerPhone(saved.phone);
            if (saved.address) setDeliveryAddress(saved.address);
        } catch (_) { }
        setStep('form');
    };

    // ── 送出訂單 ─────────────────────────────────────────────────
    const handleSubmitOrder = async () => {
        setIsSubmitting(true);
        try {
            // 儲存客戶資料到 LocalStorage（下次自動帶入）
            localStorage.setItem(LS_KEY, JSON.stringify({
                name: customerName, phone: customerPhone, address: deliveryAddress
            }));

            const res = await callGAS(apiUrl, 'savePendingOrder', {
                customerName, customerPhone, deliveryAddress, sourceGroup, note,
                paymentMethod, transferLastFive,
                items: cartItems.map(i => ({
                    productId: i.id, productName: i.name, unitPrice: i.price, qty: i.qty, remark: i.remark
                }))
            }, user.token);

            if (res?.error) throw new Error(res.error);

            setOrderId(res.orderId || '');
            setOrderTime(new Date().toLocaleString('zh-TW', { hour12: false }));
            setCart({});

            // LINE Pay：先跳轉 LINE，再顯示感謝頁
            if (paymentMethod === 'LINE Pay') {
                window.open(LINE_PAY_URL, '_blank');
            }
            setStep('success');
        } catch (err) {
            alert('送出訂單失敗: ' + err.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleCopy = (text) => {
        navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

    // ════════════════════════════════════════════════════════════
    // 感謝頁
    // ════════════════════════════════════════════════════════════
    if (step === 'success') {
        return (
            <div className="max-w-md mx-auto p-5 flex flex-col gap-5 pb-10">
                <div className="flex flex-col items-center text-center pt-6 pb-2">
                    <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mb-4 text-emerald-600">
                        <CheckCircle size={44} />
                    </div>
                    <h2 className="text-2xl font-bold text-[var(--text-primary)]">感謝您的購買！</h2>
                    <p className="text-sm text-[var(--text-secondary)] mt-1">我們已收到您的訂單，請耐心等候。</p>
                </div>

                {/* 訂單資訊 */}
                <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-2xl divide-y divide-[var(--border-primary)] text-sm font-mono">
                    {[
                        { label: '訂單編號', value: orderId, bold: true },
                        { label: '完成時間', value: orderTime },
                        { label: '付款方式', value: paymentMethod },
                    ].map(({ label, value, bold }) => (
                        <div key={label} className="flex justify-between px-4 py-3">
                            <span className="text-[var(--text-secondary)]">{label}</span>
                            <span className={`text-[var(--text-primary)] ${bold ? 'font-bold' : ''}`}>{value}</span>
                        </div>
                    ))}
                </div>

                {/* 付款說明 */}
                {paymentMethod === '現金' && (
                    <div className="bg-amber-50 dark:bg-amber-900/15 border border-amber-200 dark:border-amber-700/30 rounded-xl p-4 text-sm text-amber-800 dark:text-amber-300">
                        <p className="font-bold mb-1">現金注意事項</p>
                        <p>採現金支付，請自備零錢，現場不找零。</p>
                    </div>
                )}
                {paymentMethod === '轉帳' && (
                    <div className="bg-blue-50 dark:bg-blue-900/15 border border-blue-200 dark:border-blue-700/30 rounded-xl p-4 space-y-3">
                        <p className="font-bold text-sm text-blue-800 dark:text-blue-300">請轉帳至以下帳戶</p>
                        <div className="space-y-1.5 text-sm">
                            <div className="flex justify-between text-[var(--text-primary)]">
                                <span className="text-[var(--text-secondary)]">銀行</span>
                                <span className="font-semibold">{BANK_INFO.bank}</span>
                            </div>
                            <div className="flex justify-between items-center text-[var(--text-primary)]">
                                <span className="text-[var(--text-secondary)]">帳號</span>
                                <div className="flex items-center gap-2">
                                    <span className="font-mono font-bold tracking-wider">{BANK_INFO.account}</span>
                                    <button
                                        onClick={() => handleCopy(BANK_INFO.account)}
                                        className="text-xs bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded-lg font-semibold"
                                    >
                                        {copied ? '已複製！' : '複製'}
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
                {paymentMethod === 'LINE Pay' && (
                    <div className="bg-emerald-50 dark:bg-emerald-900/15 border border-emerald-200 dark:border-emerald-700/30 rounded-xl p-4 text-sm text-emerald-800 dark:text-emerald-300 space-y-2">
                        <p className="font-bold">LINE 個人轉帳</p>
                        <p>已開啟 LINE 轉帳頁面，完成付款後請告知我們。</p>
                        <button onClick={() => window.open(LINE_PAY_URL, '_blank')} className="text-xs underline underline-offset-2">
                            重新開啟 LINE 轉帳
                        </button>
                    </div>
                )}

                {/* 聯繫 LINE */}
                <p className="text-center text-xs text-[var(--text-secondary)]">若訂單有任何疑問，歡迎透過 LINE 與我們聯繫。</p>
                <button
                    onClick={() => window.open(LINE_CONTACT_URL, '_blank')}
                    className="w-full py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 text-white"
                    style={{ background: '#06C755' }}
                >
                    {/* LINE icon */}
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                        <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63h2.386c.349 0 .63.285.63.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63.349 0 .631.285.631.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.281.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
                    </svg>
                    加入官方 LINE 聯繫
                </button>
                <button
                    onClick={() => {
                        setStep('shop');
                        setCustomerName(''); setCustomerPhone(''); setDeliveryAddress('');
                        setNote(''); setPaymentMethod('現金'); setTransferLastFive('');
                    }}
                    className="w-full py-3 rounded-xl font-bold btn-secondary"
                >
                    繼續購物
                </button>
            </div>
        );
    }

    // ════════════════════════════════════════════════════════════
    // 訂單確認頁
    // ════════════════════════════════════════════════════════════
    if (step === 'confirm') {
        return (
            <div className="max-w-md mx-auto flex flex-col h-[100dvh] bg-[var(--bg-primary)]">
                <div className="p-4 bg-[var(--bg-secondary)] border-b border-[var(--border-primary)] flex items-center gap-3 flex-shrink-0">
                    <button onClick={() => setStep('form')} className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                        <ChevronLeft size={20} />
                    </button>
                    <h2 className="text-lg font-bold text-[var(--text-primary)]">確認訂單明細</h2>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {/* 商品清單 */}
                    <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-2xl overflow-hidden">
                        <div className="px-4 py-2.5 border-b border-[var(--border-primary)] text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">
                            訂購商品
                        </div>
                        {cartItems.map(item => (
                            <div key={item.id} className="flex justify-between items-center px-4 py-2.5 border-b border-[var(--border-primary)] last:border-0 text-sm">
                                <div>
                                    <span className="font-semibold text-[var(--text-primary)]">{item.name}</span>
                                    <span className="text-[var(--text-secondary)] ml-2">× {item.qty}</span>
                                    {item.remark && (
                                        <div className="text-xs text-blue-600 dark:text-blue-400 font-medium mt-0.5">{item.remark}</div>
                                    )}
                                </div>
                                <span className="font-mono font-bold text-[var(--text-primary)]">${item.subtotal}</span>
                            </div>
                        ))}
                        <div className="flex justify-between items-center px-4 py-3 bg-[var(--bg-tertiary)]">
                            <span className="font-bold text-[var(--text-primary)]">總計</span>
                            <span className="font-mono text-xl font-extrabold text-blue-600">${cartTotal}</span>
                        </div>
                    </div>

                    {/* 收件資訊 */}
                    <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-2xl overflow-hidden">
                        <div className="px-4 py-2.5 border-b border-[var(--border-primary)] text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">
                            收件資訊
                        </div>
                        {[
                            { label: '收件人', value: customerName },
                            { label: '電話', value: customerPhone },
                            { label: '地址', value: deliveryAddress || '（未填）' },
                            { label: '備註', value: note || '（無）' },
                        ].map(({ label, value }) => (
                            <div key={label} className="flex gap-3 px-4 py-2.5 border-b border-[var(--border-primary)] last:border-0 text-sm">
                                <span className="text-[var(--text-secondary)] w-14 shrink-0">{label}</span>
                                <span className="text-[var(--text-primary)] font-medium">{value}</span>
                            </div>
                        ))}
                    </div>

                    {/* 付款方式 */}
                    <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-2xl overflow-hidden">
                        <div className="px-4 py-2.5 border-b border-[var(--border-primary)] text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">
                            付款方式
                        </div>
                        <div className="px-4 py-3 space-y-1 text-sm">
                            <div className="font-semibold text-[var(--text-primary)]">{paymentMethod}</div>
                            {paymentMethod === '轉帳' && transferLastFive && (
                                <div className="text-[var(--text-secondary)]">帳戶後 5 碼：<span className="font-mono font-bold text-[var(--text-primary)]">{transferLastFive}</span></div>
                            )}
                            {paymentMethod === '現金' && (
                                <div className="text-xs text-amber-600">請自備零錢，現場不找零</div>
                            )}
                            {paymentMethod === 'LINE Pay' && (
                                <div className="text-xs text-emerald-600">送出後將自動開啟 LINE 轉帳</div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="p-4 bg-[var(--bg-secondary)] border-t border-[var(--border-primary)] grid grid-cols-2 gap-3 flex-shrink-0">
                    <button onClick={() => setStep('form')} className="btn-secondary py-3 rounded-xl font-bold" disabled={isSubmitting}>
                        回去修改
                    </button>
                    <button
                        onClick={handleSubmitOrder}
                        className="btn-primary py-3 rounded-xl font-bold flex items-center justify-center gap-1 shadow-md shadow-blue-500/20"
                        disabled={isSubmitting}
                    >
                        {isSubmitting
                            ? <><RefreshCw className="animate-spin" size={16} /> 送出中...</>
                            : '確定送出'}
                    </button>
                </div>
            </div>
        );
    }

    // ════════════════════════════════════════════════════════════
    // 填寫資料頁
    // ════════════════════════════════════════════════════════════
    if (step === 'form') {
        const canProceed = customerName.trim() && customerPhone.trim() &&
            (paymentMethod !== '轉帳' || transferLastFive.trim().length === 5);

        const paymentOptions = [
            { value: '現金', Icon: Banknote, label: '現金', desc: '自備零錢，現場不找零' },
            { value: '轉帳', Icon: CreditCard, label: '銀行轉帳', desc: `${BANK_INFO.bank} ‧ ${BANK_INFO.name}` },
            { value: 'LINE Pay', Icon: Smartphone, label: 'LINE Pay', desc: '個人 LINE 轉帳付款' },
        ];

        return (
            <div className="max-w-md mx-auto flex flex-col h-[100dvh] bg-[var(--bg-primary)]">
                {/* Header */}
                <div className="p-4 bg-[var(--bg-secondary)] border-b border-[var(--border-primary)] flex items-center gap-3 flex-shrink-0">
                    <button onClick={() => setStep('shop')} className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                        <ChevronLeft size={20} />
                    </button>
                    <div>
                        <h2 className="text-lg font-bold text-[var(--text-primary)]">填寫資料</h2>
                        <p className="text-xs text-[var(--text-secondary)]">{totalQty} 件商品，合計 ${cartTotal}</p>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-6">
                    {/* 收件資訊 */}
                    <div className="space-y-3">
                        <h3 className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">收件資訊</h3>
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-[var(--text-secondary)] flex items-center gap-1">
                                <User size={12} /> 收件人姓名 <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="text"
                                className="input-field w-full p-2.5 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-secondary)]"
                                placeholder="請輸入收件人姓名"
                                value={customerName}
                                onChange={e => setCustomerName(e.target.value)}
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-[var(--text-secondary)] flex items-center gap-1">
                                <Phone size={12} /> 聯絡電話 <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="tel"
                                className="input-field w-full p-2.5 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-secondary)]"
                                placeholder="請輸入手機號碼"
                                value={customerPhone}
                                onChange={e => setCustomerPhone(e.target.value)}
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-[var(--text-secondary)] flex items-center gap-1">
                                <MapPin size={12} /> 送達單位 / 地址 / 戶號
                            </label>
                            <input
                                type="text"
                                className="input-field w-full p-2.5 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-secondary)]"
                                placeholder="例：遠東科技大樓 A棟 4樓 401室"
                                value={deliveryAddress}
                                onChange={e => setDeliveryAddress(e.target.value)}
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-[var(--text-secondary)] flex items-center gap-1">
                                <FileText size={12} /> 備註（理想送達時段）
                            </label>
                            <textarea
                                className="input-field w-full p-2.5 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-secondary)]"
                                rows={2}
                                placeholder="例：希望下午 2:00 ~ 3:30 之間送達"
                                value={note}
                                onChange={e => setNote(e.target.value)}
                            />
                        </div>
                    </div>

                    {/* 付款方式 */}
                    <div className="space-y-3">
                        <h3 className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">付款方式</h3>
                        <div className="space-y-2">
                            {paymentOptions.map(({ value, Icon, label, desc }) => {
                                const active = paymentMethod === value;
                                return (
                                    <label
                                        key={value}
                                        className={`flex items-center gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${active
                                                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/15'
                                                : 'border-[var(--border-primary)] bg-[var(--bg-secondary)] hover:border-blue-300'
                                            }`}
                                    >
                                        <input type="radio" name="payment" value={value} checked={active} onChange={() => setPaymentMethod(value)} className="hidden" />
                                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${active ? 'bg-blue-600 text-white' : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'}`}>
                                            <Icon size={18} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="font-semibold text-sm text-[var(--text-primary)]">{label}</div>
                                            <div className="text-xs text-[var(--text-secondary)] truncate">{desc}</div>
                                        </div>
                                        <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${active ? 'border-blue-500' : 'border-[var(--border-primary)]'}`}>
                                            {active && <div className="w-2 h-2 rounded-full bg-blue-500" />}
                                        </div>
                                    </label>
                                );
                            })}
                        </div>

                        {/* 付款方式展開內容 */}
                        {paymentMethod === '現金' && (
                            <div className="bg-amber-50 dark:bg-amber-900/15 border border-amber-200 dark:border-amber-700/30 rounded-xl px-4 py-3 text-xs text-amber-700 dark:text-amber-300">
                                ※ 採現金支付，請自備零錢，現場不找零。
                            </div>
                        )}

                        {paymentMethod === '轉帳' && (
                            <div className="bg-blue-50 dark:bg-blue-900/15 border border-blue-200 dark:border-blue-700/30 rounded-xl p-4 space-y-3">
                                <div className="text-xs font-bold text-blue-800 dark:text-blue-300">匯款帳號</div>
                                <div className="space-y-1.5 text-xs text-[var(--text-primary)]">
                                    <div className="flex justify-between"><span className="text-[var(--text-secondary)]">銀行</span><span className="font-semibold">{BANK_INFO.bank}</span></div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-[var(--text-secondary)]">帳號</span>
                                        <div className="flex items-center gap-2">
                                            <span className="font-mono font-bold tracking-wider">{BANK_INFO.account}</span>
                                            <button
                                                onClick={() => handleCopy(BANK_INFO.account)}
                                                className="text-[10px] bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded-lg font-semibold"
                                            >
                                                {copied ? '已複製' : '複製'}
                                            </button>
                                        </div>
                                    </div>
                                    <div className="flex justify-between"><span className="text-[var(--text-secondary)]">戶名</span><span className="font-semibold">{BANK_INFO.name}</span></div>
                                </div>
                                <div className="space-y-1.5 pt-1 border-t border-blue-200 dark:border-blue-700/30">
                                    <label className="text-xs font-bold text-blue-800 dark:text-blue-300">
                                        您的帳戶後 5 碼 <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="tel"
                                        maxLength={5}
                                        className="input-field w-full p-3 rounded-xl border border-blue-300 dark:border-blue-600 bg-white dark:bg-blue-900/20 text-center font-mono tracking-[0.5em] text-lg"
                                        placeholder="_ _ _ _ _"
                                        value={transferLastFive}
                                        onChange={e => setTransferLastFive(e.target.value.replace(/\D/g, '').slice(0, 5))}
                                    />
                                </div>
                            </div>
                        )}

                        {paymentMethod === 'LINE Pay' && (
                            <div className="bg-emerald-50 dark:bg-emerald-900/15 border border-emerald-200 dark:border-emerald-700/30 rounded-xl px-4 py-3 text-xs text-emerald-700 dark:text-emerald-300">
                                送出訂單後，系統將自動開啟 LINE，請完成個人轉帳。
                            </div>
                        )}
                    </div>
                </div>

                {/* 下一步 */}
                <div className="p-4 bg-[var(--bg-secondary)] border-t border-[var(--border-primary)] flex-shrink-0">
                    <button
                        onClick={() => { if (canProceed) setStep('confirm'); }}
                        className={`w-full py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${canProceed
                                ? 'btn-primary shadow-md shadow-blue-500/20'
                                : 'bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] cursor-not-allowed'
                            }`}
                    >
                        下一步：確認訂單明細 <ArrowRight size={16} />
                    </button>
                </div>
            </div>
        );
    }

    // 商品列表頁（捲動分類模式）
    return (
        <div className="max-w-md mx-auto flex flex-col h-[100dvh] relative overflow-hidden bg-[var(--bg-primary)]">
            {/* 頂部固定導覽列（結合 Header 與分類標籤以防止任何布局位移） */}
            <div className="flex-shrink-0 flex flex-col z-10 bg-[var(--bg-secondary)] border-b border-[var(--border-primary)] shadow-sm">
                {/* Header */}
                <div className="h-[60px] px-3 flex justify-between items-center">
                    {/* 品牌區塊 - 靠左 */}
                    <div className="flex-1 flex justify-start items-center gap-3">
                        <MilkZeroWasteLogo />
                        {sourceGroup && (
                            <span className="text-xs bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 font-bold px-2 py-0.5 rounded-lg border border-blue-100 dark:border-blue-900/30">
                                {sourceGroup}
                            </span>
                        )}
                    </div>
                    <button onClick={loadProducts} className="p-1.5 rounded-lg bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex-shrink-0">
                        <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>

                {/* 分類 Tab 列 */}
                {!loading && categories.length > 1 && (
                    <div className="relative">
                        <div
                            ref={tabBarRef}
                            className="h-12 px-3 border-t border-[var(--border-primary)] flex items-center gap-1.5 overflow-x-auto relative scrollbar-none"
                            style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                        >
                            {categories.map(cat => (
                                <button
                                    key={cat}
                                    data-cat={cat}
                                    onClick={() => handleCategoryChange(cat)}
                                    className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-sm font-semibold transition-all duration-200 whitespace-nowrap border ${activeCategory === cat
                                            ? 'bg-[var(--text-primary)] text-[var(--bg-primary)] border-transparent shadow-sm'
                                            : 'bg-transparent border-[var(--border-primary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                                        }`}
                                >
                                    {cat}
                                </button>
                            ))}
                        </div>
                        {/* 右側漸層遮罩，暗示可往右滑動 */}
                        <div className="absolute right-0 top-[1px] bottom-0 w-8 bg-gradient-to-l from-[var(--bg-secondary)] to-transparent pointer-events-none z-10" />
                    </div>
                )}
            </div>

            {loading ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-2 text-[var(--text-secondary)]">
                    <RefreshCw className="animate-spin text-blue-500" size={32} />
                    <span>商品載入中...</span>
                </div>
            ) : (
                <>
                    {/* 商品列表（分類區塊捲動）*/}
                    <div ref={listRef} className="flex-1 overflow-y-auto pb-28 relative overscroll-contain">
                        {products.length === 0 ? (
                            <div className="text-center py-16 text-[var(--text-secondary)]">目前沒有商品</div>
                        ) : groupedProducts.map(({ cat, items }) => (
                            <div key={cat} ref={el => { sectionRefs.current[cat] = el; }} data-category={cat}>
                                {/* 分類標題列 */}
                                <div className="flex items-center gap-3 px-4 pt-5 pb-2.5">
                                    <span className="text-base font-extrabold text-[var(--text-primary)] whitespace-nowrap">{cat}</span>
                                    <div className="flex-1 h-px bg-[var(--border-primary)]" />
                                </div>

                                {/* 該分類商品 */}
                                <div className="px-4 space-y-2.5">
                                    {items.map(product => {
                                        const qty = cart[product.id] || 0;
                                        return (
                                            <div
                                                key={product.id}
                                                className={`flex bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-2xl overflow-hidden shadow-[0_3px_10px_rgba(0,0,0,0.04)] dark:shadow-[0_3px_10px_rgba(0,0,0,0.2)] transition-all duration-150 ${
                                                    product.stock <= 0 ? 'opacity-65' : ''
                                                } ${
                                                    animatingProductId === product.id ? 'scale-95' : 'scale-100'
                                                }`}
                                            >
                                                {/* 圖片（左側，全高）*/}
                                                <div className="w-[100px] flex-shrink-0 bg-[var(--bg-tertiary)] relative" style={{ minHeight: 100 }}>
                                                    {product.imageUrl ? (
                                                        <img
                                                            src={product.imageUrl}
                                                            alt={product.name}
                                                            className="w-full h-full object-cover"
                                                            style={{ minHeight: 100 }}
                                                            onError={e => {
                                                                e.target.style.display = 'none';
                                                                e.target.parentNode.classList.add('flex', 'items-center', 'justify-center');
                                                            }}
                                                        />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center" style={{ minHeight: 100 }}>
                                                            <Package className="text-[var(--text-tertiary)]" size={28} />
                                                        </div>
                                                    )}
                                                    {product.stock <= 0 && (
                                                        <div className="absolute inset-0 bg-black/50 z-[2] flex flex-col items-center justify-center text-white gap-1 select-none">
                                                            <span className="text-xs font-black tracking-wider bg-red-600/90 px-1.5 py-0.5 rounded shadow-sm">售罄</span>
                                                            <span className="text-[9px] font-bold text-slate-200 uppercase tracking-widest">Sold Out</span>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* 內容（右側）*/}
                                                <div className="flex-1 p-3 flex flex-col justify-between min-w-0">
                                                    <div>
                                                        <h3 className="font-extrabold text-[18px] text-[var(--text-primary)] leading-snug">{product.name}</h3>
                                                        {product.expiryDate && (
                                                            <span className="inline-block text-[10px] text-orange-600 bg-orange-50 dark:bg-orange-900/10 px-1.5 py-0.5 rounded mt-1">
                                                                有效: {product.expiryDate}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="flex flex-col mt-1.5">
                                                        <div className="flex justify-between items-center">
                                                            <div className="flex flex-col">
                                                                <span className="text-sm font-bold text-blue-600 font-mono">
                                                                    ${product.has_volume_pricing ? (product.single_price || product.price) : product.price}
                                                                </span>
                                                                {product.has_volume_pricing && product.volume_pricing_settings && (
                                                                    <span className="text-[10px] text-red-500 font-bold leading-none mt-0.5">
                                                                        任選 {product.volume_pricing_settings.target_quantity} 入 ${product.volume_pricing_settings.package_price}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div className="flex items-center gap-0.5">
                                                                {qty > 0 && (
                                                                    <>
                                                                        <button
                                                                            onClick={() => handleProductAction(product, false)}
                                                                            className="w-7 h-7 flex items-center justify-center rounded-lg border border-[var(--border-primary)] bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-all duration-100 active:scale-90"
                                                                        >
                                                                            <Minus size={13} />
                                                                        </button>
                                                                        <span className="w-7 text-center font-bold font-mono text-sm">{qty}</span>
                                                                    </>
                                                                )}
                                                                <button
                                                                    onClick={() => handleProductAction(product, true)}
                                                                    disabled={product.stock <= 0}
                                                                    className={`w-7 h-7 flex items-center justify-center rounded-lg shadow-sm transition-all duration-100 ${
                                                                        product.stock <= 0
                                                                            ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed'
                                                                            : qty > 0
                                                                                ? 'bg-slate-700 text-white hover:bg-slate-800 active:scale-90'
                                                                                : 'bg-blue-500 text-white hover:bg-blue-600 active:scale-90'
                                                                    }`}
                                                                >
                                                                    <Plus size={13} />
                                                                </button>
                                                            </div>
                                                        </div>
                                                        {qty > 0 && product.has_flavor_attributes && (
                                                            <div className="text-[10px] text-blue-600 dark:text-blue-400 font-medium mt-1.5 select-none cursor-pointer" onClick={() => handleProductAction(product, true)}>
                                                                {getFlavorRemark(product.id, flavorSelections)}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                        <div className="h-4" />
                    </div>

                    {/* 浮動購物車 */}
                    {totalQty > 0 && (
                        <div className="absolute bottom-0 left-0 right-0 bg-[var(--bg-secondary)]/95 backdrop-blur-sm border-t border-[var(--border-primary)] shadow-2xl px-4 py-3 flex justify-between items-center">
                            <div className="flex items-center gap-3">
                                <div className="relative bg-blue-100 dark:bg-blue-900/30 text-blue-600 p-2.5 rounded-full">
                                    <ShoppingCart size={20} />
                                    <span className="absolute -top-1 -right-1.5 bg-red-500 text-white text-[10px] w-5 h-5 rounded-full flex items-center justify-center font-bold border-2 border-white">{totalQty}</span>
                                </div>
                                <div>
                                    <div className="text-[10px] text-[var(--text-secondary)] font-semibold">已選 {totalQty} 件</div>
                                    <div className="text-2xl font-black text-blue-600 dark:text-blue-400 font-mono">${cartTotal}</div>
                                </div>
                            </div>
                            <button
                                onClick={handleProceedToForm}
                                className="btn-primary px-5 py-2.5 rounded-xl font-bold flex items-center gap-1 shadow-md shadow-blue-500/20"
                            >
                                前往結帳 <ArrowRight size={16} />
                            </button>
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
                                <h3 className="text-base font-bold text-[var(--text-primary)]">{flavorModalProduct.name}</h3>
                                <p className="text-xs text-[var(--text-secondary)] mt-0.5">請選擇規格口味與數量</p>
                            </div>
                            <button
                                onClick={() => setFlavorModalProduct(null)}
                                className="text-[var(--text-secondary)] hover:text-red-500 p-1.5 rounded-lg hover:bg-[var(--bg-hover)]"
                            >
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                            </button>
                        </div>

                        <div className="p-4 space-y-4 max-h-[50vh] overflow-y-auto">
                            {flavorModalProduct.flavor_choices.map(flavor => {
                                const count = tempFlavorQty[flavor] || 0;
                                return (
                                    <div key={flavor} className="flex justify-between items-center py-1">
                                        <span className="font-semibold text-sm text-[var(--text-primary)]">{flavor}</span>
                                        <div className="flex items-center gap-1 bg-[var(--bg-primary)] rounded-lg p-0.5 border border-[var(--border-primary)] shadow-sm">
                                            <button
                                                type="button"
                                                onClick={() => handleUpdateTempFlavorQty(flavor, -1)}
                                                className="w-7 h-7 flex items-center justify-center rounded-md text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-all duration-100 active:scale-90"
                                            >
                                                <Minus size={12} />
                                            </button>
                                            <span className="w-8 text-center font-bold font-mono text-sm">{count}</span>
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
                                    <span className="font-mono text-sm text-blue-600">{Object.values(tempFlavorQty).reduce((a, b) => a + b, 0)} 件</span>
                                </div>
                                {flavorModalProduct.has_volume_pricing && flavorModalProduct.volume_pricing_settings && (
                                    <div className="text-red-500 font-semibold mt-1">
                                        ※ 本商品享組合價：任選 {flavorModalProduct.volume_pricing_settings.target_quantity} 入 ${flavorModalProduct.volume_pricing_settings.package_price}（可口味混搭）
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
        </div>
    );
}
