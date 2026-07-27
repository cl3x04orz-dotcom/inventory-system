import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

function generateHash(plainPassword: string): string {
  return crypto.createHash('sha256').update(plainPassword).digest('base64');
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 4) {
    console.log("用法: npm run add-tenant <storeCode> <storeName> <adminUsername> <adminPassword>");
    console.log("範例: npm run add-tenant MILI002 '秘密客二店' 'boss2' '123456'");
    process.exit(1);
  }

  const [storeCode, storeName, username, password] = args;

  console.log(`準備建立新租戶 (店鋪): ${storeCode} - ${storeName}`);

  try {
    // 1. 建立 StoreSetting
    const existingSetting = await prisma.storeSetting.findUnique({
      where: { storeCode }
    });

    if (existingSetting) {
      console.log(`⚠️ 店鋪代碼 ${storeCode} 的設定已存在，跳過建立 StoreSetting。`);
    } else {
      await prisma.storeSetting.create({
        data: {
          storeCode,
          name: storeName,
        }
      });
      console.log(`✅ 成功建立 StoreSetting (${storeCode})`);
    }

    // 2. 建立最高權限管理員 (BOSS)
    const existingUser = await prisma.user.findUnique({
      where: { username }
    });

    if (existingUser) {
      console.log(`❌ 帳號 ${username} 已經存在，無法建立。`);
      process.exit(1);
    }

    const hashedPassword = generateHash(password);

    await prisma.user.create({
      data: {
        username,
        passwordHash: hashedPassword,
        role: 'BOSS',
        storeCode,
      }
    });
    console.log(`✅ 成功建立管理員帳號: ${username} (店鋪: ${storeCode})`);

    console.log("\n🎉 新店家註冊完成！");
    console.log(`請提供以下資訊給新老闆：\n帳號：${username}\n密碼：${password}\n請他們登入系統並前往「店鋪設定」完善資料。`);

  } catch (error) {
    console.error("❌ 發生錯誤:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
