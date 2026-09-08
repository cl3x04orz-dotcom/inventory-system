import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class StoreSettingService {
  static async getStoreSetting(payload: any) {
    // Phase 1 只回傳第一筆 setting，未來多店面可依據 storeCode 取
    const storeCode = payload?.storeCode || 'MILI001';
    const setting = await prisma.storeSetting.findUnique({
      where: { storeCode }
    });
    
    if (!setting) {
      throw new Error('找不到店家設定 (StoreSetting Not Found)');
    }
    return setting;
  }

  static async saveStoreSetting(payload: any, user: any) {
    // 預計 Day 3 會用到，先建立起來
    const storeCode = payload?.storeCode || 'MILI001';
    
    // 將 payload 裡的欄位更新
    const { 
      name, logoUrl, phone, address, 
      lineOA, linePay, liffId, 
      primaryColor, secondaryColor, 
      businessHours, timezone, language, currency 
    } = payload;

    const updated = await prisma.storeSetting.update({
      where: { storeCode },
      data: {
        ...(name && { name }),
        ...(logoUrl !== undefined && { logoUrl }),
        ...(phone !== undefined && { phone }),
        ...(address !== undefined && { address }),
        ...(lineOA !== undefined && { lineOA }),
        ...(linePay !== undefined && { linePay }),
        ...(liffId !== undefined && { liffId }),
        ...(primaryColor !== undefined && { primaryColor }),
        ...(secondaryColor !== undefined && { secondaryColor }),
        ...(businessHours !== undefined && { businessHours }),
        ...(timezone !== undefined && { timezone }),
        ...(language !== undefined && { language }),
        ...(currency !== undefined && { currency }),
      }
    });

    return updated;
  }
}
