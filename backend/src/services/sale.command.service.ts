import { prisma, runInTransaction } from '../database/context.js';
import { InventoryService } from './inventory.service.js';
import { PricingService, CartItemInput, calculateItemDiscountedInfos } from './pricing.service.js';
import { generateReceiptNo } from '../utils/receipt.util.js';

export interface CreateRetailSalePayload {
  storeCode?: string;
  terminalId?: string;
  cashierId: string;
  customer?: string;
  items: Array<{
    productId: string;
    productName: string;
    qty: number;
    unitPrice: number;
    unitCost?: number;
    discountAmount?: number;
    has_volume_pricing?: boolean;
    volume_pricing_settings?: {
      target_quantity?: number;
      package_price?: number;
    } | null;
    isBundle?: boolean;
    bundleSize?: number;
    remark?: string;
  }>;
  payments: Array<{
    method: string;
    amount: number;
    receivedAmount?: number;
    changeAmount?: number;
  }>;
  receivedAmount?: number;
}

export const SaleCommandService = {
  /**
   * 建立一筆 POS 門市零售結帳訂單 (POS 專用寫入模式)
   */
  async createRetailSale(payload: CreateRetailSalePayload) {
    const {
      storeCode = 'MILI001',
      terminalId = 'POS01',
      cashierId,
      customer = '門市散客',
      items,
      payments,
      receivedAmount = 0
    } = payload;

    // 1. 透過 PricingService 計算精準總價與全品項分配金額
    const calcInput: CartItemInput[] = items.map(i => ({
      productId: i.productId,
      productName: i.productName,
      unitPrice: i.unitPrice,
      qty: i.qty,
      discountAmount: i.discountAmount,
      has_volume_pricing: i.has_volume_pricing,
      volume_pricing_settings: i.volume_pricing_settings
    }));

    const pricing = PricingService.calculate({
      items: calcInput,
      receivedAmount
    });

    const itemDiscountedMap = calculateItemDiscountedInfos(calcInput);

    // 2. 用 DB Transaction 包裹整個結帳與庫存異動
    return await runInTransaction(async () => {
      const receiptNo = await generateReceiptNo(storeCode);
      const saleId = `POS_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const now = new Date();

      // 0. 批次查詢 dbProducts 獲取商品屬性 (支援 isCombo 組合包與 isBundle 捆裝)
      const allProductIds = items.map(i => i.productId).filter(Boolean);
      const dbProducts = await prisma.product.findMany({
        where: { productId: { in: allProductIds } }
      });
      const prodMap = new Map(dbProducts.map(p => [p.productId, p]));

      // 1. 展開銷售明細：若為跨商品組合包 (isCombo)，自動拆解為旗下的子產品
      const finalDetails: Array<{
        productId: string;
        productName: string;
        picked: number;
        original: number;
        sold: number;
        unitPrice: number;
        unitCost: number;
        discountAmount: number;
        subtotal: number;
        storeCode: string;
      }> = [];

      for (const item of items) {
        const dbProd = prodMap.get(item.productId);
        const isCombo = Boolean(dbProd?.isCombo && Array.isArray(dbProd?.comboItems) && (dbProd.comboItems as any[]).length > 0);

        const discInfo = itemDiscountedMap.get(item.productId) || {
          discountedTotal: item.unitPrice * item.qty - (item.discountAmount || 0),
          savings: item.discountAmount || 0
        };
        const comboTotalAmount = discInfo.discountedTotal;
        const comboSavings = discInfo.savings;

        if (isCombo) {
          const comboItems = (dbProd!.comboItems as any[]).filter((ci: any) => ci && ci.productId);
          const totalChildUnits = comboItems.reduce((sum, ci) => sum + Math.max(1, Number(ci.qty) || 1), 0);

          let allocatedTotal = 0;
          let allocatedSavings = 0;

          comboItems.forEach((ci, idx) => {
            const subQtyPerPack = Math.max(1, Number(ci.qty) || 1);
            const totalChildSold = item.qty * subQtyPerPack;

            let childSubtotal = 0;
            let childSavings = 0;
            if (idx === comboItems.length - 1) {
              childSubtotal = Math.round((comboTotalAmount - allocatedTotal) * 100) / 100;
              childSavings = Math.round((comboSavings - allocatedSavings) * 100) / 100;
            } else {
              childSubtotal = Math.round((comboTotalAmount * (subQtyPerPack / totalChildUnits)) * 100) / 100;
              childSavings = Math.round((comboSavings * (subQtyPerPack / totalChildUnits)) * 100) / 100;
              allocatedTotal += childSubtotal;
              allocatedSavings += childSavings;
            }

            const childUnitPrice = totalChildSold > 0 ? Number((childSubtotal / totalChildSold).toFixed(4)) : 0;

            finalDetails.push({
              productId: String(ci.productId),
              productName: ci.productName || item.productName,
              picked: totalChildSold,
              original: 0,
              sold: totalChildSold,
              unitPrice: childUnitPrice,
              unitCost: 0,
              discountAmount: childSavings,
              subtotal: childSubtotal,
              storeCode
            });
          });
        } else {
          const isBundle = Boolean(item.isBundle || dbProd?.isBundle);
          const bundleSize = Number(item.bundleSize || dbProd?.bundleSize || 1);
          const totalPickedQty = isBundle && bundleSize > 1 ? item.qty * bundleSize : item.qty;
          const effectiveUnitPrice = totalPickedQty > 0 ? Number((comboTotalAmount / totalPickedQty).toFixed(4)) : item.unitPrice;

          finalDetails.push({
            productId: item.productId,
            productName: item.productName,
            picked: totalPickedQty,
            original: 0,
            sold: totalPickedQty,
            unitPrice: effectiveUnitPrice,
            unitCost: item.unitCost || 0,
            discountAmount: comboSavings,
            subtotal: comboTotalAmount,
            storeCode
          });
        }
      }

      // (A) 建立 Sales 主單與明細
      const sale = await prisma.sales.create({
        data: {
          saleId,
          date: now,
          salesRep: cashierId,
          operator: cashierId,
          customer,
          status: 'COMPLETED',
          saleType: 'RETAIL',
          receiptNo,
          storeCode,
          terminalId,
          cashierId,
          subtotal: pricing.subtotal,
          discount: pricing.discountAmount,
          tax: pricing.taxAmount,
          finalTotal: pricing.grandTotal,
          totalCash: payments.find(p => p.method === 'CASH')?.amount || 0,
          paymentMethod: payments.map(p => p.method).join(','),
          
          details: {
            create: finalDetails
          },

          // 多重付款紀錄
          payments: {
            create: payments.map(p => ({
              method: p.method,
              amount: p.amount,
              receivedAmount: p.receivedAmount || 0,
              changeAmount: p.changeAmount || 0,
              storeCode
            }))
          }
        },
        include: {
          details: true,
          payments: true
        }
      });

      // (B) 扣減庫存：finalDetails 已經全部是實體出庫品項（組合包已展開）
      for (const d of finalDetails) {
        await InventoryService.recordMovement({
          productId: d.productId,
          storeCode,
          type: 'SALE',
          qty: -d.sold,
          refId: sale.saleId,
          operator: cashierId,
          note: `POS結帳 (${receiptNo})`
        });
      }

      // (C) 寫入 AuditLog 稽核紀錄
      await prisma.auditLog.create({
        data: {
          storeCode,
          terminalId,
          userId: cashierId,
          action: 'CREATE_RETAIL_SALE',
          entity: 'Sales',
          entityId: sale.saleId,
          after: {
            receiptNo,
            grandTotal: pricing.grandTotal,
            itemCount: items.length
          }
        }
      });

      return {
        sale,
        pricing
      };
    });
  }
};
