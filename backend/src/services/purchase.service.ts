/**
 * purchase.service.ts
 * 進貨管理服務 (移植自 Purchases.gs)
 */

import crypto from 'crypto';
import { prisma, runInTransaction } from '../database/context.js';

function getUuid() {
  return crypto.randomUUID();
}

export const PurchaseService = {

  // ============================================================
  // 1. 取得進貨建議 (廠商清單 + 廠商-產品 map + 最新單價 + 預設付款)
  //    移植自 getPurchaseSuggestionsService()
  // ============================================================
  async getPurchaseSuggestions() {
    const purchases = await prisma.purchase.findMany({
      where: { status: { not: 'VOID' } },
      orderBy: { date: 'asc' }, // asc 讓後面的蓋掉前面（最新）
      select: {
        vendor: true,
        productId: true,
        productName: true,
        unitPrice: true,
        paymentMethod: true
      }
    });

    // [New] 自動將歷史進貨出現的廠商同步至 Vendor 資料表（避免空表無處設定）
    const dbVendors = await prisma.vendor.findMany({
      orderBy: { sortWeight: 'asc' },
      select: { vendorName: true, isActive: true }
    });
    const dbVendorNames = new Set(dbVendors.map(v => v.vendorName));
    const missingVendors = new Set<string>();
    purchases.forEach(p => {
      const v = (p.vendor || '').trim();
      if (v && !dbVendorNames.has(v)) missingVendors.add(v);
    });

    if (missingVendors.size > 0) {
      await prisma.vendor.createMany({
        data: Array.from(missingVendors).map(name => ({
          vendorName: name,
          isActive: true,
          paymentMethod: 'CASH'
        })),
        skipDuplicates: true
      });
      // 重新加載最新廠商列表並按 sortWeight 排序
      const updatedVendors = await prisma.vendor.findMany({
        orderBy: { sortWeight: 'asc' },
        select: { vendorName: true, isActive: true }
      });
      dbVendors.length = 0;
      dbVendors.push(...updatedVendors);
    }

    const activeVendorNames = new Set(dbVendors.filter(v => v.isActive).map(v => v.vendorName));

    // 取得所有產品名稱（包含已停售的，以防後台篩選時停售商品消失）
    const products = await prisma.product.findMany({
      select: { productId: true, productName: true }
    });
    const activeProductNames = new Set(products.map(p => p.productName));
    const productNameMap: Record<string, string> = {};
    products.forEach(p => { productNameMap[p.productId] = p.productName; });

    const vendors = new Set<string>();
    const vpMap: Record<string, Set<string>> = {};   // vendor → Set<productName>
    const vppMap: Record<string, Record<string, number>> = {}; // vendor → { productName → latestPrice }

    for (const r of purchases) {
      const v = (r.vendor || '').trim();
      const pName = (r.productName || productNameMap[r.productId] || '').trim();
      const price = Number(r.unitPrice) || 0;

      if (!v || !pName) continue;

      // [過濾] 只加入目前啟用合作的廠商，商品則在前端動態與 activeOnly 商品聯集過濾
      if (!activeVendorNames.has(v)) continue;

      vendors.add(v);

      if (!vpMap[v]) vpMap[v] = new Set();
      vpMap[v].add(pName);

      if (!vppMap[v]) vppMap[v] = {};
      vppMap[v][pName] = price; // 後面的（更新的）蓋掉前面
    }

    // 廠商預設付款方式（從 VendorDefault 表讀取）
    const vendorDefaults = await this._getVendorDefaults();

    const vendorProductMap: Record<string, string[]> = {};
    for (const v in vpMap) {
      vendorProductMap[v] = Array.from(vpMap[v]);
    }

    // [New] 依照資料庫自訂的 sortWeight 順序輸出廠商，不使用強制 alphabet 排序
    const sortedActiveVendors = dbVendors
      .filter(v => v.isActive && vendors.has(v.vendorName))
      .map(v => v.vendorName);

    return {
      vendors: sortedActiveVendors,
      vendorProductMap,
      vendorProductPriceMap: vppMap,
      vendorDefaults
    };
  },

  // ============================================================
  // 2. 進貨存檔 (移植自 addPurchaseService())
  // ============================================================

  async addPurchase(payload: any, user: any) {
    const { submissionId, items: rawItems, operator, newProductSettings = {} } = payload;

    return runInTransaction(async () => {
      // 防重複提交：用 DB 本身做冪等性檢查
      if (submissionId) {
        const exists = await prisma.purchase.findFirst({
          where: { status: { in: ['PAID', 'CREDIT', 'ORDERED', 'UNPAID'] }, purchaseId: { contains: submissionId } }
        });
      }

      const items = Array.isArray(rawItems) ? rawItems : [payload];
      const finalOperator = operator || (user ? (user.username || user.displayName || 'Unknown') : 'Unknown');
      const entryDate = new Date();

      // 查現有產品 (productName → productId)
      const existingProducts = await prisma.product.findMany({
        select: { productId: true, productName: true }
      });
      const nameToId: Record<string, string> = {};
      existingProducts.forEach(p => { nameToId[p.productName] = p.productId; });

      let count = 0;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const itemVendor = (item.vendor || payload.vendor || '').trim();
        const itemName = (item.productName || '').trim();
        const itemQty = Number(item.quantity) || 0;
        const itemPrice = Number(item.price) || 0;
        const itemMethod = item.paymentMethod || 'CASH';
        const itemStatus = itemMethod === 'CREDIT' ? 'UNPAID' : 'PAID';

        // 解析有效期限
        let expiryDate: Date | null = null;
        if (item.expiry && String(item.expiry).trim()) {
          const d = new Date(item.expiry);
          if (!isNaN(d.getTime())) expiryDate = d;
        }

        // 自動建立不存在的產品
        let productId = nameToId[itemName];
        if (!productId && itemName) {
          productId = getUuid();
          nameToId[itemName] = productId;

          const settings = newProductSettings[itemName] || {};
          await prisma.product.create({
            data: {
              productId,
              productName: itemName,
              category: 'General',
              defaultPrice: itemPrice,
              isActive: false
            }
          });
        }

        if (!productId) continue;

        // 確定唯一的 purchaseId
        const purchaseId = `${submissionId || 'pur'}_${i}_${getUuid().slice(0, 8)}`;

        // 寫入 Purchase
        await prisma.purchase.create({
          data: {
            purchaseId,
            date: entryDate,
            vendor: itemVendor,
            productId,
            productName: itemName,
            quantity: itemQty,
            unitPrice: itemPrice,
            expiryDate,
            buyer: finalOperator,
            operator: finalOperator,
            paymentMethod: itemMethod,
            status: itemStatus
          }
        });

        // 寫入 Inventory (STOCK)
        await prisma.inventory.create({
          data: {
            batchId: getUuid(),
            productId,
            productName: itemName,
            quantity: itemQty,
            expiryDate,
            entryDate,
            type: 'STOCK',
            cost: itemPrice
          }
        });

        count++;
      }

      return { success: true, count };
    });
  },
  // 3. 廠商預設付款方式
  // ============================================================
  async saveVendorDefault(payload: any) {
    const { vendor, method } = payload;
    if (!vendor) throw new Error('缺乏廠商名稱');

    const vName = vendor.trim();
    const mType = (method || 'CASH').trim();

    // 更新 Vendor 資料表，使預設付款永久保存
    await prisma.vendor.update({
      where: { vendorName: vName },
      data: { paymentMethod: mType }
    });

    vendorDefaultCache[vName] = mType;
    return { success: true };
  },

  // ============================================================
  // 內部：取得廠商預設付款
  // ============================================================
  async _getVendorDefaults(): Promise<Record<string, string>> {
    const list = await prisma.vendor.findMany({
      select: { vendorName: true, paymentMethod: true }
    });
    const defaults: Record<string, string> = {};
    list.forEach(v => {
      defaults[v.vendorName] = v.paymentMethod;
    });
    return defaults;
  },

  // ============================================================
  // 4. 進貨查詢
  // ============================================================
  async getPurchaseHistory(payload: any) {
    const { startDate, endDate, keyword } = payload;

    const where: any = { status: { not: 'VOID' } };

    if (startDate || endDate) {
      where.date = {};
      if (startDate) {
        const s = new Date(startDate);
        s.setHours(0, 0, 0, 0);
        where.date.gte = s;
      }
      if (endDate) {
        const e = new Date(endDate);
        e.setHours(23, 59, 59, 999);
        where.date.lte = e;
      }
    }

    const purchases = await prisma.purchase.findMany({
      where,
      orderBy: { date: 'desc' }
    });

    // 取得產品名稱
    const productIds = [...new Set(purchases.map(p => p.productId))];
    const products = await prisma.product.findMany({
      where: { productId: { in: productIds } },
      select: { productId: true, productName: true }
    });
    const productNameMap: Record<string, string> = {};
    products.forEach(p => { productNameMap[p.productId] = p.productName; });

    let result = purchases.map(r => ({
      id: r.purchaseId,
      date: r.date,
      vendorName: r.vendor || '',
      productName: r.productName || productNameMap[r.productId] || 'Unknown',
      productId: r.productId,
      quantity: r.quantity,
      unitPrice: Number(r.unitPrice),
      totalPrice: r.quantity * Number(r.unitPrice),
      expiry: r.expiryDate,
      operator: r.buyer || r.operator || '-',
      paymentMethod: r.paymentMethod || 'CASH',
      status: r.status || 'PAID'
    }));

    // 關鍵字篩選
    if (keyword) {
      const kw = keyword.toLowerCase();
      result = result.filter(r =>
        r.vendorName.toLowerCase().includes(kw) ||
        r.productName.toLowerCase().includes(kw)
      );
    }

    return result;
  },

  // ============================================================
  // 5. 作廢進貨 (移植自 voidAndFetchPurchaseService())
  // ============================================================
  async voidAndFetchPurchase(payload: any, user: any) {
    const { id } = payload;
    if (!id) throw new Error('缺少單據 ID');

    return runInTransaction(async () => {
      const purchase = await prisma.purchase.findFirst({
        where: { purchaseId: id }
      });
      if (!purchase) throw new Error('找不到進貨紀錄');
      if (purchase.status === 'VOID') throw new Error('此單據已作廢');

      const opName = user ? (user.username || user.displayName || 'Unknown') : 'Unknown';

      // 1. 標記 VOID
      await prisma.purchase.update({
        where: { purchaseId: id },
        data: { status: 'VOID', operator: `VOID_BY: ${opName}` }
      });

      // 2. 扣回庫存
      if (purchase.quantity > 0) {
        await prisma.inventory.create({
          data: {
            batchId: getUuid(),
            productId: purchase.productId,
            productName: purchase.productName || '',
            quantity: -purchase.quantity,
            expiryDate: purchase.expiryDate,
            entryDate: new Date(),
            type: 'STOCK',
            cost: purchase.unitPrice
          }
        });
      }

      return {
        success: true,
        originalRecord: {
          vendor: purchase.vendor,
          productName: purchase.productName || '',
          productId: purchase.productId,
          quantity: purchase.quantity,
          unitPrice: Number(purchase.unitPrice),
          expiry: purchase.expiryDate,
          paymentMethod: purchase.paymentMethod || 'CASH'
        }
      };
    });
  },

  // ============================================================
  // 6. 確認進貨到貨 (實收驗收) (移植自 confirmPurchaseReceipt())
  // ============================================================
  async confirmPurchaseReceipt(payload: any, user: any) {
    const { id, actualQty, actualPrice } = payload;
    if (!id) throw new Error('缺少單據 ID');

    return runInTransaction(async () => {
      const purchase = await prisma.purchase.findFirst({
        where: { purchaseId: id }
      });
      if (!purchase) throw new Error('找不到該筆在途叫貨紀錄');
      if (purchase.status !== 'ORDERED') throw new Error('此單據非待驗收狀態，或已驗收過');

      const finalQty = actualQty !== undefined ? Number(actualQty) : purchase.quantity;
      const finalPrice = actualPrice !== undefined ? Number(actualPrice) : Number(purchase.unitPrice);
      const verifyDate = new Date();

      const paymentMethod = purchase.paymentMethod || 'CASH';
      const newStatus = paymentMethod === 'CREDIT' ? 'UNPAID' : 'PAID';
      const operatorName = user ? (user.displayName || user.name || user.username || 'Unknown') : 'System';

      // 格式化原下單時間
      const oldDateStr = purchase.date.toISOString().replace('T', ' ').substring(0, 16);
      const oldNote = purchase.operator || '';
      const newNote = `[下單:${oldDateStr}] [驗收:${operatorName}] ${oldNote}`.trim();

      // 1. 更新 Purchase 狀態與實到數量、單價
      await prisma.purchase.update({
        where: { purchaseId: id },
        data: {
          date: verifyDate,
          quantity: finalQty,
          unitPrice: finalPrice,
          status: newStatus,
          operator: newNote
        }
      });

      // 2. 正式寫入庫存日誌 (STOCK)
      if (finalQty > 0) {
        await prisma.inventory.create({
          data: {
            batchId: getUuid(),
            productId: purchase.productId,
            productName: purchase.productName || '',
            quantity: finalQty,
            expiryDate: purchase.expiryDate,
            entryDate: verifyDate,
            type: 'STOCK',
            cost: finalPrice
          }
        });

        // 3. 更新 Product 最新成本
        await prisma.product.update({
          where: { productId: purchase.productId },
          data: { defaultPrice: finalPrice }
        });
      }

      return { success: true, actualQty: finalQty, actualPrice: finalPrice };
    });
  },

  async getVendors() {
    return await prisma.vendor.findMany({
      orderBy: { sortWeight: 'asc' }
    });
  },

  async updateVendorSortOrder(payload: any) {
    const { vendorNames } = payload;
    if (!vendorNames || !Array.isArray(vendorNames) || vendorNames.length === 0) {
      throw new Error('缺少廠商排序名單');
    }

    // 建立批量更新的 RAW SQL
    const values = vendorNames.map((name, index) => `('${name.replace(/'/g, "''")}', ${index})`).join(',');
    const sql = `
      UPDATE "Vendor" AS v
      SET "sortWeight" = val.weight
      FROM (VALUES ${values}) AS val(name, weight)
      WHERE v."vendorName" = val.name
    `;

    await prisma.$executeRawUnsafe(sql);
    return { success: true };
  },

  async updateVendorStatus(payload: any) {
    const { vendorName, isActive } = payload;
    if (!vendorName) throw new Error('廠商名稱為必填');
    await prisma.vendor.update({
      where: { vendorName },
      data: { isActive }
    });
    return { success: true };
  }
};

// Process-level vendor default cache (與 GAS CacheService 等效)
const vendorDefaultCache: Record<string, string> = {};
