import { prisma } from '../database/context.js';

export const AnalyticsService = {
  // 1. 利潤/毛利分析
  async getProfitAnalysis(payload: any) {
    const { startDate, endDate, customer, salesRep } = payload;

    const where: any = {
      status: { not: 'VOID' }
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

    if (customer) {
      where.customer = customer.trim();
    }

    if (salesRep) {
      where.salesRep = salesRep.trim();
    }

    const list = await prisma.sales.findMany({
      where,
      include: {
        details: {
          include: {
            product: true
          }
        }
      }
    });

    const stats: Record<string, { productName: string; revenue: number; cost: number }> = {};
    let totalOrderValue = 0;
    let lastVisitDate: Date | null = null;
    const visitedSalesIds = new Set<string>();

    list.forEach((sale: any) => {
      visitedSalesIds.add(sale.saleId);
      totalOrderValue += Number(sale.totalCash) || 0;
      if (!lastVisitDate || sale.date > lastVisitDate) {
        lastVisitDate = sale.date;
      }

      sale.details.forEach((d: any) => {
        const pId = d.productId;
        const pName = d.product.productName || pId;
        const qty = d.sold;
        const revenue = Number(d.subtotal) || 0;
        const unitCost = Number(d.product.reserve) || 0;
        const cost = qty * unitCost;

        if (!stats[pId]) {
          stats[pId] = { productName: pName, revenue: 0, cost: 0 };
        }
        stats[pId].revenue += revenue;
        stats[pId].cost += cost;
      });
    });

    const sortedArray = Object.values(stats).sort((a: any, b: any) => (b.revenue - b.cost) - (a.revenue - a.cost));

    if (customer) {
      return {
        products: sortedArray,
        customerStats: {
          visitCount: visitedSalesIds.size,
          totalOrderValue,
          lastVisitDate: lastVisitDate ? (lastVisitDate as Date).toISOString().split('T')[0] : null
        }
      };
    }

    return sortedArray;
  },

  // 2. 銷售排行
  async getSalesRanking(payload: any) {
    const { startDate, endDate } = payload;
    const where: any = {
      status: { not: 'VOID' }
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

    const list = await prisma.sales.findMany({
      where,
      include: {
        details: {
          include: {
            product: true
          }
        }
      }
    });

    const stats: Record<string, { productName: string; totalQty: number; totalAmount: number }> = {};

    list.forEach((sale: any) => {
      sale.details.forEach((d: any) => {
        const pId = d.productId;
        const pName = d.product.productName || pId;
        const qty = d.sold;
        const amount = Number(d.subtotal) || 0;

        if (!stats[pId]) {
          stats[pId] = { productName: pName, totalQty: 0, totalAmount: 0 };
        }
        stats[pId].totalQty += qty;
        stats[pId].totalAmount += amount;
      });
    });

    return Object.values(stats).sort((a: any, b: any) => b.totalAmount - a.totalAmount);
  },

  // 3. 客戶排行
  async getCustomerRanking(payload: any) {
    const { startDate, endDate } = payload;
    const where: any = {
      status: { not: 'VOID' }
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

    const list = await prisma.sales.findMany({
      where
    });

    const stats: Record<string, { customerName: string; transactionCount: number; totalAmount: number }> = {};

    list.forEach((sale: any) => {
      const customer = sale.customer || '未指定';
      const amount = Number(sale.totalCash) || 0;

      if (!stats[customer]) {
        stats[customer] = { customerName: customer, transactionCount: 0, totalAmount: 0 };
      }
      stats[customer].transactionCount += 1;
      stats[customer].totalAmount += amount;
    });

    return Object.values(stats).sort((a: any, b: any) => b.totalAmount - a.totalAmount);
  },

  // 4. 客戶深度對比分析 (RFM + 雙時間段比較)
  async getCustomerAnalytics(payload: any) {
    const { customer, baseStart, baseEnd, compStart, compEnd, mode } = payload;
    if (!customer) throw new Error('未選取銀售對象');

    // 支援 baseMonth/compareMonth 快速模式
    let bStart = baseStart ? new Date(baseStart + 'T00:00:00.000+08:00') : null;
    let bEnd   = baseEnd   ? new Date(baseEnd   + 'T23:59:59.999+08:00') : null;
    let cStart = compStart ? new Date(compStart + 'T00:00:00.000+08:00') : null;
    let cEnd   = compEnd   ? new Date(compEnd   + 'T23:59:59.999+08:00') : null;

    if (!bStart && payload.baseMonth) {
      const [y, m] = payload.baseMonth.split('-').map(Number);
      bStart = new Date(y, m - 1, 1, 0, 0, 0, 0);
      bEnd   = new Date(y, m, 0, 23, 59, 59, 999);
    }
    if (!cStart && payload.compareMonth) {
      const [y, m] = payload.compareMonth.split('-').map(Number);
      cStart = new Date(y, m - 1, 1, 0, 0, 0, 0);
      cEnd   = new Date(y, m, 0, 23, 59, 59, 999);
    }

    if (!bStart || !bEnd || !cStart || !cEnd) throw new Error('日期區間參數缺失');

    // 擈出所有此客戶的鈤售單 (+ 明細)
    const salesList = await prisma.sales.findMany({
      where: {
        customer: { equals: customer, mode: 'insensitive' },
        status: { not: 'VOID' }
      },
      include: { details: { include: { product: true } } },
      orderBy: { date: 'desc' }
    });

    // 擈出品項排序權重
    const productOrderMap: Record<string, number> = {};
    const productNameMap: Record<string, string> = {};
    const allProducts = await prisma.product.findMany({ select: { productId: true, productName: true, sortWeight: true } });
    allProducts.forEach((p: any) => {
      productNameMap[p.productId] = p.productName || p.productId;
      productOrderMap[p.productId] = p.sortWeight ?? 99999;
    });

    let lastPurchaseDay: Date | null = null;

    const getRangeStats = (start: Date, end: Date) => {
      const stats = { revenue: 0, transactions: 0, returns: 0, products: {} as Record<string, { qty: number; amount: number }> };
      const matchedIds = new Set<string>();

      salesList.forEach((sale: any) => {
        const d = new Date(sale.date);
        if (!lastPurchaseDay || d > lastPurchaseDay) lastPurchaseDay = d;

        if (d >= start && d <= end) {
          matchedIds.add(sale.saleId);
          stats.transactions++;
        }
      });

      salesList.forEach((sale: any) => {
        if (!matchedIds.has(sale.saleId)) return;
        sale.details.forEach((d: any) => {
          const pId = d.productId;
          const returns = Number(d.picked) || 0;  // 退貨數量
          const sold = Number(d.sold) || 0;
          const amount = Number(d.subtotal) || 0;

          stats.revenue += amount;
          stats.returns += returns;

          if (!stats.products[pId]) stats.products[pId] = { qty: 0, amount: 0 };
          stats.products[pId].qty += sold;
          stats.products[pId].amount += amount;
        });
      });

      return stats;
    };

    const baseStats = getRangeStats(bStart, bEnd);
    const compStats = getRangeStats(cStart, cEnd);

    const allPIds = new Set([...Object.keys(baseStats.products), ...Object.keys(compStats.products)]);
    const productTrends: any[] = [];

    allPIds.forEach(pId => {
      const base = baseStats.products[pId] || { qty: 0, amount: 0 };
      const comp = compStats.products[pId] || { qty: 0, amount: 0 };
      const diffQty = base.qty - comp.qty;
      productTrends.push({
        pId,
        pName: productNameMap[pId] || pId,
        baseQty: base.qty,
        compQty: comp.qty,
        diffQty,
        diffPercent: comp.qty > 0 ? (diffQty / comp.qty) * 100 : (base.qty > 0 ? 100 : 0),
        order: productOrderMap[pId] ?? 9999
      });
    });

    productTrends.sort((a, b) => a.order - b.order);

    const recencyDays = lastPurchaseDay
      ? Math.floor((Date.now() - (lastPurchaseDay as Date).getTime()) / (1000 * 60 * 60 * 24))
      : -1;

    return {
      customer,
      mode,
      baseRange: { start: bStart, end: bEnd },
      compRange: { start: cStart, end: cEnd },
      recencyDays,
      kpi: {
        revenue: {
          current: baseStats.revenue,
          previous: compStats.revenue,
          growth: compStats.revenue > 0
            ? ((baseStats.revenue - compStats.revenue) / compStats.revenue) * 100
            : (baseStats.revenue > 0 ? 100 : 0)
        },
        transactions: {
          current: baseStats.transactions,
          previous: compStats.transactions,
          growth: compStats.transactions > 0 ? baseStats.transactions - compStats.transactions : 0
        },
        returns: {
          current: baseStats.returns,
          previous: compStats.returns,
          diff: baseStats.returns - compStats.returns
        }
      },
      productTrends
    };
  }
};
