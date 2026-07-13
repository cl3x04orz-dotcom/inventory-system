import { prisma } from '../database/context.js';

const formatLocalDateStr = (date: Date) => {
  const local = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  return local.toISOString().replace('T', ' ').substring(0, 19);
};

const formatLocalYMD = (date: Date) => {
  const local = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  return local.toISOString().split('T')[0];
};

export const BillService = {
  // 1. 查詢應收帳款
  async getReceivables(payload: any) {
    const { startDate, endDate, status } = payload;
    const where: any = {
      paymentMethod: 'CREDIT'
    };

    if (status === 'PAID') {
      where.status = 'PAID';
    } else if (status === 'ALL') {
      where.status = { in: ['PAID', 'UNPAID'] };
    } else {
      where.status = 'UNPAID';
    }

    if (startDate || endDate) {
      where.date = {};
      if (startDate) {
        where.date.gte = new Date(startDate + 'T00:00:00.000+08:00');
      }
      if (endDate) {
        where.date.lte = new Date(endDate + 'T23:59:59.999+08:00');
      }
    }

    const list = await prisma.sales.findMany({
      where,
      include: {
        details: {
          where: { picked: { gt: 0 } },
          include: { product: true }
        }
      },
      orderBy: { date: 'desc' }
    });

    return list.map((sale: any) => {
      const items = sale.details.map((d: any) => ({
        saleId: sale.saleId,
        productName: d.product.productName || d.productId,
        qty: d.picked,
        price: Number(d.unitPrice),
        subtotal: Number(d.subtotal)
      }));

      return {
        uuids: [sale.saleId],
        saleId: sale.saleId,
        date: formatLocalDateStr(sale.date).replace(' ', 'T'), // 轉為 ISO 形格式對齊
        customer: sale.customer || '',
        salesRep: sale.salesRep || '未知',
        amount: Number(sale.finalTotal),
        status: sale.status,
        items
      };
    });
  },

  // 2. 標記應收帳款為已結清
  async markAsPaid(payload: any) {
    const { targetUuids, paymentMethod } = payload;
    if (!targetUuids || targetUuids.length === 0) {
      throw new Error('未提供有效 SaleID');
    }

    const res = await prisma.sales.updateMany({
      where: { saleId: { in: targetUuids } },
      data: {
        status: 'PAID',
        paymentDate: new Date(),
        actualPaymentMethod: paymentMethod || 'CASH'
      }
    });

    return { success: true, updated: res.count };
  },

  // 3. 查詢應付帳款
  async getPayables(payload: any) {
    const { startDate, endDate } = payload;
    const where: any = {
      paymentMethod: 'CREDIT',
      status: 'UNPAID'
    };

    if (startDate || endDate) {
      where.date = {};
      if (startDate) {
        where.date.gte = new Date(startDate + 'T00:00:00.000+08:00');
      }
      if (endDate) {
        where.date.lte = new Date(endDate + 'T23:59:59.999+08:00');
      }
    }

    const purchases = await prisma.purchase.findMany({
      where,
      orderBy: { date: 'desc' }
    });

    // 取得所有產品的名稱對照
    const productIds = [...new Set(purchases.map((p: any) => p.productId))];
    const products = await prisma.product.findMany({
      where: { productId: { in: productIds } },
      select: { productId: true, productName: true }
    });
    const productMap: Record<string, string> = {};
    products.forEach((p: any) => {
      productMap[p.productId] = p.productName;
    });

    const purchaseGroups: Record<string, any> = {};

    for (const row of purchases) {
      const rowDate = row.date;
      const status = row.status.toUpperCase();
      if (status === 'VOID') continue;

      const vendor = row.vendor || '未知廠商';
      const dateStr = formatLocalYMD(rowDate);
      const rawOperator = row.buyer || row.operator || '未知';

      const groupKey = `${vendor}_${dateStr}_${rawOperator}`;
      if (!purchaseGroups[groupKey]) {
        purchaseGroups[groupKey] = {
          uuids: [],
          date: dateStr,
          serverTimestamp: rowDate,
          vendor,
          operator: rawOperator,
          amount: 0,
          items: []
        };
      }

      const uuid = row.purchaseId;
      if (uuid) {
        purchaseGroups[groupKey].uuids.push(uuid);
      }

      const pName = row.productName || productMap[row.productId] || row.productId;
      const qty = row.quantity;
      const price = Number(row.unitPrice);
      const subtotal = qty * price;

      purchaseGroups[groupKey].amount += subtotal;
      purchaseGroups[groupKey].items.push({
        uuid,
        productName: pName,
        qty,
        price,
        subtotal
      });
    }

    return Object.values(purchaseGroups).reverse();
  },

  // 4. 標記應付帳款為已結清
  async markPayableAsPaid(payload: any) {
    const { targetUuids } = payload;
    if (!targetUuids || targetUuids.length === 0) {
      throw new Error('未提供有效 ID');
    }

    const res = await prisma.purchase.updateMany({
      where: { purchaseId: { in: targetUuids } },
      data: { status: 'PAID' }
    });

    return { success: true, updated: res.count };
  },

  // 5. 標記應收帳款為未結清 (還原)
  async markAsUnpaid(payload: any) {
    const { targetUuids } = payload;
    if (!targetUuids || targetUuids.length === 0) {
      throw new Error('未提供有效 SaleID');
    }

    const res = await prisma.sales.updateMany({
      where: { saleId: { in: targetUuids } },
      data: {
        status: 'UNPAID',
        paymentDate: null,
        actualPaymentMethod: null
      }
    });

    return { success: true, updated: res.count };
  }
};
