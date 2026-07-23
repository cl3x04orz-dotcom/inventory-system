import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

export class PromotionService {
  static async getPromotions(payload: any) {
    const { communityId } = payload;
    return await prisma.promotion.findMany({
      where: {
        OR: [
          { communityId: null },
          ...(communityId ? [{ communityId }] : [])
        ]
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  static async createPromotion(payload: any, user: any) {
    const { name, promoType, buyQty, freeQty, bundlePrice, communityId, rewardSelectionMode } = payload;
    return await prisma.promotion.create({
      data: {
        name,
        promoType,
        buyQty: Number(buyQty) || 0,
        freeQty: Number(freeQty) || 0,
        bundlePrice: bundlePrice ? Number(bundlePrice) : null,
        communityId: communityId || null,
        rewardSelectionMode: rewardSelectionMode || 'AUTO_LOWEST_PRICE'
      }
    });
  }

  static async updatePromotion(payload: any, user: any) {
    const { promoId, name, promoType, buyQty, freeQty, bundlePrice, communityId, isActive, rewardSelectionMode } = payload;
    return await prisma.promotion.update({
      where: { promoId },
      data: {
        name,
        promoType,
        buyQty: Number(buyQty) || 0,
        freeQty: Number(freeQty) || 0,
        bundlePrice: bundlePrice ? Number(bundlePrice) : null,
        communityId: communityId || null,
        isActive: isActive !== undefined ? isActive : undefined,
        rewardSelectionMode: rewardSelectionMode !== undefined ? rewardSelectionMode : undefined
      }
    });
  }

  static async deletePromotion(payload: any, user: any) {
    const { promoId } = payload;
    return await prisma.promotion.delete({
      where: { promoId }
    });
  }
}
