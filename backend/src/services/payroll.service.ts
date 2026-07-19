import { prisma } from '../database/context.js';

const formatLocalYMD = (date: Date) => {
  const local = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  return local.toISOString().split('T')[0];
};

export const PayrollService = {
  // 1. 獲取薪資資料
  async getPayrollData(payload: any, user: any) {
    const { year, month, targetUser } = payload;
    const y = Number(year);
    const m = Number(month);

    const isAdmin = user.role === 'BOSS';
    const isOwner = String(targetUser || '').trim().toLowerCase() === String(user.username || '').trim().toLowerCase();
    if (!isAdmin && !isOwner) {
      throw new Error('權限不足：您只能查詢自己的薪資資料');
    }

    // 1. 取得薪資設定
    let config = {
      baseSalary: 30000,
      attendanceBonus: 0,
      insurance: 0,
      offDaysStandard: 8,
      monthlyOffDays: 8, // [Fix] 同步給前端
      bonusTiers: [] as any[],
      empType: 'FULL_TIME',
      hourlyWage: 0,
      commissionRate: 0
    };

    const setting = await prisma.payrollSetting.findUnique({
      where: { username: targetUser }
    });

    if (setting) {
      let bonusTiers = [];
      try {
        if (typeof setting.bonusTiersJson === 'string') {
          bonusTiers = JSON.parse(setting.bonusTiersJson);
        } else if (Array.isArray(setting.bonusTiersJson)) {
          bonusTiers = setting.bonusTiersJson;
        }
      } catch {
        bonusTiers = [];
      }

      config = {
        baseSalary: Number(setting.baseSalary) || 0,
        attendanceBonus: Number(setting.attendanceBonus) || 0,
        insurance: Number(setting.insurance) || 0,
        offDaysStandard: setting.offDaysStandard,
        monthlyOffDays: setting.offDaysStandard, // [Fix] 同步給前端
        bonusTiers,
        empType: setting.empType || 'FULL_TIME',
        hourlyWage: Number(setting.hourlyWage) || 0,
        commissionRate: Number(setting.commissionRate) || 0
      };
    }

    // 2. 彙整當月業績與工時
    let totalSales = 0;
    let salesShortage = 0;
    let totalWorkHours = 0;
    const dailyData: Record<string, number> = {};

    const startOfMonth = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0) - 8 * 60 * 60 * 1000);
    const endOfMonth = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999) - 8 * 60 * 60 * 1000);

    // 撈出批發客戶名單
    const wholesaleCustomers = await prisma.customer.findMany({
      where: { category: '批發' },
      select: { customerName: true }
    });
    const wholesaleSet = new Set(wholesaleCustomers.map((c: any) => c.customerName.trim().toLowerCase()));

    const salesList = await prisma.sales.findMany({
      where: {
        salesRep: { equals: targetUser, mode: 'insensitive' },
        status: { not: 'VOID' },
        date: {
          gte: startOfMonth,
          lte: endOfMonth
        }
      },
      include: {
        details: true
      }
    });

    const dailyRecords: Record<string, any> = {};

    salesList.forEach((sale: any) => {
      const dateKey = formatLocalYMD(sale.date);

      // 累加當日工時
      const wHours = Number(sale.workHours) || 0;
      totalWorkHours += wHours;
      if (wHours > 0) {
        if (!dailyRecords[dateKey]) dailyRecords[dateKey] = {};
        dailyRecords[dateKey].workHours = (dailyRecords[dateKey].workHours || 0) + wHours;
      }

      // 檢查是否是負數結算 (盤損)
      const finalTotal = Number(sale.finalTotal) || 0;
      if (finalTotal < 0) {
        salesShortage += Math.abs(finalTotal);
      }

      // 批發客戶業績不計入
      const custName = String(sale.customer || '').trim().toLowerCase();
      if (wholesaleSet.has(custName)) return;

      sale.details.forEach((d: any) => {
        const subtotal = Number(d.subtotal) || 0;
        totalSales += subtotal;
        dailyData[dateKey] = (dailyData[dateKey] || 0) + subtotal;
      });
    });

    // 3. 取得出勤與手動紀錄
    let generalLeaveDays = 0;
    let specialLeaveDays = 0;
    let sickLeaveDays = 0;
    let totalSpecialLeaveUsed = 0;
    let manualLoss = 0;

    const records = await prisma.dailyRecord.findMany({
      where: {
        username: { equals: targetUser, mode: 'insensitive' }
      },
      orderBy: { timestamp: 'asc' }
    });

    // 用 Map 進行去重：每天只保留最新的一筆紀錄
    const effectiveRecords: Record<string, any> = {};
    records.forEach((rec: any) => {
      // 全局特休累積統計
      if (rec.type === 'SPECIAL_LEAVE') {
        totalSpecialLeaveUsed++;
      }

      const dateKey = formatLocalYMD(rec.date);
      effectiveRecords[dateKey] = rec;
    });

    // 篩選出當月生效的紀錄
    for (const [dateKey, rec] of Object.entries(effectiveRecords)) {
      const recDate = new Date(rec.date);
      const recY = recDate.getFullYear();
      const recM = recDate.getMonth() + 1;

      if (recY === y && recM === m) {
        if (!dailyRecords[dateKey]) dailyRecords[dateKey] = {};

        const type = rec.type;
        const val = Number(rec.value) || 0;

        if (type === 'LEAVE') {
          dailyRecords[dateKey].isLeave = true;
          generalLeaveDays++;
        } else if (type === 'SPECIAL_LEAVE') {
          dailyRecords[dateKey].isSpecialLeave = true;
          specialLeaveDays++;
        } else if (type === 'SICK_LEAVE') {
          dailyRecords[dateKey].isSickLeave = true;
          sickLeaveDays++;
        } else if (type === 'WORK') {
          dailyRecords[dateKey].isWork = true;
        } else if (type === 'LOSS') {
          dailyRecords[dateKey].loss = (dailyRecords[dateKey].loss || 0) + val;
          manualLoss += val;
        }

        if (rec.note) {
          dailyRecords[dateKey].note = rec.note;
        }
      }
    }

    // 當月預設休假天數補全：當天無業績、無工作記錄、無請假記錄，則預設為休假
    const daysInMonth = new Date(y, m, 0).getDate();
    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(y, m - 1, day);
      const dateKey = formatLocalYMD(d);

      const hasSales = (dailyData[dateKey] || 0) > 0;
      const hasRecord = dailyRecords[dateKey];
      const hasExplicitLeave = hasRecord && (hasRecord.isLeave || hasRecord.isSpecialLeave || hasRecord.isSickLeave);
      const hasExplicitWork = hasRecord && hasRecord.isWork;

      if (!hasSales && !hasExplicitWork && !hasExplicitLeave) {
        if (!dailyRecords[dateKey]) dailyRecords[dateKey] = {};
        dailyRecords[dateKey].isLeave = true;
        generalLeaveDays++;
      }
    }

    // 4. 計算獎金與薪資
    const isPartTime = config.empType === 'PART_TIME';
    let bonus = 0;
    let commissionAmount = 0;

    if (isPartTime) {
      // 工讀生：抽成
      commissionAmount = totalSales * (config.commissionRate || 0);
      bonus = commissionAmount;
    } else {
      // 正職：業績達標級距
      const sortedTiers = [...config.bonusTiers].sort((a, b) => b.threshold - a.threshold);
      for (const tier of sortedTiers) {
        if (totalSales >= tier.threshold) {
          bonus = tier.bonus;
          break;
        }
      }
    }

    const finalLoss = manualLoss + salesShortage;
    const finalBonus = Math.max(0, bonus - finalLoss);

    const calculatedBase = isPartTime ? (totalWorkHours * config.hourlyWage) : config.baseSalary;
    const hasAttendanceBonus = (generalLeaveDays <= config.offDaysStandard);
    const leaveCompensation = isPartTime ? 0 : (config.offDaysStandard - generalLeaveDays) * 1000;
    const sickLeaveDeduction = isPartTime ? 0 : (sickLeaveDays * 500);

    const summary = {
      sales: totalSales,
      bonus: finalBonus,
      commissionAmount,
      commissionRate: config.commissionRate,
      generalLeaveDays,
      specialLeaveDays,
      sickLeaveDays,
      attendanceBonus: hasAttendanceBonus ? config.attendanceBonus : 0,
      leaveCompensation,
      sickLeaveDeduction,
      insurance: config.insurance,
      loss: finalLoss,
      totalWorkHours,
      calculatedBase,
      // 實領薪水 = 底薪 + 全勤 + 補貼 - 健保 - 病假扣除
      finalSalary: calculatedBase + (hasAttendanceBonus ? config.attendanceBonus : 0) + leaveCompensation - config.insurance - sickLeaveDeduction
    };

    // 5. 檢查生日月份
    let isBirthdayMonth = false;
    const profile = await prisma.employeeProfile.findUnique({
      where: { username: targetUser }
    });

    if (profile && profile.birthday) {
      const bdayStr = String(profile.birthday).trim();
      const parsedDate = new Date(bdayStr);
      let bMonth = -1;

      if (!isNaN(parsedDate.getTime())) {
        bMonth = parsedDate.getMonth() + 1;
      } else {
        const parts = bdayStr.match(/(\d+)[/.-](\d+)/);
        if (parts) {
          bMonth = parseInt(parts[1], 10);
        } else {
          const matches = bdayStr.match(/\d+/);
          if (matches) {
            bMonth = parseInt(matches[0], 10);
          }
        }
      }

      if (bMonth === m) {
        isBirthdayMonth = true;
      }
    }

    return {
      config,
      summary,
      dailyData,
      dailyRecords,
      isBirthdayMonth,
      totalSpecialLeaveUsed
    };
  },

  // 2. 儲存出勤/扣款紀錄
  async saveDailyRecord(payload: any, user: any) {
    if (user.role !== 'BOSS' && user.role !== 'ADMIN') {
      throw new Error('權限不足：您沒有權限編輯出勤紀錄');
    }

    const { date, username, type, value, note } = payload;
    const targetDate = new Date(date + 'T12:00:00.000+08:00'); // 台北中午避免跨天
    const targetDateStr = formatLocalYMD(targetDate);

    // 搜尋當天是否已有該員工記錄
    const existing = await prisma.dailyRecord.findFirst({
      where: {
        username,
        date: {
          gte: new Date(targetDateStr + 'T00:00:00.000+08:00'),
          lte: new Date(targetDateStr + 'T23:59:59.999+08:00')
        }
      }
    });

    if (existing) {
      await prisma.dailyRecord.update({
        where: { id: existing.id },
        data: {
          type,
          value: Number(value) || 0,
          note: note || '',
          timestamp: new Date()
        }
      });
    } else {
      await prisma.dailyRecord.create({
        data: {
          date: targetDate,
          username,
          type,
          value: Number(value) || 0,
          note: note || ''
        }
      });
    }

    return { success: true };
  },

  // 3. 儲存薪資設定
  async savePayrollSettings(payload: any, user: any) {
    if (user.role !== 'BOSS' && user.role !== 'ADMIN') {
      throw new Error('權限不足：您沒有權限修改薪資設定');
    }

    const { targetUser, baseSalary, attendanceBonus, insurance, monthlyOffDays, bonusTiers, empType, hourlyWage, commissionRate } = payload;

    await prisma.payrollSetting.upsert({
      where: { username: targetUser },
      update: {
        baseSalary: Number(baseSalary) || 0,
        attendanceBonus: Number(attendanceBonus) || 0,
        insurance: Number(insurance) || 0,
        offDaysStandard: Number(monthlyOffDays) || 8,
        bonusTiersJson: JSON.stringify(bonusTiers || []),
        empType: empType || 'FULL_TIME',
        hourlyWage: Number(hourlyWage) || 0,
        commissionRate: Number(commissionRate) || 0
      },
      create: {
        username: targetUser,
        baseSalary: Number(baseSalary) || 0,
        attendanceBonus: Number(attendanceBonus) || 0,
        insurance: Number(insurance) || 0,
        offDaysStandard: Number(monthlyOffDays) || 8,
        bonusTiersJson: JSON.stringify(bonusTiers || []),
        empType: empType || 'FULL_TIME',
        hourlyWage: Number(hourlyWage) || 0,
        commissionRate: Number(commissionRate) || 0
      }
    });

    return { success: true };
  },

  // 4. 獲取員工基本資料與年資特休
  async getEmployeeProfile(payload: any, user: any) {
    const { targetUser } = payload;

    const isAdmin = user.role === 'BOSS';
    const isOwner = String(targetUser || '').trim().toLowerCase() === String(user.username || '').trim().toLowerCase();
    if (!isAdmin && !isOwner) {
      throw new Error('權限不足：您只能查詢自己的基本資料');
    }

    const profile = await prisma.employeeProfile.findUnique({
      where: { username: targetUser }
    });

    const resultProfile = profile ? {
      username: profile.username,
      joinedDate: profile.joinedDate || '',
      birthday: profile.birthday || '',
      identityId: profile.identityId || '',
      contact: profile.contact || '',
      note: profile.note || ''
    } : {
      username: targetUser,
      joinedDate: '',
      birthday: '',
      identityId: '',
      contact: '',
      note: ''
    };

    // 計算年資與特休
    const seniorityInfo = this.calculateSeniorityAndLeave(resultProfile.joinedDate);

    return { profile: resultProfile, ...seniorityInfo };
  },

  // 5. 儲存員工基本資料
  async saveEmployeeProfile(payload: any, user: any) {
    if (user.role !== 'BOSS' && user.role !== 'ADMIN') {
      throw new Error('權限不足：您沒有權限修改基本資料');
    }

    const { username, joinedDate, birthday, identityId, contact, note } = payload;

    await prisma.employeeProfile.upsert({
      where: { username },
      update: {
        joinedDate: joinedDate || null,
        birthday: birthday || null,
        identityId: identityId || null,
        contact: contact || null,
        note: note || null
      },
      create: {
        username,
        joinedDate: joinedDate || null,
        birthday: birthday || null,
        identityId: identityId || null,
        contact: contact || null,
        note: note || null
      }
    });

    return { success: true };
  },

  // 6. 取得員工類型
  async getEmpType(payload: any, user: any) {
    const targetUser = payload.targetUser || user.username;

    const setting = await prisma.payrollSetting.findUnique({
      where: { username: targetUser },
      select: { empType: true }
    });

    return { empType: setting?.empType || 'FULL_TIME' };
  },

  // 7. 年資特休計算輔助 (照抄勞基法邏輯)
  calculateSeniorityAndLeave(joinedDateStr: string) {
    if (!joinedDateStr) return { seniorityText: '資料未設定', estimatedLeaveDays: 0, joinedDateFormatted: '' };

    let joined: Date;

    // 偵測是否為 Excel/GAS 日期序號 (純數字，如 46029)
    const serial = Number(joinedDateStr);
    if (!isNaN(serial) && serial > 1 && String(joinedDateStr).trim().match(/^\d+$/)) {
      // Excel serial: days since 1899-12-30
      joined = new Date((serial - 25569) * 86400 * 1000);
    } else {
      joined = new Date(joinedDateStr);
    }

    if (isNaN(joined.getTime())) {
      return { seniorityText: '日期格式錯誤', estimatedLeaveDays: 0, joinedDateFormatted: '' };
    }

    const joinedDateFormatted = joined.toISOString().split('T')[0];
    const today = new Date();

    if (joined > today) return { seniorityText: '尚未到職', estimatedLeaveDays: 0, joinedDateFormatted };

    let totalMonths = (today.getFullYear() - joined.getFullYear()) * 12 + (today.getMonth() - joined.getMonth());
    if (today.getDate() < joined.getDate()) totalMonths--;

    const years = Math.floor(totalMonths / 12);
    const months = totalMonths % 12;

    let seniorityText = "";
    if (years > 0) seniorityText += years + " 年 ";
    if (months > 0) seniorityText += months + " 個月";
    if (!seniorityText) seniorityText = "未滿 1 個月";

    let leaveDays = 0;
    const yFloat = totalMonths / 12;

    if (yFloat >= 0.5 && yFloat < 1) leaveDays = 3;
    else if (yFloat >= 1 && yFloat < 2) leaveDays = 7;
    else if (yFloat >= 2 && yFloat < 3) leaveDays = 10;
    else if (yFloat >= 3 && yFloat < 5) leaveDays = 14;
    else if (yFloat >= 5 && yFloat < 10) leaveDays = 15;
    else if (yFloat >= 10) {
      leaveDays = 15 + Math.min(15, Math.floor(yFloat - 10) + 1);
    }

    return { seniorityText, estimatedLeaveDays: leaveDays, joinedDateFormatted };
  }
};
