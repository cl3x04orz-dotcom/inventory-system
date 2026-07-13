import crypto from 'crypto';
import { prisma, runInTransaction } from '../database/context.js';

function getUuid() {
  return crypto.randomUUID();
}

function snapToDispatchSteps(target: number, steps: number[]): number {
  if (!steps || steps.length === 0) return target;

  const sortedSteps = [...steps]
    .map(Number)
    .filter(n => !isNaN(n))
    .sort((a, b) => a - b);
  if (sortedSteps.length === 0) return target;

  const maxStep = sortedSteps[sortedSteps.length - 1];

  if (target <= 0) return 0;

  if (target <= maxStep) {
    const matched = sortedSteps.find(s => s >= target);
    return matched || maxStep;
  } else {
    return maxStep + snapToDispatchSteps(target - maxStep, sortedSteps);
  }
}

export const SalesService = {
  // 1. 銷售存檔 (Save Sales) - 包含 FIFO 扣庫存與交易控制
  async saveSales(payload: any, user: any) {
    const {
      salesData,
      cashData,
      expenseData,
      customer,
      paymentMethod,
      salesRep,
      operator,
      submissionId,
      originalDate,
      workHours,
      weather
    } = payload;

    // 業務人員與操作人員決定 (與 Apps Script 一致)
    const finalSalesRep = salesRep || (user ? (user.displayName || user.name || user.username) : 'Unknown');
    const finalOperator = operator || (user ? (user.displayName || user.name || user.username) : 'Unknown');

    return runInTransaction(async () => {
      const saleId = getUuid();

      let today = new Date();
      if (originalDate) {
        today = new Date(originalDate);
      } else if (payload.serverTimestamp) {
        today = new Date(payload.serverTimestamp);
      }

      const status = (paymentMethod === 'CREDIT') ? 'UNPAID' : 'PAID';
      const method = paymentMethod || 'CASH';

      // 3.1 建立 Sales 主檔
      const sale = await prisma.sales.create({
        data: {
          saleId,
          date: today,
          salesRep: finalSalesRep,
          totalCash: Number(cashData.totalCash || 0),
          reserve: Number(cashData.reserve || 0),
          finalTotal: Number(expenseData.finalTotal || 0),
          customer: customer || '',
          operator: finalOperator,
          paymentMethod: method,
          status: status,
          workHours: Number(workHours || 0)
        }
      });

      // 3.2 建立 Expenditures 紀錄
      const baseNote = originalDate ? `[修正] 於 ${new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })} 修改，原始 ID: ${payload.originalSaleId || 'N/A'}` : "";
      const remarks = [];
      if (expenseData.goodsVendor) remarks.push(`貨款廠商: ${expenseData.goodsVendor}`);
      if (expenseData.gasRemark) remarks.push(`加油: ${expenseData.gasRemark}`);
      if (expenseData.parkingRemark) remarks.push(`停車: ${expenseData.parkingRemark}`);
      if (expenseData.othersRemark) remarks.push(`其他: ${expenseData.othersRemark}`);
      if (expenseData.salaryRemark) remarks.push(`薪資: ${expenseData.salaryRemark}`);
      if (expenseData.reserveFundRemark) remarks.push(`公積金: ${expenseData.reserveFundRemark}`);
      if (expenseData.vehicleMaintenanceRemark) remarks.push(`保養: ${expenseData.vehicleMaintenanceRemark}`);

      const combinedRemarks = remarks.length > 0 ? `[${remarks.join(', ')}] ` : "";
      const finalNote = (combinedRemarks + baseNote).trim();

      await prisma.expenditure.create({
        data: {
          saleId,
          stall: Number(expenseData.stall || 0),
          cleaning: Number(expenseData.cleaning || 0),
          electricity: Number(expenseData.electricity || 0),
          gas: Number(expenseData.gas || 0),
          parking: Number(expenseData.parking || 0),
          goods: Number(expenseData.goods || 0),
          bags: Number(expenseData.bags || 0),
          others: Number(expenseData.others || 0),
          linePay: Number(expenseData.linePay || 0),
          serviceFee: Number(expenseData.serviceFee || 0),
          totalDeductions: Number(expenseData.finalTotal || 0),
          customer: customer || '',
          salesRep: finalSalesRep,
          timestamp: today,
          vehicleMaintenance: Number(expenseData.vehicleMaintenance || 0),
          salary: Number(expenseData.salary || 0),
          reserve: Number(expenseData.reserveFund || expenseData.reserve || 0),
          note: finalNote,
          paymentMethod: 'CASH',
          paymentDate: today
        }
      });

      // 3.3 處理銷售細項與庫存扣減 (FIFO)
      for (const item of salesData) {
        const sold = Number(item.sold || 0);
        const picked = Number(item.picked || 0);
        const original = Number(item.original || 0);
        const returns = Number(item.returns || 0);

        const hasActivity = sold > 0 || picked > 0 || original > 0 || returns > 0;
        if (!hasActivity) continue;

        // 寫入銷售明細
        await prisma.salesDetail.create({
          data: {
            saleId,
            productId: item.productId,
            picked,
            original,
            returnQty: returns,
            sold,
            unitPrice: Number(item.unitPrice || 0),
            subtotal: sold * Number(item.unitPrice || 0)
          }
        });

        // 扣減庫存 (FIFO)
        let consumedBatches: Array<{ expiryDate: Date | null; quantity: number }> = [];

        if (picked > 0) {
          consumedBatches = await deductInventory(item.productId, picked, 'STOCK');
        }
        if (original > 0) {
          await deductInventory(item.productId, original, 'ORIGINAL');
        }

        // 處理退貨 (寫入回原批次的退回紀錄)
        if (returns > 0) {
          let remainingReturn = returns;

          // 1. 優先退回到剛才扣除的批次效期
          for (const batch of consumedBatches) {
            if (remainingReturn <= 0) break;
            const returnQty = Math.min(remainingReturn, batch.quantity);

            await prisma.inventory.create({
              data: {
                productId: item.productId,
                quantity: returnQty,
                expiryDate: batch.expiryDate,
                entryDate: today,
                type: 'ORIGINAL',
                cost: 0,
                productName: item.productName || ''
              }
            });
            remainingReturn -= returnQty;
          }

          // 2. 超出扣除量，退回到該商品最接近過期的 STOCK 批次效期
          if (remainingReturn > 0) {
            const oldestStockBatch = await prisma.inventory.findFirst({
              where: { productId: item.productId, type: 'STOCK', quantity: { gt: 0 } },
              orderBy: { expiryDate: 'asc' }
            });

            const fallbackExpiry = oldestStockBatch?.expiryDate || new Date('2099-12-31');

            await prisma.inventory.create({
              data: {
                productId: item.productId,
                quantity: remainingReturn,
                expiryDate: fallbackExpiry,
                entryDate: today,
                type: 'ORIGINAL',
                cost: 0,
                productName: item.productName || ''
              }
            });
          }
        }
      }

      return { success: true };
    });
  },

  // 獲取單據明細用於修正/複製
  async getSaleToClone(payload: any) {
    const { saleId } = payload;
    if (!saleId) throw new Error('缺少銷售編號');

    const sale = await prisma.sales.findUnique({
      where: { saleId },
      include: { details: { include: { product: true } } }
    });

    if (!sale) throw new Error('找不到銷售紀錄');

    const expenditure = await prisma.expenditure.findUnique({
      where: { saleId }
    });

    const parsedExpenses = expenditure ? {
      stall: Number(expenditure.stall),
      cleaning: Number(expenditure.cleaning),
      electricity: Number(expenditure.electricity),
      gas: Number(expenditure.gas),
      parking: Number(expenditure.parking),
      goods: Number(expenditure.goods),
      bags: Number(expenditure.bags),
      others: Number(expenditure.others),
      linePay: Number(expenditure.linePay),
      serviceFee: Number(expenditure.serviceFee),
      vehicleMaintenance: Number(expenditure.vehicleMaintenance),
      salary: Number(expenditure.salary),
      reserveFund: Number(expenditure.reserve),
      remarksRaw: expenditure.note || ''
    } : null;

    const salesData = sale.details.map(d => ({
      productId: d.productId,
      productName: d.product.productName,
      picked: d.picked,
      original: d.original,
      returns: d.returnQty,
      sold: d.sold,
      unitPrice: Number(d.unitPrice)
    }));

    return {
      success: true,
      cloneData: {
        customer: sale.customer || '',
        salesRep: sale.salesRep,
        paymentMethod: sale.paymentMethod || 'CASH',
        salesData,
        reserve: Number(sale.reserve),
        expenses: parsedExpenses,
        cashCounts: {}, // Can map from a model field if necessary
        originalDate: sale.date,
        originalSaleId: saleId,
        workHours: Number(sale.workHours) || ''
      }
    };
  },

  // 銷售作廢
  async voidAndFetchSale(payload: any, user: any) {
    const { saleId } = payload;
    if (!saleId) throw new Error('缺少銷售編號');

    const isAdmin = user && (user.role === 'BOSS' || user.role === 'ADMIN');

    return runInTransaction(async () => {
      const sale = await prisma.sales.findUnique({
        where: { saleId },
        include: { details: { include: { product: true } } }
      });

      if (!sale) throw new Error('找不到該筆銷售紀錄');
      if (sale.status === 'VOID') throw new Error('此單據已經作廢，不可重複操作。');

      // 員工只能在 2 天內作廢
      if (!isAdmin) {
        const diffMs = new Date().getTime() - new Date(sale.date).getTime();
        const diffDays = diffMs / (1000 * 60 * 60 * 24);
        if (diffDays > 2) {
          throw new Error('權限限制：此單據已超過 2 天，員工無法自行修改。請聯繫管理員。');
        }
      }

      // 1. 將 Sales 狀態改為 VOID
      await prisma.sales.update({
        where: { saleId },
        data: { status: 'VOID' }
      });

      // 2. 將 Expenditure 備註加上 [VOID]
      const expenditure = await prisma.expenditure.findUnique({ where: { saleId } });
      if (expenditure) {
        await prisma.expenditure.update({
          where: { saleId },
          data: { note: `[VOID] ${expenditure.note || ''}` }
        });
      }

      // 3. 庫存退回 (Void Refund)
      const today = new Date();
      for (const d of sale.details) {
        if (d.picked > 0) {
          // 找到該商品的最新批次效期作為退回參考
          const lastInventory = await prisma.inventory.findFirst({
            where: { productId: d.productId, type: 'STOCK' },
            orderBy: { expiryDate: 'desc' }
          });
          const fallbackExpiry = lastInventory?.expiryDate || new Date();

          await prisma.inventory.create({
            data: {
              productId: d.productId,
              quantity: d.picked,
              expiryDate: fallbackExpiry,
              entryDate: today,
              type: 'STOCK',
              cost: 0,
              productName: d.product.productName
            }
          });
        }

        if (d.original > 0) {
          await prisma.inventory.create({
            data: {
              productId: d.productId,
              quantity: d.original,
              expiryDate: today,
              entryDate: today,
              type: 'ORIGINAL',
              cost: 0,
              productName: d.product.productName
            }
          });
        }

        // 退貨作廢扣回
        if (d.returnQty > 0) {
          await deductInventory(d.productId, d.returnQty, 'ORIGINAL');
        }
      }

      return { success: true };
    });
  },

  // 獲取歷史紀錄 (終極優化：原生 Raw SQL 關聯查詢，全資料一鍵秒開)
  async getSalesHistory(payload: any, user: any = null) {
    const { startDate, endDate } = payload;
    
    let query = `
      SELECT 
        s.date,
        s."paymentDate",
        COALESCE(s."actualPaymentMethod", '') AS "actualPaymentMethod",
        s.status,
        COALESCE(s.customer, '') AS location,
        s."salesRep",
        d.sold AS "soldQty",
        d.picked AS "pickedQty",
        d.original AS "originalQty",
        CAST(d.subtotal AS float) AS "totalAmount",
        COALESCE(s."paymentMethod", 'CASH') AS "paymentMethod",
        s."saleId",
        COALESCE(s.operator, '') AS operator,
        CAST(s."workHours" AS float) AS "workHours",
        p."productName"
      FROM "SalesDetail" d
      JOIN "Sales" s ON d."saleId" = s."saleId"
      JOIN "Product" p ON d."productId" = p."productId"
      WHERE s.status <> 'VOID'
    `;

    const params: any[] = [];
    let paramIdx = 1;

    let start: Date | null = null;
    let end: Date | null = null;

    if (startDate) {
      start = new Date(startDate + 'T00:00:00.000+08:00');
    }
    if (endDate) {
      end = new Date(endDate + 'T23:59:59.999+08:00');
    }

    if (start && end) {
      query += ` AND (
        (s.date >= $${paramIdx} AND s.date <= $${paramIdx + 1}) OR
        (s."paymentDate" >= $${paramIdx} AND s."paymentDate" <= $${paramIdx + 1})
      )`;
      params.push(start, end);
      paramIdx += 2;
    } else if (start) {
      query += ` AND (s.date >= $${paramIdx} OR s."paymentDate" >= $${paramIdx})`;
      params.push(start);
      paramIdx += 1;
    } else if (end) {
      query += ` AND (s.date <= $${paramIdx} OR s."paymentDate" <= $${paramIdx})`;
      params.push(end);
      paramIdx += 1;
    }

    const isAdmin = user && (user.role === 'BOSS' || user.role === 'ADMIN');
    if (!isAdmin && user && user.username) {
      query += ` AND LOWER(s."salesRep") = $${paramIdx}`;
      params.push(user.username.trim().toLowerCase());
      paramIdx += 1;
    }

    query += ` ORDER BY s.date DESC`;

    const list: any[] = await prisma.$queryRawUnsafe(query, ...params);

    return list.map((item: any) => {
      const sDate = new Date(item.date);
      const pDate = item.paymentDate ? new Date(item.paymentDate) : null;

      const isSaleInBatch = start && end ? (sDate >= start && sDate <= end) : true;
      const isCollectionInBatch = pDate && start && end ? (pDate >= start && pDate <= end) : false;

      const isCollectionReportMode = !!(isCollectionInBatch && !isSaleInBatch);

      let collectionNote = "";
      let displayMethod = item.paymentMethod;
      let displayDate = item.date;

      if (isCollectionReportMode) {
        collectionNote = item.actualPaymentMethod === 'TRANSFER' ? "(匯款補收)" : "(現金補收)";
        if (item.actualPaymentMethod) displayMethod = item.actualPaymentMethod;
        if (pDate) displayDate = pDate;
      }

      return {
        date: displayDate,
        location: item.location,
        salesRep: item.salesRep,
        soldQty: item.soldQty,
        pickedQty: item.pickedQty,
        originalQty: item.originalQty,
        totalAmount: item.totalAmount,
        paymentMethod: displayMethod,
        saleId: item.saleId,
        operator: item.operator,
        productName: item.productName,
        collectionNote,
        isCollectionReportMode,
        workHours: item.workHours > 0 ? item.workHours : "",
        weather: 'SUNNY'
      };
    });
  },

  // 獲取指定日期範圍的銷售紀錄 (用於合併列印)
  async getSalesByDateRange(payload: any) {
    const { startDate, endDate } = payload;
    if (!startDate || !endDate) return [];

    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);

    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const disabledCustomers = await prisma.customer.findMany({
      where: { isAiEnabled: false },
      select: { customerName: true }
    });
    const disabledNames = disabledCustomers.map(c => c.customerName || '');

    const sales = await prisma.sales.findMany({
      where: {
        status: { not: 'VOID' },
        customer: { notIn: disabledNames },
        date: {
          gte: start,
          lte: end
        }
      },
      orderBy: { date: 'desc' }
    });

    if (sales.length === 0) return [];

    const saleIds = sales.map(s => s.saleId);

    const details = await prisma.salesDetail.findMany({
      where: {
        saleId: { in: saleIds }
      },
      include: {
        product: true
      }
    });

    const detailsMap = new Map<string, any[]>();
    for (const d of details) {
      if (!detailsMap.has(d.saleId)) {
        detailsMap.set(d.saleId, []);
      }
      if (Number(d.sold) > 0 || Number(d.picked) > 0 || Number(d.original) > 0 || Number(d.returnQty) > 0) {
        detailsMap.get(d.saleId)!.push({
          productId: d.productId,
          productName: d.product.productName,
          picked: Number(d.picked),
          original: Number(d.original),
          returns: Number(d.returnQty),
          sold: Number(d.sold),
          unitPrice: Number(d.unitPrice)
        });
      }
    }

    return sales.map(s => ({
      saleId: s.saleId,
      date: s.date.toISOString(),
      customer: s.customer || '',
      salesRep: s.salesRep,
      paymentMethod: s.paymentMethod || 'CASH',
      totalAmount: s.finalTotal != null ? Number(s.finalTotal) : 0,
      workHours: s.workHours != null ? Number(s.workHours) : 0,
      salesData: detailsMap.get(s.saleId) || []
    }));
  },

  // AI 智慧補貨建議 (移植自 Sales_AI.gs - 支援箱數進位與發貨階梯)
  async getSmartPickSuggestion(payload: any) {
    const { customer, dayOfWeek, weather, currentOriginals = {} } = payload;
    const PICK_ROUND_THRESHOLD = 99; // 預設進位門檻

    // 1. 查倉庫庫存 (STOCK 類型加總)
    const stockAgg = await prisma.inventory.groupBy({
      by: ['productId'],
      where: { type: 'STOCK' },
      _sum: { quantity: true }
    });
    const warehouseStockMap: Record<string, number> = {};
    stockAgg.forEach(item => {
      warehouseStockMap[item.productId] = item._sum.quantity || 0;
    });

    // 2. 查所有產品設定 (箱數、發貨階梯、抑制等)
    const dbProducts = await prisma.product.findMany({
      select: {
        productId: true,
        productName: true,
        packSize: true,
        dispatchSteps: true,
        roundThreshold: true,
        autoSuppress: true,
        maxSuggestion: true
      }
    });
    const productSettingsMap: Record<string, typeof dbProducts[0]> = {};
    dbProducts.forEach(p => {
      productSettingsMap[p.productId] = p;
    });

    // 3. 查近 60 天的銷售記錄（同客戶、不是 VOID）
    const since = new Date();
    since.setDate(since.getDate() - 60);

    const historySales = await prisma.sales.findMany({
      where: {
        customer: customer,
        status: { not: 'VOID' },
        date: { gte: since }
      },
      select: { saleId: true, date: true },
      orderBy: { date: 'desc' }
    });

    // 4. 篩選：同星期的（DOW only）
    const dowMatches = historySales.filter(s => new Date(s.date).getDay() === dayOfWeek);
    const sampleIds = dowMatches.slice(0, 3).map(s => s.saleId);

    if (sampleIds.length === 0) {
      return {
        success: true,
        suggestions: {},
        fallbackLevel: 'NO_DATA',
        message: '此星期尚無歷史數據可供分析'
      };
    }

    // 5. 查這幾筆的明細
    const details = await prisma.salesDetail.findMany({
      where: { saleId: { in: sampleIds } },
      select: { saleId: true, productId: true, sold: true }
    });

    // 6. 建立 per-product per-sale 的 sold map
    const salesStatsMap: Record<string, Record<string, number>> = {};
    details.forEach(d => {
      if (Number(d.sold) <= 0) return;
      if (!salesStatsMap[d.productId]) salesStatsMap[d.productId] = {};
      salesStatsMap[d.productId][d.saleId] = Number(d.sold);
    });

    // 7. 計算加權平均並生成建議量
    const weightsConfig: Record<number, number[]> = {
      1: [1.0],
      2: [0.6, 0.4],
      3: [0.5, 0.3, 0.2]
    };

    const suggestions: Record<string, number> = {};
    let hasStockShortage = false;

    for (const pId in salesStatsMap) {
      const itemGrid = salesStatsMap[pId];
      const actualValues = sampleIds.map(id => itemGrid[id] || 0);
      const count = actualValues.length;
      const activeWeights = weightsConfig[count] || [1 / count];

      let weightedAvg = 0;
      for (let i = 0; i < count; i++) {
        weightedAvg += actualValues[i] * activeWeights[i];
      }

      // 讀取產品 AI 進位與階梯設定
      const pSetting = productSettingsMap[pId] || {
        packSize: 1,
        dispatchSteps: [],
        roundThreshold: PICK_ROUND_THRESHOLD,
        autoSuppress: false,
        maxSuggestion: 0
      };

      const packSize = pSetting.packSize || 1;
      const roundThreshold = pSetting.roundThreshold !== undefined ? pSetting.roundThreshold : PICK_ROUND_THRESHOLD;
      const autoSuppress = pSetting.autoSuppress || false;
      const maxSuggestion = pSetting.maxSuggestion || 0;

      // 解析發貨階梯
      let dispatchSteps: number[] = [];
      if (Array.isArray(pSetting.dispatchSteps)) {
        dispatchSteps = pSetting.dispatchSteps as number[];
      } else if (typeof pSetting.dispatchSteps === 'string') {
        try {
          dispatchSteps = JSON.parse(pSetting.dispatchSteps);
        } catch {
          dispatchSteps = [];
        }
      }

      // 建議量 = 加權平均 * 1.1，無條件進位
      let target = Math.ceil(weightedAvg * 1.1);

      // 如果有定義發貨階梯，則使用階梯對齊；否則使用 packSize 倍數對齊 (套用產品門檻)
      if (dispatchSteps && dispatchSteps.length > 0) {
        target = snapToDispatchSteps(target, dispatchSteps);
      } else {
        const fullBoxes = Math.floor(target / packSize);
        const remainder = target % packSize;
        if (remainder >= roundThreshold) {
          target = (fullBoxes + 1) * packSize;
        } else {
          target = (fullBoxes * packSize) + Math.ceil(remainder);
        }
      }

      // 扣掉身上已有的貨 (Returns)
      const onTruck = Number(currentOriginals[pId] || 0);
      const rawNeed = target - onTruck;
      let needToPick = 0;

      if (rawNeed <= 0) {
        needToPick = 0;
      } else if (autoSuppress && rawNeed < roundThreshold && onTruck >= (packSize / 2)) {
        // [智慧抑制] 雖有缺口但身上還有一半貨，且缺口小於門檻，建議不領
        needToPick = 0;
      } else {
        needToPick = rawNeed;
        if (dispatchSteps && dispatchSteps.length > 0) {
          needToPick = snapToDispatchSteps(needToPick, dispatchSteps);
        } else {
          const pickFullBoxes = Math.floor(needToPick / packSize);
          const pickRemainder = needToPick % packSize;
          if (pickRemainder >= roundThreshold) {
            needToPick = (pickFullBoxes + 1) * packSize;
          } else {
            needToPick = (pickFullBoxes * packSize) + Math.ceil(pickRemainder);
          }
        }
      }

      // 不超過倉庫庫存
      const warehouseQty = warehouseStockMap[pId] || 0;
      if (needToPick > warehouseQty) {
        needToPick = warehouseQty;
        hasStockShortage = true;
      }

      if (needToPick > 0) {
        // 執行最大建議量上限 (Max Cap)
        if (maxSuggestion > 0 && needToPick > maxSuggestion) {
          needToPick = maxSuggestion;
        }
        suggestions[pId] = needToPick;
      }
    }

    const fallbackLevel = 'DOW_ONLY'; 
    const message = `已根據過去同一星期的平均銷售量為您預估${hasStockShortage ? ' (⚠️ 部分品項庫存不足)' : ''}。`;

    return { success: true, suggestions, fallbackLevel, message };
  },

  // 更新客戶 AI 送貨排程與設定 (地點排程後台)
  async updateCustomerSettings(payload: any) {
    const { customerName, isAiEnabled, schedule, category } = payload;
    if (!customerName) throw new Error('缺少客戶/地點名稱');

    const updated = await prisma.customer.upsert({
      where: { customerName: String(customerName).trim() },
      update: {
        isAiEnabled: isAiEnabled !== undefined ? Boolean(isAiEnabled) : undefined,
        schedule: schedule !== undefined ? schedule : undefined,
        category: category !== undefined ? String(category) : undefined
      },
      create: {
        customerName: String(customerName).trim(),
        isAiEnabled: isAiEnabled !== undefined ? Boolean(isAiEnabled) : true,
        schedule: schedule !== undefined ? schedule : [],
        category: category !== undefined ? String(category) : '市場'
      }
    });

    return { success: true, updated };
  },



  async getReportDataBatch(payload: any, user: any) {
    const { startDate, endDate, fetchPivotData } = payload;
    const historyPayload = { startDate, endDate };

    const sales = await this.getSalesHistory(historyPayload, user);

    // Get expenditures
    const expWhere: any = {};
    if (startDate || endDate) {
      expWhere.timestamp = {};
      if (startDate) {
        const d = new Date(startDate);
        d.setHours(0, 0, 0, 0);
        expWhere.timestamp.gte = d;
      }
      if (endDate) {
        const d = new Date(endDate);
        d.setHours(23, 59, 59, 999);
        expWhere.timestamp.lte = d;
      }
    }

    // Fetch all sales orders in this date range to get their status (for double verification on VOID)
    let voidedSaleIds = new Set<string>();
    if (expWhere.timestamp) {
      const salesOrders = await prisma.sales.findMany({
        where: {
          date: {
            gte: expWhere.timestamp.gte,
            lte: expWhere.timestamp.lte
          }
        },
        select: {
          saleId: true,
          status: true
        }
      });
      voidedSaleIds = new Set(
        salesOrders.filter(s => s.status === 'VOID').map(s => s.saleId)
      );
    }

    // 1. 撈取記帳日期在範圍內的支出 (Primary Items)
    const expenditures = await prisma.expenditure.findMany({
      where: expWhere,
      orderBy: { timestamp: 'desc' }
    });

    // 雙重過濾：除了檢查備註 [VOID] 之外，也檢查對應的銷售單是否為 VOID
    const activeExpenditures = expenditures.filter(e => {
      if (e.note && e.note.includes('[VOID]')) return false;
      if (e.saleId && voidedSaleIds.has(e.saleId)) return false;
      return true;
    });

    const formattedExpenditures = activeExpenditures.map(e => {
      const isTransfer = e.paymentMethod === 'TRANSFER';
      const salary = Number(e.salary);
      let excludeFromCashFlow = false;

      if (salary > 0 && !isTransfer && e.paymentDate) {
        const pd = new Date(e.paymentDate);
        const start = startDate ? new Date(startDate) : null;
        if (start) start.setHours(0, 0, 0, 0);
        const end = endDate ? new Date(endDate) : null;
        if (end) end.setHours(23, 59, 59, 999);

        if ((start && pd < start) || (end && pd > end)) {
          excludeFromCashFlow = true;
        }
      }

      return {
        saleId: e.saleId,
        stall: Number(e.stall),
        cleaning: Number(e.cleaning),
        electricity: Number(e.electricity),
        gas: Number(e.gas),
        parking: Number(e.parking),
        goods: Number(e.goods),
        bags: Number(e.bags),
        others: Number(e.others),
        linePay: Number(e.linePay),
        serviceFee: Number(e.serviceFee),
        totalDeductions: Number(e.totalDeductions),
        finalTotal: Number(e.totalDeductions),
        customer: e.customer || '',
        salesRep: e.salesRep || '',
        date: e.timestamp,
        timestamp: e.timestamp,
        vehicleMaintenance: Number(e.vehicleMaintenance),
        salary,
        reserve: Number(e.reserve),
        note: e.note || '',
        paymentMethod: e.paymentMethod || 'CASH',
        paymentDate: e.paymentDate,
        excludeFromCashFlow,
        cashFlowOnly: false
      };
    });

    // 2. 撈取「記帳日期不在範圍內、但付款日期在範圍內」的現金薪資分錄 (Cash Flow Items)
    let formattedCashFlow: any[] = [];
    if (expWhere.timestamp) {
      const cashFlowExpenditures = await prisma.expenditure.findMany({
        where: {
          salary: { gt: 0 },
          paymentMethod: { not: 'TRANSFER' },
          paymentDate: {
            gte: expWhere.timestamp.gte,
            lte: expWhere.timestamp.lte
          },
          NOT: {
            timestamp: {
              gte: expWhere.timestamp.gte,
              lte: expWhere.timestamp.lte
            }
          }
        },
        orderBy: { timestamp: 'desc' }
      });

      // 針對 Cash Flow 的銷售單狀態做雙重過濾
      const cashFlowSaleIds = cashFlowExpenditures.map(e => e.saleId).filter(Boolean);
      const cashFlowSales = await prisma.sales.findMany({
        where: {
          saleId: { in: cashFlowSaleIds }
        },
        select: {
          saleId: true,
          status: true
        }
      });
      const voidedCashFlowSaleIds = new Set(
        cashFlowSales.filter(s => s.status === 'VOID').map(s => s.saleId)
      );

      const activeCashFlow = cashFlowExpenditures.filter(e => {
        if (e.note && e.note.includes('[VOID]')) return false;
        if (e.saleId && voidedCashFlowSaleIds.has(e.saleId)) return false;
        return true;
      });

      formattedCashFlow = activeCashFlow.map(e => ({
        saleId: e.saleId,
        stall: Number(e.stall),
        cleaning: Number(e.cleaning),
        electricity: Number(e.electricity),
        gas: Number(e.gas),
        parking: Number(e.parking),
        goods: Number(e.goods),
        bags: Number(e.bags),
        others: Number(e.others),
        linePay: Number(e.linePay),
        serviceFee: Number(e.serviceFee),
        totalDeductions: Number(e.totalDeductions),
        finalTotal: Number(e.totalDeductions),
        customer: e.customer || '',
        salesRep: e.salesRep || '',
        date: e.timestamp,
        timestamp: e.timestamp,
        vehicleMaintenance: Number(e.vehicleMaintenance),
        salary: Number(e.salary),
        reserve: Number(e.reserve),
        note: e.note || '',
        paymentMethod: e.paymentMethod || 'CASH',
        paymentDate: e.paymentDate,
        excludeFromCashFlow: false,
        cashFlowOnly: true
      }));
    }

    const finalExpenditures = [...formattedExpenditures, ...formattedCashFlow];

    let purchases: any[] = [];
    let inventory: any = null;
    let adjustments: any[] = [];

    if (fetchPivotData) {
      const purWhere: any = {};
      if (startDate || endDate) {
        purWhere.date = {};
        if (startDate) {
          const d = new Date(startDate);
          d.setHours(0, 0, 0, 0);
          purWhere.date.gte = d;
        }
        if (endDate) {
          const d = new Date(endDate);
          d.setHours(23, 59, 59, 999);
          purWhere.date.lte = d;
        }
      }
      purchases = await prisma.purchase.findMany({
        where: purWhere,
        orderBy: { date: 'desc' }
      });

      // Get current inventory levels
      inventory = await prisma.inventory.findMany({
        orderBy: { entryDate: 'desc' }
      });

      // Adjustments (inventory type changes that aren't sales)
      adjustments = await prisma.inventory.findMany({
        where: {
          type: { notIn: ['STOCK', 'ORIGINAL'] }
        },
        orderBy: { entryDate: 'desc' }
      });
    }

    return {
      sales,
      expenditures: finalExpenditures,
      purchases,
      inventory,
      adjustments
    };
  },

  // 獲取銷售登錄頁面初始化資料
  async initSalesPageData(payload: any, user: any) {
    const targetUser = payload?.targetUser || user?.username;
    const isCorrectionMode = payload?.isCorrectionMode || false;

    // 1. 取得商品與庫存
    const products = await prisma.product.findMany({
      orderBy: { sortWeight: 'asc' }
    });

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

    const formattedProducts = products.map(p => {
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
        stock: stockInfo.stock,
        originalStock: stockInfo.originalStock,
        isActive: p.isActive,
        imageUrl: p.imageUrl || '',
        expiryDate: p.expiryDate || '',
        category: p.category || '',
        has_flavor_attributes: p.hasFlavorAttributes,
        flavor_choices: flavorChoices,
        single_price: Number(p.singlePrice),
        has_volume_pricing: p.hasVolumePricing,
        volume_pricing_settings: p.volumePricingSettings,
        sortWeight: p.sortWeight,
        _fromSheet: 'Products'
      };
    });

    // 2. 獲取與初始化客戶 AI 送貨排程與設定 (與原 Customers sheet 行為一致)
    // 讀取 DB 中已有的 Customer 設定
    const dbCustomers = await prisma.customer.findMany();
    const dbCustomerMap: Record<string, { isAiEnabled: boolean; schedule: number[]; category: string }> = {};
    dbCustomers.forEach(c => {
      let scheduleArr: number[] = [];
      if (Array.isArray(c.schedule)) {
        scheduleArr = c.schedule as number[];
      } else if (typeof c.schedule === 'string') {
        try {
          scheduleArr = JSON.parse(c.schedule);
        } catch {
          scheduleArr = [0, 1, 2, 3, 4, 5, 6];
        }
      } else {
        scheduleArr = [0, 1, 2, 3, 4, 5, 6];
      }
      dbCustomerMap[c.customerName] = {
        isAiEnabled: c.isAiEnabled,
        schedule: scheduleArr,
        category: c.category
      };
    });

    // 計算最近 90 天銷售數據作為新地點初始化排程用
    const since90 = new Date();
    since90.setDate(since90.getDate() - 90);
    const recentSales = await prisma.sales.findMany({
      where: {
        status: { not: 'VOID' },
        customer: { not: '' },
        date: { gte: since90 }
      },
      select: { customer: true, date: true }
    });

    const customerStats: Record<string, { total: number; dow: number[] }> = {};
    for (const s of recentSales) {
      const name = s.customer;
      if (!name) continue;
      if (!customerStats[name]) {
        customerStats[name] = { total: 0, dow: [0, 0, 0, 0, 0, 0, 0] };
      }
      customerStats[name].total++;
      customerStats[name].dow[new Date(s.date).getDay()]++;
    }

    // 取得系統所有不重複的客戶
    const allCustomerNames = new Set<string>(
      (await prisma.sales.findMany({
        where: { customer: { not: '' } },
        select: { customer: true },
        distinct: ['customer']
      })).map(s => s.customer).filter(Boolean) as string[]
    );

    const systemCustomers = [];

    for (const name of Array.from(allCustomerNames)) {
      const dbRecord = dbCustomerMap[name];
      if (dbRecord) {
        // 如果資料庫中已有設定，直接使用
        systemCustomers.push({
          name,
          isAiEnabled: dbRecord.isAiEnabled,
          schedule: dbRecord.schedule,
          category: dbRecord.category
        });
      } else {
        // 新地點：利用近 90 天推估排程並進行初始化，寫回資料庫
        const stats = customerStats[name];
        let schedule: number[] = [];
        if (stats && stats.total > 0) {
          schedule = [0, 1, 2, 3, 4, 5, 6].filter(d => {
            const cnt = stats.dow[d];
            return cnt >= 2 || (cnt / stats.total) >= 0.2;
          });
        } else {
          schedule = [0, 1, 2, 3, 4, 5, 6];
        }

        // 寫入 DB 以便日後鎖定
        await prisma.customer.create({
          data: {
            customerName: name,
            isAiEnabled: true,
            schedule: schedule,
            category: '市場'
          }
        }).catch(err => console.error(`Failed to initialize customer setting for ${name}:`, err));

        systemCustomers.push({
          name,
          isAiEnabled: true,
          schedule,
          category: '市場'
        });
      }
    }

    systemCustomers.sort((a, b) => a.name.localeCompare(b.name, 'zh-TW'));


    // 3. 取得該人員的員工類別 (工讀或正職)
    let empType = 'FULL_TIME';
    if (targetUser) {
      const payrollSetting = await prisma.payrollSetting.findUnique({
        where: { username: targetUser }
      });
      if (payrollSetting) {
        empType = payrollSetting.empType;
      }
    }

    // 4. 修正模式下，獲取所有使用者名稱列表
    let usersList: string[] = [];
    if (isCorrectionMode) {
      const users = await prisma.user.findMany({
        select: { username: true }
      });
      usersList = users.map(u => u.username);
    }

    return {
      success: true,
      data: {
        products: formattedProducts,
        systemCustomers,
        empType,
        usersList
      },
      versions: {
        products: Date.now(),
        customers: Date.now(),
        users: Date.now()
      },
      benchmark: {
        total: 10
      }
    };
  }
};

// FIFO 庫存扣除邏輯 helper
async function deductInventory(productId: string, qtyToDeduct: number, targetType: string) {
  let remaining = qtyToDeduct;
  const consumed: Array<{ expiryDate: Date | null; quantity: number }> = [];

  // 1. 獲取該商品的可扣除批次，並按過期日（expiryDate）升序排列 (FIFO)
  const batches = await prisma.inventory.findMany({
    where: {
      productId,
      quantity: { gt: 0 },
      type: targetType === 'STOCK' ? 'STOCK' : { not: 'STOCK' }
    },
    orderBy: { expiryDate: 'asc' }
  });

  // 2. 逐一扣除庫存並寫回資料庫
  for (const batch of batches) {
    if (remaining <= 0) break;

    const deduct = Math.min(batch.quantity, remaining);
    remaining -= deduct;

    await prisma.inventory.update({
      where: { batchId: batch.batchId },
      data: { quantity: batch.quantity - deduct }
    });

    consumed.push({
      expiryDate: batch.expiryDate,
      quantity: deduct
    });
  }

  return consumed;
}
