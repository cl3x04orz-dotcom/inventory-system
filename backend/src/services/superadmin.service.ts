import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'your-jwt-secret';

function generateHash(plainPassword: string): string {
  return crypto.createHash('sha256').update(plainPassword).digest('base64');
}

function superAdminOnly(user: any) {
  if (user?.role !== 'SUPER_ADMIN') throw new Error('Access denied. Super Admin only.');
}

export const superadminService = {
  // 取得所有店鋪與管理員數量
  async getTenants(payload: any, user: any) {
    superAdminOnly(user);

    const settings = await prisma.storeSetting.findMany({
      orderBy: { storeCode: 'asc' }
    });

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
    superAdminOnly(user);

    const { storeCode, name, adminUsername, adminPassword } = payload;

    if (!storeCode || !name || !adminUsername || !adminPassword) {
      return { error: '請提供完整的店鋪與管理員資訊' };
    }

    const existingSetting = await prisma.storeSetting.findUnique({ where: { storeCode } });
    if (existingSetting) return { error: `店鋪代碼 ${storeCode} 已存在` };

    const existingUser = await prisma.user.findUnique({ where: { username: adminUsername } });
    if (existingUser) return { error: `帳號 ${adminUsername} 已存在` };

    const hashedPassword = generateHash(adminPassword);

    await prisma.$transaction(async (tx) => {
      await tx.storeSetting.create({ data: { storeCode, name } });
      await tx.user.create({
        data: { username: adminUsername, passwordHash: hashedPassword, role: 'BOSS', storeCode }
      });
    });

    return { success: true, message: `成功開通店鋪 ${storeCode} 與管理員 ${adminUsername}` };
  },

  // 編輯店鋪名稱/狀態
  async updateTenant(payload: any, user: any) {
    superAdminOnly(user);

    const { storeCode, name, status } = payload;
    if (!storeCode) return { error: '缺少 storeCode' };

    const data: any = {};
    if (name) data.name = name;
    if (status) data.status = status;

    await prisma.storeSetting.update({ where: { storeCode }, data });
    return { success: true, message: `店鋪 ${storeCode} 已更新` };
  },

  // 刪除店鋪（軟刪除 = 停用；加上 force:true 才真正刪除）
  async deleteTenant(payload: any, user: any) {
    superAdminOnly(user);

    const { storeCode, force } = payload;
    if (!storeCode) return { error: '缺少 storeCode' };

    // 防止誤刪自己的店
    if (storeCode === user.storeCode) {
      return { error: '不能刪除自己所在的店鋪' };
    }

    if (force) {
      // 硬刪除：先刪使用者，再刪設定
      await prisma.user.deleteMany({ where: { storeCode } });
      await prisma.storeSetting.delete({ where: { storeCode } });
      return { success: true, message: `已永久刪除店鋪 ${storeCode} 及其所有帳號` };
    } else {
      // 軟刪除：設定狀態為 inactive
      await prisma.storeSetting.update({ where: { storeCode }, data: { status: 'inactive' } });
      return { success: true, message: `已停用店鋪 ${storeCode}` };
    }
  },

  // 模擬登入：以 SUPER_ADMIN 身分進入指定店鋪
  async impersonateTenant(payload: any, user: any) {
    superAdminOnly(user);

    const { storeCode } = payload;
    if (!storeCode) return { error: '缺少 storeCode' };

    // 找到該店鋪的第一個 BOSS 帳號
    const boss = await prisma.user.findFirst({
      where: { storeCode, role: 'BOSS' }
    });

    if (!boss) return { error: `找不到 ${storeCode} 的 BOSS 帳號` };

    // 發一張短效 JWT（2 小時），並在 payload 裡標記這是「模擬身分」
    const tokenPayload = {
      username: boss.username,
      role: boss.role,
      permissions: boss.permissions,
      gasToken: '',
      storeCode: boss.storeCode,
      impersonatedBy: user.username, // 記錄是誰模擬的
    };

    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '2h' });

    return {
      success: true,
      token,
      username: boss.username,
      role: boss.role,
      storeCode: boss.storeCode,
      impersonatedBy: user.username,
    };
  }
};
