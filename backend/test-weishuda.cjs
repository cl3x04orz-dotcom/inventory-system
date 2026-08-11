const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const p = await prisma.product.findMany({
    where: { productName: { contains: "微舒打" } }
  });
  console.log(JSON.stringify(p, null, 2));
}

main().finally(() => prisma.$disconnect());
