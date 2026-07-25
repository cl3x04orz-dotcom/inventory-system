const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testUpdate() {
  const prod = await prisma.product.findFirst();
  if (!prod) {
    console.log('No product found');
    return;
  }
  console.log('Before update:', prod.productId, 'maxTotalQty:', prod.maxTotalQty);

  await prisma.product.update({
    where: { productId: prod.productId },
    data: { maxTotalQty: 100 }
  });

  const updated = await prisma.product.findUnique({
    where: { productId: prod.productId },
    select: { productId: true, productName: true, maxTotalQty: true }
  });
  console.log('After update:', updated);
}

testUpdate()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
