export interface CartItemInput {
  productId: string;
  productName: string;
  unitPrice: number;
  qty: number;
  discountAmount?: number;
  has_volume_pricing?: boolean;
  volume_pricing_settings?: {
    target_quantity?: number;
    package_price?: number;
  } | null;
}

export interface CalculationResult {
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  serviceCharge: number;
  rounding: number;
  grandTotal: number;
  changeAmount: number;
}

/**
 * 計算單一商品的組合/捆綁/多件優惠價
 * 例如：單價 100，買 3 件特價 250。若買 7 件 = 2組(500) + 零散1件(100) = 600
 */
export function calculateItemSubtotal(item: CartItemInput): number {
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
  return singlePrice * qty;
}

export const PricingService = {
  /**
   * 計算購物車與訂單金額的中樞服務 (含多件/組合價自動計算)
   */
  calculate(params: {
    items: CartItemInput[];
    promotionDiscount?: number;
    taxRate?: number;
    serviceChargeRate?: number;
    receivedAmount?: number;
  }): CalculationResult {
    const {
      items,
      promotionDiscount = 0,
      taxRate = 0,
      serviceChargeRate = 0,
      receivedAmount = 0
    } = params;

    // 1. 小計 (自動計算多件/組合折扣價)
    const subtotal = items.reduce((sum, item) => {
      return sum + calculateItemSubtotal(item);
    }, 0);

    // 2. 折扣（來自個項目手動折扣 + 全域促銷折扣）
    const itemDiscounts = items.reduce((sum, item) => sum + Number(item.discountAmount || 0), 0);
    const discountAmount = itemDiscounts + Number(promotionDiscount || 0);

    // 3. 折扣後金額
    const afterDiscount = Math.max(0, subtotal - discountAmount);

    // 4. 稅額與服務費
    const taxAmount = Math.round(afterDiscount * taxRate);
    const serviceCharge = Math.round(afterDiscount * serviceChargeRate);

    // 5. 總計與四捨五入
    const rawTotal = afterDiscount + taxAmount + serviceCharge;
    const grandTotal = Math.round(rawTotal);
    const rounding = grandTotal - rawTotal;

    // 6. 找零
    const changeAmount = receivedAmount > 0 ? Math.max(0, receivedAmount - grandTotal) : 0;

    return {
      subtotal,
      discountAmount,
      taxAmount,
      serviceCharge,
      rounding,
      grandTotal,
      changeAmount
    };
  }
};
