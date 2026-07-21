import { Prisma } from '@prisma/client';
import { prisma, runInTransaction } from '../database/context.js';
import { ProductService } from './product.service.js';
import { deductInventory } from './sales.service.js';

function generateOrderId(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `GB${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

export const GroupBuyService = {

  // 1. 取得訂單列表（按狀態篩選）
  async getPendingOrders(payload: any, user: any) {
    if (user.role !== 'BOSS' && user.role !== 'ADMIN') throw new Error('權限不足');
    const { status } = payload || {};

    const where: any = {};
    if (status === 'UNPAID') {
      where.OR = [
        { paymentStatus: null },
        { paymentStatus: '' },
        {
          AND: [
            { NOT: { paymentStatus: { contains: '已付款' } } },
            { NOT: { paymentStatus: { contains: '已入帳' } } }
          ]
        }
      ];
    } else if (status) {
      where.status = status;
    }

    const orders = await prisma.groupBuyOrder.findMany({
      where,
      include: {
        details: true,
        recipients: {
          include: { items: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return orders.map((o: any) => ({
      orderId: o.orderId,
      status: o.status,
      customerLineId: o.customerLineId || '',
      customerName: o.customerName || '',
      customerPhone: o.customerPhone || '',
      deliveryAddress: o.deliveryAddress || '',
      sourceGroup: o.sourceGroup || '',
      note: o.note || '',
      totalAmount: Number(o.totalAmount),
      shippingFee: Number(o.shippingFee) || 0,
      paymentMethod: o.paymentMethod || '',
      transferLastFive: o.transferLastFive || '',
      paymentStatus: o.paymentStatus || '',
      lineDisplayName: o.lineDisplayName || '',
      createdAt: o.createdAt?.toISOString() || '',
      updatedAt: o.updatedAt?.toISOString() || '',
      confirmedAt: o.confirmedAt?.toISOString() || '',
      confirmedBy: o.confirmedBy || '',
      expectedDeliveryDate: o.expectedDeliveryDate || '',
      recipients: (o.recipients || []).map((r: any) => ({
        recipientId: r.recipientId,
        recipientName: r.recipientName,
        note: r.note || '',
        items: (r.items || []).map((ri: any) => ({
          productId: ri.productId,
          productName: ri.productName,
          qty: Number(ri.qty),
          price: Number(ri.price)
        }))
      })),
      items: (o.details || []).map((d: any) => ({
        productId: d.productId || '',
        productName: d.productName || '',
        unitPrice: Number(d.unitPrice),
        qty: Number(d.qty),
        subtotal: Number(d.subtotal),
        remark: d.remark || ''
      }))
    }));
  },

  // 2. 客戶送出訂單 (PENDING)
  async savePendingOrder(payload: any, user: any) {
    const { customerName, customerPhone, deliveryAddress, sourceGroup, note, items,
            paymentMethod, transferLastFive, lineDisplayName, lineUserId, source } = payload;

    if (!items || !Array.isArray(items) || items.length === 0) {
      throw new Error('訂單明細不得為空');
    }

    const orderId = generateOrderId();
    const totalAmount = items.reduce((sum: number, item: any) =>
      sum + (Number(item.unitPrice) * Number(item.qty)), 0);

    let paymentStatus = '';
    if (paymentMethod === '現金') paymentStatus = '貨到付款';
    else if (paymentMethod === '轉帳') paymentStatus = '待對帳';
    else if (paymentMethod === 'LINE Pay') paymentStatus = '待確認';

    await prisma.groupBuyOrder.create({
      data: {
        orderId,
        status: 'PENDING',
        customerLineId: lineUserId || user.username || '',
        customerName: customerName || '',
        customerPhone: customerPhone || '',
        deliveryAddress: deliveryAddress || '',
        sourceGroup: sourceGroup || '',
        note: note || '',
        totalAmount,
        paymentMethod: paymentMethod || '',
        transferLastFive: transferLastFive || '',
        paymentStatus,
        lineDisplayName: lineDisplayName || '',
        source: source || 'NORMAL',
        expectedDeliveryDate: payload.expectedDeliveryDate || '',
        details: {
          create: items.map((item: any) => ({
            productId: item.productId || '',
            productName: item.productName || '',
            unitPrice: Number(item.unitPrice) || 0,
            qty: Number(item.qty) || 0,
            subtotal: Number(item.unitPrice) * Number(item.qty),
            remark: item.remark || ''
          }))
        }
      }
    });

    return { success: true, orderId };
  },

  // 3. 管理員修改訂單
  async updatePendingOrder(payload: any, user: any) {
    if (user.role !== 'BOSS' && user.role !== 'ADMIN') throw new Error('權限不足');
    const { orderId, customerName, customerPhone, deliveryAddress, sourceGroup, note,
            items, paymentMethod, transferLastFive, paymentStatus, recipients, shippingFee } = payload;
    if (!orderId) throw new Error('缺少 orderId');

    const updateData: any = { updatedAt: new Date() };
    if (customerName !== undefined) updateData.customerName = customerName;
    if (customerPhone !== undefined) updateData.customerPhone = customerPhone;
    if (deliveryAddress !== undefined) updateData.deliveryAddress = deliveryAddress;
    if (sourceGroup !== undefined) updateData.sourceGroup = sourceGroup;
    if (note !== undefined) updateData.note = note;
    if (paymentMethod !== undefined) updateData.paymentMethod = paymentMethod;
    if (transferLastFive !== undefined) updateData.transferLastFive = transferLastFive;
    if (paymentStatus !== undefined) updateData.paymentStatus = paymentStatus;
    if (payload.expectedDeliveryDate !== undefined) updateData.expectedDeliveryDate = payload.expectedDeliveryDate;

    // 計算商品總額
    let productTotal = 0;
    if (Array.isArray(items) && items.length > 0) {
      productTotal = items.reduce((sum: number, item: any) =>
        sum + (Number(item.unitPrice) * Number(item.qty)), 0);
    } else {
      const details = await prisma.groupBuyOrderDetail.findMany({ where: { orderId } });
      productTotal = details.reduce((sum: number, item: any) =>
        sum + (Number(item.unitPrice) * Number(item.qty)), 0);
    }

    // 判斷來源群組
    const targetGroup = sourceGroup !== undefined ? sourceGroup : '';
    const isGeneralUser = !targetGroup || targetGroup === '一般散客' || targetGroup === '線上下單';

    let finalShippingFee = 0;

    if (shippingFee !== undefined) {
      // 若前端/管理員傳入了明確的運費金額 (如 $80)，直接採用
      finalShippingFee = Number(shippingFee) || 0;
    } else if (!isGeneralUser) {
      // 團購社區訂單一律免運 (0 元)
      finalShippingFee = 0;
    } else {
      // 線上下單 / 一般散客：依據地址包含的行政區/外送區域自動比對運費標準 (如「台南市玉井區」、「永康區」)
      const addr = String(deliveryAddress || '').trim();
      const getCleanName = (str: string) => String(str || '').replace(/^(台南市|高雄市|台灣|臺灣)/, '').replace(/^線上下單\s*-\s*/, '').trim();
      const addrClean = getCleanName(addr);

      const allComms = await prisma.groupBuyCommunity.findMany({
        where: { status: 'ACTIVE' }
      });

      // 依區域名稱長度降序排序，優先比對最精確的行政區名稱
      const sortedComms = allComms.sort((a, b) => (b.communityName?.length || 0) - (a.communityName?.length || 0));
      const matchedComm = sortedComms.find(c => {
        if (!c.communityName) return false;
        const commClean = getCleanName(c.communityName);
        if (!commClean) return false;
        return addrClean.includes(commClean) || commClean.includes(addrClean);
      });

      if (matchedComm) {
        if (matchedComm.defaultFreeShipping) {
          finalShippingFee = 0;
        } else {
          const min = Number(matchedComm.freeShippingMin) || 0;
          const fee = Number(matchedComm.shippingFee) || 0;
          if (min > 0 && productTotal >= min) {
            finalShippingFee = 0;
          } else {
            finalShippingFee = fee;
          }
        }
      } else {
        finalShippingFee = 150; // 線上下單若未比對到已知區域，預設外送運費
      }
    }

    updateData.shippingFee = finalShippingFee;
    updateData.totalAmount = productTotal + finalShippingFee;

    await prisma.$transaction(async (tx) => {
      // 1. 更新主訂單
      await tx.groupBuyOrder.update({ where: { orderId }, data: updateData });

      // 2. 如果有更新商品明細，刪舊重建
      if (Array.isArray(items) && items.length > 0) {
        await tx.groupBuyOrderDetail.deleteMany({ where: { orderId } });
        await tx.groupBuyOrderDetail.createMany({
          data: items.map((item: any) => ({
            orderId,
            productId: item.productId || '',
            productName: item.productName || '',
            unitPrice: Number(item.unitPrice) || 0,
            qty: Number(item.qty) || 0,
            subtotal: Number(item.unitPrice) * Number(item.qty),
            remark: item.remark || ''
          }))
        });
      }

      // 3. 如果有更新團員分配明細，刪舊重建
      if (recipients !== undefined) {
        await tx.groupBuyOrderRecipient.deleteMany({ where: { orderId } });

        if (Array.isArray(recipients) && recipients.length > 0) {
          for (const r of recipients) {
            await tx.groupBuyOrderRecipient.create({
              data: {
                orderId,
                recipientName: r.recipientName,
                note: r.note || '',
                items: {
                  create: (r.items || []).map((ri: any) => ({
                    productId: ri.productId,
                    productName: ri.productName,
                    qty: Number(ri.qty) || 0,
                    price: Math.round(Number(ri.price)) || 0
                  }))
                }
              }
            });
          }
        }
      }
    });

    return { success: true };
  },

  // 4. 確認出貨：PENDING → CONFIRMED，並寫入正式銷售單
  async confirmPendingOrder(payload: any, user: any) {
    if (user.role !== 'BOSS' && user.role !== 'ADMIN') throw new Error('權限不足');
    const { orderId } = payload;
    if (!orderId) throw new Error('缺少 orderId');

    const order = await prisma.groupBuyOrder.findUnique({
      where: { orderId },
      include: { details: true }
    });
    if (!order) throw new Error('找不到訂單：' + orderId);
    if (order.status !== 'PENDING') throw new Error('此訂單已不是 PENDING 狀態');
    if (!order.details || order.details.length === 0) throw new Error('訂單明細為空，無法確認出貨');

    const now = new Date();

    const productIds = (order.details as any[]).map((d: any) => d.productId).filter(Boolean);
    const orderProds = await prisma.product.findMany({
      where: { productId: { in: productIds } }
    });
    const orderProdMap = new Map(orderProds.map(p => [p.productId, p]));

    // 寫入正式銷售單
    await prisma.sales.create({
      data: {
        saleId: orderId,
        date: now,
        salesRep: user.username,
        operator: user.username,
        customer: (order.customerName || '') + (order.deliveryAddress ? ' ' + order.deliveryAddress : ''),
        paymentMethod: order.paymentMethod === '轉帳' ? 'TRANSFER' : 
                       order.paymentMethod === 'LINE Pay' ? 'LINEPAY' :
                       (order.paymentMethod === '奶包金扣抵' || order.paymentMethod === '奶包金') ? 'WALLET' : 'CASH',
        status: 'PAID',
        totalCash: (order.paymentMethod === '現金' || !order.paymentMethod) ? order.totalAmount : 0,
        finalTotal: order.totalAmount,
        details: {
          create: (order.details as any[]).map((d: any) => {
            const prod = orderProdMap.get(d.productId);
            const multiplier = (prod && prod.isBundle) ? Number(prod.bundleSize || 1) : 1;
            const finalSold = Number(d.qty) * multiplier;

            return {
              productId: d.productId || 'UNKNOWN',
              sold: finalSold,
              picked: finalSold,
              original: 0,
              subtotal: Number(d.subtotal),
              unitPrice: Number(d.unitPrice)
            };
          })
        }
      }
    });

    // 扣除庫存 (FIFO)
    for (const d of order.details as any[]) {
      const qty = Number(d.qty || 0);
      if (qty > 0) {
        const prod = orderProdMap.get(d.productId);
        const multiplier = (prod && prod.isBundle) ? Number(prod.bundleSize || 1) : 1;
        const totalDeduct = qty * multiplier;

        await deductInventory(d.productId, totalDeduct, 'STOCK');
      }
    }

    // 更新訂單狀態
    await prisma.groupBuyOrder.update({
      where: { orderId },
      data: { status: 'CONFIRMED', confirmedAt: now, confirmedBy: user.username }
    });

    return { success: true, orderId };
  },

  // 5. 刪除 PENDING 訂單
  async deletePendingOrder(payload: any, user: any) {
    if (user.role !== 'BOSS' && user.role !== 'ADMIN') throw new Error('權限不足');
    const { orderId } = payload;
    if (!orderId) throw new Error('缺少 orderId');

    const order = await prisma.groupBuyOrder.findUnique({ where: { orderId } });
    if (!order) throw new Error('找不到訂單：' + orderId);
    if (order.status !== 'PENDING') throw new Error('此訂單已非 PENDING 狀態，無法刪除');

    // Cascade 會自動刪明細
    await prisma.groupBuyOrder.delete({ where: { orderId } });
    return { success: true, orderId };
  },

  // 5a. 批次確認出貨
  async batchConfirmPendingOrders(payload: any, user: any) {
    if (user.role !== 'BOSS' && user.role !== 'ADMIN') throw new Error('權限不足');
    const { orderIds } = payload;
    if (!orderIds || !Array.isArray(orderIds)) throw new Error('缺少 orderIds');

    return runInTransaction(async () => {
      for (const orderId of orderIds) {
        await GroupBuyService.confirmPendingOrder({ orderId }, user);
      }
      return { success: true, count: orderIds.length };
    });
  },

  // 5b. 批次確認收款
  async batchConfirmPayments(payload: any, user: any) {
    if (user.role !== 'BOSS' && user.role !== 'ADMIN') throw new Error('權限不足');
    const { orderIds } = payload;
    if (!orderIds || !Array.isArray(orderIds)) throw new Error('缺少 orderIds');

    return runInTransaction(async () => {
      const now = new Date();
      await prisma.groupBuyOrder.updateMany({
        where: { orderId: { in: orderIds } },
        data: { paymentStatus: '已付款', updatedAt: now }
      });
      return { success: true, count: orderIds.length };
    });
  },

  // 5c. 批次刪除 pending 訂單
  async batchDeletePendingOrders(payload: any, user: any) {
    if (user.role !== 'BOSS' && user.role !== 'ADMIN') throw new Error('權限不足');
    const { orderIds } = payload;
    if (!orderIds || !Array.isArray(orderIds)) throw new Error('缺少 orderIds');

    return runInTransaction(async () => {
      // 先確認都是 PENDING
      const orders = await prisma.groupBuyOrder.findMany({
        where: { orderId: { in: orderIds } }
      });
      for (const order of orders) {
        if (order.status !== 'PENDING') {
          throw new Error(`訂單 ${order.orderId} 不是 PENDING 狀態，無法刪除`);
        }
      }

      await prisma.groupBuyOrder.deleteMany({
        where: { orderId: { in: orderIds } }
      });
      return { success: true, count: orderIds.length };
    });
  },

  // 6. 快速變更訂單狀態
  async updateOrderStatus(payload: any, user: any) {
    if (user.role !== 'BOSS' && user.role !== 'ADMIN') throw new Error('權限不足');
    const { orderId, status, paymentStatus } = payload;
    if (!orderId) throw new Error('缺少 orderId');

    const updateData: any = { updatedAt: new Date() };
    if (status !== undefined) updateData.status = status;
    if (paymentStatus !== undefined) updateData.paymentStatus = paymentStatus;

    await prisma.groupBuyOrder.update({ where: { orderId }, data: updateData });
    return { success: true };
  },

  // 7. 取得大樓設定列表（含對應社區的運費設定）
  async getBuildingSettings(payload: any, user: any) {
    const settings = await prisma.buildingSetting.findMany({
      orderBy: [
        { sortOrder: 'asc' },
        { building: 'asc' }
      ]
    });
    // 一次查出所有社區的運費設定（依名稱匹配）
    const allComms = await prisma.groupBuyCommunity.findMany({
      select: { communityId: true, communityName: true, defaultFreeShipping: true, freeShippingMin: true, shippingFee: true }
    });
    const commMap = new Map(allComms.map((c: any) => [c.communityName, c]));

    const result = settings.map((s: any) => {
      const comm = commMap.get(s.building);
      return {
        building: s.building,
        community_id: comm?.communityId || null,
        start_time: s.startTime || '',
        end_time: s.endTime || '',
        sort_order: s.sortOrder !== undefined && s.sortOrder !== null ? s.sortOrder : 0,
        admin_note: s.adminNote || '',
        is_auto: s.isAuto || false,
        auto_open_day: s.autoOpenDay !== null && s.autoOpenDay !== undefined ? s.autoOpenDay : '',
        auto_open_time: s.autoOpenTime || '',
        auto_close_day: s.autoCloseDay !== null && s.autoCloseDay !== undefined ? s.autoCloseDay : '',
        auto_close_time: s.autoCloseTime || '',
        // 運費設定
        default_free_shipping: comm?.defaultFreeShipping || false,
        free_shipping_min: Number(comm?.freeShippingMin) || 0,
        shipping_fee: Number(comm?.shippingFee) || 0,
      };
    });

    // 補上所有在 GroupBuyCommunity 但尚未在 BuildingSetting 中的區域 (如台南市永康區等)
    const existingBuildings = new Set(result.map((r: any) => r.building));
    allComms.forEach((c: any) => {
      if (c.communityName && !existingBuildings.has(c.communityName)) {
        result.push({
          building: c.communityName,
          community_id: c.communityId,
          start_time: '',
          end_time: '',
          sort_order: 999,
          admin_note: '',
          is_auto: false,
          auto_open_day: '',
          auto_open_time: '',
          auto_close_day: '',
          auto_close_time: '',
          default_free_shipping: c.defaultFreeShipping || false,
          free_shipping_min: Number(c.freeShippingMin) || 0,
          shipping_fee: Number(c.shippingFee) || 0
        });
      }
    });

    return result;
  },

  // 8. 儲存/更新大樓設定
  async saveBuildingSettings(payload: any, user: any) {
    if (user.role !== 'BOSS' && user.role !== 'ADMIN') throw new Error('權限不足');
    const { building, start_time, end_time, sort_order, admin_note } = payload;
    if (!building) throw new Error('缺少大樓名稱');

    const updateData: any = {};
    if (start_time !== undefined) updateData.startTime = start_time || null;
    if (end_time !== undefined) updateData.endTime = end_time || null;
    if (sort_order !== undefined) updateData.sortOrder = Number(sort_order);
    if (admin_note !== undefined) updateData.adminNote = admin_note || null;

    const createData: any = {
      building,
      startTime: start_time || null,
      endTime: end_time || null,
      sortOrder: sort_order !== undefined ? Number(sort_order) : 0,
      adminNote: admin_note || null
    };

    await prisma.buildingSetting.upsert({
      where: { building },
      update: updateData,
      create: createData
    });

    // 自動同步：如果在 GroupBuyCommunity 中找不到同名社區，自動新增
    const existingComm = await prisma.groupBuyCommunity.findFirst({
      where: { communityName: building }
    });
    if (!existingComm) {
      const code = 'C' + Math.random().toString(36).substring(2, 7).toUpperCase();
      await prisma.groupBuyCommunity.create({
        data: {
          communityId: code,
          communityCode: code,
          communityName: building,
          status: 'ACTIVE',
          orderingMode: 'OPEN'
        }
      });
    }

    return { success: true };
  },

  // 8a. 刪除大樓設定與社區
  async deleteBuildingSettings(payload: any, user: any) {
    if (user.role !== 'BOSS' && user.role !== 'ADMIN') throw new Error('權限不足');
    const { building } = payload;
    if (!building) throw new Error('缺少大樓名稱');

    await prisma.buildingSetting.delete({
      where: { building }
    });

    const comm = await prisma.groupBuyCommunity.findFirst({
      where: { communityName: building }
    });
    if (comm) {
      await prisma.groupBuyCommunity.update({
        where: { communityId: comm.communityId },
        data: {
          deletedAt: new Date(),
          status: 'DELETED'
        }
      });
    }

    return { success: true };
  },

  // 8d. 批次更新大樓排序
  async reorderBuildings(payload: any, user: any) {
    if (user.role !== 'BOSS' && user.role !== 'ADMIN') throw new Error('權限不足');
    const { buildings } = payload; // string[]
    if (!Array.isArray(buildings) || buildings.length === 0) throw new Error('缺少 buildings 陣列');

    await prisma.$transaction(
      buildings.map((name: string, idx: number) =>
        prisma.buildingSetting.update({
          where: { building: name },
          data: { sortOrder: idx }
        })
      )
    );
    return { success: true };
  },

  // 8c. 修改大樓與社區名稱
  async renameBuildingSettings(payload: any, user: any) {
    if (user.role !== 'BOSS' && user.role !== 'ADMIN') throw new Error('權限不足');
    const { oldName, newName } = payload;
    if (!oldName || !newName) throw new Error('缺少舊名稱或新名稱');

    const oldSetting = await prisma.buildingSetting.findUnique({
      where: { building: oldName }
    });
    if (!oldSetting) throw new Error('找不到大樓：' + oldName);

    await prisma.$transaction(async (tx) => {
      await tx.buildingSetting.create({
        data: {
          building: newName,
          startTime: oldSetting.startTime,
          endTime: oldSetting.endTime
        }
      });
      await tx.buildingSetting.delete({
        where: { building: oldName }
      });

      const comm = await tx.groupBuyCommunity.findFirst({
        where: { communityName: oldName }
      });
      if (comm) {
        await tx.groupBuyCommunity.update({
          where: { communityId: comm.communityId },
          data: { communityName: newName }
        });
      }
    });

    return { success: true };
  },

  // 8b. 儲存社區運費設定
  async saveCommunityShipping(payload: any, user: any) {
    if (user.role !== 'BOSS' && user.role !== 'ADMIN') throw new Error('權限不足');
    const { building, default_free_shipping, free_shipping_min, shipping_fee } = payload;
    if (!building) throw new Error('缺少大樓名稱');

    // 找到對應的社區
    const comm = await prisma.groupBuyCommunity.findFirst({
      where: { communityName: building }
    });
    if (!comm) throw new Error(`找不到社區「${building}」，請先建立大樓設定`);

    await prisma.groupBuyCommunity.update({
      where: { communityId: comm.communityId },
      data: {
        defaultFreeShipping: !!default_free_shipping,
        freeShippingMin: Number(free_shipping_min) || 0,
        shippingFee: Number(shipping_fee) || 0,
      }
    });
    return { success: true };
  },

  // 9. 取得群組綁定列表
  async getGroupBindings(payload: any, user: any) {
    const bindings = await prisma.groupBinding.findMany();
    const result: Record<string, string> = {};
    bindings.forEach((b: any) => {
      result[b.groupId] = b.groupName;
    });
    return result;
  },

  // 10. 儲存/更新群組綁定
  async saveGroupBinding(payload: any, user: any) {
    const { groupId, groupName } = payload;
    if (!groupId || !groupName) throw new Error('缺少群組 ID 或名稱');

    await prisma.groupBinding.upsert({
      where: { groupId },
      update: { groupName },
      create: { groupId, groupName }
    });
    return { success: true };
  },

  // 11. LIFF V2 初始化資料 (社區 + 活躍檔期 + 商品)
  async v2_getLiffInitData(payload: any, user: any) {
    const commCode: string = payload?.c || '';
    const buildingName: string = payload?.building || '';

    // 自動同步：如果該大樓有開團設定，但尚未在 GroupBuyCommunity 建立同名社區，立即在線自動修復
    if (buildingName) {
      const bSetting = await prisma.buildingSetting.findUnique({
        where: { building: buildingName }
      });
      if (bSetting) {
        const existingComm = await prisma.groupBuyCommunity.findFirst({
          where: { communityName: buildingName }
        });
        if (!existingComm) {
          const code = 'C' + Math.random().toString(36).substring(2, 7).toUpperCase();
          await prisma.groupBuyCommunity.create({
            data: {
              communityId: code,
              communityCode: code,
              communityName: buildingName,
              status: 'ACTIVE',
              orderingMode: 'OPEN'
            }
          });
        }
      }
    }

    // 找社區：優先 communityId 精確匹配(c參數)，其次 communityName 匹配(building參數)，最後 fallback 第一筆 ACTIVE
    const communities = await prisma.groupBuyCommunity.findMany({
      where: { status: 'ACTIVE' }
    });

    let targetComm: any = null;
    if (commCode) {
      targetComm = communities.find((c: any) => c.communityId === commCode);
      if (!targetComm) {
        targetComm = await prisma.groupBuyCommunity.findUnique({
          where: { communityId: commCode }
        });
      }
    }
    if (!targetComm && buildingName) {
      targetComm = communities.find((c: any) =>
        c.communityName === buildingName || c.communityName?.includes(buildingName)
      );
      if (!targetComm) {
        targetComm = await prisma.groupBuyCommunity.findFirst({
          where: {
            OR: [
              { communityName: buildingName },
              { communityName: { contains: buildingName } }
            ]
          }
        });
      }
    }
    if (!targetComm) {
      targetComm = communities[0] || null;
    }

    if (!targetComm) {
      return { success: false, error: 'COMMUNITY_NOT_FOUND', message: '找不到對應的社區入口' };
    }

    const now = new Date();

    // 找活躍檔期
    const campaigns = await prisma.groupBuyCampaign.findMany({
      where: { communityId: targetComm.communityId },
      orderBy: { createdAt: 'desc' }
    });

    let activeCampaign: any = campaigns.find((c: any) => c.campaignStatus === 'OPEN') || null;
    let nextCampaign: any = null;
    if (!activeCampaign) {
      const upcoming = campaigns
        .filter((c: any) => (c.campaignStatus === 'DRAFT' || c.campaignStatus === 'CLOSED') && c.startTime && new Date(c.startTime) > now)
        .sort((a: any, b: any) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
      if (upcoming.length > 0) nextCampaign = upcoming[0];
    }

    // 商品列表
    const rawProducts = await ProductService.getProducts({});
    const customPrices = await prisma.communityProductPrice.findMany({
      where: { communityId: targetComm.communityId }
    });
    const customPriceMap = new Map(customPrices.map((cp: any) => [
      cp.productId, 
      {
        customPrice: Number(cp.customPrice),
        promotions: Array.isArray(cp.promotions) ? cp.promotions : (cp.promotions ? cp.promotions : [])
      }
    ]));

    const products = rawProducts.map((p: any) => {
      if (customPriceMap.has(p.id)) {
        const cp = customPriceMap.get(p.id);
        return {
          ...p,
          single_price: cp?.customPrice,
          promotions: cp?.promotions
        };
      }
      return p;
    });

    const community = {
      CommunityId: targetComm.communityId,
      CommunityName: targetComm.communityName,
      OrderingMode: targetComm.orderingMode || 'OPEN',
      OpenMessage: targetComm.openMessage || '',
      CloseMessage: targetComm.closeMessage || '',
      DefaultFreeShipping: targetComm.defaultFreeShipping || false,
      FreeShippingMin: Number(targetComm.freeShippingMin) || 0,
      ShippingFee: Number(targetComm.shippingFee) || 0,
    };

    // 取得大樓時段設定
    const bSettings = await prisma.buildingSetting.findMany({
      orderBy: [
        { sortOrder: 'asc' },
        { building: 'asc' }
      ]
    });
    const buildingSettings = bSettings.map((s: any) => ({
      building: s.building,
      start_time: s.startTime || '',
      end_time: s.endTime || ''
    }));

    // 取得群組綁定對照表
    const gBindings = await prisma.groupBinding.findMany();
    const groupBindings: Record<string, string> = {};
    gBindings.forEach((b: any) => {
      groupBindings[b.groupId] = b.groupName;
    });

    return {
      success: true,
      data: {
        community,
        activeCampaign: activeCampaign ? {
          CampaignId: activeCampaign.campaignId,
          CampaignName: activeCampaign.campaignName,
          ThemeColor: activeCampaign.themeColor || '',
          SystemAnnouncement: activeCampaign.systemAnnouncement || '',
          GroupAnnouncement: activeCampaign.groupAnnouncement || '',
          DeliveryDate: activeCampaign.deliveryDate ? activeCampaign.deliveryDate.toISOString() : null,
          DeliveryStartTime: activeCampaign.deliveryStartTime || '',
          DeliveryEndTime: activeCampaign.deliveryEndTime || ''
        } : null,
        nextOpenTime: nextCampaign?.startTime || null,
        products,
        buildingSettings,
        groupBindings,
        allCommunities: communities.map((c: any) => ({
          CommunityId: c.communityId,
          CommunityName: c.communityName,
          DefaultFreeShipping: c.defaultFreeShipping || false,
          FreeShippingMin: Number(c.freeShippingMin) || 0,
          ShippingFee: Number(c.shippingFee) || 0,
        }))
      }
    };
  },

  // 12. LIFF V2 送出訂單
  async v2_createOrder(payload: any, user: any) {
    const {
      customerName, customerPhone, deliveryAddress,
      CommunityId, CampaignId, sourceGroup,
      note, paymentMethod, transferLastFive,
      lineDisplayName, lineUserId, items,
      useWalletDeduction, walletDeductionAmount,
      shippingFee,
      isGroupOrder,
      groupCart
    } = payload;

    if (!items || items.length === 0) throw new Error('購物車為空');

    // 產生訂單號
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const dateStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
    const orderId = `GB${dateStr}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

    // 快照 community/campaign 名稱
    let commNameSnap = sourceGroup || '';
    let campNameSnap = '';

    if (CommunityId) {
      const comm = await prisma.groupBuyCommunity.findUnique({ where: { communityId: CommunityId } });
      if (comm) commNameSnap = comm.communityName;
    }
    if (CampaignId) {
      const camp = await prisma.groupBuyCampaign.findUnique({ where: { campaignId: CampaignId } });
      if (camp) campNameSnap = camp.campaignName;
    }

    const productTotal = items.reduce((sum: number, item: any) =>
      sum + (Number(item.unitPrice) * Number(item.qty)), 0);
    const appliedShippingFee = Number(shippingFee) || 0;
    const totalAmount = productTotal + appliedShippingFee;

    let finalNote = note || '';
    let deductionApplied = 0;
    let actualPaymentMethod = paymentMethod || '';

    // 如果使用錢包扣抵
    if (useWalletDeduction && lineUserId) {
      await prisma.$transaction(async (tx) => {
        const member = await tx.member.findUnique({ where: { memberId: lineUserId } });
        if (member) {
          const balance = Number(member.walletBalance);
          const maxDeduction = Math.min(balance, totalAmount);
          if (maxDeduction > 0) {
            deductionApplied = maxDeduction;
            // 扣除餘額
            await tx.member.update({
              where: { memberId: lineUserId },
              data: {
                walletBalance: {
                  decrement: maxDeduction
                }
              }
            });
            // 寫入扣款流水
            await tx.walletTransaction.create({
              data: {
                memberId: lineUserId,
                amount: -maxDeduction,
                type: 'ORDER_PAY',
                description: `消費扣抵 訂單 ${orderId}`
              }
            });
          }
        }
      }, { maxWait: 15000, timeout: 30000 });
    }

    if (deductionApplied > 0) {
      finalNote = `【奶包金扣抵: $${deductionApplied}】` + (finalNote ? ` | ${finalNote}` : '');
    }

    const combinedNote = [finalNote, transferLastFive ? `後五碼:${transferLastFive}` : ''].filter(Boolean).join(' | ');

    let paymentStatus = '';
    if (deductionApplied === totalAmount) {
      paymentStatus = '已付款';
      actualPaymentMethod = '奶包金扣抵';
    } else {
      if (paymentMethod === '現金') paymentStatus = '貨到付款';
      else if (paymentMethod === '轉帳') paymentStatus = '待對帳';
    }

    let recipientsInput: any = undefined;
    if (isGroupOrder && groupCart && typeof groupCart === 'object') {
      recipientsInput = {
        create: Object.entries(groupCart).map(([name, recipientItems]: [string, any]) => {
          return {
            recipientName: name,
            note: '',
            items: {
              create: Object.entries(recipientItems).map(([productId, qty]: [string, any]) => {
                const matchedItem = items.find((it: any) => it.productId === productId);
                const pName = matchedItem ? matchedItem.productName : productId;
                const price = matchedItem ? Math.round(Number(matchedItem.unitPrice)) : 0;
                return {
                  productId,
                  productName: pName,
                  qty: Number(qty) || 0,
                  price: price
                };
              })
            }
          };
        })
      };
    }

    await prisma.groupBuyOrder.create({
      data: {
        orderId,
        status: 'PENDING',
        customerLineId: lineUserId || '',
        customerName: customerName || '',
        customerPhone: customerPhone || '',
        deliveryAddress: deliveryAddress || '',
        sourceGroup: commNameSnap || sourceGroup || '',
        note: combinedNote,
        totalAmount,
        shippingFee: appliedShippingFee,
        paymentMethod: actualPaymentMethod,
        transferLastFive: transferLastFive || '',
        paymentStatus,
        lineDisplayName: lineDisplayName || '',
        source: 'LIFF_V2',
        confirmedAt: deductionApplied === totalAmount ? now : null, // 全額扣抵直接標記確認
        expectedDeliveryDate: payload.expectedDeliveryDate || '',
        details: {
          create: items.map((item: any) => ({
            productId: item.productId || '',
            productName: item.productName + (item.remark ? ` (${item.remark})` : ''),
            unitPrice: Number(item.unitPrice) || 0,
            qty: Number(item.qty) || 0,
            subtotal: Number(item.unitPrice) * Number(item.qty),
            remark: item.remark || ''
          }))
        },
        recipients: recipientsInput
      }
    });

    return { success: true, orderId, orderNo: orderId };
  },

  // 13. LIFF V1 取得個人訂單列表
  async v1_getOrders(payload: any, user: any) {
    const { userId } = payload;
    if (!userId) throw new Error('缺少 userId');

    // 1. 查找該 LINE 使用者在 Member 資料庫中的資料
    const member = await prisma.member.findUnique({
      where: { memberId: String(userId).trim() }
    });

    const conditions: any[] = [
      { customerLineId: String(userId).trim() }
    ];

    if (member) {
      const names = [member.receiverName, member.displayName].filter(Boolean) as string[];
      if (names.length > 0) {
        conditions.push({
          recipients: {
            some: {
              recipientName: { in: names }
            }
          }
        });
      }
    }

    // 2. 獲取自己建立的訂單，或是自己是團員（收件人）被代訂的訂單
    const dbOrders = await prisma.groupBuyOrder.findMany({
      where: {
        OR: conditions
      },
      include: {
        details: true,
        recipients: {
          include: { items: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // 3. 格式化輸出
    const orders = dbOrders.map((o: any) => {
      const isCreator = o.customerLineId === String(userId).trim();
      
      let items: any[] = [];
      let totalAmount = Number(o.totalAmount);

      if (isCreator) {
        // 建立者（團長或自己下單的人）看到完整訂單
        items = o.details.map((d: any) => ({
          OrderId: o.orderId,
          ProductId: d.productId,
          ProductName: d.productName,
          UnitPrice: Number(d.unitPrice),
          Qty: Number(d.qty),
          Subtotal: Number(d.subtotal)
        }));
      } else {
        // 團員看到自己的代訂部分
        const names = member ? [member.receiverName, member.displayName].filter(Boolean) as string[] : [];
        const myRecipient = o.recipients?.find((r: any) => names.includes(r.recipientName));
        if (myRecipient) {
          items = (myRecipient.items || []).map((ri: any) => ({
            OrderId: o.orderId,
            ProductId: ri.productId,
            ProductName: ri.productName,
            UnitPrice: Number(ri.price),
            Qty: Number(ri.qty),
            Subtotal: Number(ri.price) * Number(ri.qty)
          }));
          totalAmount = items.reduce((sum, it) => sum + it.Subtotal, 0);
        }
      }

      return {
        OrderId: o.orderId,
        OrderNo: o.orderId,
        Status: o.status === 'PENDING' ? '未確認' : o.status === 'CONFIRMED' ? '已確認' : o.status === 'CANCELLED' ? '已取消' : o.status,
        DeliveryStatus: o.deliveryStatus || 'ORDER_RECEIVED',
        CustomerLineId: o.customerLineId,
        CustomerName: isCreator ? o.customerName : (member?.receiverName || member?.displayName || o.customerName),
        CustomerPhone: isCreator ? o.customerPhone : (member?.phone || o.customerPhone),
        DeliveryAddress: o.deliveryAddress,
        SourceGroup: o.sourceGroup,
        Note: o.note,
        TotalAmount: totalAmount,
        ShippingFee: Number(o.shippingFee || 0),
        PaymentMethod: o.paymentMethod,
        PaymentMethodSnapshot: o.paymentMethod,
        PaymentStatus: o.paymentStatus || '',
        Source: o.source,
        ExpectedDeliveryDate: o.expectedDeliveryDate || '',
        CreatedAt: o.createdAt,
        UpdatedAt: o.updatedAt,
        LineDisplayName: o.lineDisplayName,
        items,
        recipients: (o.recipients || []).map((r: any) => ({
          recipientName: r.recipientName,
          note: r.note || '',
          items: (r.items || []).map((ri: any) => ({
            productId: ri.productId,
            productName: ri.productName,
            qty: Number(ri.qty),
            price: Number(ri.price)
          }))
        }))
      };
    });

    return { success: true, orders };
  },

  // 14. LIFF V1 重新下單 (取得舊單資訊)
  async v1_reorder(payload: any, user: any) {
    const { orderId, userId } = payload;
    if (!orderId) throw new Error('缺少 orderId');

    const o = await prisma.groupBuyOrder.findUnique({
      where: { orderId },
      include: {
        details: true,
        recipients: {
          include: { items: true }
        }
      }
    });

    if (!o) throw new Error('找不到該訂單');

    let items: any[] = [];
    const isCreator = userId ? o.customerLineId === String(userId).trim() : true;

    if (isCreator) {
      items = o.details.map((d: any) => ({
        productId: d.productId,
        productName: d.productName,
        unitPrice: Number(d.unitPrice),
        qty: Number(d.qty),
        remark: d.remark || ''
      }));
    } else {
      const member = await prisma.member.findUnique({
        where: { memberId: String(userId).trim() }
      });
      const names = member ? [member.receiverName, member.displayName].filter(Boolean) as string[] : [];
      const myRecipient = o.recipients?.find((r: any) => names.includes(r.recipientName));
      if (myRecipient) {
        items = (myRecipient.items || []).map((ri: any) => ({
          productId: ri.productId,
          productName: ri.productName,
          unitPrice: Number(ri.price),
          qty: Number(ri.qty),
          remark: ''
        }));
      }
    }

    return {
      success: true,
      deliveryAddress: o.deliveryAddress,
      paymentMethod: o.paymentMethod,
      note: o.note,
      items
    };
  },

  // 15. LIFF V1 取得/註冊會員資料
  async v1_getMember(payload: any, user: any) {
    const { userId, displayName, pictureUrl } = payload;
    if (!userId) throw new Error('缺少 userId');

    const m = await prisma.member.upsert({
      where: { memberId: userId },
      update: {
        displayName: displayName || undefined,
        pictureUrl: pictureUrl || undefined
      },
      create: {
        memberId: userId,
        displayName: displayName || '',
        pictureUrl: pictureUrl || '',
        walletBalance: 0,
        memberLevel: 'General'
      }
    });

    return {
      success: true,
      member: {
        ReceiverName: m.receiverName || '',
        Phone: m.phone || '',
        WalletBalance: Number(m.walletBalance),
        MemberLevel: m.memberLevel,
        DisplayName: m.displayName || '',
        PictureUrl: m.pictureUrl || '',
        MemberId: m.memberId
      }
    };
  },

  // 16. LIFF V1 保存會員基本資料
  async v1_saveMember(payload: any, user: any) {
    const { userId, receiverName, phone } = payload;
    if (!userId) throw new Error('缺少 userId');

    await prisma.member.update({
      where: { memberId: userId },
      data: {
        receiverName: receiverName || undefined,
        phone: phone || undefined
      }
    });

    return { success: true };
  },

  // 17. 後台管理員獲取所有會員列表
  async admin_getMembers(payload: any, user: any) {
    if (user.role !== 'BOSS' && user.role !== 'ADMIN') throw new Error('權限不足');

    const members = await prisma.member.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        transactions: {
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    const list = await Promise.all(members.map(async (m) => {
      const orderStats = await prisma.groupBuyOrder.aggregate({
        where: { customerLineId: m.memberId },
        _count: { orderId: true },
        _sum: { totalAmount: true }
      });

      return {
        memberId: m.memberId,
        displayName: m.displayName || '',
        pictureUrl: m.pictureUrl || '',
        receiverName: m.receiverName || '',
        phone: m.phone || '',
        walletBalance: Number(m.walletBalance),
        memberLevel: m.memberLevel,
        createdAt: m.createdAt.toISOString(),
        totalOrders: orderStats._count.orderId || 0,
        totalAmount: Number(orderStats._sum.totalAmount || 0),
        transactions: m.transactions.map((t) => ({
          transactionId: t.transactionId,
          amount: Number(t.amount),
          type: t.type,
          description: t.description || '',
          createdAt: t.createdAt.toISOString()
        }))
      };
    }));

    return list;
  },

  // 18. 後台管理員調整餘額/手動儲值
  async admin_adjustWallet(payload: any, user: any) {
    if (user.role !== 'BOSS' && user.role !== 'ADMIN') throw new Error('權限不足');
    const { memberId, amount, description } = payload;
    if (!memberId) throw new Error('缺少 memberId');

    const adjustAmount = Number(amount);
    if (isNaN(adjustAmount)) throw new Error('金額格式不正確');

    await prisma.$transaction(async (tx) => {
      const m = await tx.member.findUnique({ where: { memberId } });
      if (!m) throw new Error('找不到該會員');

      await tx.member.update({
        where: { memberId },
        data: {
          walletBalance: {
            increment: adjustAmount
          }
        }
      });

      await tx.walletTransaction.create({
        data: {
          memberId,
          amount: adjustAmount,
          type: adjustAmount >= 0 ? 'DEPOSIT' : 'ADJUST',
          description: description || (adjustAmount >= 0 ? '管理員手動儲值' : '管理員扣抵調整')
        }
      });
    }, { maxWait: 15000, timeout: 30000 });

    return { success: true };
  },

  // 定期配相關實作
  async getSubscriptions(payload: any, user: any) {
    const list = await prisma.subscription.findMany();
    return list.map((item: any) => ({
      ...item,
      frequency: JSON.parse(item.frequency || '[]')
    }));
  },

  async saveSubscription(payload: any, user: any) {
    if (user.role !== 'BOSS' && user.role !== 'ADMIN') throw new Error('權限不足');
    const { subscriptionId, building, customerName, phone, productId, productName, quantity, frequency, paymentMethod, isActive, note } = payload;
    
    const freqStr = Array.isArray(frequency) ? JSON.stringify(frequency) : '[]';
    const data = {
      building,
      customerName,
      phone: phone || null,
      productId,
      productName,
      quantity: Number(quantity) || 0,
      frequency: freqStr,
      paymentMethod: paymentMethod || '奶包金',
      isActive: isActive !== undefined ? Boolean(isActive) : true,
      note: note || null
    };

    if (subscriptionId) {
      await prisma.subscription.update({
        where: { subscriptionId },
        data
      });
      return { success: true, subscriptionId };
    } else {
      const created = await prisma.subscription.create({
        data
      });
      return { success: true, subscriptionId: created.subscriptionId };
    }
  },

  async deleteSubscription(payload: any, user: any) {
    if (user.role !== 'BOSS' && user.role !== 'ADMIN') throw new Error('權限不足');
    const { subscriptionId } = payload;
    await prisma.subscription.delete({
      where: { subscriptionId }
    });
    return { success: true };
  },

  async generateSubscriptionOrders(payload: any, user: any) {
    if (user.role !== 'BOSS' && user.role !== 'ADMIN') throw new Error('權限不足');

    const { building, date } = payload;
    if (!building) throw new Error('請指定配送大樓');

    const targetDateStr = date || new Date().toISOString().split('T')[0];
    const parts = targetDateStr.split('-');
    const targetDate = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    const dayOfWeek = targetDate.getDay(); // 0 = 日, 1-6 = 一到六

    // 1. 取得所有有效的定期配計畫
    const subs = await prisma.subscription.findMany({
      where: { building, isActive: true }
    });

    const filteredSubs = subs.filter((sub: any) => {
      try {
        const freq = JSON.parse(sub.frequency || '[]');
        return Array.isArray(freq) && freq.includes(dayOfWeek);
      } catch {
        return false;
      }
    });

    if (filteredSubs.length === 0) {
      return { success: true, count: 0, message: '今日無符合的定期配項目' };
    }

    // 2. 獲取商品定價
    const products = await prisma.product.findMany();
    const prodPriceMap: Record<string, number> = {};
    products.forEach((p: any) => {
      prodPriceMap[p.productId] = Number(p.singlePrice) || Number(p.defaultPrice) || 0;
    });

    // 3. 按客戶分組
    const customerGroups: Record<string, any> = {};
    filteredSubs.forEach((sub: any) => {
      const key = `${sub.customerName}_${sub.phone || ''}`;
      if (!customerGroups[key]) {
        customerGroups[key] = {
          customerName: sub.customerName,
          phone: sub.phone || '',
          paymentMethod: sub.paymentMethod || '奶包金',
          note: sub.note || '',
          items: []
        };
      }
      const price = prodPriceMap[sub.productId] || 0;
      customerGroups[key].items.push({
        productId: sub.productId,
        productName: sub.productName,
        unitPrice: price,
        qty: sub.quantity,
        remark: '定期配匯入'
      });
    });

    // 4. 防重複檢查 (同一天該大樓已匯入過該客戶定期配)
    const flagNote = `定期配(${targetDateStr})`;
    const existingOrders = await prisma.groupBuyOrder.findMany({
      where: {
        note: { contains: flagNote }
      }
    });

    const alreadyImportedKeys = new Set(
      existingOrders.map((o: any) => `${o.customerName}_${o.customerPhone || ''}`)
    );

    let importCount = 0;
    const now = new Date();

    // 5. 逐一寫入訂單
    for (const key in customerGroups) {
      if (alreadyImportedKeys.has(key)) {
        continue;
      }

      const group = customerGroups[key];
      const orderId = `GB${targetDateStr.replace(/-/g, '')}${now.getHours()}${now.getMinutes()}${now.getSeconds()}_${Math.floor(Math.random() * 100)}`;
      const totalAmount = group.items.reduce((sum: number, item: any) => sum + (item.unitPrice * item.qty), 0);

      // 用交易寫入主表和明細表
      await prisma.$transaction(async (tx) => {
        await tx.groupBuyOrder.create({
          data: {
            orderId,
            status: 'PENDING',
            customerName: group.customerName,
            customerPhone: group.phone,
            deliveryAddress: `${building} ${group.note}`.trim(),
            note: flagNote,
            totalAmount,
            paymentMethod: group.paymentMethod,
            paymentStatus: group.paymentMethod === '奶包金' ? '已付款(扣餘額)' : '待確認',
            source: 'SUBSCRIPTION',
            createdAt: now,
            updatedAt: now
          }
        });

        for (const item of group.items) {
          await tx.groupBuyOrderDetail.create({
            data: {
              orderId,
              productId: item.productId,
              productName: item.productName,
              unitPrice: item.unitPrice,
              qty: item.qty,
              subtotal: item.unitPrice * item.qty,
              remark: item.remark
            }
          });
        }
      });

      importCount++;
    }

    return { 
      success: true, 
      count: importCount, 
      message: `成功導入 ${importCount} 筆定期配訂單` 
    };
  },

  // 17. 取得所有社區列表 (用於後台社區/外送區域管理)
  async getCommunities(payload: any, user: any) {
    if (user.role !== 'BOSS' && user.role !== 'ADMIN') throw new Error('權限不足');
    const communities = await prisma.groupBuyCommunity.findMany({
      where: { deletedAt: null },
      orderBy: { communityName: 'asc' }
    });
    return communities.map((c: any) => ({
      communityId: c.communityId,
      communityCode: c.communityCode,
      communityName: c.communityName,
      defaultFreeShipping: c.defaultFreeShipping || false,
      freeShippingMin: Number(c.freeShippingMin) || 0,
      shippingFee: Number(c.shippingFee) || 0,
      status: c.status || 'ACTIVE'
    }));
  },

  // 18. 新增/更新外送區域
  async saveCommunityArea(payload: any, user: any) {
    if (user.role !== 'BOSS' && user.role !== 'ADMIN') throw new Error('權限不足');
    const { communityId, communityName, defaultFreeShipping, freeShippingMin, shippingFee, status } = payload;
    if (!communityName) throw new Error('缺少區域名稱');

    if (communityId) {
      // 編輯現有
      await prisma.groupBuyCommunity.update({
        where: { communityId },
        data: {
          communityName,
          defaultFreeShipping: !!defaultFreeShipping,
          freeShippingMin: Number(freeShippingMin) || 0,
          shippingFee: Number(shippingFee) || 0,
          status: status || 'ACTIVE',
          updatedAt: new Date()
        }
      });
    } else {
      // 新增
      const code = 'C' + Math.random().toString(36).substring(2, 7).toUpperCase();
      await prisma.groupBuyCommunity.create({
        data: {
          communityId: code,
          communityCode: code,
          communityName,
          defaultFreeShipping: !!defaultFreeShipping,
          freeShippingMin: Number(freeShippingMin) || 0,
          shippingFee: Number(shippingFee) || 0,
          status: 'ACTIVE',
          orderingMode: 'OPEN'
        }
      });
    }
    return { success: true };
  },

  // 19. 刪除外送區域 (軟刪除)
  async deleteCommunityArea(payload: any, user: any) {
    if (user.role !== 'BOSS' && user.role !== 'ADMIN') throw new Error('權限不足');
    const { communityId } = payload;
    if (!communityId) throw new Error('缺少區域 ID');

    await prisma.groupBuyCommunity.update({
      where: { communityId },
      data: {
        deletedAt: new Date(),
        status: 'DELETED'
      }
    });
    return { success: true };
  },

  // 20. 取得特定社區的專屬商品價格對照表
  async getCommunityCustomPrices(payload: any, user: any) {
    const { communityId } = payload;
    if (!communityId) throw new Error('缺少 communityId');

    const customPrices = await prisma.communityProductPrice.findMany({
      where: { communityId }
    });

    return customPrices.map((cp: any) => ({
      productId: cp.productId,
      customPrice: Number(cp.customPrice),
      promotions: Array.isArray(cp.promotions) ? cp.promotions : (cp.promotions ? cp.promotions : [])
    }));
  },

  // 21. 儲存/更新社區商品價格 (支援自動刪除 + 多組促銷)
  async saveCommunityCustomPrice(payload: any, user: any) {
    if (user.role !== 'BOSS' && user.role !== 'ADMIN') throw new Error('權限不足');
    const { communityId, productId, customPrice, promotions } = payload;
    if (!communityId || !productId) throw new Error('缺少必要參數');

    const hasPrice = customPrice !== undefined && customPrice !== null && customPrice !== '';
    // promotions 是陣列，過濾掉不合法的項目
    const validPromos: Array<{buyX: number, getY: number}> = Array.isArray(promotions)
      ? promotions.filter((p: any) => p && p.buyX > 0 && p.getY > 0).map((p: any) => ({ buyX: Number(p.buyX), getY: Number(p.getY) }))
      : [];

    // 全空直接移除
    if (!hasPrice && validPromos.length === 0) {
      try {
        await prisma.communityProductPrice.delete({
          where: {
            communityId_productId: { communityId, productId }
          }
        });
      } catch (e) {}
      return { success: true, deleted: true };
    }

    const priceVal = hasPrice ? Number(customPrice) : 0;
    if (isNaN(priceVal) || priceVal < 0) throw new Error('價格必須為正數');

    await prisma.communityProductPrice.upsert({
      where: {
        communityId_productId: {
          communityId,
          productId
        }
      },
      update: {
        customPrice: priceVal,
        promotions: validPromos.length > 0 ? validPromos : Prisma.JsonNull
      },
      create: {
        communityId,
        productId,
        customPrice: priceVal,
        promotions: validPromos.length > 0 ? validPromos : Prisma.JsonNull
      }
    });

    return { success: true };
  },

  // 22. 刪除社區商品客製價（復原為預設原價）
  async deleteCommunityCustomPrice(payload: any, user: any) {
    if (user.role !== 'BOSS' && user.role !== 'ADMIN') throw new Error('權限不足');
    const { communityId, productId } = payload;
    if (!communityId || !productId) throw new Error('缺少必要參數');

    try {
      await prisma.communityProductPrice.delete({
        where: {
          communityId_productId: {
            communityId,
            productId
          }
        }
      });
    } catch (e: any) {
      // 找不到要刪除的就 ignore
    }

    return { success: true };
  }
};
