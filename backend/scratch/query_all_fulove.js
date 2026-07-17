import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const invs = await prisma.inventory.findMany({
    where: {
      OR: [
        { productName: { contains: '福樂' } },
        { productId: { contains: '福樂' } }
      ]
    }
  });

  console.log(`總共找到 ${invs.length} 筆福樂相關的庫存紀錄：`);
  invs.forEach(i => {
    if (i.productName && i.productName.includes('蘋果')) {
      console.log('🌟 [找到含有蘋果字眼]：', {
        batchId: i.batchId,
        productId: i.productId,
        productName: i.productName,
        quantity: i.quantity,
        type: i.type,
        entryDate: i.entryDate
      });
    } else {
      console.log({
        batchId: i.batchId,
        productId: i.productId,
        productName: i.productName,
        quantity: i.quantity,
        type: i.type,
        entryDate: i.entryDate
      });
    }
  });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
