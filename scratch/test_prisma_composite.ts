import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function run() {
  const m = await prisma.member.findUnique({
    where: {
      memberId_storeCode: {
        memberId: 'U1234567890',
        storeCode: 'MILI001'
      }
    }
  });
  console.log('Success!', m);
}
run();
