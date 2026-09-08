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

  // 1. 取得批次庫存 (包含正數與負數/零庫存項目，確保負庫存如 -1 永不隱藏)
  async getInventory(payload: any = {}) {
    const { storeCode = 'MILI001' } = payload;
    const invList = await prisma.inventory.findMany({
      where: { storeCode },
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
    let { productId, productName, batchId, inventoryCategory, type, quantity, afterQty, beforeQty, note, storeCode = 'MILI001' } = payload;
    const operator = user?.username || user?.userId || 'system';

    // 1. 若傳入 batchId 補全商品資訊及查詢當前批次
    let targetBatch: any = null;
    if (batchId) {
      targetBatch = await prisma.inventory.findFirst({
        where: { batchId, storeCode }
      });
      if (targetBatch) {
        if (!productId) productId = targetBatch.productId;
        if (!productName) productName = targetBatch.productName;
      }
    }

    // 2. 若有 productName 補全 productId
    if (!productId && productName) {
      const prod = await prisma.product.findFirst({
        where: { productName, storeCode }
      });
      if (prod) productId = prod.productId;
    }

    // 3. 若有 productId 補全 productName
    if (productId && !productName) {
      const prod = await prisma.product.findFirst({
        where: { productId, storeCode }
      });
      if (prod) productName = prod.productName;
    }

    const finalProductId = productId || batchId || 'UNKNOWN';
    const finalProductName = productName || '未指定商品';

    // 分清類別：「現貨進貨 (STOCK)」或「原貨/退貨 (ORIGINAL)」
    const targetCategory = inventoryCategory || (targetBatch && targetBatch.type !== 'STOCK' && targetBatch.type !== 'VOID_REFUND' ? 'ORIGINAL' : 'STOCK');

    // 4. 計算變更數量 changeQty (正數增加，負數減少)
    let changeQty = 0;
    let recordQty = 0;

    if (afterQty !== undefined && afterQty !== null && afterQty !== '') {
      const after = Number(afterQty);
      const current = (beforeQty !== undefined && beforeQty !== null && beforeQty !== '')
        ? Number(beforeQty)
        : (targetBatch ? targetBatch.quantity : 0);
      changeQty = after - current;
      recordQty = Math.abs(changeQty);
      if (!type) {
        type = changeQty >= 0 ? 'ADD' : 'SCRAP';
      }
    } else {
      const qty = Math.abs(Number(quantity) || 0);
      recordQty = qty;
      const isAddType = ['ADD', 'OTHER_ADD', 'INFLOW'].includes((type || '').toUpperCase());
      changeQty = isAddType ? qty : -qty;
    }

    // 5. 確實更新資料庫中的批次庫存 (prisma.inventory)
    if (changeQty < 0) {
      // 扣減情況：分類別跨批次智能扣除 (FIFO, 不跨類別扣除)
      if (finalProductId !== 'UNKNOWN') {
        await deductInventory(finalProductId, Math.abs(changeQty), targetCategory, storeCode);
      } else if (targetBatch) {
        let newBatchQty = Math.max(0, targetBatch.quantity + changeQty);
        await prisma.inventory.updateMany({
          where: { batchId: targetBatch.batchId, storeCode },
          data: { quantity: newBatchQty }
        });
      }
    } else if (changeQty > 0) {
      // 增加情況：更新該批次或建立新批次
      if (targetBatch) {
        await prisma.inventory.updateMany({
          where: { batchId: targetBatch.batchId, storeCode },
          data: { quantity: targetBatch.quantity + changeQty }
        });
      } else if (finalProductId !== 'UNKNOWN') {
        await prisma.inventory.create({
          data: {
            productId: finalProductId,
            productName: finalProductName,
            quantity: changeQty,
            type: targetCategory === 'STOCK' ? 'STOCK' : 'ORIGINAL',
            storeCode
          }
        });
      }
    }

    // 6. 紀錄調整歷史 (prisma.inventoryAdjustment)
    const adj = await prisma.inventoryAdjustment.create({
      data: {
        productId: finalProductId,
        productName: finalProductName,
        type: type || (changeQty >= 0 ? 'ADD' : 'ADJUST_REDUCE'),
        quantity: recordQty,
        operator,
        note,
        storeCode
      }
    });

    // 7. 寫入 InventoryMovement 留底與更新 Snapshot
    await this.recordMovement({
      productId: finalProductId,
      storeCode,
      type: 'ADJUSTMENT',
      qty: changeQty,
      operator,
      note: `庫存手動調整 (${type || 'ADJUSTMENT'}): ${note || ''}`
    });

    return adj;
  },

  // 5. 取得調整歷史
  async getAdjustmentHistory(payload: any = {}) {
    const { startDate, endDate, storeCode = 'MILI001', page, pageSize } = payload;
    const where: any = { storeCode };

    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(startDate);
      if (endDate) where.date.lte = new Date(endDate);
    } else {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      thirtyDaysAgo.setHours(0, 0, 0, 0);
      where.date = { gte: thirtyDaysAgo };
    }

    const take = pageSize ? parseInt(pageSize, 10) : undefined;
    const skip = page && pageSize && take ? (parseInt(page, 10) - 1) * take : undefined;

    return await prisma.inventoryAdjustment.findMany({
      where,
      take,
      skip,
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
    const { startDate, endDate, productName, diffOnly, storeCode = 'MILI001', page, pageSize } = payload;
    const where: any = { storeCode };

    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(startDate);
      if (endDate) where.date.lte = new Date(endDate);
    } else {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      thirtyDaysAgo.setHours(0, 0, 0, 0);
      where.date = { gte: thirtyDaysAgo };
    }
    
    if (productName) {
      where.productName = { contains: productName };
    }
    if (diffOnly) {
      where.diff = { not: 0 };
    }

    const take = pageSize ? parseInt(pageSize, 10) : undefined;
    const skip = page && pageSize && take ? (parseInt(page, 10) - 1) * take : undefined;

    return await prisma.stocktake.findMany({
      where,
      take,
      skip,
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
