const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const sales = await prisma.sales.findMany({
    orderBy: { date: 'desc' },
    select: { saleId: true, customer: true, date: true, cashCounts: true, totalCash: true }
  });
  
  const withCashCounts = sales.filter(s => s.cashCounts && Object.keys(s.cashCounts).length > 0);
  console.log('All 8 Sales with cashCounts:');
  console.dir(withCashCounts, { depth: null });
  await prisma.$disconnect();
}

run().catch(console.error);
