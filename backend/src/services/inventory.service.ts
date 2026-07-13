import { prisma } from '../database/context.js';

const getUuid = () => {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
};

const formatLocalDate = (date: Date | null | undefined) => {
  if (!date) return '';
  const local = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  return local.toISOString().replace('T', ' ').substring(0, 16);
};

const formatLocalDay = (date: Date | null | undefined) => {
  if (!date) return '';
  const local = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  return local.toISOString().split('T')[0];
};

export const InventoryService = {
  // 1. 取得批次庫存 (quantity != 0)
  async getInventory() {
    const invList = await prisma.inventory.findMany({
      where: { quantity: { not: 0 } },
      include: { product: { select: { sortWeight: true, productName: true } } }
    });

    const result = invList.map((item: any) => ({
      batchId: item.batchId,
      productId: item.productId,
      productName: item.product.productName || item.productName || 'Unknown',
      quantity: item.quantity,
      expiry: formatLocalDay(item.expiryDate),
      type: item.type,
      sortWeight: item.product.sortWeight ?? 999999
    }));

    result.sort((a: any, b: any) => (a.sortWeight - b.sortWeight) || a.productName.localeCompare(b.productName, 'zh-TW'));
    return result;
  },

  // 2. 取得安全庫存
  async getInventoryWithSafety() {
    const inv = await this.getInventory();
    const productsList = await prisma.product.findMany({
      select: { productName: true, safetyStock: true }
    });
    const safetyStocks: Record<string, number> = {};
    productsList.forEach((p: any) => {
      safetyStocks[p.productName] = p.safetyStock;
    });
    return { inventory: inv, safetyStocks };
  },

  // 3. 更新安全庫存
  async updateSafetyStock(payload: any) {
    const { productName, level } = payload;
    const targetLvl = Number(level) || 0;

    const product = await prisma.product.findFirst({
      where: { productName }
    });

    if (!product) {
      throw new Error('找不到該產品: ' + productName);
    }

    await prisma.product.update({
      where: { productId: product.productId },
      data: { safetyStock: targetLvl }
    });

    return { success: true, message: `已成功校正庫存` };
  },

  // 4. 庫存調整
  async adjustInventory(payload: any, user: any) {
    const { batchId, quantity, type, note } = payload;
    const subQty = Number(quantity) || 0;

    const inv = await prisma.inventory.findUnique({
      where: { batchId },
      include: { product: true }
    });

    if (!inv) {
      throw new Error('找不到該庫存批次: ' + batchId);
    }

    await prisma.inventory.update({
      where: { batchId },
      data: { quantity: inv.quantity - subQty }
    });

    await prisma.inventoryAdjustment.create({
      data: {
        productId: inv.productId,
        productName: inv.productName || inv.product.productName || 'Unknown',
        type: type || 'ADJUST',
        quantity: subQty,
        operator: user.username || user.userId || 'system',
        note: note || ''
      }
    });

    return { success: true };
  },

  // 5. 取得庫存調整歷史
  async getAdjustmentHistory(payload: any) {
    const { startDate, endDate, type, productName } = payload;
    const where: any = {};

    if (startDate || endDate) {
      where.date = {};
      if (startDate) {
        where.date.gte = new Date(startDate);
      }
      if (endDate) {
        const e = new Date(endDate);
        e.setHours(23, 59, 59, 999);
        where.date.lte = e;
      }
    }

    if (type) {
      where.type = type;
    }

    if (productName) {
      where.productName = { contains: productName, mode: 'insensitive' };
    }

    const list = await prisma.inventoryAdjustment.findMany({
      where,
      orderBy: { date: 'desc' }
    });

    return list.map((item: any) => ({
      date: formatLocalDate(item.date),
      productName: item.productName,
      type: item.type,
      quantity: item.quantity,
      operator: item.operator,
      note: item.note || ''
    }));
  },

  // 6. 取得盤點基礎資料
  async getInventoryForStocktake() {
    const invList = await prisma.inventory.findMany({
      where: {
        type: { in: ['STOCK', 'VOID_REFUND'] }
      },
      include: { product: { select: { productName: true } } }
    });

    const totals: Record<string, { name: string; qty: number }> = {};
    invList.forEach((item: any) => {
      const pId = item.productId;
      const name = item.product.productName || item.productName || pId;
      if (!totals[pId]) {
        totals[pId] = { name, qty: 0 };
      }
      totals[pId].qty += item.quantity;
    });

    return Object.keys(totals).map(pId => ({
      productId: pId,
      productName: totals[pId].name,
      bookQty: totals[pId].qty
    }));
  },

  // 7. 保存盤點紀錄
  async saveStocktake(payload: any) {
    const { items, operator } = payload;
    if (!items || !Array.isArray(items)) {
      throw new Error('缺少盤點項目');
    }

    const op = operator || 'system';

    await prisma.stocktake.createMany({
      data: items.map((item: any) => ({
        productId: item.productId,
        productName: item.productName,
        bookQty: Number(item.bookQty) || 0,
        physicalQty: Number(item.physicalQty) || 0,
        diff: Number(item.diff) || 0,
        reason: item.reason || '',
        accountability: item.accountability || '',
        operator: op
      }))
    });

    return { success: true };
  },

  // 8. 盤點紀錄歷史
  async getStocktakeHistory(payload: any) {
    const { startDate, endDate, productName, diffOnly } = payload;
    const where: any = {};

    if (startDate || endDate) {
      where.date = {};
      if (startDate) {
        where.date.gte = new Date(startDate);
      }
      if (endDate) {
        const e = new Date(endDate);
        e.setHours(23, 59, 59, 999);
        where.date.lte = e;
      }
    }

    if (productName) {
      where.productName = { contains: productName, mode: 'insensitive' };
    }

    if (diffOnly) {
      where.diff = { not: 0 };
    }

    const list = await prisma.stocktake.findMany({
      where,
      orderBy: { date: 'desc' }
    });

    return list.map((item: any) => ({
      id: item.id,
      date: formatLocalDate(item.date),
      productId: item.productId,
      productName: item.productName,
      bookQty: item.bookQty,
      physicalQty: item.physicalQty,
      diff: item.diff,
      reason: item.reason || '',
      accountability: item.accountability || '',
      operator: item.operator
    }));
  },

  // 9. 庫存估值
  async getInventoryValuation() {
    const invList = await prisma.inventory.findMany({
      include: { product: { select: { sortWeight: true, productName: true, defaultPrice: true } } }
    });

    const valuations: Record<string, any> = {};

    invList.forEach((item: any) => {
      const pId = item.productId;
      const pName = item.product.productName || item.productName || pId;
      const qty = item.quantity;
      const type = item.type.toUpperCase();
      const price = Number(item.cost) || Number(item.product.defaultPrice) || 0;

      if (!valuations[pName]) {
        valuations[pName] = {
          name: pName,
          stockQty: 0,
          stockValue: 0,
          originalQty: 0,
          originalValue: 0,
          totalQty: 0,
          totalValue: 0,
          productId: pId,
          sortWeight: item.product.sortWeight ?? 999999
        };
      }

      const target = valuations[pName];

      if (type === 'STOCK' || type === 'VOID_REFUND') {
        target.stockQty += qty;
        target.stockValue += (qty * price);
        target.totalQty += qty;
        target.totalValue += (qty * price);
      } else if (type === 'ORIGINAL') {
        target.originalQty += qty;
        target.originalValue += (qty * price);
        target.totalQty += qty;
        target.totalValue += (qty * price);
      }
    });

    return Object.values(valuations).sort((a: any, b: any) => a.sortWeight - b.sortWeight);
  }
};
