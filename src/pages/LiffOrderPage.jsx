import React, { useState, useEffect } from 'react';
import { ShoppingCart, Plus, Minus, CheckCircle, Package, MapPin, Phone, User, FileText, ArrowRight, RefreshCw } from 'lucide-react';
import { callGAS } from '../utils/api';

export default function LiffOrderPage({ user, apiUrl }) {
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [cart, setCart] = useState({}); // { productId: qty }
    const [customerName, setCustomerName] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');
    const [deliveryAddress, setDeliveryAddress] = useState('');
    const [note, setNote] = useState('');
    const [sourceGroup, setSourceGroup] = useState('');
    const [step, setStep] = useState('shop'); // 'shop' | 'checkout' | 'success'
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [orderId, setOrderId] = useState('');

    useEffect(() => {
        // 從 URL 取得來源群組 ?grp=xxx
        const params = new URLSearchParams(window.location.search);
        const grp = params.get('grp') || '';
        setSourceGroup(grp);

        // 初始化載入上架的商品
        const loadProducts = async () => {
            setLoading(true);
            try {
                const data = await callGAS(apiUrl, 'getProducts', {}, user.token);
                if (Array.isArray(data)) {
                    // 只顯示上架的商品
                    const activeProducts = data.filter(p => p.isActive);
                    setProducts(activeProducts);
                }
            } catch (error) {
                console.error('Failed to load products:', error);
                alert('載入商品失敗: ' + error.message);
            } finally {
                setLoading(false);
            }
        };

        if (user?.token) {
            loadProducts();
        }
    }, [apiUrl, user?.token]);

    const handleUpdateQty = (productId, delta) => {
        setCart(prev => {
            const currentQty = prev[productId] || 0;
            const newQty = Math.max(0, currentQty + delta);
            const newCart = { ...prev };
            if (newQty === 0) {
                delete newCart[productId];
            } else {
                newCart[productId] = newQty;
            }
            return newCart;
        });
    };

    const totalQty = Object.values(cart).reduce((sum, q) => sum + q, 0);
    
    const getCartTotal = () => {
        return Object.entries(cart).reduce((sum, [pid, qty]) => {
            const prod = products.find(p => p.id === pid);
            if (!prod) return sum;
            return sum + (prod.price * qty);
        }, 0);
    };

    const cartTotal = getCartTotal();

    const handleSubmitOrder = async (e) => {
        e.preventDefault();
        if (!customerName.trim()) {
            alert('請填寫收件人姓名');
            return;
        }
        if (!customerPhone.trim()) {
            alert('請填寫聯絡電話');
            return;
        }

        const items = Object.entries(cart).map(([pid, qty]) => {
            const prod = products.find(p => p.id === pid);
            return {
                productId: pid,
                productName: prod ? prod.name : pid,
                unitPrice: prod ? prod.price : 0,
                qty: qty
            };
        });

        if (items.length === 0) {
            alert('購物車是空的');
            return;
        }

        setIsSubmitting(true);
        try {
            const payload = {
                customerName,
                customerPhone,
                deliveryAddress,
                sourceGroup,
                note,
                items
            };

            const res = await callGAS(apiUrl, 'savePendingOrder', payload, user.token);
            if (res && res.error) {
                throw new Error(res.error);
            }

            setOrderId(res.orderId || '');
            setCart({});
            setStep('success');
        } catch (error) {
            alert('送出訂單失敗: ' + error.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (step === 'success') {
        return (
            <div className="max-w-md mx-auto p-6 flex flex-col items-center justify-center min-h-[70vh] text-center">
                <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mb-6 text-emerald-600 animate-bounce">
                    <CheckCircle size={48} />
                </div>
                <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-2">訂單提交成功！</h2>
                <p className="text-sm text-[var(--text-secondary)] mb-6">
                    我們已收到您的預約訂單。管理員確認訂單後，將會為您保留並安排出貨。
                </p>
                <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-4 w-full text-left font-mono text-sm mb-6 space-y-2">
                    <div className="flex justify-between border-b border-[var(--border-primary)] pb-2 mb-2">
                        <span className="text-[var(--text-secondary)]">訂單編號</span>
                        <span className="font-bold text-[var(--text-primary)]">{orderId}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-[var(--text-secondary)]">收件人</span>
                        <span className="text-[var(--text-primary)]">{customerName}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-[var(--text-secondary)]">聯絡電話</span>
                        <span className="text-[var(--text-primary)]">{customerPhone}</span>
                    </div>
                    {deliveryAddress && (
                        <div className="flex justify-between">
                            <span className="text-[var(--text-secondary)]">送貨地址</span>
                            <span className="text-[var(--text-primary)]">{deliveryAddress}</span>
                        </div>
                    )}
                </div>
                <button
                    onClick={() => {
                        setStep('shop');
                        setCustomerName('');
                        setCustomerPhone('');
                        setDeliveryAddress('');
                        setNote('');
                    }}
                    className="btn-primary w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2"
                >
                    繼續購物
                </button>
            </div>
        );
    }

    return (
        <div className="max-w-md mx-auto flex flex-col h-[calc(100vh-6rem)] relative overflow-hidden bg-[var(--bg-primary)]">
            {/* Header */}
            <div className="p-4 bg-[var(--bg-secondary)] border-b border-[var(--border-primary)] flex justify-between items-center flex-shrink-0">
                <div>
                    <h2 className="text-lg font-bold text-[var(--text-primary)]">LINE 團購一鍵下單</h2>
                    {sourceGroup && (
                        <span className="inline-block bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-[10px] px-2 py-0.5 rounded-full font-semibold mt-1">
                            來源群組: {sourceGroup}
                        </span>
                    )}
                </div>
                <button 
                    onClick={() => {
                        setLoading(true);
                        callGAS(apiUrl, 'getProducts', {}, user.token)
                            .then(data => {
                                if (Array.isArray(data)) setProducts(data.filter(p => p.isActive));
                            })
                            .finally(() => setLoading(false));
                    }}
                    className="p-1.5 rounded-lg bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >
                    <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                </button>
            </div>

            {loading ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-2 text-[var(--text-secondary)]">
                    <RefreshCw className="animate-spin text-blue-500" size={32} />
                    <span>商品載入中...</span>
                </div>
            ) : step === 'shop' ? (
                <>
                    {/* 商品列表 */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-24">
                        {products.length === 0 ? (
                            <div className="text-center py-12 text-[var(--text-secondary)]">
                                目前沒有上架的商品喔！
                            </div>
                        ) : (
                            products.map(product => {
                                const qty = cart[product.id] || 0;
                                return (
                                    <div key={product.id} className="flex gap-4 p-3 bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-2xl shadow-sm hover:shadow-md transition-shadow relative overflow-hidden">
                                        {/* 商品圖片 */}
                                        <div className="w-24 h-24 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-tertiary)] overflow-hidden flex items-center justify-center flex-shrink-0">
                                            {product.imageUrl ? (
                                                <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" onError={(e) => { e.target.onerror = null; e.target.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'; }} />
                                            ) : (
                                                <Package className="text-[var(--text-tertiary)]" size={32} />
                                            )}
                                        </div>

                                        {/* 商品內容 */}
                                        <div className="flex-1 flex flex-col justify-between">
                                            <div>
                                                <h3 className="font-bold text-base text-[var(--text-primary)] leading-tight">{product.name}</h3>
                                                {product.expiryDate && (
                                                    <span className="inline-block text-[10px] text-orange-600 bg-orange-50 dark:bg-orange-900/10 border border-orange-200/30 px-1.5 py-0.5 rounded mt-1">
                                                        有效日期: {product.expiryDate}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex justify-between items-center mt-2">
                                                <span className="text-lg font-extrabold text-blue-600 font-mono">${product.price}</span>
                                                
                                                {/* 加減按鈕 */}
                                                <div className="flex items-center gap-1 bg-[var(--bg-tertiary)] rounded-lg p-0.5 border border-[var(--border-primary)]">
                                                    {qty > 0 ? (
                                                        <>
                                                            <button 
                                                                onClick={() => handleUpdateQty(product.id, -1)}
                                                                className="w-7 h-7 flex items-center justify-center rounded-md text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors"
                                                            >
                                                                <Minus size={14} />
                                                            </button>
                                                            <span className="w-6 text-center font-bold font-mono text-sm">{qty}</span>
                                                        </>
                                                    ) : null}
                                                    <button 
                                                        onClick={() => handleUpdateQty(product.id, 1)}
                                                        className="w-7 h-7 flex items-center justify-center rounded-md bg-blue-500 text-white hover:bg-blue-600 shadow-sm transition-colors"
                                                    >
                                                        <Plus size={14} />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>

                    {/* 底部浮動購物車條 */}
                    {totalQty > 0 && (
                        <div className="absolute bottom-0 left-0 right-0 bg-[var(--bg-secondary)] border-t border-[var(--border-primary)] shadow-2xl p-4 flex justify-between items-center backdrop-blur-md bg-opacity-95 animate-slide-up">
                            <div className="flex items-center gap-3">
                                <div className="relative bg-blue-100 text-blue-600 p-2.5 rounded-full">
                                    <ShoppingCart size={20} />
                                    <span className="absolute -top-1 -right-1.5 bg-red-500 text-white text-[10px] w-5 h-5 rounded-full flex items-center justify-center font-bold border border-white">
                                        {totalQty}
                                    </span>
                                </div>
                                <div>
                                    <div className="text-[10px] text-[var(--text-secondary)] font-semibold">合計</div>
                                    <div className="text-xl font-extrabold text-[var(--text-primary)] font-mono">${cartTotal}</div>
                                </div>
                            </div>
                            <button
                                onClick={() => setStep('checkout')}
                                className="btn-primary px-6 py-3 rounded-xl font-bold flex items-center gap-1 shadow-md shadow-blue-500/20"
                            >
                                填寫資料 <ArrowRight size={16} />
                            </button>
                        </div>
                    )}
                </>
            ) : (
                /* Checkout Form Step */
                <form onSubmit={handleSubmitOrder} className="flex-1 flex flex-col justify-between overflow-hidden">
                    <div className="flex-1 overflow-y-auto p-5 space-y-4">
                        <div className="flex items-center gap-2 text-sm text-blue-600 font-bold mb-2">
                            <ShoppingCart size={16} />
                            <span>購物車確認 ({totalQty} 件商品，共 ${cartTotal} 元)</span>
                        </div>

                        {/* 收件人姓名 */}
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-[var(--text-secondary)] flex items-center gap-1">
                                <User size={14} /> 收件人姓名 <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="text"
                                className="input-field w-full p-2.5 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-secondary)]"
                                placeholder="請輸入收件人姓名"
                                required
                                value={customerName}
                                onChange={(e) => setCustomerName(e.target.value)}
                            />
                        </div>

                        {/* 聯絡電話 */}
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-[var(--text-secondary)] flex items-center gap-1">
                                <Phone size={14} /> 聯絡電話 <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="tel"
                                className="input-field w-full p-2.5 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-secondary)]"
                                placeholder="請輸入手機或聯絡電話"
                                required
                                value={customerPhone}
                                onChange={(e) => setCustomerPhone(e.target.value)}
                            />
                        </div>

                        {/* 外送地址 / 自取備註 */}
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-[var(--text-secondary)] flex items-center gap-1">
                                <MapPin size={14} /> 送貨地址 (若要自取請填自取)
                            </label>
                            <input
                                type="text"
                                className="input-field w-full p-2.5 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-secondary)]"
                                placeholder="請輸入完整地址，或填自取"
                                value={deliveryAddress}
                                onChange={(e) => setDeliveryAddress(e.target.value)}
                            />
                        </div>

                        {/* 備註 */}
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-[var(--text-secondary)] flex items-center gap-1">
                                <FileText size={14} /> 備註 (選填)
                            </label>
                            <textarea
                                className="input-field w-full p-2.5 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-secondary)]"
                                rows="3"
                                placeholder="有任何特殊需求，如不吃香菜、要分包等，請在此備註"
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                            />
                        </div>
                    </div>

                    {/* 表單底部按鈕 */}
                    <div className="p-4 bg-[var(--bg-secondary)] border-t border-[var(--border-primary)] grid grid-cols-2 gap-3">
                        <button
                            type="button"
                            onClick={() => setStep('shop')}
                            className="btn-secondary py-3 rounded-xl font-bold"
                            disabled={isSubmitting}
                        >
                            回上一頁
                        </button>
                        <button
                            type="submit"
                            className="btn-primary py-3 rounded-xl font-bold flex items-center justify-center gap-1 shadow-md shadow-blue-500/20"
                            disabled={isSubmitting}
                        >
                            {isSubmitting ? (
                                <>
                                    <RefreshCw className="animate-spin" size={16} />
                                    提交中...
                                </>
                            ) : (
                                '送出訂單'
                            )}
                        </button>
                    </div>
                </form>
            )}
        </div>
    );
}
