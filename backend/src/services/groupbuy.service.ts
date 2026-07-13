import { prisma } from '../database/context.js';
import { ProductService } from './product.service.js';

function generateOrderId(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `GB${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

export const GroupBuyService = {

  // 1. 取得訂單列表（按狀態篩選）
  async getPendingOrders(payload: any, user: any) {
    if (user.role !== 'BOSS') throw new Error('權限不足');
    const { status } = payload || {};

    const where: any = {};
    if (status) where.status = status;

    const orders = await prisma.groupBuyOrder.findMany({
      where,
      include: { details: true },
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
      paymentMethod: o.paymentMethod || '',
      transferLastFive: o.transferLastFive || '',
      paymentStatus: o.paymentStatus || '',
      lineDisplayName: o.lineDisplayName || '',
      createdAt: o.createdAt?.toISOString() || '',
      updatedAt: o.updatedAt?.toISOString() || '',
      confirmedAt: o.confirmedAt?.toISOString() || '',
      confirmedBy: o.confirmedBy || '',
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
    if (user.role !== 'BOSS') throw new Error('權限不足');
    const { orderId, customerName, customerPhone, deliveryAddress, note,
            items, paymentMethod, transferLastFive, paymentStatus } = payload;
    if (!orderId) throw new Error('缺少 orderId');

    const updateData: any = { updatedAt: new Date() };
    if (customerName !== undefined) updateData.customerName = customerName;
    if (customerPhone !== undefined) updateData.customerPhone = customerPhone;
    if (deliveryAddress !== undefined) updateData.deliveryAddress = deliveryAddress;
    if (note !== undefined) updateData.note = note;
    if (paymentMethod !== undefined) updateData.paymentMethod = paymentMethod;
    if (transferLastFive !== undefined) updateData.transferLastFive = transferLastFive;
    if (paymentStatus !== undefined) updateData.paymentStatus = paymentStatus;

    if (Array.isArray(items) && items.length > 0) {
      const totalAmount = items.reduce((sum: number, item: any) =>
        sum + (Number(item.unitPrice) * Number(item.qty)), 0);
      updateData.totalAmount = totalAmount;

      // 刪舊明細再重建
      await prisma.groupBuyOrderDetail.deleteMany({ where: { orderId } });
      await prisma.groupBuyOrderDetail.createMany({
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

    await prisma.groupBuyOrder.update({ where: { orderId }, data: updateData });
    return { success: true };
  },

  // 4. 確認出貨：PENDING → CONFIRMED，並寫入正式銷售單
  async confirmPendingOrder(payload: any, user: any) {
    if (user.role !== 'BOSS') throw new Error('權限不足');
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

    // 寫入正式銷售單
    await prisma.sales.create({
      data: {
        saleId: orderId,
        date: now,
        salesRep: user.username,
        operator: user.username,
        customer: (order.customerName || '') + (order.deliveryAddress ? ' ' + order.deliveryAddress : ''),
        paymentMethod: order.paymentMethod === '轉帳' ? 'TRANSFER' : 
                       (order.paymentMethod === '奶包金扣抵' || order.paymentMethod === '奶包金') ? 'WALLET' : 'CASH',
        status: 'PAID',
        totalCash: (order.paymentMethod === '轉帳' || order.paymentMethod === '奶包金扣抵' || order.paymentMethod === '奶包金') ? 0 : order.totalAmount,
        finalTotal: order.totalAmount,
        details: {
          create: (order.details as any[]).map((d: any) => ({
            productId: d.productId || 'UNKNOWN',
            sold: Number(d.qty),
            picked: 0,
            original: Number(d.qty),
            subtotal: Number(d.subtotal),
            unitPrice: Number(d.unitPrice)
          }))
        }
      }
    });

    // 更新訂單狀態
    await prisma.groupBuyOrder.update({
      where: { orderId },
      data: { status: 'CONFIRMED', confirmedAt: now, confirmedBy: user.username }
    });

    return { success: true, orderId };
  },

  // 5. 刪除 PENDING 訂單
  async deletePendingOrder(payload: any, user: any) {
    if (user.role !== 'BOSS') throw new Error('權限不足');
    const { orderId } = payload;
    if (!orderId) throw new Error('缺少 orderId');

    const order = await prisma.groupBuyOrder.findUnique({ where: { orderId } });
    if (!order) throw new Error('找不到訂單：' + orderId);
    if (order.status !== 'PENDING') throw new Error('此訂單已非 PENDING 狀態，無法刪除');

    // Cascade 會自動刪明細
    await prisma.groupBuyOrder.delete({ where: { orderId } });
    return { success: true, orderId };
  },

  // 6. 快速變更訂單狀態
  async updateOrderStatus(payload: any, user: any) {
    if (user.role !== 'BOSS') throw new Error('權限不足');
    const { orderId, status, paymentStatus } = payload;
    if (!orderId) throw new Error('缺少 orderId');

    const updateData: any = { updatedAt: new Date() };
    if (status !== undefined) updateData.status = status;
    if (paymentStatus !== undefined) updateData.paymentStatus = paymentStatus;

    await prisma.groupBuyOrder.update({ where: { orderId }, data: updateData });
    return { success: true };
  },

  // 7. 取得大樓設定列表
  async getBuildingSettings(payload: any, user: any) {
    const settings = await prisma.buildingSetting.findMany({
      orderBy: { building: 'asc' }
    });
    return settings.map((s: any) => ({
      building: s.building,
      start_time: s.startTime || '',
      end_time: s.endTime || ''
    }));
  },

  // 8. 儲存/更新大樓設定
  async saveBuildingSettings(payload: any, user: any) {
    if (user.role !== 'BOSS') throw new Error('權限不足');
    const { building, start_time, end_time } = payload;
    if (!building) throw new Error('缺少大樓名稱');

    await prisma.buildingSetting.upsert({
      where: { building },
      update: {
        startTime: start_time || null,
        endTime: end_time || null
      },
      create: {
        building,
        startTime: start_time || null,
        endTime: end_time || null
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

    // 找社區：優先 communityId 精確匹配(c參數)，其次 communityName 匹配(building參數)，最後 fallback 第一筆 ACTIVE
    const communities = await prisma.groupBuyCommunity.findMany({
      where: { status: 'ACTIVE' }
    });

    let targetComm: any = null;
    if (commCode) {
      targetComm = communities.find((c: any) => c.communityId === commCode);
    }
    if (!targetComm && buildingName) {
      targetComm = communities.find((c: any) =>
        c.communityName === buildingName || c.communityName?.includes(buildingName)
      );
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
    const products = await ProductService.getProducts({});

    const community = {
      CommunityId: targetComm.communityId,
      CommunityName: targetComm.communityName,
      OrderingMode: targetComm.orderingMode || 'OPEN',
      OpenMessage: targetComm.openMessage || '',
      CloseMessage: targetComm.closeMessage || ''
    };

    // 取得大樓時段設定
    const bSettings = await prisma.buildingSetting.findMany();
    const buildingSettings = bSettings.map((s: any) => ({
      building: s.building,
      start_time: s.startTime || '',
      end_time: s.endTime || ''
    }));

    return {
      success: true,
      data: {
        community,
        activeCampaign: activeCampaign ? {
          CampaignId: activeCampaign.campaignId,
          CampaignName: activeCampaign.campaignName,
          ThemeColor: activeCampaign.themeColor || '',
          SystemAnnouncement: activeCampaign.systemAnnouncement || '',
          GroupAnnouncement: activeCampaign.groupAnnouncement || ''
        } : null,
        nextOpenTime: nextCampaign?.startTime || null,
        products,
        buildingSettings
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
      useWalletDeduction, walletDeductionAmount
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

    const totalAmount = items.reduce((sum: number, item: any) =>
      sum + (Number(item.unitPrice) * Number(item.qty)), 0);

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
      });
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
        paymentMethod: actualPaymentMethod,
        transferLastFive: transferLastFive || '',
        paymentStatus,
        lineDisplayName: lineDisplayName || '',
        source: 'LIFF_V2',
        confirmedAt: deductionApplied === totalAmount ? now : null, // 全額扣抵直接標記確認
        details: {
          create: items.map((item: any) => ({
            productId: item.productId || '',
            productName: item.productName + (item.remark ? ` (${item.remark})` : ''),
            unitPrice: Number(item.unitPrice) || 0,
            qty: Number(item.qty) || 0,
            subtotal: Number(item.unitPrice) * Number(item.qty),
            remark: item.remark || ''
          }))
        }
      }
    });

    return { success: true, orderId, orderNo: orderId };
  },

  // 13. LIFF V1 取得個人訂單列表
  async v1_getOrders(payload: any, user: any) {
    const { userId } = payload;
    if (!userId) throw new Error('缺少 userId');

    const dbOrders = await prisma.groupBuyOrder.findMany({
      where: { customerLineId: String(userId).trim() },
      include: { details: true },
      orderBy: { createdAt: 'desc' }
    });

    // 格式化輸出對齊 GAS 的大寫駝峰欄位名稱
    const orders = dbOrders.map((o: any) => {
      // 解析備註跟後五碼的拆分（如果有的話，前端用以顯示）
      const items = o.details.map((d: any) => ({
        OrderId: o.orderId,
        ProductId: d.productId,
        ProductName: d.productName,
        UnitPrice: Number(d.unitPrice),
        Qty: Number(d.qty),
        Subtotal: Number(d.subtotal)
      }));

      return {
        OrderId: o.orderId,
        OrderNo: o.orderId, // 使用 uuid / orderId 作為訂單序號
        Status: o.status === 'PENDING' ? '未確認' : o.status === 'CONFIRMED' ? '已確認' : o.status === 'CANCELLED' ? '已取消' : o.status,
        DeliveryStatus: o.deliveryStatus || 'ORDER_RECEIVED',
        CustomerLineId: o.customerLineId,
        CustomerName: o.customerName,
        CustomerPhone: o.customerPhone,
        DeliveryAddress: o.deliveryAddress,
        SourceGroup: o.sourceGroup,
        Note: o.note,
        TotalAmount: Number(o.totalAmount),
        PaymentMethodSnapshot: o.paymentMethod,
        PaymentStatus: o.paymentStatus || '',
        Source: o.source,
        CreatedAt: o.createdAt,
        UpdatedAt: o.updatedAt,
        LineDisplayName: o.lineDisplayName,
        items
      };
    });

    return { success: true, orders };
  },

  // 14. LIFF V1 重新下單 (取得舊單資訊)
  async v1_reorder(payload: any, user: any) {
    const { orderId } = payload;
    if (!orderId) throw new Error('缺少 orderId');

    const o = await prisma.groupBuyOrder.findUnique({
      where: { orderId },
      include: { details: true }
    });

    if (!o) throw new Error('找不到該訂單');

    const items = o.details.map((d: any) => ({
      productId: d.productId,
      productName: d.productName,
      unitPrice: Number(d.unitPrice),
      qty: Number(d.qty),
      remark: d.remark || ''
    }));

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
    if (user.role !== 'BOSS') throw new Error('權限不足');

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
    if (user.role !== 'BOSS') throw new Error('權限不足');
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
    });

    return { success: true };
  }
};
