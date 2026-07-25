import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function test() {
  const list = await prisma.promotion.findMany({ orderBy: { createdAt: 'desc' }, take: 5 });
  console.log(JSON.stringify(list, null, 2));
}
test();
