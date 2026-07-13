import { prisma } from '../database/context.js';

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

export const FinanceService = {
  // 1. 取得支出歷史
  async getExpenditures(payload: any, user: any) {
    const { startDate, endDate } = payload;
    const where: any = {};

    // 時間範圍過濾
    if (startDate || endDate) {
      where.timestamp = {};
      if (startDate) {
        // 前端傳入 2026-07-01，轉為台北時間 00:00:00 的 UTC 毫秒數
        where.timestamp.gte = new Date(startDate + 'T00:00:00.000+08:00');
      }
      if (endDate) {
        where.timestamp.lte = new Date(endDate + 'T23:59:59.999+08:00');
      }
    }

    // 權限過濾：非管理員且無財務權限者只能看自己的單
    const hasFinancePerm = user.role === 'BOSS' ||
      (user.permissions && user.permissions.some((p: string) => p === 'finance' || p.startsWith('finance_')));

    if (!hasFinancePerm) {
      const currentUserDisplay = user.username || 'Unknown';
      where.salesRep = currentUserDisplay;
    }

    const list = await prisma.expenditure.findMany({
      where,
      orderBy: { timestamp: 'desc' }
    });

    // 排除標記為 [VOID] 的備註紀錄 (對齊 GAS 的邏輯)
    const activeList = list.filter((item: any) => !item.note || !item.note.includes('[VOID]'));

    return activeList.map((item: any) => ({
      saleId: item.saleId,
      stall: Number(item.stall) || 0,
      cleaning: Number(item.cleaning) || 0,
      electricity: Number(item.electricity) || 0,
      gas: Number(item.gas) || 0,
      parking: Number(item.parking) || 0,
      goods: Number(item.goods) || 0,
      bags: Number(item.bags) || 0,
      others: Number(item.others) || 0,
      linePay: Number(item.linePay) || 0,
      serviceFee: Number(item.serviceFee) || 0,
      finalTotal: Number(item.totalDeductions) || 0, // 對應總額
      customer: item.customer || '',
      salesRep: item.salesRep || '',
      date: formatLocalDate(item.timestamp),
      vehicleMaintenance: Number(item.vehicleMaintenance) || 0,
      salary: Number(item.salary) || 0,
      reserve: Number(item.reserve) || 0,
      paymentMethod: item.paymentMethod || 'CASH',
      operator: item.salesRep || '-',
      paymentDate: item.paymentDate ? formatLocalDay(item.paymentDate) : '',
      note: item.note || ''
    }));
  },

  // 2. 保存支出資料
  async saveExpenditure(payload: any) {
    try {
      const saleId = 'exp_' + Math.random().toString(36).substring(2, 10);
      
      // 計算記帳日期
      let timestamp = new Date();
      if (payload.customDate) {
        timestamp = new Date(payload.customDate + 'T12:00:00.000+08:00');
      }

      // 實際付款日期
      let paymentDate = null;
      if (payload.paymentDate) {
        paymentDate = new Date(payload.paymentDate + 'T12:00:00.000+08:00');
      }

      await prisma.expenditure.create({
        data: {
          saleId,
          stall: Number(payload.stall) || 0,
          cleaning: Number(payload.cleaning) || 0,
          electricity: Number(payload.electricity) || 0,
          gas: Number(payload.gas) || 0,
          parking: Number(payload.parking) || 0,
          goods: Number(payload.goods) || 0,
          bags: Number(payload.bags) || 0,
          others: Number(payload.others) || 0,
          linePay: Number(payload.linePay) || 0,
          serviceFee: Number(payload.serviceFee) || 0,
          totalDeductions: Number(payload.finalTotal) || 0,
          customer: payload.customer || '',
          salesRep: payload.salesRep || payload.operator || 'System',
          timestamp,
          vehicleMaintenance: Number(payload.vehicleMaintenance) || 0,
          salary: Number(payload.salary) || 0,
          reserve: Number(payload.reserve) || 0,
          note: payload.note || '',
          paymentMethod: payload.paymentMethod || 'CASH',
          paymentDate
        }
      });

      return { success: true, timestamp };
    } catch (error: any) {
      throw new Error('保存支出資料失敗: ' + error.message);
    }
  },

  // 3. 將薪資存檔至 Expenditures
  async savePayrollToExpenditure(payload: any, user: any) {
    if (user.role !== 'BOSS') {
      throw new Error('權限不足：只有管理員可以存檔薪資');
    }

    const { targetUser, year, month, finalSalary, paymentMethod, paymentDate } = payload;
    if (!targetUser || !year || !month || finalSalary === undefined) {
      throw new Error('缺少必要參數');
    }

    const targetNote = `${year}年${month}月薪資結算`;

    // 搜尋是否已有該月同人的薪資記錄
    const existing = await prisma.expenditure.findFirst({
      where: {
        note: targetNote,
        salesRep: targetUser
      }
    });

    const parsedPaymentDate = paymentDate ? new Date(paymentDate + 'T12:00:00.000+08:00') : new Date();

    if (existing) {
      // 覆蓋模式 (Update)
      await prisma.expenditure.update({
        where: { saleId: existing.saleId },
        data: {
          salary: Number(finalSalary),
          totalDeductions: Number(finalSalary),
          paymentMethod: paymentMethod || 'CASH',
          paymentDate: parsedPaymentDate,
          timestamp: new Date() // 更新記帳戳記
        }
      });
      return { success: true, message: `已更新 ${year}/${month} 薪資記錄 (覆蓋舊檔)` };
    } else {
      // 新增模式
      const saleId = 'exp_' + Math.random().toString(36).substring(2, 10);
      
      // 記帳日期 = 該會計月份最後一天 (台北時間中午 12 點，避免跨天 UTC 偏差)
      const lastDayOfMonth = new Date(year, month, 0, 12, 0, 0);

      await prisma.expenditure.create({
        data: {
          saleId,
          salary: Number(finalSalary),
          totalDeductions: Number(finalSalary),
          paymentMethod: paymentMethod || 'CASH',
          paymentDate: parsedPaymentDate,
          salesRep: targetUser,
          customer: targetUser,
          note: targetNote,
          timestamp: lastDayOfMonth,
          // 其他費用為 0
          stall: 0,
          cleaning: 0,
          electricity: 0,
          gas: 0,
          parking: 0,
          goods: 0,
          bags: 0,
          others: 0,
          linePay: 0,
          serviceFee: 0,
          vehicleMaintenance: 0,
          reserve: 0
        }
      });

      return { success: true, message: '薪資記錄已新增至 Expenditures' };
    }
  }
};
