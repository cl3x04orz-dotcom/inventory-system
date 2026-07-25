const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('正在安全新增 maxTotalQty 與 soldQty 欄位至 PostgreSQL ...');
  
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Product" 
    ADD COLUMN IF NOT EXISTS "maxTotalQty" INTEGER,
    ADD COLUMN IF NOT EXISTS "soldQty" INTEGER NOT NULL DEFAULT 0;
  `);

  console.log('✅ 欄位已順利安全新增！無任何既有資料受影響。');
}

main()
  .catch((e) => {
    console.error('執行失敗:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
