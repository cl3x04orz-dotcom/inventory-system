import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // 找出 MILI001 的 BOSS 帳號
  const users = await prisma.user.findMany({ 
    where: { role: 'BOSS', storeCode: 'MILI001' }, 
    select: { userId: true, username: true, role: true } 
  });
  
  console.log('目前 MILI001 的 BOSS 帳號:', JSON.stringify(users, null, 2));
  
  if (users.length > 0) {
    // 升級第一個 BOSS 為 SUPER_ADMIN
    const result = await prisma.user.update({
      where: { userId: users[0].userId },
      data: { role: 'SUPER_ADMIN' }
    });
    console.log(`✅ 成功升級 ${result.username} 為 SUPER_ADMIN`);
  } else {
    console.log('❌ 找不到 MILI001 的 BOSS 帳號');
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
