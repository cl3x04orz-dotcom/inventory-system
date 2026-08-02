import React, { useState, useEffect, useRef, useMemo } from 'react';
import { callGAS } from '../utils/api';
import { useCart } from '../hooks/useCart';
import { POSReceiptPrint } from '../components/POSReceiptPrint';
import { 
  ShoppingCart, Trash2, Plus, Minus, CreditCard, DollarSign, 
  Search, RefreshCw, CheckCircle, Package, Tag, Layers,
  FileText, Smartphone, Building2, Heart, Receipt, Delete
} from 'lucide-react';

/**
 * 前端計算單項商品的組合/多件優惠價
 */
function getItemSubtotal(item) {
  const qty = Number(item.qty || 0);
  const singlePrice = Number(item.unitPrice || 0);
  const settings = item.volume_pricing_settings;

  if (item.has_volume_pricing && settings) {
    const targetQty = Number(settings.target_quantity) || 0;
    const packagePrice = Number(settings.package_price) || 0;
    if (targetQty > 0 && packagePrice > 0) {
      const groupCount = Math.floor(qty / targetQty);
      const remainderCount = qty % targetQty;
      return (groupCount * packagePrice) + (remainderCount * singlePrice);
    }
  }
  return (singlePrice * qty) - (item.discountAmount || 0);
}

export default function POSPage({ user, apiUrl }) {
  const { cartItems, addItem, updateQty, removeItem, clear } = useCart();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Checkout Modal State
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [receivedAmountInput, setReceivedAmountInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [lastReceipt, setLastReceipt] = useState(null);

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
          const pos = p.posSettings || {};
          return {
            ...p,
            isActive: pos.isActive !== undefined ? pos.isActive : p.isActive,
            single_price: pos.price !== undefined && pos.price !== null ? pos.price : p.single_price,
            price: pos.price !== undefined && pos.price !== null ? pos.price : p.price,
            isBundle: pos.isBundle !== undefined ? pos.isBundle : p.isBundle,
            packSize: pos.packSize !== undefined && pos.packSize !== null ? pos.packSize : p.packSize,
            sortWeight: pos.sortWeight !== undefined && pos.sortWeight !== null ? pos.sortWeight : p.sortWeight,
            has_flavor_attributes: pos.has_flavor_attributes !== undefined ? pos.has_flavor_attributes : p.has_flavor_attributes,
            flavor_choices: pos.flavor_choices !== undefined ? pos.flavor_choices : p.flavor_choices,
            maxTotalQty: pos.maxTotalQty !== undefined ? pos.maxTotalQty : p.maxTotalQty,
            has_volume_pricing: pos.has_volume_pricing !== undefined ? pos.has_volume_pricing : p.has_volume_pricing,
            volume_pricing_settings: pos.volume_pricing_settings !== undefined ? pos.volume_pricing_settings : p.volume_pricing_settings,
          };
        }).filter(p => p.isActive !== false);

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
      return matchCat && matchSearch;
    });
  }, [products, selectedCategory, searchQuery]);

  // Helper to add normalized product to cart
  const handleAddToCart = (product) => {
    const normalizedProduct = {
      productId: product.id || product.productId,
      productName: product.name || product.productName || product.id,
      single_price: Number(product.single_price || product.singlePrice || product.price || product.defaultPrice || 0),
      cost: Number(product.price || product.defaultPrice || 0),
      capacity: product.capacity || '',
      category: product.category || '',
      has_volume_pricing: Boolean(product.has_volume_pricing || product.hasVolumePricing),
      volume_pricing_settings: product.volume_pricing_settings || product.volumePricingSettings || null,
      isBundle: Boolean(product.isBundle),
      bundleSize: Number(product.bundleSize || 1),
      packSize: Number(product.packSize || 1)
    };
    addItem(normalizedProduct);
  };

  // Totals Calculation
  const subtotal = useMemo(() => {
    return cartItems.reduce((sum, item) => sum + getItemSubtotal(item), 0);
  }, [cartItems]);

  const receivedAmount = Number(receivedAmountInput) || 0;
  const changeAmount = Math.max(0, receivedAmount - subtotal);

  // Barcode Scanner Global Keyboard Listener
  const barcodeBuffer = useRef('');
  const lastKeyTime = useRef(0);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (document.activeElement?.tagName === 'INPUT') return;

      const currentTime = Date.now();
      if (currentTime - lastKeyTime.current > 100) {
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
            (p.barcodes && p.barcodes.some(b => b.barcode === scanned))
          );
          if (match) {
            handleAddToCart(match);
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
    <div className="flex h-[calc(100vh-76px)] bg-gray-100 overflow-hidden font-sans">
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

        {/* 商品大卡片列表 */}
        <div className="flex-1 overflow-y-auto p-3">
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
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2.5">
              {filteredProducts.map((product) => {
                const pName = product.name || product.productName || product.id;
                const pId = product.id || product.productId;
                const price = Number(product.single_price || product.singlePrice || product.price || product.defaultPrice || 0);

                // 捆裝與多件特價
                const isBundle = Boolean(product.isBundle);
                const bundleSize = Number(product.packSize || 1);

                const hasVolume = Boolean(product.has_volume_pricing || product.hasVolumePricing);
                const volumeSettings = product.volume_pricing_settings || product.volumePricingSettings;
                const bundleText = (hasVolume && volumeSettings?.target_quantity && volumeSettings?.package_price)
                  ? `${volumeSettings.target_quantity}件$${volumeSettings.package_price}`
                  : null;

                return (
                  <button
                    key={pId}
                    onClick={() => handleAddToCart(product)}
                    className="bg-white p-3 rounded-xl border border-gray-200 hover:border-indigo-500 hover:shadow-md transition-all text-left flex flex-col justify-between h-32 group relative overflow-hidden active:scale-95"
                  >
                    <div className="space-y-1">
                      <div className="font-bold text-gray-800 text-xs line-clamp-2 leading-snug group-hover:text-indigo-600">
                        {pName}
                      </div>
                      <div className="text-[10px] text-gray-400 font-medium">
                        {isBundle ? `1組(${bundleSize}入)` : (product.capacity || '')}
                      </div>
                    </div>

                    <div>
                      {/* 標籤顯示 */}
                      <div className="flex flex-wrap gap-1 mb-1">
                        {isBundle && (
                          <span className="inline-flex items-center space-x-0.5 text-[10px] bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded font-bold border border-indigo-200">
                            <Layers className="w-2.5 h-2.5" />
                            <span>捆裝{bundleSize}入</span>
                          </span>
                        )}
                        {bundleText && (
                          <span className="inline-flex items-center space-x-0.5 text-[10px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded font-bold border border-amber-200">
                            <Tag className="w-2.5 h-2.5" />
                            <span>{bundleText}</span>
                          </span>
                        )}
                      </div>

                      <div className="flex justify-between items-end border-t border-gray-100 pt-1">
                        <span className="font-extrabold text-indigo-600 text-sm">
                          ${price.toLocaleString()}{isBundle ? '/組' : ''}
                        </span>
                        <span className="w-5 h-5 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                          <Plus className="w-3.5 h-3.5" />
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 右側：購物車與結帳區 (360px / 400px 固定寬度) */}
      <div className="w-[360px] lg:w-[400px] bg-white border-l border-gray-200 flex flex-col h-full shadow-lg z-10 shrink-0">
        {/* 購物車標頭 */}
        <div className="p-3.5 border-b border-gray-200 flex justify-between items-center bg-gray-50">
          <div className="flex items-center space-x-2 text-gray-800 font-bold text-base">
            <ShoppingCart className="w-5 h-5 text-indigo-600" />
            <span>當前購物車 ({cartItems.length})</span>
          </div>
          {cartItems.length > 0 && (
            <button 
              onClick={clear}
              className="text-xs text-red-500 hover:text-red-700 flex items-center space-x-1"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>清空</span>
            </button>
          )}
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
              const itemTotal = getItemSubtotal(item);
              const originalTotal = item.unitPrice * item.qty;
              const hasBundleDiscount = originalTotal > itemTotal;

              return (
                <div key={item.productId} className="flex items-center justify-between p-2.5 bg-gray-50 rounded-xl border border-gray-200 hover:border-indigo-300 transition-colors">
                  <div className="flex-1 min-w-0 pr-2">
                    <div className="flex items-center space-x-1 flex-wrap gap-y-1">
                      <h4 className="font-bold text-gray-800 text-sm truncate">{item.productName}</h4>
                      {item.isBundle && (
                        <span className="bg-indigo-100 text-indigo-700 text-[10px] px-1.5 py-0.5 rounded font-bold whitespace-nowrap">
                          捆裝{item.packSize}入
                        </span>
                      )}
                      {hasBundleDiscount && (
                        <span className="bg-amber-100 text-amber-700 text-[10px] px-1.5 py-0.5 rounded font-bold whitespace-nowrap">
                          多件特價
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      ${item.isBundle ? (item.unitPrice * item.packSize).toLocaleString() : item.unitPrice.toLocaleString()} {item.isBundle ? `/組(${item.packSize}入)` : (item.capacity ? `• ${item.capacity}` : '')}
                    </div>
                  </div>

                  {/* 數量調整與小計 */}
                  <div className="flex items-center space-x-1.5">
                    <div className="flex items-center border border-gray-300 rounded-lg bg-white overflow-hidden">
                      <button 
                        onClick={() => updateQty(item.productId, item.qty - 1)}
                        className="p-1 hover:bg-gray-100 text-gray-600"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="px-2 text-xs font-bold text-gray-800 min-w-[1.2rem] text-center">{item.qty}</span>
                      <button 
                        onClick={() => updateQty(item.productId, item.qty + 1)}
                        className="p-1 hover:bg-gray-100 text-gray-600"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="min-w-[3.5rem] text-right">
                      {hasBundleDiscount && (
                        <div className="text-[10px] text-gray-400 line-through">${originalTotal}</div>
                      )}
                      <span className="font-extrabold text-gray-900 text-sm">
                        ${itemTotal.toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* 購物車底欄總計與結帳按鈕 */}
        <div className="p-3.5 border-t border-gray-200 bg-gray-50 space-y-2.5">
          <div className="flex justify-between items-center text-gray-600 text-xs">
            <span>品項總數</span>
            <span className="font-bold text-gray-800">{cartItems.reduce((s, i) => s + i.qty, 0)} 件</span>
          </div>
          <div className="flex justify-between items-center text-gray-900 font-black text-xl border-t border-gray-200 pt-2">
            <span>應收總計</span>
            <span className="text-indigo-600">${subtotal.toLocaleString()}</span>
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
    </div>
  );
}
