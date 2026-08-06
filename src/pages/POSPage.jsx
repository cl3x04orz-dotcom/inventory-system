import React, { useState, useEffect, useRef, useMemo } from 'react';
import { callGAS } from '../utils/api';
import { useCart } from '../hooks/useCart';
import { POSReceiptPrint } from '../components/POSReceiptPrint';
import { 
  ShoppingCart, Trash2, Plus, Minus, CreditCard, DollarSign, 
  Search, RefreshCw, CheckCircle, Package, Tag, Layers,
  FileText, Smartphone, Building2, Heart, Receipt, Delete, Settings, X, Save, Store, Eye, EyeOff, PauseCircle, PlayCircle, Clock
} from 'lucide-react';

/**
 * 跨商品 Mix-and-Match 組合特價計算 (同商品優先原則)
 */
function calculateCartSubtotal(cartItems) {
  if (!Array.isArray(cartItems) || cartItems.length === 0) return 0;

  let totalSum = 0;
  const groups = {}; // Key: `${target_quantity}_${package_price}`
  const normalItems = [];

  cartItems.forEach(item => {
    const qty = Number(item.qty || 0);
    const unitPrice = Number(item.unitPrice || 0);
    const settings = item.volume_pricing_settings;

    if (item.has_volume_pricing && settings && Number(settings.target_quantity) > 0 && Number(settings.package_price) > 0) {
      const key = `${settings.target_quantity}_${settings.package_price}`;
      if (!groups[key]) {
        groups[key] = {
          targetQuantity: Number(settings.target_quantity),
          packagePrice: Number(settings.package_price),
          items: []
        };
      }
      groups[key].items.push({ ...item, qty, unitPrice });
    } else {
      normalItems.push({ ...item, qty, unitPrice });
    }
  });

  // 1. 一般商品計價
  normalItems.forEach(item => {
    totalSum += (item.qty * item.unitPrice) - (item.discountAmount || 0);
  });

  // 2. 多件特價商品（同商品優先，剩餘散買才跨品項混搭）
  Object.values(groups).forEach(group => {
    const { targetQuantity, packagePrice, items } = group;
    let leftoverQtySum = 0;
    let leftoverBaseSum = 0;

    items.forEach(item => {
      const selfBundles = Math.floor(item.qty / targetQuantity);
      const selfRemainder = item.qty % targetQuantity;
      
      // 同商品優先享用完整組合價
      totalSum += (selfBundles * packagePrice);
      
      leftoverQtySum += selfRemainder;
      leftoverBaseSum += (selfRemainder * item.unitPrice);
    });

    // 剩餘散買品項跨商品混搭
    if (leftoverQtySum >= targetQuantity) {
      const crossBundles = Math.floor(leftoverQtySum / targetQuantity);
      const crossRemainder = leftoverQtySum % targetQuantity;
      const avgUnitPrice = leftoverQtySum > 0 ? (leftoverBaseSum / leftoverQtySum) : 0;
      
      totalSum += (crossBundles * packagePrice) + Math.round(crossRemainder * avgUnitPrice);
    } else {
      totalSum += leftoverBaseSum;
    }
  });

  return totalSum;
}

/**
 * 計算購物車中各單項商品分配到的折抵後金額與省下金額 (同商品優先，支援小數位 $18.33 與第4/5個散買原價展示)
 */
function getItemDiscountedInfo(item, cartItems) {
  const originalTotal = Number(item.unitPrice || 0) * Number(item.qty || 0);
  const settings = item.volume_pricing_settings;

  if (!item.has_volume_pricing || !settings || !Number(settings.target_quantity) || !Number(settings.package_price)) {
    return { discountedTotal: originalTotal, savings: 0, formattedDiscountedTotal: `$${originalTotal.toLocaleString()}` };
  }

  const targetQty = Number(settings.target_quantity);
  const packagePrice = Number(settings.package_price);
  const itemQty = Number(item.qty || 0);
  const unitPrice = Number(item.unitPrice || 0);

  if (itemQty <= 0) {
    return { discountedTotal: 0, savings: 0, formattedDiscountedTotal: '$0' };
  }

  // 1. 找出購物車中所有同規則商品 (保持出現順序)
  const groupItems = cartItems.filter(i => 
    i.has_volume_pricing && 
    i.volume_pricing_settings &&
    Number(i.volume_pricing_settings.target_quantity) === targetQty &&
    Number(i.volume_pricing_settings.package_price) === packagePrice
  );

  // 2. 收集各商品散買剩餘量
  let leftoverItems = [];

  groupItems.forEach(i => {
    const q = Number(i.qty || 0);
    leftoverItems.push({
      productId: i.productId,
      unitPrice: Number(i.unitPrice || 0),
      remainderQty: q % targetQty
    });
  });

  // 3. 計算跨商品散買可組出的組數 (crossBundles)
  const totalLeftoverQty = leftoverItems.reduce((s, i) => s + i.remainderQty, 0);
  const crossBundles = Math.floor(totalLeftoverQty / targetQty);
  let remainingCrossBundledCap = crossBundles * targetQty;

  // 4. 計算目前 item 的特價件數 (totalBundledQty) 與 散買原價件數 (extraOriginalQty)
  const mySelfBundles = Math.floor(itemQty / targetQty);
  const mySelfBundledQty = mySelfBundles * targetQty;

  let myCrossBundledQty = 0;
  for (const lo of leftoverItems) {
    const capTake = Math.min(lo.remainderQty, remainingCrossBundledCap);
    remainingCrossBundledCap -= capTake;

    if (lo.productId === item.productId) {
      myCrossBundledQty = capTake;
      break;
    }
  }

  const totalBundledQty = mySelfBundledQty + myCrossBundledQty;
  const extraOriginalQty = itemQty - totalBundledQty;

  // 5. 金額精算 (特價單價如 55/3 = 18.333333...)
  const bundledUnitPrice = packagePrice / targetQty;
  const discountedTotal = (totalBundledQty * bundledUnitPrice) + (extraOriginalQty * unitPrice);
  const savings = originalTotal - discountedTotal;

  if (savings <= 0.001) {
    return { discountedTotal: originalTotal, savings: 0, formattedDiscountedTotal: `$${originalTotal.toLocaleString()}` };
  }

  // 6. 格式化輸出 (有小數點顯示 .2f 如 $18.33)
  const hasDecimals = Math.abs(discountedTotal - Math.round(discountedTotal)) > 0.001;
  const formattedDiscountedTotal = hasDecimals 
    ? `$${discountedTotal.toFixed(2)}` 
    : `$${Math.round(discountedTotal).toLocaleString()}`;

  return { discountedTotal, savings, formattedDiscountedTotal };
}

function getItemSubtotal(item) {
  const qty = Number(item.qty || 0);
  const singlePrice = Number(item.unitPrice || 0);
  return (singlePrice * qty) - (item.discountAmount || 0);
}

export default function POSPage({ user, apiUrl, isHeaderHidden }) {
  const { cartItems, addItem, updateQty, removeItem, clear, replaceCart } = useCart();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [showUnlistedProducts, setShowUnlistedProducts] = useState(false); // 門市未上架商品顯示開關

  // 門市 POS 暫存掛單與取單 State (Hold & Resume Cart)
  const [heldCarts, setHeldCarts] = useState(() => {
    try {
      const saved = localStorage.getItem('pos_held_carts');
      return saved ? JSON.parse(saved) : [];
    } catch (_) {
      return [];
    }
  });
  const [isHoldModalOpen, setIsHoldModalOpen] = useState(false);
  const [isResumeModalOpen, setIsResumeModalOpen] = useState(false);
  const [holdNoteInput, setHoldNoteInput] = useState('');

  // 持久化保存暫存單至 LocalStorage
  useEffect(() => {
    try {
      localStorage.setItem('pos_held_carts', JSON.stringify(heldCarts));
    } catch (err) {
      console.error('Failed to save held carts:', err);
    }
  }, [heldCarts]);
  
  // Checkout Modal State
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [receivedAmountInput, setReceivedAmountInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [lastReceipt, setLastReceipt] = useState(null);

  // POS Product Settings Modal State
  const [editingPosProduct, setEditingPosProduct] = useState(null);
  const [savingPosSettings, setSavingPosSettings] = useState(false);

  // Touch Numpad Modal State (藍芽掃碼槍防呆觸控數字鍵盤，支援首字覆蓋)
  const [numpadTarget, setNumpadTarget] = useState(null);
  const [numpadValue, setNumpadValue] = useState('');
  const [isFirstKey, setIsFirstKey] = useState(true);

  // E-Invoice State
  const [invoiceType, setInvoiceType] = useState('paper'); // 'paper' | 'mobile' | 'taxId' | 'donate'
  const [mobileCarrier, setMobileCarrier] = useState('');
  const [taxId, setTaxId] = useState('');
  const [donateCode, setDonateCode] = useState('');

  // Load Products
  const fetchProducts = async () => {
    setLoading(true);
    try {
      const res = await callGAS(apiUrl, 'getProducts', {}, user.token);
      if (Array.isArray(res)) {
        let mapped = res.map(p => {
          let pos = p.posSettings || {};
          if (typeof pos === 'string') {
            try { pos = JSON.parse(pos); } catch (_) { pos = {}; }
          }
          // 門市 POS 獨立上架狀態：優先讀取 posSettings.isActive，若無才繼承 p.isActive
          const isPosActive = pos.isActive !== undefined 
            ? (pos.isActive === true || pos.isActive === 'true') 
            : Boolean(p.isActive);
          return {
            ...p,
            isActive: isPosActive,
            single_price: pos.price !== undefined && pos.price !== null ? pos.price : (p.single_price || p.price || 0),
            price: pos.price !== undefined && pos.price !== null ? pos.price : (p.price || p.single_price || 0),
            isBundle: pos.isBundle !== undefined ? Boolean(pos.isBundle) : Boolean(p.isBundle),
            bundleSize: pos.packSize !== undefined && pos.packSize !== null ? Number(pos.packSize) : Number(p.bundleSize || p.packSize || 1),
            packSize: pos.packSize !== undefined && pos.packSize !== null ? Number(pos.packSize) : Number(p.bundleSize || p.packSize || 1),
            sortWeight: pos.sortWeight !== undefined && pos.sortWeight !== null ? pos.sortWeight : p.sortWeight,
            has_flavor_attributes: pos.has_flavor_attributes !== undefined ? pos.has_flavor_attributes : p.has_flavor_attributes,
            flavor_choices: pos.flavor_choices !== undefined ? pos.flavor_choices : p.flavor_choices,
            maxTotalQty: pos.maxTotalQty !== undefined ? pos.maxTotalQty : p.maxTotalQty,
            has_volume_pricing: pos.has_volume_pricing !== undefined ? Boolean(pos.has_volume_pricing) : Boolean(p.has_volume_pricing || p.hasVolumePricing),
            volume_pricing_settings: pos.volume_pricing_settings !== undefined ? pos.volume_pricing_settings : (p.volume_pricing_settings || p.volumePricingSettings || null),
            posSettings: pos
          };
        });

        mapped.sort((a, b) => {
          const weightA = a.sortWeight != null ? Number(a.sortWeight) : 999999;
          const weightB = b.sortWeight != null ? Number(b.sortWeight) : 999999;
          return weightA - weightB;
        });
        setProducts(mapped);
      }
    } catch (err) {
      console.error('Failed to load products for POS:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, [apiUrl, user]);

  // Categories
  const categories = useMemo(() => {
    const cats = new Set(products.map(p => p.category).filter(Boolean));
    return ['ALL', ...Array.from(cats)];
  }, [products]);

  // Filtered Products
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const pName = p.name || p.productName || p.id || '';
      const pId = p.id || p.productId || '';
      const matchCat = selectedCategory === 'ALL' || p.category === selectedCategory;
      const matchSearch = !searchQuery || 
        pName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        pId.toLowerCase().includes(searchQuery.toLowerCase());
      
      // 若未勾選「顯示全品項 (含下架)」，只過濾顯示門市已上架商品
      const matchActive = showUnlistedProducts || p.isActive === true;

      return matchCat && matchSearch && matchActive;
    });
  }, [products, selectedCategory, searchQuery, showUnlistedProducts]);

  // Helper to add normalized product to cart
  const handleAddToCart = (product) => {
    const normalizedProduct = {
      productId: product.id || product.productId,
      productName: product.name || product.productName || product.id,
      single_price: Number(product.single_price || product.singlePrice || product.price || product.defaultPrice || 0),
      cost: Number(product.price || product.defaultPrice || 0),
      capacity: product.capacity || '',
      category: product.category || '',
      has_volume_pricing: Boolean(product.has_volume_pricing),
      volume_pricing_settings: product.volume_pricing_settings || null,
      isBundle: Boolean(product.isBundle),
      bundleSize: Number(product.bundleSize || 1),
      packSize: Number(product.packSize || 1)
    };
    addItem(normalizedProduct);
  };

  // Totals Calculation (與跨商品 Mix-and-Match 組合特價演算法對齊)
  const subtotal = useMemo(() => {
    return calculateCartSubtotal(cartItems);
  }, [cartItems]);

  // 暫存掛單與取單邏輯
  const handleHoldCart = () => {
    if (!cartItems || cartItems.length === 0) return;
    const newHeldCart = {
      id: 'HOLD_' + Date.now(),
      createdAt: new Date().toLocaleTimeString('zh-TW', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      dateStr: new Date().toLocaleDateString('zh-TW'),
      note: holdNoteInput.trim() || `暫存客 ${heldCarts.length + 1}`,
      items: [...cartItems],
      subtotal: subtotal
    };
    setHeldCarts(prev => [newHeldCart, ...prev]);
    clear();
    setHoldNoteInput('');
    setIsHoldModalOpen(false);
  };

  const handleResumeCart = (heldCart) => {
    if (cartItems.length > 0) {
      if (!window.confirm('當前購物車內尚有商品，恢復暫存單將會取代當前購物車，是否確定恢復？')) {
        return;
      }
    }
    replaceCart(heldCart.items);
    setHeldCarts(prev => prev.filter(c => c.id !== heldCart.id));
    setIsResumeModalOpen(false);
  };

  const handleDeleteHeldCart = (heldCartId) => {
    setHeldCarts(prev => prev.filter(c => c.id !== heldCartId));
  };

  const receivedAmount = Number(receivedAmountInput) || 0;
  const changeAmount = Math.max(0, receivedAmount - subtotal);

  // Barcode Scanner Global Keyboard Listener
  const barcodeBuffer = useRef('');
  const lastKeyTime = useRef(0);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (document.activeElement?.tagName === 'INPUT') return;

      const currentTime = Date.now();
      // 增加容許時間至 300ms，相容部分速度較慢的無線掃碼槍或手動快速輸入
      if (currentTime - lastKeyTime.current > 300) {
        barcodeBuffer.current = '';
      }
      lastKeyTime.current = currentTime;

      if (e.key === 'Enter') {
        if (barcodeBuffer.current.length > 2) {
          const scanned = barcodeBuffer.current.trim();
          barcodeBuffer.current = '';
          const match = products.find(p => 
            (p.id || p.productId) === scanned || 
            (p.name || p.productName) === scanned ||
            (p.barcodes && p.barcodes.some(b => (typeof b === 'object' ? b.barcode : b) === scanned))
          );
          if (match) {
            handleAddToCart(match);
          } else {
            alert(`找不到對應的商品條碼：${scanned}`);
          }
        }
      } else if (e.key.length === 1) {
        barcodeBuffer.current += e.key;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [products]);

  // Handle Checkout Submit
  const handleCheckoutSubmit = async () => {
    if (cartItems.length === 0) return;
    if (paymentMethod === 'CASH' && receivedAmount < subtotal) {
      alert('實收金額不足！');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        storeCode: 'MILI001',
        terminalId: 'POS01',
        cashierId: user.username || user.userId || 'admin',
        customer: '門市散客',
        items: cartItems.map(i => ({
          productId: i.productId,
          productName: i.productName,
          qty: i.qty,
          unitPrice: i.unitPrice,
          unitCost: i.unitCost || 0,
          discountAmount: i.discountAmount || 0,
          has_volume_pricing: i.has_volume_pricing,
          volume_pricing_settings: i.volume_pricing_settings,
          isBundle: i.isBundle,
          bundleSize: i.bundleSize
        })),
        payments: [{
          method: paymentMethod,
          amount: subtotal,
          receivedAmount: paymentMethod === 'CASH' ? receivedAmount : subtotal,
          changeAmount: paymentMethod === 'CASH' ? changeAmount : 0
        }],
        receivedAmount: paymentMethod === 'CASH' ? receivedAmount : subtotal,
        invoice: {
          type: invoiceType,
          mobileCarrier: invoiceType === 'mobile' ? mobileCarrier : '',
          taxId: invoiceType === 'taxId' ? taxId : '',
          donateCode: invoiceType === 'donate' ? donateCode : ''
        }
      };

      const result = await callGAS(apiUrl, 'createRetailSale', payload, user.token);

      if (result && result.sale) {
        const receiptData = {
          storeName: '米立微門市',
          receiptNo: result.sale.receiptNo,
          date: new Date(result.sale.date).toLocaleString('zh-TW'),
          cashier: user.username || '管理員',
          items: cartItems,
          pricing: result.pricing || { subtotal, grandTotal: subtotal, changeAmount },
          paymentMethod: paymentMethod === 'CASH' ? '現金' : paymentMethod === 'LINE_PAY' ? 'LINE Pay' : '信用卡',
          receivedAmount: paymentMethod === 'CASH' ? receivedAmount : subtotal
        };

        setLastReceipt(receiptData);
        clear();
        setIsCheckoutOpen(false);
        setReceivedAmountInput('');
      }
    } catch (err) {
      console.error('POS Checkout failed:', err);
      alert('結帳失敗：' + (err.message || '系統錯誤'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={`flex w-full bg-gray-100 overflow-hidden font-sans transition-all duration-300 ${isHeaderHidden ? 'h-screen' : 'h-[calc(100vh-76px)]'}`}>
      {/* 隱藏列印區域 */}
      <POSReceiptPrint receiptData={lastReceipt} />

      {/* 左側：商品選購點選區 (主區域 flex-1) */}
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-gray-100 min-w-0">
        {/* 搜尋與分類頂欄 */}
        <div className="p-3 bg-white border-b border-gray-200 space-y-2">
          <div className="flex items-center space-x-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="搜尋商品名稱 / 編號 (或刷條碼)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-xs"
              />
            </div>
            <button 
              onClick={fetchProducts}
              className="p-1.5 border border-gray-300 rounded-xl hover:bg-gray-50 text-gray-600"
              title="重新載入商品"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={() => setShowUnlistedProducts(prev => !prev)}
              className={`px-2.5 py-1.5 border rounded-xl text-xs font-bold whitespace-nowrap transition-colors flex items-center space-x-1 ${
                showUnlistedProducts
                  ? 'bg-amber-500 text-white border-amber-600 shadow-sm'
                  : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
              }`}
              title={showUnlistedProducts ? "點擊切換為僅顯示門市已上架商品" : "點擊顯示全品項 (包含門市已下架商品)"}
            >
              {showUnlistedProducts ? (
                <>
                  <Eye className="w-3.5 h-3.5" />
                  <span>顯示全品項 (含下架)</span>
                </>
              ) : (
                <>
                  <EyeOff className="w-3.5 h-3.5" />
                  <span>僅顯示門市上架</span>
                </>
              )}
            </button>
          </div>

          {/* 分類標籤 */}
          <div className="flex space-x-1.5 overflow-x-auto pb-1 scrollbar-none">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                  selectedCategory === cat
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {cat === 'ALL' ? '全部商品' : cat}
              </button>
            ))}
          </div>
        </div>

        {/* 商品大卡片列表 (一行三格，大字體清晰排版) */}
        <div className="flex-1 overflow-y-auto p-3.5">
          {loading ? (
            <div className="h-full flex items-center justify-center text-gray-400 space-x-2 text-sm">
              <RefreshCw className="w-5 h-5 animate-spin text-indigo-600" />
              <span>載入商品中...</span>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="h-full flex items-center justify-center text-gray-400 text-sm">
              尚無符合條件的商品
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {filteredProducts.map((product) => {
                const pName = product.name || product.productName || product.id;
                const pId = product.id || product.productId;
                const price = Number(product.single_price || product.singlePrice || product.price || product.defaultPrice || 0);

                // 捆裝與多件特價
                const isBundle = Boolean(product.isBundle);
                const bundleSize = Number(product.bundleSize || 1);

                const hasVolume = Boolean(product.has_volume_pricing || product.hasVolumePricing);
                const volumeSettings = product.volume_pricing_settings || product.volumePricingSettings;
                const bundleText = (hasVolume && volumeSettings?.target_quantity && volumeSettings?.package_price)
                  ? `${volumeSettings.target_quantity}件$${volumeSettings.package_price}`
                  : null;

                const isUnlisted = product.isActive === false;

                return (
                  <div
                    key={pId}
                    onClick={() => handleAddToCart(product)}
                    className={`p-4 rounded-2xl border-2 transition-all text-left flex flex-col justify-between h-36 md:h-40 group relative overflow-hidden shadow-xs cursor-pointer select-none active:scale-98 ${
                      isUnlisted
                        ? 'bg-gray-50/80 border-dashed border-gray-300 opacity-65 hover:border-amber-400'
                        : 'bg-white border-gray-100 hover:border-indigo-500 hover:shadow-lg'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div className="space-y-1 flex-1 pr-1">
                        <div className="font-black text-gray-900 text-base md:text-lg leading-tight group-hover:text-indigo-600 line-clamp-2">
                          {pName}
                        </div>
                        <div className="text-xs text-gray-400 font-bold">
                          {isBundle ? `1組(${bundleSize}入)` : (product.capacity || '')}
                        </div>
                      </div>

                      {/* ⚙️ 門市 POS 自訂特價與屬性設定按鈕 */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingPosProduct({
                            id: product.id,
                            name: pName,
                            isActive: product.isActive !== false,
                            barcodes: Array.isArray(product.barcodes) ? [...product.barcodes] : [],
                            single_price: price,
                            price: price,
                            isBundle: isBundle,
                            bundleSize: bundleSize,
                            has_volume_pricing: hasVolume,
                            volume_pricing_settings: volumeSettings || { target_quantity: '', package_price: '' }
                          });
                        }}
                        className="p-1.5 rounded-xl hover:bg-indigo-50 text-gray-400 hover:text-indigo-600 transition-colors z-10"
                        title="自訂 POS 專屬特價與屬性"
                      >
                        <Settings className="w-4 h-4" />
                      </button>
                    </div>

                    <div>
                      {/* 標籤顯示 (加大顯眼) */}
                      <div className="flex flex-wrap gap-1.5 mb-1.5">
                        {isUnlisted && (
                          <span className="inline-flex items-center space-x-1 text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-lg font-extrabold border border-red-200">
                            <EyeOff className="w-3 h-3" />
                            <span>門市已下架</span>
                          </span>
                        )}
                        {isBundle && (
                          <span className="inline-flex items-center space-x-1 text-xs bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-lg font-extrabold border border-indigo-200">
                            <Layers className="w-3 h-3" />
                            <span>捆裝{bundleSize}入</span>
                          </span>
                        )}
                        {bundleText && (
                          <span className="inline-flex items-center space-x-1 text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-lg font-extrabold border border-amber-300">
                            <Tag className="w-3 h-3" />
                            <span>{bundleText}</span>
                          </span>
                        )}
                      </div>

                      <div className="flex justify-between items-end border-t border-gray-100 pt-1.5">
                        <span className="font-black text-indigo-600 text-base md:text-lg">
                          ${price.toLocaleString()}{isBundle ? '/組' : ''}
                        </span>
                        <span className="w-6 h-6 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                          <Plus className="w-4 h-4" />
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 右側：購物車與結帳區 (360px / 400px 固定寬度) */}
      <div className="w-[360px] lg:w-[400px] bg-white border-l border-gray-200 flex flex-col h-full shadow-lg z-10 shrink-0">
        {/* 購物車標頭與暫存/取單按鈕列 */}
        <div className="p-3 border-b border-gray-200 bg-gray-50 flex flex-col gap-2">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-2 text-gray-800 font-bold text-base">
              <ShoppingCart className="w-5 h-5 text-indigo-600" />
              <span>當前購物車 ({cartItems.length})</span>
            </div>
            {cartItems.length > 0 && (
              <button 
                onClick={clear}
                className="text-xs text-red-500 hover:text-red-700 flex items-center space-x-1 font-bold cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>清空</span>
              </button>
            )}
          </div>

          {/* 暫存掛單與取單按鈕列 */}
          <div className="flex gap-1.5 pt-0.5">
            <button
              type="button"
              disabled={cartItems.length === 0}
              onClick={() => {
                setHoldNoteInput(`暫存客 ${heldCarts.length + 1}`);
                setIsHoldModalOpen(true);
              }}
              className={`flex-1 py-1.5 px-2 rounded-xl text-xs font-extrabold flex items-center justify-center space-x-1 transition-all border ${
                cartItems.length > 0
                  ? 'bg-amber-500 text-white border-amber-600 hover:bg-amber-600 cursor-pointer shadow-2xs active:scale-95'
                  : 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
              }`}
              title="將當前購物車暫存掛單，讓後方客人先結帳"
            >
              <PauseCircle className="w-3.5 h-3.5" />
              <span>暫存掛單</span>
            </button>

            <button
              type="button"
              onClick={() => setIsResumeModalOpen(true)}
              className={`flex-1 py-1.5 px-2 rounded-xl text-xs font-extrabold flex items-center justify-center space-x-1 transition-all border ${
                heldCarts.length > 0
                  ? 'bg-indigo-600 text-white border-indigo-700 hover:bg-indigo-700 cursor-pointer shadow-sm active:scale-95'
                  : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50 cursor-pointer'
              }`}
              title="查看並恢復暫存掛單購物車"
            >
              <PlayCircle className="w-3.5 h-3.5" />
              <span>暫存取單</span>
              {heldCarts.length > 0 && (
                <span className="ml-1 bg-white text-indigo-700 px-1.5 py-0.2 rounded-full text-[10px] font-black shadow-2xs">
                  {heldCarts.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* 購物車明細清單 */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {cartItems.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-400 space-y-2 text-center p-4">
              <Package className="w-12 h-12 stroke-[1.5]" />
              <p className="text-sm">點擊左側商品卡片<br />或掃描條碼即可加入購物車</p>
            </div>
          ) : (
            cartItems.map((item) => {
              const originalTotal = (item.unitPrice || 0) * (item.qty || 0);
              const { savings, formattedDiscountedTotal } = getItemDiscountedInfo(item, cartItems);

              return (
                <div key={item.productId} className="flex items-center justify-between p-3 bg-gray-50 rounded-2xl border border-gray-200 hover:border-indigo-300 transition-colors">
                  <div className="flex-1 min-w-0 pr-2">
                    <div className="flex items-center space-x-1 flex-wrap gap-y-1">
                      <h4 className="font-extrabold text-gray-900 text-sm truncate">{item.productName}</h4>
                      {item.isBundle && (
                        <span className="bg-indigo-100 text-indigo-800 text-[11px] px-2 py-0.5 rounded-md font-extrabold whitespace-nowrap">
                          捆裝{item.bundleSize}入
                        </span>
                      )}
                      {item.has_volume_pricing && (
                        <span className="bg-amber-100 text-amber-800 text-[11px] px-2 py-0.5 rounded-md font-extrabold whitespace-nowrap border border-amber-300">
                          {item.volume_pricing_settings?.target_quantity ? `滿${item.volume_pricing_settings.target_quantity}件特價` : '多件特價'}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 mt-1 font-medium">
                      ${item.isBundle ? (item.unitPrice * item.bundleSize).toLocaleString() : item.unitPrice.toLocaleString()} {item.isBundle ? `/組(${item.bundleSize}入)` : (item.capacity ? `• ${item.capacity}` : '')}
                    </div>
                  </div>

                  {/* 數量調整與小計 (含單項劃線原價與實收特價) */}
                  <div className="flex items-center space-x-2">
                    <div className="flex items-center border border-gray-300 rounded-xl bg-white overflow-hidden shadow-2xs">
                      <button 
                        onClick={() => updateQty(item.productId, item.qty - 1)}
                        className="p-1.5 hover:bg-gray-100 text-gray-600 active:bg-gray-200"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setNumpadTarget(item);
                          setNumpadValue(String(item.qty));
                          setIsFirstKey(true);
                        }}
                        className="px-2 py-0.5 text-sm font-extrabold text-indigo-700 hover:bg-indigo-50 active:bg-indigo-100 min-w-[1.8rem] text-center underline decoration-indigo-300 underline-offset-2 transition-colors"
                        title="點擊開啟螢幕觸控數字鍵盤"
                      >
                        {item.qty}
                      </button>
                      <button 
                        onClick={() => updateQty(item.productId, item.qty + 1)}
                        className="p-1.5 hover:bg-gray-100 text-gray-600 active:bg-gray-200"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="min-w-[4.2rem] text-right font-mono">
                      {savings > 0 ? (
                        <>
                          <div className="text-[11px] text-gray-400 font-bold line-through">${originalTotal.toLocaleString()}</div>
                          <div className="font-black text-emerald-600 text-base md:text-lg">{formattedDiscountedTotal}</div>
                        </>
                      ) : (
                        <div className="font-black text-gray-900 text-base md:text-lg">${originalTotal.toLocaleString()}</div>
                      )}
                    </div>
                    {/* ✕ 單項獨立刪除按鈕 */}
                    <button
                      type="button"
                      onClick={() => removeItem(item.productId)}
                      className="p-1 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors ml-1"
                      title="單獨移除此商品"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* 購物車底欄總計與結帳按鈕 (包含組合優惠折抵明細) */}
        {(() => {
          const originalSubtotal = cartItems.reduce((s, i) => s + (i.unitPrice * i.qty), 0);
          const totalDiscount = Math.max(0, originalSubtotal - subtotal);
          
          return (
            <div className="p-3.5 border-t border-gray-200 bg-gray-50 space-y-2.5">
              <div className="flex justify-between items-center text-gray-600 text-xs font-semibold">
                <span>品項總數</span>
                <span className="font-bold text-gray-800">{cartItems.reduce((s, i) => s + i.qty, 0)} 件</span>
              </div>

              {/* 🎉 多件組合優惠折抵提示列 */}
              {totalDiscount > 0 && (
                <div className="flex justify-between items-center text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200 text-xs font-extrabold animate-fade-in shadow-2xs">
                  <span className="flex items-center gap-1.5">
                    <Tag className="w-4 h-4 text-emerald-600" />
                    <span>🎉 組合優惠折抵</span>
                  </span>
                  <span className="font-mono text-sm font-black text-emerald-600">-${totalDiscount.toLocaleString()}</span>
                </div>
              )}

              <div className="flex justify-between items-center text-gray-900 font-black text-xl border-t border-gray-200 pt-2">
                <span>應收總計</span>
                <div className="text-right">
                  {totalDiscount > 0 && (
                    <div className="text-xs text-gray-400 font-bold line-through">${originalSubtotal.toLocaleString()}</div>
                  )}
                  <span className="text-indigo-600">${subtotal.toLocaleString()}</span>
                </div>
              </div>

              <button
                disabled={cartItems.length === 0}
                onClick={() => {
                  setReceivedAmountInput('');
                  setIsCheckoutOpen(true);
                }}
                className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 text-white font-bold text-base rounded-xl shadow-md hover:shadow-lg transition-all flex items-center justify-center space-x-2"
              >
                <DollarSign className="w-5 h-5" />
                <span>前往結帳 (${subtotal.toLocaleString()})</span>
              </button>
            </div>
          );
        })()}
      </div>

      {/* 結帳彈窗 (Checkout Modal) */}
      {isCheckoutOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-2 md:p-4">
          <div className="bg-white rounded-3xl w-full p-4 md:p-6 shadow-2xl border border-gray-100 flex flex-col md:flex-row transition-all duration-300 max-w-4xl gap-4 md:gap-6 max-h-[95vh] overflow-y-auto">
            
            {/* 左側：支付設定與電子發票 */}
            <div className="flex-1 space-y-4 flex flex-col">
              <div className="flex justify-between items-center border-b border-gray-100 pb-2.5">
                <h3 className="text-lg font-bold text-gray-800">結帳付款</h3>
                <button onClick={() => setIsCheckoutOpen(false)} className="md:hidden text-gray-400 hover:text-gray-600 text-lg">✕</button>
              </div>
            {/* 支付方式 */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">選擇支付方式</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'CASH', label: '現金', icon: DollarSign },
                  { id: 'LINE_PAY', label: 'LINE Pay', icon: CreditCard },
                  { id: 'CARD', label: '信用卡', icon: CreditCard }
                ].map(item => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setPaymentMethod(item.id)}
                      className={`p-2.5 rounded-xl border flex flex-col items-center justify-center space-y-1 font-bold text-xs transition-all ${
                        paymentMethod === item.id
                          ? 'border-indigo-600 bg-indigo-50 text-indigo-600 shadow-sm'
                          : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 發票類型 */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">電子發票設定</label>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { id: 'paper', label: '印紙本', icon: FileText },
                  { id: 'mobile', label: '刷載具', icon: Smartphone },
                  { id: 'taxId', label: '打統編', icon: Building2 },
                  { id: 'donate', label: '愛心捐贈', icon: Heart }
                ].map(item => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setInvoiceType(item.id)}
                      className={`p-2 rounded-xl border flex flex-col items-center justify-center space-y-1 font-bold text-[11px] transition-all ${
                        invoiceType === item.id
                          ? 'border-indigo-600 bg-indigo-50 text-indigo-600 shadow-sm'
                          : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* 載具輸入框 */}
              {invoiceType === 'mobile' && (
                <div className="mt-2 animate-fade-in relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Receipt className="h-4 w-4 text-gray-400" />
                  </div>
                  <input
                    type="text"
                    value={mobileCarrier}
                    onChange={(e) => setMobileCarrier(e.target.value.toUpperCase())}
                    placeholder="請刷入手機條碼 (例: /AB12345)"
                    className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-xl font-bold text-sm text-gray-900 focus:ring-2 focus:ring-indigo-500 uppercase font-mono"
                    autoFocus
                  />
                </div>
              )}

              {/* 統編輸入框 */}
              {invoiceType === 'taxId' && (
                <div className="mt-2 animate-fade-in relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Building2 className="h-4 w-4 text-gray-400" />
                  </div>
                  <input
                    type="text"
                    maxLength={8}
                    value={taxId}
                    onChange={(e) => setTaxId(e.target.value.replace(/[^0-9]/g, ''))}
                    placeholder="請輸入 8 碼統一編號"
                    className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-xl font-bold text-sm text-gray-900 focus:ring-2 focus:ring-indigo-500 font-mono"
                    autoFocus
                  />
                </div>
              )}

              {/* 捐贈碼輸入框 */}
              {invoiceType === 'donate' && (
                <div className="mt-2 animate-fade-in relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Heart className="h-4 w-4 text-gray-400" />
                  </div>
                  <input
                    type="text"
                    value={donateCode}
                    onChange={(e) => setDonateCode(e.target.value.replace(/[^0-9]/g, ''))}
                    placeholder="請輸入捐贈碼"
                    className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-xl font-bold text-sm text-gray-900 focus:ring-2 focus:ring-indigo-500 font-mono"
                    autoFocus
                  />
                </div>
              )}
            </div>

            </div>

            {/* 右側：金額輸入與數字小鍵盤 (固定顯示) */}
            <div className="flex-1 flex flex-col space-y-4 border-t md:border-t-0 md:border-l border-gray-100 pt-4 md:pt-0 md:pl-6">
              <div className="hidden md:flex justify-end border-b border-gray-100 pb-2.5">
                <button onClick={() => setIsCheckoutOpen(false)} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
              </div>

              <div className="bg-gray-50 p-4 rounded-2xl flex-1 flex flex-col space-y-3">
                <div className="flex justify-between items-center text-sm mb-3">
                  <span className="font-bold text-gray-700">找零</span>
                  <span className={`font-extrabold text-3xl ${changeAmount > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                    ${changeAmount.toLocaleString()}
                  </span>
                </div>
                
                <div className="flex justify-between items-center text-sm text-gray-600 mb-1 pt-3 border-t border-gray-200">
                  <span className="font-bold">應收金額</span>
                  <span className="font-bold text-gray-900 text-2xl">${subtotal.toLocaleString()}</span>
                </div>

                <div className="pt-3 border-t border-gray-200 space-y-2 flex-1 flex flex-col justify-end">
                  <div className="flex justify-between items-end">
                    <label className="text-sm font-semibold text-gray-500">實收金額</label>
                  </div>
                  
                  {/* 模擬輸入框 */}
                  <div className="w-full px-5 py-3 border-2 border-indigo-200 bg-white rounded-xl font-bold text-3xl text-indigo-900 text-right shadow-inner tracking-wider min-h-[56px] flex items-center justify-end">
                    {receivedAmountInput ? `$${Number(receivedAmountInput).toLocaleString()}` : '$0'}
                  </div>

                  {/* 快捷金額按鈕 */}
                  <div className="grid grid-cols-4 gap-2 pt-1">
                    {[subtotal, 100, 500, 1000].map(val => (
                      <button
                        key={val}
                        onClick={() => setReceivedAmountInput(val.toString())}
                        className="py-2.5 bg-indigo-50 border border-indigo-100 rounded-xl text-sm font-bold text-indigo-700 hover:bg-indigo-600 hover:text-white active:scale-95 transition-all shadow-sm"
                      >
                        ${val}
                      </button>
                    ))}
                  </div>

                  {/* 數字小鍵盤 (Numpad) */}
                  <div className="grid grid-cols-4 gap-2 mt-1">
                    {['1', '2', '3'].map(n => (
                      <button key={n} onClick={() => setReceivedAmountInput(prev => prev + n)} className="py-3 bg-white border border-gray-200 rounded-xl text-2xl font-bold text-gray-700 hover:bg-gray-50 active:scale-95 active:bg-gray-200 shadow-sm transition-transform">{n}</button>
                    ))}
                    <button onClick={() => setReceivedAmountInput(prev => prev.slice(0, -1))} className="py-3 bg-red-50 border border-red-100 rounded-xl flex items-center justify-center text-red-500 hover:bg-red-100 active:scale-95 transition-transform shadow-sm row-span-2">
                      <Delete size={28} />
                    </button>
                    
                    {['4', '5', '6'].map(n => (
                      <button key={n} onClick={() => setReceivedAmountInput(prev => prev + n)} className="py-3 bg-white border border-gray-200 rounded-xl text-2xl font-bold text-gray-700 hover:bg-gray-50 active:scale-95 active:bg-gray-200 shadow-sm transition-transform">{n}</button>
                    ))}
                    
                    {['7', '8', '9'].map(n => (
                      <button key={n} onClick={() => setReceivedAmountInput(prev => prev + n)} className="py-3 bg-white border border-gray-200 rounded-xl text-2xl font-bold text-gray-700 hover:bg-gray-50 active:scale-95 active:bg-gray-200 shadow-sm transition-transform">{n}</button>
                    ))}
                    <button onClick={() => setReceivedAmountInput('')} className="py-3 bg-gray-100 border border-gray-200 rounded-xl text-xl font-extrabold text-gray-600 hover:bg-gray-200 active:scale-95 transition-transform shadow-sm row-span-2">
                      C
                    </button>

                    <button onClick={() => setReceivedAmountInput(prev => prev + '0')} className="py-3 bg-white border border-gray-200 rounded-xl text-2xl font-bold text-gray-700 hover:bg-gray-50 active:scale-95 active:bg-gray-200 shadow-sm transition-transform col-span-2">0</button>
                    <button onClick={() => setReceivedAmountInput(prev => prev + '00')} className="py-3 bg-white border border-gray-200 rounded-xl text-2xl font-bold text-gray-700 hover:bg-gray-50 active:scale-95 active:bg-gray-200 shadow-sm transition-transform">00</button>
                  </div>

                </div>
              </div>

              {/* 確認結帳按鈕 */}
              <button
                disabled={submitting}
                onClick={handleCheckoutSubmit}
                className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-lg rounded-xl shadow-md transition-all flex items-center justify-center space-x-2"
              >
                {submitting ? (
                  <>
                    <RefreshCw className="w-5 h-5 animate-spin" />
                    <span>處理中...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-5 h-5" />
                    <span>確認完成結帳</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 自訂 POS 專屬特價與屬性 Modal */}
      {editingPosProduct && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 shadow-2xl border border-gray-100 flex flex-col gap-4 animate-fade-in">
            <div className="flex justify-between items-center border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                  <Settings className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 text-base">門市 POS 自訂特價與屬性</h3>
                  <p className="text-xs text-gray-500 font-medium truncate max-w-[240px]">{editingPosProduct.name}</p>
                </div>
              </div>
              <button 
                onClick={() => setEditingPosProduct(null)}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              {/* 0. 國際條碼 (共用主檔，支援多組) */}
              <div className="bg-gray-50 p-3.5 rounded-2xl border border-gray-200 space-y-2">
                <div className="flex justify-between items-center">
                  <label className="font-extrabold text-gray-800 text-xs flex items-center gap-1.5">
                    <Receipt className="w-4 h-4 text-indigo-600" />
                    <span>國際條碼 (共用主檔，支援多組)</span>
                  </label>
                  <span className="text-[10px] text-gray-400 font-bold">刷條碼快速找貨/結帳</span>
                </div>
                
                {/* 現有條碼標籤 */}
                <div className="space-y-2">
                  {Array.isArray(editingPosProduct.barcodes) && editingPosProduct.barcodes.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {editingPosProduct.barcodes.map((bc, idx) => {
                        const barcodeStr = typeof bc === 'object' ? (bc.barcode || '') : String(bc);
                        return (
                          <span key={idx} className="inline-flex items-center space-x-1 bg-white border border-gray-300 px-2.5 py-1 rounded-xl text-xs font-mono font-bold text-gray-700 shadow-2xs">
                            <span>🏷️ {barcodeStr}</span>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingPosProduct(prev => ({
                                  ...prev,
                                  barcodes: (prev.barcodes || []).filter((_, i) => i !== idx)
                                }));
                              }}
                              className="text-gray-400 hover:text-red-500 ml-1 cursor-pointer"
                              title="刪除此條碼"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-[11px] text-gray-400 italic">尚無綁定國際條碼</div>
                  )}

                  {/* 新增條碼輸入框 */}
                  <div className="flex gap-1.5 pt-1">
                    <input
                      type="text"
                      id="pos-modal-new-barcode"
                      placeholder="請掃描或輸入新國際條碼..."
                      className="flex-1 p-2 bg-white border border-gray-300 rounded-xl font-mono text-xs font-bold text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && e.target.value.trim()) {
                          e.preventDefault();
                          const val = e.target.value.trim();
                          if (!editingPosProduct.barcodes?.includes(val)) {
                            setEditingPosProduct(prev => ({
                              ...prev,
                              barcodes: [...(prev.barcodes || []), val]
                            }));
                          }
                          e.target.value = '';
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const input = document.getElementById('pos-modal-new-barcode');
                        if (input && input.value.trim()) {
                          const val = input.value.trim();
                          if (!editingPosProduct.barcodes?.includes(val)) {
                            setEditingPosProduct(prev => ({
                              ...prev,
                              barcodes: [...(prev.barcodes || []), val]
                            }));
                          }
                          input.value = '';
                        }
                      }}
                      className="px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-extrabold text-xs rounded-xl border border-indigo-200 transition-colors cursor-pointer"
                    >
                      + 新增條碼
                    </button>
                  </div>
                </div>
              </div>

              {/* 1. 門市 POS 獨立上架開關 */}
              <div className="bg-gray-50 p-3.5 rounded-2xl border border-gray-200 flex justify-between items-center">
                <div className="space-y-0.5">
                  <label className="font-extrabold text-gray-800 text-xs flex items-center gap-1.5 cursor-pointer">
                    <Store className="w-4 h-4 text-indigo-600" />
                    <span>門市 POS 獨立上架狀態</span>
                  </label>
                  <span className="text-[10px] text-gray-400 font-bold block">
                    開啟：門市 POS 展示販售；關閉：僅門市 POS 隱藏，不影響線上 Line 販售
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingPosProduct(prev => ({ ...prev, isActive: !prev.isActive }))}
                  className={`w-11 h-6 rounded-full transition-colors relative flex items-center px-0.5 cursor-pointer ${
                    editingPosProduct.isActive ? 'bg-indigo-600' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${
                      editingPosProduct.isActive ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* 2. POS 售價 */}
              <div className="bg-gray-50 p-3.5 rounded-2xl border border-gray-200 space-y-1.5">
                <label className="font-bold text-gray-700 flex items-center gap-1.5">
                  <DollarSign className="w-4 h-4 text-emerald-600" />
                  <span>POS 專屬售價</span>
                </label>
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-gray-400 text-sm">$</span>
                  <input
                    type="number"
                    className="w-full p-2.5 bg-white border border-gray-300 rounded-xl font-mono font-bold text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="請輸入單價"
                    value={editingPosProduct.single_price ?? ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      setEditingPosProduct(prev => ({
                        ...prev,
                        single_price: val,
                        price: val
                      }));
                    }}
                  />
                </div>
              </div>

              {/* 3. 捆裝設定 */}
              <div className="bg-gray-50 p-3.5 rounded-2xl border border-gray-200 space-y-2">
                <div className="flex justify-between items-center">
                  <label className="font-bold text-gray-700 flex items-center gap-1.5 cursor-pointer">
                    <Package className="w-4 h-4 text-blue-600" />
                    <span>啟用捆裝銷售 (Bundle)</span>
                  </label>
                  <input
                    type="checkbox"
                    className="w-4 h-4 accent-indigo-600 rounded cursor-pointer"
                    checked={Boolean(editingPosProduct.isBundle)}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setEditingPosProduct(prev => ({
                        ...prev,
                        isBundle: checked,
                        bundleSize: checked ? (prev.bundleSize || 2) : 1
                      }));
                    }}
                  />
                </div>

                {editingPosProduct.isBundle && (
                  <div className="flex items-center gap-2 pt-1 animate-fade-in">
                    <span className="text-gray-600 font-bold whitespace-nowrap">整組入數：</span>
                    <input
                      type="number"
                      min="2"
                      className="w-full p-2 bg-white border border-gray-300 rounded-xl font-mono font-bold text-center text-sm text-gray-800"
                      placeholder="例：4"
                      value={editingPosProduct.bundleSize ?? ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        setEditingPosProduct(prev => ({
                          ...prev,
                          bundleSize: val !== '' ? Number(val) : ''
                        }));
                      }}
                    />
                    <span className="text-gray-500 font-bold">入/組</span>
                  </div>
                )}
              </div>

              {/* 4. 多件特價設定 */}
              <div className="bg-gray-50 p-3.5 rounded-2xl border border-gray-200 space-y-2">
                <div className="flex justify-between items-center">
                  <label className="font-bold text-gray-700 flex items-center gap-1.5 cursor-pointer">
                    <Tag className="w-4 h-4 text-amber-600" />
                    <span>啟用多件特價 (滿幾件特價)</span>
                  </label>
                  <input
                    type="checkbox"
                    className="w-4 h-4 accent-indigo-600 rounded cursor-pointer"
                    checked={Boolean(editingPosProduct.has_volume_pricing)}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setEditingPosProduct(prev => ({
                        ...prev,
                        has_volume_pricing: checked
                      }));
                    }}
                  />
                </div>

                {editingPosProduct.has_volume_pricing && (
                  <div className="grid grid-cols-2 gap-2 pt-1 animate-fade-in">
                    <div>
                      <span className="text-gray-500 text-[10px] font-bold block mb-1">滿幾件享特價</span>
                      <input
                        type="number"
                        min="2"
                        className="w-full p-2 bg-white border border-gray-300 rounded-xl font-mono font-bold text-center text-sm text-gray-800"
                        placeholder="例：3"
                        value={editingPosProduct.volume_pricing_settings?.target_quantity ?? ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          setEditingPosProduct(prev => ({
                            ...prev,
                            volume_pricing_settings: {
                              ...prev.volume_pricing_settings,
                              target_quantity: val !== '' ? Number(val) : ''
                            }
                          }));
                        }}
                      />
                    </div>
                    <div>
                      <span className="text-gray-500 text-[10px] font-bold block mb-1">特價總金額 ($)</span>
                      <input
                        type="number"
                        min="1"
                        className="w-full p-2 bg-white border border-gray-300 rounded-xl font-mono font-bold text-center text-sm text-gray-800"
                        placeholder="例：55"
                        value={editingPosProduct.volume_pricing_settings?.package_price ?? ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          setEditingPosProduct(prev => ({
                            ...prev,
                            volume_pricing_settings: {
                              ...prev.volume_pricing_settings,
                              package_price: val !== '' ? Number(val) : ''
                            }
                          }));
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 儲存按鈕 */}
            <div className="flex gap-2 pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setEditingPosProduct(null)}
                className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs rounded-xl transition-colors"
              >
                取消
              </button>
              <button
                type="button"
                disabled={savingPosSettings}
                onClick={async () => {
                  setSavingPosSettings(true);
                  try {
                    const newPosSettings = {
                      isActive: editingPosProduct.isActive === true, // 門市 POS 獨立上架狀態
                      price: editingPosProduct.single_price !== '' && editingPosProduct.single_price !== null ? Number(editingPosProduct.single_price) : null,
                      isBundle: Boolean(editingPosProduct.isBundle),
                      packSize: editingPosProduct.isBundle ? Number(editingPosProduct.bundleSize || 1) : 1,
                      has_volume_pricing: Boolean(editingPosProduct.has_volume_pricing),
                      volume_pricing_settings: editingPosProduct.has_volume_pricing ? {
                        target_quantity: Number(editingPosProduct.volume_pricing_settings?.target_quantity || 0),
                        package_price: Number(editingPosProduct.volume_pricing_settings?.package_price || 0)
                      } : null
                    };

                    const updatedFields = {
                      productId: editingPosProduct.id,
                      isPosOnlyUpdate: true, // 標記此更新僅限於 POS 門市設定，絕不觸碰線上商品主檔
                      barcodes: editingPosProduct.barcodes || [], // 支援國際條碼同步更新
                      posSettings: newPosSettings
                    };

                    await callGAS(apiUrl, 'updateProductDetails', updatedFields, user.token);

                    // 靜默無感更新本地 State，防止頁面 Loading 與滾動置頂
                    setProducts(prevProducts => prevProducts.map(p => {
                      if (p.id === editingPosProduct.id) {
                        const newPrice = newPosSettings.price !== null ? newPosSettings.price : (p.single_price || p.price || 0);
                        return {
                          ...p,
                          isActive: newPosSettings.isActive,
                          barcodes: updatedFields.barcodes,
                          single_price: newPrice,
                          price: newPrice,
                          isBundle: Boolean(newPosSettings.isBundle),
                          bundleSize: newPosSettings.packSize ? Number(newPosSettings.packSize) : 1,
                          packSize: newPosSettings.packSize ? Number(newPosSettings.packSize) : 1,
                          has_volume_pricing: Boolean(newPosSettings.has_volume_pricing),
                          volume_pricing_settings: newPosSettings.volume_pricing_settings || null,
                          posSettings: newPosSettings
                        };
                      }
                      return p;
                    }));

                    setEditingPosProduct(null);
                  } catch (err) {
                    console.error('Failed to update product POS settings:', err);
                    alert('儲存失敗：' + (err.message || '請重試'));
                  } finally {
                    setSavingPosSettings(false);
                  }
                }}
                className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center justify-center space-x-1.5"
              >
                {savingPosSettings ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>儲存中...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>儲存並即時生效</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 觸控專用數字鍵盤彈窗 (Touch Numpad Modal - 相容藍芽掃碼槍) */}
      {numpadTarget && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-3xl w-full max-w-sm p-5 shadow-2xl border border-gray-100 space-y-4">
            {/* 標頭 */}
            <div className="flex justify-between items-center border-b border-gray-100 pb-3">
              <div>
                <h3 className="font-extrabold text-gray-900 text-base truncate max-w-[220px]">{numpadTarget.productName}</h3>
                <span className="text-xs text-gray-400 font-bold">修改購買數量</span>
              </div>
              <button 
                type="button"
                onClick={() => setNumpadTarget(null)} 
                className="p-1.5 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* 螢幕顯示輸入區域 (亮色極簡高對比風格) */}
            <div className="bg-indigo-50/90 border-2 border-indigo-200 text-indigo-950 rounded-2xl p-4 text-right font-mono shadow-inner">
              <div className="text-xs text-indigo-600 font-extrabold mb-1">預計修改數量</div>
              <div className="text-4xl font-black text-indigo-700 tracking-wider">
                {numpadValue || '0'} <span className="text-sm text-indigo-500 font-sans">件</span>
              </div>
            </div>

            {/* 常用數量快選按鈕 (一鍵加量) */}
            <div className="grid grid-cols-4 gap-1.5">
              {[1, 5, 10, 20].map(add => (
                <button
                  key={add}
                  type="button"
                  onClick={() => {
                    const curr = parseInt(numpadValue || '0', 10);
                    setNumpadValue(String(curr + add));
                    setIsFirstKey(false);
                  }}
                  className="py-2.5 bg-indigo-100 hover:bg-indigo-200 text-indigo-800 font-extrabold text-xs rounded-xl transition-colors active:scale-95 border border-indigo-200"
                >
                  +{add}
                </button>
              ))}
            </div>

            {/* 大字體九宮格觸控數字鍵盤 (按第一個數字鍵直接覆蓋取代) */}
            <div className="grid grid-cols-3 gap-2">
              {['1','2','3','4','5','6','7','8','9','C','0','⌫'].map(btn => (
                <button
                  key={btn}
                  type="button"
                  onClick={() => {
                    if (btn === 'C') {
                      setNumpadValue('');
                      setIsFirstKey(true);
                    } else if (btn === '⌫') {
                      setNumpadValue(prev => {
                        const nextVal = prev.slice(0, -1);
                        if (nextVal.length === 0) setIsFirstKey(true);
                        return nextVal;
                      });
                    } else {
                      if (isFirstKey) {
                        setNumpadValue(btn);
                        setIsFirstKey(false);
                      } else {
                        setNumpadValue(prev => (prev === '0' ? btn : prev + btn));
                      }
                    }
                  }}
                  className={`py-3.5 rounded-2xl font-black text-xl transition-all active:scale-95 shadow-2xs border ${
                    btn === 'C' ? 'bg-amber-100 border-amber-200 text-amber-800 hover:bg-amber-200' :
                    btn === '⌫' ? 'bg-red-100 border-red-200 text-red-700 hover:bg-red-200' :
                    'bg-gray-50 border-gray-200 text-gray-800 hover:bg-gray-100'
                  }`}
                >
                  {btn}
                </button>
              ))}
            </div>

            {/* 操作按鈕 */}
            <div className="flex gap-2 pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setNumpadTarget(null)}
                className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-sm rounded-xl transition-colors"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => {
                  const finalQty = parseInt(numpadValue || '1', 10);
                  if (finalQty > 0) {
                    updateQty(numpadTarget.productId, finalQty);
                  } else {
                    removeItem(numpadTarget.productId);
                  }
                  setNumpadTarget(null);
                }}
                className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-xl shadow-md transition-all active:scale-98"
              >
                確認修改
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 暫存掛單彈窗 (Hold Cart Modal) */}
      {isHoldModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-3xl w-full max-w-sm p-5 shadow-2xl border border-gray-100 flex flex-col gap-4">
            <div className="flex justify-between items-center border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
                  <PauseCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 text-base">暫存掛單 (Hold Cart)</h3>
                  <p className="text-xs text-gray-400 font-medium">暫存當前購物車，先服務後方排隊顧客</p>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => setIsHoldModalOpen(false)} 
                className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">顧客識別 / 備註標籤 (可自訂)</label>
                <input
                  type="text"
                  className="w-full p-2.5 bg-gray-50 border border-gray-300 rounded-xl font-bold text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  placeholder="例：戴帽子的先生 / 夾克客人"
                  value={holdNoteInput}
                  onChange={(e) => setHoldNoteInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleHoldCart();
                  }}
                  autoFocus
                />
              </div>

              <div className="bg-amber-50 p-3 rounded-2xl border border-amber-200 space-y-1">
                <div className="font-extrabold text-amber-900 text-xs">當前暫存清單摘要：</div>
                <div className="text-amber-800 font-bold">共 {cartItems.length} 項商品 / 總金額 ${subtotal.toLocaleString()}</div>
              </div>
            </div>

            <div className="flex gap-2 pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setIsHoldModalOpen(false)}
                className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs rounded-xl transition-colors"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleHoldCart}
                className="flex-1 py-3 bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-xs rounded-xl shadow-md transition-all flex items-center justify-center space-x-1.5 cursor-pointer active:scale-98"
              >
                <PauseCircle className="w-4 h-4" />
                <span>確認暫存掛單</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 暫存取單列表彈窗 (Resume Cart Modal) */}
      {isResumeModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-3xl w-full max-w-lg p-6 shadow-2xl border border-gray-100 flex flex-col gap-4 max-h-[85vh]">
            <div className="flex justify-between items-center border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                  <PlayCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 text-base">暫存掛單清單 ({heldCarts.length})</h3>
                  <p className="text-xs text-gray-400 font-medium">點擊「恢復此單結帳」即可一鍵還原顧客購物車</p>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => setIsResumeModalOpen(false)} 
                className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {heldCarts.length === 0 ? (
                <div className="py-12 flex flex-col items-center justify-center text-gray-400 space-y-2">
                  <Clock className="w-12 h-12 stroke-[1.5]" />
                  <p className="text-sm font-bold">目前尚無暫存中的掛單</p>
                </div>
              ) : (
                heldCarts.map((hc) => (
                  <div key={hc.id} className="p-4 bg-gray-50 border border-gray-200 rounded-2xl flex flex-col gap-2.5 hover:border-indigo-300 transition-colors">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center space-x-2">
                        <span className="px-2.5 py-0.5 bg-amber-100 text-amber-900 font-extrabold text-xs rounded-lg border border-amber-200">
                          🏷️ {hc.note}
                        </span>
                        <span className="text-xs text-gray-400 font-mono flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          {hc.createdAt}
                        </span>
                      </div>
                      <span className="font-black text-indigo-600 text-base">
                        ${hc.subtotal?.toLocaleString()}
                      </span>
                    </div>

                    {/* 明細簡覽 */}
                    <div className="bg-white p-2.5 rounded-xl border border-gray-200 text-xs text-gray-700 space-y-1 max-h-28 overflow-y-auto">
                      {hc.items.map((item, idx) => (
                        <div key={idx} className="flex justify-between font-medium">
                          <span className="truncate max-w-[260px]">• {item.productName}</span>
                          <span className="font-mono font-extrabold text-gray-500">x{item.qty}</span>
                        </div>
                      ))}
                    </div>

                    {/* 操作按鈕組 */}
                    <div className="flex gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => handleDeleteHeldCart(hc.id)}
                        className="px-3.5 py-2 bg-gray-100 hover:bg-red-50 hover:text-red-600 text-gray-500 text-xs font-bold rounded-xl transition-colors flex items-center space-x-1 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>廢棄</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleResumeCart(hc)}
                        className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold rounded-xl shadow-xs transition-all flex items-center justify-center space-x-1.5 cursor-pointer active:scale-98"
                      >
                        <PlayCircle className="w-4 h-4" />
                        <span>恢復此單結帳</span>
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
