import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

function generateHash(plainPassword: string): string {
  return crypto.createHash('sha256').update(plainPassword).digest('base64');
}

export const superadminService = {
  // 取得所有店鋪與管理員數量
  async getTenants(payload: any, user: any) {
    if (user.role !== 'SUPER_ADMIN') {
      throw new Error('Access denied. Super Admin only.');
    }

    const settings = await prisma.storeSetting.findMany({
      orderBy: { storeCode: 'asc' }
    });

    // 順便統計每個店鋪有多少使用者
    const userCounts = await prisma.user.groupBy({
      by: ['storeCode'],
      _count: { userId: true }
    });

    const userCountMap = userCounts.reduce((acc: Record<string, number>, item) => {
      acc[item.storeCode] = item._count.userId;
      return acc;
    }, {});

    return settings.map(setting => ({
      ...setting,
      userCount: userCountMap[setting.storeCode] || 0
    }));
  },

  // 建立新店鋪與首位管理員
  async createTenant(payload: any, user: any) {
    if (user.role !== 'SUPER_ADMIN') {
      throw new Error('Access denied. Super Admin only.');
    }

    const { storeCode, name, adminUsername, adminPassword } = payload;

    if (!storeCode || !name || !adminUsername || !adminPassword) {
      return { error: '請提供完整的店鋪與管理員資訊 (storeCode, name, adminUsername, adminPassword)' };
    }

    // 1. 檢查店鋪代碼是否重複
    const existingSetting = await prisma.storeSetting.findUnique({
      where: { storeCode }
    });
    if (existingSetting) {
      return { error: `店鋪代碼 ${storeCode} 已存在` };
    }

    // 2. 檢查管理員帳號是否重複
    const existingUser = await prisma.user.findUnique({
      where: { username: adminUsername }
    });
    if (existingUser) {
      return { error: `帳號 ${adminUsername} 已存在` };
    }

    // 3. 建立資料
    const hashedPassword = generateHash(adminPassword);

    await prisma.$transaction(async (tx) => {
      await tx.storeSetting.create({
        data: {
          storeCode,
          name,
        }
      });

      await tx.user.create({
        data: {
          username: adminUsername,
          passwordHash: hashedPassword,
          role: 'BOSS',
          storeCode,
        }
      });
    });

    return { success: true, message: `成功開通店鋪 ${storeCode} 與管理員 ${adminUsername}` };
  }
};
