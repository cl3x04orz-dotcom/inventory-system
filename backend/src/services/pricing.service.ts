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
    tiers?: Array<{ target_quantity?: number; package_price?: number }>;
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

export function getVolumeTiers(settings: any): Array<{ target_quantity: number; package_price: number }> {
  if (!settings) return [];
  let tiers: Array<{ target_quantity: number; package_price: number }> = [];
  if (Array.isArray(settings.tiers) && settings.tiers.length > 0) {
    tiers = settings.tiers
      .map((t: any) => ({ target_quantity: Number(t.target_quantity || 0), package_price: Number(t.package_price || 0) }))
      .filter((t: any) => t.target_quantity > 0 && t.package_price > 0);
  } else if (Number(settings.target_quantity) > 0 && Number(settings.package_price) > 0) {
    tiers = [{ target_quantity: Number(settings.target_quantity), package_price: Number(settings.package_price) }];
  }
  return tiers.sort((a, b) => b.target_quantity - a.target_quantity);
}

/**
 * 計算單一商品的組合/捆綁/多件優惠價 (支援多階梯貪婪折抵)
 */
export function calculateItemSubtotal(item: CartItemInput): number {
  const qty = Number(item.qty || 0);
  const singlePrice = Number(item.unitPrice || 0);
  const settings = item.volume_pricing_settings;

  if (item.has_volume_pricing && settings) {
    const tiers = getVolumeTiers(settings);
    if (tiers.length > 0 && qty > 0) {
      let remaining = qty;
      let total = 0;
      for (const tier of tiers) {
        if (remaining >= tier.target_quantity) {
          const count = Math.floor(remaining / tier.target_quantity);
          total += count * tier.package_price;
          remaining %= tier.target_quantity;
        }
      }
      total += remaining * singlePrice;
      return total;
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
