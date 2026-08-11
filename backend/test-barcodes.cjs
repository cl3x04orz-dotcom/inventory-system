const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const p = await prisma.product.findMany({
    where: { barcodes: { some: {} } },
    include: { barcodes: true }
  });
  console.log("Products with barcodes:", JSON.stringify(p, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
