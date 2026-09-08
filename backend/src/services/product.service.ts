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
    const { activeOnly, purchasableOnly, storeCode } = payload;
    const whereClause: any = { storeCode }; // 強制隔離
    if (activeOnly) {
      whereClause.isActive = true;
    }
    if (purchasableOnly) {
      whereClause.isPurchasable = true;
    }

    // 1. Fetch products sorted by sortWeight
    const products = await prisma.product.findMany({
      where: whereClause,
      orderBy: { sortWeight: 'asc' },
      include: { barcodes: true }
    });

    // 2. Perform GroupBy on Inventory to calculate stock levels
    const stockAgg = await prisma.inventory.groupBy({
      by: ['productId', 'type'],
      where: { storeCode }, // 強制隔離庫存計算
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

      let parsedPosSettings = p.posSettings || {};
      if (typeof parsedPosSettings === 'string') {
        try {
          parsedPosSettings = JSON.parse(parsedPosSettings);
        } catch {
          parsedPosSettings = {};
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
        stopPickupThreshold: p.stopPickupThreshold !== null && p.stopPickupThreshold !== undefined ? Number(p.stopPickupThreshold) : null,
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
        communityQuotas: p.communityQuotas || {},
        posSettings: parsedPosSettings,
        barcodes: p.barcodes ? p.barcodes.map(b => b.barcode) : [],
        capacity: p.capacity || '',
        isPurchasable: p.isPurchasable !== false, // 進貨清單顯示，與前台上架無關
        isDiscontinued: Boolean(p.isDiscontinued), // 停售/停產狀態
        _fromSheet: 'Products'
      };
    });
  },

  async getProductStock(payload: any) {
    const { productId, id, storeCode } = payload;
    const targetId = productId || id;
    if (!targetId) throw new Error('缺少 productId');
    
    // 改用 findFirst 以支援非 unique 的 storeCode 過濾
    const p = await prisma.product.findFirst({
      where: { 
        productId: String(targetId).trim(),
        storeCode: storeCode
      },
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
      WHERE p."productId" = temp.id AND p."storeCode" = '${String(payload.storeCode).replace(/'/g, "''")}'
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
      capacity,
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
      allowedCommunityIds,
      communityQuotas,
      posSettings,
      barcodes
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

    // 解析 allowedCommunityIds：獨立處理 (不干擾 maxTotalQty)
    let parsedAllowedIds: string[] | undefined = undefined;
    if (allowedCommunityIds !== undefined) {
      if (Array.isArray(allowedCommunityIds)) {
        parsedAllowedIds = allowedCommunityIds.map(String);
      } else if (allowedCommunityIds === null || allowedCommunityIds === '') {
        parsedAllowedIds = [];
      }
    }

    const oldProduct = await prisma.product.findFirst({
      where: { productId: String(productId).trim(), storeCode: payload.storeCode },
      select: { maxTotalQty: true }
    });

    let shouldResetSoldQty = false;
    if (parsedMaxTotalQty !== undefined && oldProduct) {
      const oldLimit = oldProduct.maxTotalQty !== null && oldProduct.maxTotalQty !== undefined ? Number(oldProduct.maxTotalQty) : null;
      if (parsedMaxTotalQty !== oldLimit) {
        shouldResetSoldQty = true;
      }
    }

    const isPosOnly = Boolean(payload.isPosOnlyUpdate);

    await prisma.product.updateMany({
      where: { productId: String(productId).trim(), storeCode: payload.storeCode },
      data: {
        isActive: isActive !== undefined ? Boolean(isActive) : undefined,
        imageUrl: imageUrl !== undefined ? String(imageUrl) : undefined,
        category: category !== undefined ? String(category) : undefined,
        capacity: payload.capacity !== undefined ? String(payload.capacity).trim() : undefined,
        expiryDate: expiryDate !== undefined ? String(expiryDate) : undefined,
        defaultPrice: !isPosOnly && price !== undefined && price !== '' && price !== null ? Number(price) : undefined,
        hasFlavorAttributes: has_flavor_attributes !== undefined ? Boolean(has_flavor_attributes) : undefined,
        flavorChoices: flavor_choices !== undefined ? flavor_choices : undefined,
        singlePrice: !isPosOnly && single_price !== undefined && single_price !== '' && single_price !== null ? Number(single_price) : undefined,
        hasVolumePricing: !isPosOnly && has_volume_pricing !== undefined ? Boolean(has_volume_pricing) : undefined,
        volumePricingSettings: !isPosOnly && volume_pricing_settings !== undefined ? volume_pricing_settings : undefined,
        packSize: packSize !== undefined ? Number(packSize) : undefined,
        dispatchSteps: dispatchSteps !== undefined ? dispatchSteps : undefined,
        roundThreshold: roundThreshold !== undefined
          ? (roundThreshold === '' || roundThreshold === null || Number(roundThreshold) === 99 || isNaN(Number(roundThreshold)) ? null : Number(roundThreshold))
          : undefined,
        autoSuppress: autoSuppress !== undefined ? Boolean(autoSuppress) : undefined,
        maxSuggestion: maxSuggestion !== undefined ? Number(maxSuggestion) : undefined,
        stopPickupThreshold: payload.stopPickupThreshold !== undefined
          ? (payload.stopPickupThreshold === '' || payload.stopPickupThreshold === null || isNaN(Number(payload.stopPickupThreshold)) ? null : Number(payload.stopPickupThreshold))
          : undefined,
        isBundle: !isPosOnly && isBundle !== undefined ? Boolean(isBundle) : undefined,
        bundleSize: !isPosOnly && bundleSize !== undefined ? Number(bundleSize) : undefined,
        maxTotalQty: parsedMaxTotalQty,
        // 僅在活動上限實際變更（新值或清除）時，soldQty 才同步重設
        soldQty: shouldResetSoldQty ? 0 : undefined,
        allowedCommunityIds: parsedAllowedIds,
        communityQuotas: communityQuotas !== undefined ? (communityQuotas || {}) : undefined,
        posSettings: posSettings !== undefined ? posSettings : undefined,
        isPurchasable: payload.isPurchasable !== undefined ? Boolean(payload.isPurchasable) : undefined,
        isDiscontinued: payload.isDiscontinued !== undefined ? Boolean(payload.isDiscontinued) : undefined,
      }
    });

    if (barcodes !== undefined && Array.isArray(barcodes)) {
      await prisma.productBarcode.deleteMany({
        where: { productId: String(productId).trim(), storeCode: payload.storeCode }
      });
      if (barcodes.length > 0) {
        await prisma.productBarcode.createMany({
          data: barcodes.map((b: string) => ({
            productId: String(productId).trim(),
            barcode: String(b).trim(),
            storeCode: payload.storeCode
          }))
        });
      }
    }

    return { success: true };
  },

  async updateProductPurchasable(payload: any, user: any) {
    if (user.role !== 'BOSS' && user.role !== 'ADMIN') {
      throw new Error('權限不足');
    }
    const { productId, isPurchasable } = payload;
    if (!productId) throw new Error('缺少 productId');

    await prisma.product.updateMany({
      where: { productId: String(productId).trim(), storeCode: payload.storeCode },
      data: { isPurchasable: Boolean(isPurchasable) }
    });

    return { success: true };
  }
};

export async function verifyAndDeductProductQuota(
  tx: any,
  items: Array<{ productId: string; qty: number }>,
  communityId?: string,
  communityName?: string,
  storeCode?: string
) {
  if (!items || !Array.isArray(items)) return;

  for (const item of items) {
    if (!item || !item.productId || !item.qty) continue;

    const pid = String(item.productId).trim();
    const requestedQty = Number(item.qty || 0);
    if (requestedQty <= 0) continue;

    const prod = await tx.product.findFirst({
      where: { 
        productId: pid,
        ...(storeCode ? { storeCode } : {})
      },
      select: { productId: true, productName: true, maxTotalQty: true, soldQty: true, communityQuotas: true }
    });

    if (!prod) continue;

    // A. 優先檢查是否設定了「社區專屬配額 (Community Quotas)」
    const cQuotas: Record<string, { maxQty: number; soldQty: number }> = (prod.communityQuotas as any) || {};
    const matchedCommKey = [communityId, communityName].find(key => key && cQuotas[key] && typeof cQuotas[key].maxQty === 'number');

    if (matchedCommKey) {
      const cItem = cQuotas[matchedCommKey];
      const maxQty = Number(cItem.maxQty || 0);
      const currentSold = Number(cItem.soldQty || 0);
      const remain = maxQty - currentSold;

      if (remain < requestedQty) {
        throw new Error(`【${prod.productName || prod.productId}】在您的社區專屬限量剩餘 ${Math.max(0, remain)} 罐，無法購買 ${requestedQty} 罐`);
      }

      cQuotas[matchedCommKey] = {
        maxQty,
        soldQty: currentSold + requestedQty
      };

      await tx.product.updateMany({
        where: { 
          productId: pid,
          ...(storeCode ? { storeCode } : {})
        },
        data: {
          communityQuotas: cQuotas,
          soldQty: { increment: requestedQty }
        }
      });

      continue;
    }

    // B. 全局無上限商品
    if (prod.maxTotalQty === null || prod.maxTotalQty === undefined) {
      await tx.product.updateMany({
        where: { 
          productId: pid,
          ...(storeCode ? { storeCode } : {})
        },
        data: { soldQty: { increment: requestedQty } }
      });
      continue;
    }

    // C. 全局上限商品
    const limit = Number(prod.maxTotalQty);
    const currentSold = Number(prod.soldQty || 0);
    const remain = limit - currentSold;

    if (remain < requestedQty) {
      throw new Error(`【${prod.productName || prod.productId}】活動剩餘額度僅剩 ${Math.max(0, remain)} 罐，無法購買 ${requestedQty} 罐`);
    }

    const upd = await tx.product.updateMany({
      where: {
        productId: pid,
        soldQty: { lte: limit - requestedQty },
        ...(storeCode ? { storeCode } : {})
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

