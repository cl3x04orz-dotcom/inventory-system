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
    const { name, promoType, buyQty, freeQty, bundlePrice, communityId, rewardSelectionMode, tiers } = payload;

    let processedTiers = Array.isArray(tiers) && tiers.length > 0
      ? [...tiers].map(t => ({ buyQty: Number(t.buyQty) || 0, freeQty: Number(t.freeQty) || 0, bundlePrice: t.bundlePrice ? Number(t.bundlePrice) : null })).sort((a, b) => b.buyQty - a.buyQty)
      : null;

    const primaryBuyQty = processedTiers ? processedTiers[0].buyQty : (Number(buyQty) || 0);
    const primaryFreeQty = processedTiers ? processedTiers[0].freeQty : (Number(freeQty) || 0);

    return await prisma.promotion.create({
      data: {
        name,
        promoType,
        buyQty: primaryBuyQty,
        freeQty: primaryFreeQty,
        bundlePrice: bundlePrice ? Number(bundlePrice) : null,
        communityId: communityId || null,
        rewardSelectionMode: rewardSelectionMode || 'AUTO_LOWEST_PRICE',
        tiers: processedTiers || undefined
      }
    });
  }

  static async updatePromotion(payload: any, user: any) {
    const { promoId, name, promoType, buyQty, freeQty, bundlePrice, communityId, isActive, rewardSelectionMode, tiers } = payload;

    let processedTiers = Array.isArray(tiers)
      ? [...tiers].map(t => ({ buyQty: Number(t.buyQty) || 0, freeQty: Number(t.freeQty) || 0, bundlePrice: t.bundlePrice ? Number(t.bundlePrice) : null })).sort((a, b) => b.buyQty - a.buyQty)
      : undefined;

    return await prisma.promotion.update({
      where: { promoId },
      data: {
        name,
        promoType,
        buyQty: buyQty !== undefined ? Number(buyQty) : (processedTiers && processedTiers[0] ? processedTiers[0].buyQty : undefined),
        freeQty: freeQty !== undefined ? Number(freeQty) : (processedTiers && processedTiers[0] ? processedTiers[0].freeQty : undefined),
        bundlePrice: bundlePrice !== undefined ? (bundlePrice ? Number(bundlePrice) : null) : undefined,
        communityId: communityId !== undefined ? (communityId || null) : undefined,
        isActive: isActive !== undefined ? isActive : undefined,
        rewardSelectionMode: rewardSelectionMode !== undefined ? rewardSelectionMode : undefined,
        tiers: processedTiers
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
