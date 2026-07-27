import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  // 將現有硬編碼的店家資訊寫入 StoreSetting (Upsert 保證可重複執行)
  console.log('Seeding StoreSetting MILI001...');
  const storeSetting = await prisma.storeSetting.upsert({
    where: {
      storeCode: 'MILI001',
    },
    update: {
      name: '米立微',
      phone: '09xxxxxxxx',
      address: '未設定',
      lineOA: 'https://line.me/ti/p/@example',
      primaryColor: '#4F46E5',
      secondaryColor: '#3730A3',
      businessHours: '24小時',
      timezone: 'Asia/Taipei',
      language: 'zh-TW',
      currency: 'TWD',
    },
    create: {
      storeCode: 'MILI001',
      status: 'active',
      name: '米立微',
      phone: '09xxxxxxxx',
      address: '未設定',
      lineOA: 'https://line.me/ti/p/@example',
      primaryColor: '#4F46E5',
      secondaryColor: '#3730A3',
      businessHours: '24小時',
      timezone: 'Asia/Taipei',
      language: 'zh-TW',
      currency: 'TWD',
    }
  });
  console.log('Upserted StoreSetting (MILI001):', storeSetting.id);

  console.log('Seeding StoreSetting DEMO001...');
  const store2 = await prisma.storeSetting.upsert({
    where: { storeCode: 'DEMO001' },
    update: {},
    create: {
      storeCode: 'DEMO001',
      status: 'active',
      name: '幸福水餃 (Demo)',
      phone: '0987654321',
      address: '台北市測試路1號',
      lineOA: 'https://line.me/ti/p/@demo',
      primaryColor: '#E11D48',
      secondaryColor: '#BE123C',
      businessHours: '10:00 - 22:00',
      timezone: 'Asia/Taipei',
      language: 'zh-TW',
      currency: 'TWD',
    },
  });
  console.log('Upserted StoreSetting (DEMO001):', store2.id);
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
