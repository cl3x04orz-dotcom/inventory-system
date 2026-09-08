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

export function getVolumeTiers(rawSettings: any): Array<{ target_quantity: number; package_price: number }> {
  if (!rawSettings) return [];
  let settings = rawSettings;
  if (typeof settings === 'string') {
    try {
      settings = JSON.parse(settings);
    } catch (e) {}
  }
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

/**
 * 計算購物車小計 (同商品優先自組整組，剩餘散件跨商品混搭多件特價)
 */
export function calculateMixAndMatchCartSubtotal(items: CartItemInput[]): number {
  if (!Array.isArray(items) || items.length === 0) return 0;

  const groups: Record<string, { unitPrice: number; tiers: Array<{ target_quantity: number; package_price: number }>; items: CartItemInput[] }> = {};
  let nonVolumeSum = 0;

  items.forEach(item => {
    const qty = Number(item.qty || 0);
    const unitPrice = Number(item.unitPrice || 0);
    if (qty <= 0) return;

    if (item.has_volume_pricing && item.volume_pricing_settings) {
      const tiers = getVolumeTiers(item.volume_pricing_settings);
      if (tiers.length > 0) {
        const sig = JSON.stringify(tiers);
        const groupKey = `${unitPrice}_${sig}`;
        if (!groups[groupKey]) {
          groups[groupKey] = { unitPrice, tiers, items: [] };
        }
        groups[groupKey].items.push(item);
        return;
      }
    }
    nonVolumeSum += qty * unitPrice;
  });

  let volumeGroupsSum = 0;

  Object.values(groups).forEach(group => {
    let groupLeftoverQty = 0;

    // 1. 同商品優先自組整組
    group.items.forEach(item => {
      let rem = Number(item.qty || 0);
      for (const tier of group.tiers) {
        if (rem >= tier.target_quantity) {
          const count = Math.floor(rem / tier.target_quantity);
          volumeGroupsSum += count * tier.package_price;
          rem %= tier.target_quantity;
        }
      }
      groupLeftoverQty += rem;
    });

    // 2. 剩餘散件跨商品混搭
    let remLeftover = groupLeftoverQty;
    for (const tier of group.tiers) {
      if (remLeftover >= tier.target_quantity) {
        const count = Math.floor(remLeftover / tier.target_quantity);
        volumeGroupsSum += count * tier.package_price;
        remLeftover %= tier.target_quantity;
      }
    }
    volumeGroupsSum += remLeftover * group.unitPrice;
  });

  return nonVolumeSum + volumeGroupsSum;
}

export interface LineItemDiscountResult {
  discountedTotal: number;
  savings: number;
}

/**
 * 精確計算購物車中各單項商品分配到的小計與折抵金額 
 * (同商品優先自組整組，剩餘散件跨商品混搭多件特價)
 */
export function calculateItemDiscountedInfos(items: CartItemInput[]): Map<string, LineItemDiscountResult> {
  const resultMap = new Map<string, LineItemDiscountResult>();
  if (!Array.isArray(items) || items.length === 0) return resultMap;

  const groups: Record<string, {
    unitPrice: number;
    tiers: Array<{ target_quantity: number; package_price: number }>;
    items: CartItemInput[];
  }> = {};

  items.forEach(item => {
    const qty = Number(item.qty || 0);
    const unitPrice = Number(item.unitPrice || 0);
    const originalTotal = qty * unitPrice;

    if (qty <= 0) {
      resultMap.set(item.productId, { discountedTotal: 0, savings: 0 });
      return;
    }

    if (!item.has_volume_pricing || !item.volume_pricing_settings) {
      const finalTotal = Math.max(0, originalTotal - (item.discountAmount || 0));
      resultMap.set(item.productId, { discountedTotal: finalTotal, savings: item.discountAmount || 0 });
      return;
    }

    const tiers = getVolumeTiers(item.volume_pricing_settings);
    if (tiers.length === 0) {
      const finalTotal = Math.max(0, originalTotal - (item.discountAmount || 0));
      resultMap.set(item.productId, { discountedTotal: finalTotal, savings: item.discountAmount || 0 });
      return;
    }

    const sig = JSON.stringify(tiers);
    const groupKey = `${unitPrice}_${sig}`;
    if (!groups[groupKey]) {
      groups[groupKey] = { unitPrice, tiers, items: [] };
    }
    groups[groupKey].items.push(item);
  });

  Object.values(groups).forEach(group => {
    let groupLeftoverQtySum = 0;

    const itemStats = group.items.map(gi => {
      const gQty = Number(gi.qty || 0);
      let rem = gQty;
      let selfSubtotal = 0;
      let selfBundledQty = 0;

      for (const tier of group.tiers) {
        if (rem >= tier.target_quantity) {
          const count = Math.floor(rem / tier.target_quantity);
          selfSubtotal += count * tier.package_price;
          selfBundledQty += count * tier.target_quantity;
          rem %= tier.target_quantity;
        }
      }

      groupLeftoverQtySum += rem;

      return {
        item: gi,
        qty: gQty,
        selfSubtotal,
        selfBundledQty,
        leftoverQty: rem
      };
    });

    const leftoverOriginalTotal = groupLeftoverQtySum * group.unitPrice;
    let remLeftover = groupLeftoverQtySum;
    let leftoverSubtotal = 0;

    for (const tier of group.tiers) {
      if (remLeftover >= tier.target_quantity) {
        const count = Math.floor(remLeftover / tier.target_quantity);
        leftoverSubtotal += count * tier.package_price;
        remLeftover %= tier.target_quantity;
      }
    }
    leftoverSubtotal += remLeftover * group.unitPrice;
    const leftoverSavings = leftoverOriginalTotal - leftoverSubtotal;

    itemStats.forEach(stat => {
      const originalTotal = stat.qty * group.unitPrice;
      let myLeftoverSavings = 0;

      if (leftoverSavings > 0 && leftoverOriginalTotal > 0) {
        myLeftoverSavings = ((stat.leftoverQty * group.unitPrice) / leftoverOriginalTotal) * leftoverSavings;
      }

      const myLeftoverSubtotal = Math.max(0, (stat.leftoverQty * group.unitPrice) - myLeftoverSavings);
      const rawDiscountedTotal = stat.selfSubtotal + myLeftoverSubtotal - (stat.item.discountAmount || 0);
      const discountedTotal = Math.max(0, rawDiscountedTotal);
      const totalSavings = originalTotal - discountedTotal;

      resultMap.set(stat.item.productId, {
        discountedTotal,
        savings: Math.max(0, totalSavings)
      });
    });
  });

  return resultMap;
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

    // 1. 小計 (自動計算同單價同門檻跨商品多件/組合折扣價)
    const subtotal = calculateMixAndMatchCartSubtotal(items);

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
