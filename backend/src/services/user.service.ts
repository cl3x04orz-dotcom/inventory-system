import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { prisma } from '../database/context.js';

const JWT_SECRET = process.env.JWT_SECRET || 'your-jwt-secret';

function verifyPassword(plainPassword: string, storedHash: string): boolean {
  if (plainPassword === storedHash) return true;

  const hash = crypto.createHash('sha256').update(plainPassword).digest('base64');
  return hash === storedHash;
}

function generateHash(plainPassword: string): string {
  return crypto.createHash('sha256').update(plainPassword).digest('base64');
}

export const UserService = {
  async login(payload: any) {
    const { username, password } = payload;
    if (!username || !password) {
      return { error: '請輸入帳號和密碼' };
    }

    const user = await prisma.user.findUnique({
      where: { username: String(username).trim() }
    });

    if (!user) {
      return { error: '找不到此帳號' };
    }

    if (user.status !== 'ACTIVE') {
      return { error: '此帳號已被停用' };
    }

    const isValid = verifyPassword(String(password), user.passwordHash);
    if (!isValid) {
      return { error: '密碼錯誤' };
    }

    // Clean permissions array
    let permissions: string[] = [];
    if (user.permissions) {
      if (Array.isArray(user.permissions)) {
        permissions = user.permissions as string[];
      } else if (typeof user.permissions === 'string') {
        try {
          permissions = JSON.parse(user.permissions);
        } catch {
          permissions = [user.permissions];
        }
      }
    }

    let gasToken = '';
    const gasUrl = process.env.GAS_API_URL;
    if (gasUrl) {
      try {
        console.log(`[Proxy] Logging in to GAS Web App to fetch dynamic gasToken for user: ${username}`);
        const response = await fetch(gasUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'login',
            payload: { username, password }
          })
        });
        if (response.ok) {
          const resJson: any = await response.json();
          if (resJson && resJson.success && resJson.token) {
            gasToken = resJson.token;
            console.log('[Proxy] Successfully obtained gasToken from GAS!');
          } else {
            console.warn('[Proxy] GAS login responded without success/token:', resJson);
          }
        } else {
          console.warn('[Proxy] GAS login responded with status:', response.status);
        }
      } catch (err) {
        console.error('[Proxy] Failed to forward login to GAS:', err);
      }
    }

    const tokenPayload = {
      username: user.username,
      role: user.role,
      permissions,
      gasToken
    };

    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '12h' });

    return {
      success: true,
      token,
      username: user.username,
      role: user.role,
      permissions
    };
  },

  async getUsers() {
    const list = await prisma.user.findMany({
      select: {
        userId: true,
        username: true,
        role: true,
        status: true,
        permissions: true
      }
    });

    // Ensure permissions are parsed as array
    const formatted = list.map(u => {
      let permissions: string[] = [];
      if (Array.isArray(u.permissions)) {
        permissions = u.permissions as string[];
      } else if (typeof u.permissions === 'string') {
        try {
          permissions = JSON.parse(u.permissions);
        } catch {
          permissions = [];
        }
      }
      return {
        ...u,
        permissions
      };
    });

    return { list: formatted, cached: false };
  },

  async addUser(payload: any) {
    const { username, password, role } = payload;
    if (!username) return { error: '請輸入帳號(姓名)' };

    const existing = await prisma.user.findUnique({
      where: { username: String(username).trim() }
    });

    if (existing) {
      return { error: '此帳號(姓名)已存在' };
    }

    const passwordHash = generateHash(String(password || '123456')); // Default password fallback

    await prisma.user.create({
      data: {
        username: String(username).trim(),
        passwordHash,
        role: role || 'EMPLOYEE',
        status: 'ACTIVE',
        permissions: []
      }
    });

    return { success: true };
  },

  async deleteUser(payload: any) {
    const { username } = payload;
    if (!username) return { error: 'Missing username' };

    await prisma.user.delete({
      where: { username: String(username).trim() }
    });

    return { success: true };
  },

  async updateUserPermissions(payload: any) {
    const { username, permissions } = payload;
    if (!username) return { error: 'Missing username' };

    await prisma.user.update({
      where: { username: String(username).trim() },
      data: {
        permissions: Array.isArray(permissions) ? permissions : []
      }
    });

    return { success: true };
  },

  async updateUserStatus(payload: any) {
    const { username, status } = payload;
    if (!username || !status) return { error: 'Missing parameters' };

    await prisma.user.update({
      where: { username: String(username).trim() },
      data: {
        status: String(status).trim().toUpperCase()
      }
    });

    return { success: true };
  },

  // 自動續約 Token — 讓前端不用重新登入
  async renewToken(payload: any, user: any) {
    if (!user || !user.username) {
      return { error: 'Unauthorized' };
    }

    // 從 DB 重新讀取最新的 permissions/role（確保即時反映權限更新）
    const dbUser = await prisma.user.findUnique({
      where: { username: user.username }
    });

    if (!dbUser || dbUser.status !== 'ACTIVE') {
      return { error: 'Unauthorized' };
    }

    let permissions: string[] = [];
    if (Array.isArray(dbUser.permissions)) {
      permissions = dbUser.permissions as string[];
    } else if (typeof dbUser.permissions === 'string') {
      try { permissions = JSON.parse(dbUser.permissions); } catch { permissions = []; }
    }

    const tokenPayload = {
      username: dbUser.username,
      role: dbUser.role,
      permissions,
      gasToken: user.gasToken || '' // 保留舊 gasToken
    };

    const newToken = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '12h' });

    return {
      success: true,
      token: newToken,
      username: dbUser.username,
      role: dbUser.role,
      permissions
    };
  }
};
