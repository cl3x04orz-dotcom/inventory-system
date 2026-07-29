import { prisma } from '../database/context.js';

/**
 * 產生唯一的 POS 收據號碼
 * 格式：門市代碼 - 年月日 - 6位流水號
 * 例如：MILI-20260729-000001
 */
export async function generateReceiptNo(storeCode: string = 'MILI001'): Promise<string> {
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');

  const startOfDay = new Date(`${today.toISOString().slice(0, 10)}T00:00:00.000Z`);
  const endOfDay = new Date(`${today.toISOString().slice(0, 10)}T23:59:59.999Z`);

  const todayCount = await prisma.sales.count({
    where: {
      storeCode,
      date: {
        gte: startOfDay,
        lte: endOfDay
      }
    }
  });

  const seq = String(todayCount + 1).padStart(6, '0');
  const prefix = storeCode.slice(0, 4).toUpperCase();

  return `${prefix}-${dateStr}-${seq}`;
}
