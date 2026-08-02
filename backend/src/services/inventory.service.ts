import { prisma, runInTransaction } from '../database/context.js';
import { deductInventory } from './sales.service.js';

export const InventoryService = {
  // ── Phase 1 新增：庫存異動與快照方法 ──

  /**
   * 記錄庫存異動並同步更新 Snapshot & 舊批次庫存 (prisma.inventory)
   */
  async recordMovement(params: {
    productId: string;
    storeCode?: string;
    type: 'PURCHASE' | 'SALE' | 'RETURN' | 'ADJUSTMENT' | 'TRANSFER' | 'VOID_SALE';
    qty: number;
    refId?: string;
    operator?: string;
    note?: string;
  }) {
    const { productId, storeCode = 'MILI001', type, qty, refId, operator, note } = params;

    return await runInTransaction(async () => {
      // 1. 寫入流水帳
      const movement = await prisma.inventoryMovement.create({
        data: {
          productId,
          storeCode,
          type,
          qty,
          refId,
          operator,
          note
        }
      });

      // 2. 更新或新增庫存快照
      await prisma.inventorySnapshot.upsert({
        where: {
          productId_storeCode: { productId, storeCode }
        },
        create: {
          productId,
          storeCode,
          onHandQty: qty,
          availableQty: qty
        },
        update: {
          onHandQty: { increment: qty },
          availableQty: { increment: qty }
        }
      });

      // 3. 🔑 同步扣除舊系統的批次庫存 (prisma.inventory)，確保舊版庫存檢視與作廢邏輯一致
      if (type === 'SALE' && qty < 0) {
        await deductInventory(productId, Math.abs(qty), 'STOCK', storeCode);
      }

      return movement;
    });
  },

  /**
   * 讀取某商品的庫存快照
   */
  async getStock(productId: string, storeCode: string = 'MILI001'): Promise<number> {
    const snapshot = await prisma.inventorySnapshot.findUnique({
      where: { productId_storeCode: { productId, storeCode } }
    });
    return snapshot?.availableQty ?? 0;
  },

  /**
   * 查詢某商品的異動流水帳
   */
  async getMovements(productId: string, storeCode: string = 'MILI001') {
    return await prisma.inventoryMovement.findMany({
      where: { productId, storeCode },
      orderBy: { createdAt: 'desc' }
    });
  },

  // ── 原有舊版相容方法 (避免 API Controller 斷裂) ──

  // 1. 取得批次庫存 (quantity != 0)
  async getInventory(payload: any = {}) {
    const { storeCode = 'MILI001' } = payload;
    const invList = await prisma.inventory.findMany({
      where: { quantity: { not: 0 }, storeCode },
      include: { product: { select: { sortWeight: true, productName: true } } }
    });

    return invList.map((item: any) => ({
      ...item,
      productName: item.product?.productName || item.productName || item.productId,
      sortWeight: item.product?.sortWeight ?? null
    }));
  },

  // 2. 取得安全庫存
  async getInventoryWithSafety(payload: any = {}) {
    const { storeCode = 'MILI001' } = payload;
    const inv = await this.getInventory(payload);
    const productsList = await prisma.product.findMany({
      where: { storeCode },
      select: { productName: true, safetyStock: true }
    });
    const safetyStocks: Record<string, number> = {};
    productsList.forEach((p: any) => {
      safetyStocks[p.productName] = p.safetyStock;
    });

    return inv.map((item: any) => ({
      ...item,
      safetyStock: safetyStocks[item.productName] || 0
    }));
  },

  // 3. 更新安全庫存
  async updateSafetyStock(payload: any) {
    const { productName, level, storeCode = 'MILI001' } = payload;
    const targetLvl = Number(level) || 0;

    const product = await prisma.product.findFirst({
      where: { productName, storeCode }
    });

    if (!product) {
      throw new Error('找不到該產品: ' + productName);
    }

    await prisma.product.updateMany({
      where: { productId: product.productId, storeCode },
      data: { safetyStock: targetLvl }
    });

    return { success: true };
  },

  // 4. 庫存調整
  async adjustInventory(payload: any, user: any) {
    const { productId, productName, type, quantity, note, storeCode = 'MILI001' } = payload;
    const qty = Number(quantity) || 0;
    const operator = user?.username || user?.userId || 'system';

    const adj = await prisma.inventoryAdjustment.create({
      data: {
        productId,
        productName,
        type,
        quantity: qty,
        operator,
        note,
        storeCode
      }
    });

    // 寫入 InventoryMovement 留底
    await this.recordMovement({
      productId,
      storeCode,
      type: 'ADJUSTMENT',
      qty: type === 'ADD' ? qty : -qty,
      operator,
      note: `庫存手動調整 (${type}): ${note || ''}`
    });

    return adj;
  },

  // 5. 取得調整歷史
  async getAdjustmentHistory(payload: any = {}) {
    const { startDate, endDate, storeCode = 'MILI001' } = payload;
    const where: any = { storeCode };

    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(startDate);
      if (endDate) where.date.lte = new Date(endDate);
    }

    return await prisma.inventoryAdjustment.findMany({
      where,
      orderBy: { date: 'desc' }
    });
  },

  // 6. 取得盤點基礎資料
  async getInventoryForStocktake(payload: any = {}) {
    const { storeCode = 'MILI001' } = payload;
    const invList = await prisma.inventory.findMany({
      where: {
        type: { in: ['STOCK', 'VOID_REFUND'] },
        storeCode
      },
      include: { product: { select: { productName: true } } }
    });

    const totals: Record<string, { name: string; qty: number }> = {};
    invList.forEach((item: any) => {
      const pId = item.productId;
      const name = item.product?.productName || item.productName || pId;
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
    const { items, operator, storeCode = 'MILI001' } = payload;
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
        operator: op,
        storeCode
      }))
    });

    return { success: true };
  },

  // 8. 盤點紀錄歷史
  async getStocktakeHistory(payload: any = {}) {
    const { startDate, endDate, productName, diffOnly, storeCode = 'MILI001' } = payload;
    const where: any = { storeCode };

    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(startDate);
      if (endDate) where.date.lte = new Date(endDate);
    }
    if (productName) {
      where.productName = { contains: productName };
    }
    if (diffOnly) {
      where.diff = { not: 0 };
    }

    return await prisma.stocktake.findMany({
      where,
      orderBy: { date: 'desc' }
    });
  },

  // 9. 庫存估值
  async getInventoryValuation(payload: any = {}) {
    const { storeCode = 'MILI001' } = payload;
    const invList = await prisma.inventory.findMany({
      where: { storeCode },
      include: { product: { select: { sortWeight: true, productName: true, defaultPrice: true } } }
    });

    const valuations: Record<string, any> = {};

    invList.forEach((item: any) => {
      const pId = item.productId;
      const pName = item.product?.productName || item.productName || pId;
      const qty = item.quantity;
      const type = (item.type || '').toUpperCase();
      const price = Number(item.cost) || Number(item.product?.defaultPrice) || 0;

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
          sortWeight: item.product?.sortWeight ?? 999999
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
