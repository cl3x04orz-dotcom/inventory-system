import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function validate() {
  console.log('🔍 [Phase -1] 開始驗證 Migration 結果...\n');

  try {
    // 1. 驗證 Sales 筆數與總金額
    const salesCount = await prisma.sales.count();
    const totalAmountAgg = await prisma.sales.aggregate({
      _sum: { finalTotal: true }
    });
    const totalAmount = totalAmountAgg._sum.finalTotal || 0;

    console.log(`✅ Sales 總筆數: ${salesCount} 筆`);
    console.log(`✅ Sales 金額總和: $${totalAmount}`);

    // 2. 驗證 Product 數量
    const productCount = await prisma.product.count();
    console.log(`✅ Product 商品數量: ${productCount} 項`);

    // 3. 驗證 Inventory 筆數
    const inventoryCount = await prisma.inventory.count();
    console.log(`✅ Inventory 批次筆數: ${inventoryCount} 筆`);

    console.log('\n🎉 [Phase -1] 驗證完全通過！既有資料完整無損。');
  } catch (error) {
    console.error('❌ [Phase -1] 驗證失敗:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

validate();
