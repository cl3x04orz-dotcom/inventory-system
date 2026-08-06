import { useState, useCallback } from 'react';

/**
 * 門市 POS 獨立購物車 Hook (支援多件組合價與捆裝規格)
 */
export function useCart(storeCode = 'MILI001', terminalId = 'POS01') {
  const [cartItems, setCartItems] = useState([]);

  /**
   * 加入商品至購物車 (若已存在則數量 +1)
   */
  const addItem = useCallback((product) => {
    const retailPrice = Number(product.single_price || product.singlePrice || product.price || product.defaultPrice || 0);
    const costPrice = Number(product.price || product.defaultPrice || 0);

    const isBundle = Boolean(product.isBundle);
    const bundleSize = Number(product.bundleSize || 1);
    const addQty = isBundle ? bundleSize : 1;

    // POS 捆裝的價格是「整組」的價格，因此單價要除以數量 (與線上邏輯一致)
    const unitPrice = (isBundle && bundleSize > 0) ? (retailPrice / bundleSize) : retailPrice;

    setCartItems(prev => {
      const pId = product.productId || product.id;
      const existingIndex = prev.findIndex(item => item.productId === pId);
      if (existingIndex > -1) {
        const updated = [...prev];
        updated[existingIndex] = {
          ...updated[existingIndex],
          qty: updated[existingIndex].qty + addQty
        };
        return updated;
      }

      return [...prev, {
        productId: pId,
        productName: product.productName || product.name || pId,
        unitPrice: unitPrice,
        unitCost: costPrice,
        qty: addQty,
        discountAmount: 0,
        capacity: product.capacity || '',
        category: product.category || '',
        has_volume_pricing: Boolean(product.has_volume_pricing || product.hasVolumePricing),
        volume_pricing_settings: product.volume_pricing_settings || product.volumePricingSettings || null,
        isBundle: Boolean(product.isBundle),
        bundleSize: Number(product.bundleSize || 1),
        bundleSize: Number(product.bundleSize || 1)
      }];
    });
  }, []);

  /**
   * 更新商品數量
   */
  const updateQty = useCallback((productId, qty) => {
    if (qty <= 0) {
      setCartItems(prev => prev.filter(item => item.productId !== productId));
      return;
    }
    setCartItems(prev => prev.map(item =>
      item.productId === productId ? { ...item, qty } : item
    ));
  }, []);

  /**
   * 移除單一商品
   */
  const removeItem = useCallback((productId) => {
    setCartItems(prev => prev.filter(item => item.productId !== productId));
  }, []);

  /**
   * 清空購物車
   */
  const clear = useCallback(() => {
    setCartItems([]);
  }, []);

  /**
   * 批次替換購物車內容 (全車還原/暫存取單專用)
   */
  const replaceCart = useCallback((newItems) => {
    setCartItems(Array.isArray(newItems) ? newItems : []);
  }, []);

  return {
    cartItems,
    addItem,
    updateQty,
    removeItem,
    clear,
    replaceCart,
    setCartItems,
    storeCode,
    terminalId
  };
}
