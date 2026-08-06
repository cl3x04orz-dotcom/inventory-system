import { prisma, runInTransaction } from '../database/context.js';
import { InventoryService } from './inventory.service.js';
import { PricingService, CartItemInput, calculateItemSubtotal } from './pricing.service.js';
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
   * 建立一筆 POS 門市零售結帳訂單
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

    // 1. 透過 PricingService 計算精準金額 (包含多件組合價)
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

    // 2. 用 DB Transaction 包裹整個結帳與庫存異動
    return await runInTransaction(async () => {
      const receiptNo = await generateReceiptNo(storeCode);
      const saleId = `POS_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const now = new Date();

      // (A) 建立 Sales 主單與明細
      // 🔑 原貨 (original) 設為 0，商品出貨只記錄在領貨 (picked)
      // 🔑 單價與小計依照組合價算出 (例: 55/3 = 18.3333)
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
          
          // 明細：領貨 (picked) 填入實際出貨量，原貨 (original) 設為 0
          details: {
            create: items.map(item => {
              const isBundle = Boolean(item.isBundle);
              const bundleSize = Number(item.bundleSize || 1);
              const totalPickedQty = isBundle && bundleSize > 1 ? item.qty * bundleSize : item.qty;

              // 🔑 計算實際組合價小計與折扣
              const lineSubtotal = calculateItemSubtotal({
                productId: item.productId,
                productName: item.productName,
                unitPrice: item.unitPrice,
                qty: item.qty,
                discountAmount: item.discountAmount,
                has_volume_pricing: item.has_volume_pricing,
                volume_pricing_settings: item.volume_pricing_settings
              });

              const originalLineTotal = item.unitPrice * item.qty;
              const lineDiscount = Math.max(0, originalLineTotal - lineSubtotal) + (item.discountAmount || 0);

              // 🔑 依照組合價算出的平均成交單價 (例 55 / 3 = 18.3333)
              const effectiveUnitPrice = item.qty > 0 ? Number((lineSubtotal / item.qty).toFixed(4)) : item.unitPrice;

              return {
                productId: item.productId,
                productName: item.productName,
                picked: totalPickedQty, // 領貨處記錄實際出貨數量 (用作扣庫存: qty * bundleSize)
                original: 0,            // 原貨不用重複記錄，設為 0
                sold: item.qty,         // 實售數量 (用作報表顯示: 原始組數)
                unitPrice: effectiveUnitPrice, // 🔑 依組合價算出的平均成交單價 (例 18.3333)
                unitCost: item.unitCost || 0,
                discountAmount: lineDiscount,  // 🔑 多件/組合折抵金額 (例 5)
                subtotal: lineSubtotal,        // 🔑 實際成交小計 (例 55)
                storeCode
              };
            })
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

      // (B) 扣減庫存：若商品為捆裝 (isBundle)，扣減數量 = 購買組數 * bundleSize
      for (const item of items) {
        const isBundle = Boolean(item.isBundle);
        const bundleSize = Number(item.bundleSize || 1);
        const deduceQty = isBundle && bundleSize > 1 ? item.qty * bundleSize : item.qty;

        await InventoryService.recordMovement({
          productId: item.productId,
          storeCode,
          type: 'SALE',
          qty: -deduceQty, // 扣減實際庫存
          refId: sale.saleId,
          operator: cashierId,
          note: `POS結帳 (${receiptNo})${isBundle ? ` [捆裝${bundleSize}入×${item.qty}組]` : ''}`
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
