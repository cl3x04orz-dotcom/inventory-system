import { prisma } from '../database/context.js';

function formatExpiryDate(val: string | null | undefined): string {
  if (!val) return '';
  const trimmed = val.trim();
  if (!trimmed) return '';

  // 檢查是否為 Excel 日期序號
  if (/^\d+$/.test(trimmed)) {
    const serial = Number(trimmed);
    const date = new Date((serial - 25569) * 86400 * 1000);
    if (!isNaN(date.getTime())) {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
  }

  // 檢查是否為 ISO 時間格式字串，精簡為 YYYY-MM-DD
  const parsedDate = new Date(trimmed);
  if (!isNaN(parsedDate.getTime()) && trimmed.includes('-')) {
    const y = parsedDate.getFullYear();
    const m = String(parsedDate.getMonth() + 1).padStart(2, '0');
    const d = String(parsedDate.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  return trimmed;
}

export const ProductService = {
  async getProducts(payload: any = {}) {
    const { activeOnly, purchasableOnly } = payload;
    const whereClause: any = {};
    if (activeOnly) {
      whereClause.isActive = true;
    }
    if (purchasableOnly) {
      whereClause.isPurchasable = true;
    }

    // 1. Fetch products sorted by sortWeight
    const products = await prisma.product.findMany({
      where: whereClause,
      orderBy: { sortWeight: 'asc' }
    });

    // 2. Perform GroupBy on Inventory to calculate stock levels
    const stockAgg = await prisma.inventory.groupBy({
      by: ['productId', 'type'],
      _sum: {
        quantity: true
      }
    });

    const stockMap: Record<string, { stock: number; originalStock: number }> = {};
    stockAgg.forEach(item => {
      const pid = item.productId;
      if (!stockMap[pid]) {
        stockMap[pid] = { stock: 0, originalStock: 0 };
      }
      const qty = item._sum.quantity || 0;
      if (item.type === 'STOCK') {
        stockMap[pid].stock += qty;
      } else if (item.type === 'ORIGINAL') {
        stockMap[pid].originalStock += qty;
      }
    });

    // 3. Construct product output list matching the React expected format
    return products.map(p => {
      const stockInfo = stockMap[p.productId] || { stock: 0, originalStock: 0 };
      
      let flavorChoices: string[] = [];
      if (Array.isArray(p.flavorChoices)) {
        flavorChoices = p.flavorChoices as string[];
      } else if (typeof p.flavorChoices === 'string') {
        try {
          flavorChoices = JSON.parse(p.flavorChoices);
        } catch {
          flavorChoices = [];
        }
      }

      return {
        id: p.productId,
        name: p.productName,
        price: Number(p.defaultPrice),
        packSize: Number(p.packSize || 1),
        dispatchSteps: p.dispatchSteps,
        roundThreshold: p.roundThreshold !== null && p.roundThreshold !== undefined ? Number(p.roundThreshold) : null,
        autoSuppress: Boolean(p.autoSuppress),
        maxSuggestion: Number(p.maxSuggestion || 0),
        stock: stockInfo.stock,
        originalStock: stockInfo.originalStock,
        isActive: p.isActive,
        imageUrl: p.imageUrl || '',
        expiryDate: formatExpiryDate(p.expiryDate),
        category: p.category || '',
        has_flavor_attributes: p.hasFlavorAttributes,
        flavor_choices: flavorChoices,
        single_price: Number(p.singlePrice),
        has_volume_pricing: p.hasVolumePricing,
        volume_pricing_settings: p.volumePricingSettings,
        sortWeight: p.sortWeight,
        isBundle: Boolean(p.isBundle),
        bundleSize: Number(p.bundleSize || 1),
        maxTotalQty: p.maxTotalQty !== null && p.maxTotalQty !== undefined ? Number(p.maxTotalQty) : null,
        soldQty: Number(p.soldQty || 0),
        allowedCommunityIds: Array.isArray(p.allowedCommunityIds) ? p.allowedCommunityIds : [],
        isPurchasable: p.isPurchasable !== false, // 進貨清單顯示，與前台上架無關
        _fromSheet: 'Products'
      };
    });
  },

  async getProductStock(productId: string) {
    if (!productId) throw new Error('缺少 productId');
    const p = await prisma.product.findUnique({
      where: { productId: String(productId).trim() },
      select: { productId: true, productName: true, maxTotalQty: true, soldQty: true }
    });
    if (!p) throw new Error('商品不存在');

    const maxTotalQty = p.maxTotalQty !== null && p.maxTotalQty !== undefined ? Number(p.maxTotalQty) : null;
    const soldQty = Number(p.soldQty || 0);
    const remaining = maxTotalQty === null ? null : Math.max(0, maxTotalQty - soldQty);

    return {
      productId: p.productId,
      remaining,
      soldQty,
      maxTotalQty
    };
  },

  async updateProductSortOrder(payload: any) {
    const { productIds } = payload;
    if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
      return { error: 'Invalid productIds' };
    }

    // Build batch VALUES clause for raw SQL to complete in one query
    const valuesClause = productIds.map((id, index) => {
      const weight = (index + 1) * 10;
      return `('${String(id).replace(/'/g, "''")}', ${weight})`;
    }).join(', ');

    await prisma.$executeRawUnsafe(`
      UPDATE "Product" AS p
      SET "sortWeight" = temp.weight
      FROM (VALUES ${valuesClause}) AS temp(id, weight)
      WHERE p."productId" = temp.id
    `);

    return { success: true, updateCount: productIds.length };
  },

  async updateProductDetails(payload: any, user: any) {
    if (user.role !== 'BOSS' && user.role !== 'ADMIN') {
      throw new Error('權限不足');
    }

    const {
      productId,
      isActive,
      imageUrl,
      category,
      expiryDate,
      has_flavor_attributes,
      flavor_choices,
      single_price,
      has_volume_pricing,
      volume_pricing_settings,
      packSize,
      dispatchSteps,
      roundThreshold,
      autoSuppress,
      maxSuggestion,
      price,
      isBundle,
      bundleSize,
      maxTotalQty,
      allowedCommunityIds
    } = payload;

    if (!productId) {
      throw new Error('缺少 productId');
    }

    let parsedMaxTotalQty: number | null | undefined = undefined;
    if (maxTotalQty !== undefined) {
      if (maxTotalQty === '' || maxTotalQty === null || Number(maxTotalQty) < 0 || isNaN(Number(maxTotalQty))) {
        parsedMaxTotalQty = null;
      } else {
        parsedMaxTotalQty = Math.floor(Number(maxTotalQty));
      }
    }

    // 解析 allowedCommunityIds：只在 maxTotalQty 有傳入時才處理
    let parsedAllowedIds: string[] | undefined = undefined;
    if (parsedMaxTotalQty !== undefined) {
      if (parsedMaxTotalQty === null) {
        // 清除限額 → 白名單強制清空
        parsedAllowedIds = [];
      } else {
        // 有限額 → 存入前端傳來的白名單（可為空陣列代表全社區開放）
        parsedAllowedIds = Array.isArray(allowedCommunityIds)
          ? allowedCommunityIds.map(String)
          : [];
      }
    }

    await prisma.product.update({
      where: { productId: String(productId).trim() },
      data: {
        isActive: isActive !== undefined ? Boolean(isActive) : undefined,
        imageUrl: imageUrl !== undefined ? String(imageUrl) : undefined,
        category: category !== undefined ? String(category) : undefined,
        expiryDate: expiryDate !== undefined ? String(expiryDate) : undefined,
        defaultPrice: price !== undefined && price !== '' && price !== null ? Number(price) : undefined,
        hasFlavorAttributes: has_flavor_attributes !== undefined ? Boolean(has_flavor_attributes) : undefined,
        flavorChoices: flavor_choices !== undefined ? flavor_choices : undefined,
        singlePrice: single_price !== undefined && single_price !== '' && single_price !== null ? Number(single_price) : undefined,
        hasVolumePricing: has_volume_pricing !== undefined ? Boolean(has_volume_pricing) : undefined,
        volumePricingSettings: volume_pricing_settings !== undefined ? volume_pricing_settings : undefined,
        packSize: packSize !== undefined ? Number(packSize) : undefined,
        dispatchSteps: dispatchSteps !== undefined ? dispatchSteps : undefined,
        roundThreshold: roundThreshold !== undefined
          ? (roundThreshold === '' || roundThreshold === null || Number(roundThreshold) === 99 || isNaN(Number(roundThreshold)) ? null : Number(roundThreshold))
          : undefined,
        autoSuppress: autoSuppress !== undefined ? Boolean(autoSuppress) : undefined,
        maxSuggestion: maxSuggestion !== undefined ? Number(maxSuggestion) : undefined,
        isBundle: isBundle !== undefined ? Boolean(isBundle) : undefined,
        bundleSize: bundleSize !== undefined ? Number(bundleSize) : undefined,
        maxTotalQty: parsedMaxTotalQty,
        // 每次重新設定活動上限（不論是新值還是清除），soldQty 與白名單都同步重設
        soldQty: parsedMaxTotalQty !== undefined ? 0 : undefined,
        allowedCommunityIds: parsedAllowedIds,
      }
    });

    return { success: true };
  },

  async updateProductPurchasable(payload: any, user: any) {
    if (user.role !== 'BOSS' && user.role !== 'ADMIN') {
      throw new Error('權限不足');
    }
    const { productId, isPurchasable } = payload;
    if (!productId) throw new Error('缺少 productId');

    await prisma.product.update({
      where: { productId: String(productId).trim() },
      data: { isPurchasable: Boolean(isPurchasable) }
    });

    return { success: true };
  }
};

export async function verifyAndDeductProductQuota(tx: any, items: Array<{ productId: string; qty: number }>) {
  if (!items || !Array.isArray(items)) return;

  for (const item of items) {
    if (!item || !item.productId || !item.qty) continue;

    const pid = String(item.productId).trim();
    const requestedQty = Number(item.qty || 0);
    if (requestedQty <= 0) continue;

    const prod = await tx.product.findUnique({
      where: { productId: pid },
      select: { productId: true, productName: true, maxTotalQty: true, soldQty: true }
    });

    if (!prod) continue;

    // 無上限商品：直接記錄累加 soldQty，無上限配額攔截
    if (prod.maxTotalQty === null || prod.maxTotalQty === undefined) {
      await tx.product.update({
        where: { productId: pid },
        data: { soldQty: { increment: requestedQty } }
      });
      continue;
    }

    const limit = Number(prod.maxTotalQty);
    const currentSold = Number(prod.soldQty || 0);
    const remain = limit - currentSold;

    if (remain < requestedQty) {
      throw new Error(`【${prod.productName || prod.productId}】活動剩餘額度僅剩 ${Math.max(0, remain)} 罐，無法購買 ${requestedQty} 罐`);
    }

    // 原子條件更新
    const upd = await tx.product.updateMany({
      where: {
        productId: pid,
        soldQty: { lte: limit - requestedQty }
      },
      data: {
        soldQty: { increment: requestedQty }
      }
    });

    if (upd.count === 0) {
      throw new Error(`【${prod.productName || prod.productId}】商品熱銷中，剩餘額度不足，請重新整理頁面`);
    }
  }
}

