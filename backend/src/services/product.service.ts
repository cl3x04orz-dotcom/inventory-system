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
        roundThreshold: Number(p.roundThreshold !== undefined ? p.roundThreshold : 99),
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
        isPurchasable: p.isPurchasable !== false, // 進貨清單顯示，與前台上架無關
        _fromSheet: 'Products'
      };
    });
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
    if (user.role !== 'BOSS') {
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
      bundleSize
    } = payload;

    if (!productId) {
      throw new Error('缺少 productId');
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
        roundThreshold: roundThreshold !== undefined ? Number(roundThreshold) : undefined,
        autoSuppress: autoSuppress !== undefined ? Boolean(autoSuppress) : undefined,
        maxSuggestion: maxSuggestion !== undefined ? Number(maxSuggestion) : undefined,
        isBundle: isBundle !== undefined ? Boolean(isBundle) : undefined,
        bundleSize: bundleSize !== undefined ? Number(bundleSize) : undefined
      }
    });

    return { success: true };
  },

  async updateProductPurchasable(payload: any, user: any) {
    if (user.role !== 'BOSS') {
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
