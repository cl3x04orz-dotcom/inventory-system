const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log("正在查詢使用者 '張庭瑜'...");
  const users = await prisma.user.findMany({
    where: {
      username: {
        contains: '張庭瑜'
      }
    }
  });

  console.log("找到的使用者：", users);

  if (users.length === 0) {
    console.log("找不到該使用者！");
  } else {
    for (const u of users) {
      const updated = await prisma.user.update({
        where: { userId: u.userId },
        data: { role: 'ADMIN' }
      });
      console.log(`已成功將使用者 '${updated.username}' (ID: ${updated.userId}) 的角色修改為: ${updated.role}`);
    }
  }
}

main()
  .catch(e => {
    console.error("執行錯誤：", e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
