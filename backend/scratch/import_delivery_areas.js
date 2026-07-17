import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config({ path: '../.env' });
const prisma = new PrismaClient();

const areas = [
  // 1. 永康、東區、北區、中西區、安平 (滿 300 免運，未滿 80)
  { name: '台南市永康區', fee: 80, min: 300 },
  { name: '台南市東區', fee: 80, min: 300 },
  { name: '台南市北區', fee: 80, min: 300 },
  { name: '台南市中西區', fee: 80, min: 300 },
  { name: '台南市安平區', fee: 80, min: 300 },

  // 2. 南區、安南區 (滿 300 免運，未滿 80)
  { name: '台南市南區', fee: 80, min: 300 },
  { name: '台南市安南區', fee: 80, min: 300 },

  // 3. 仁德、歸仁、新化、新市 (滿 400 免運，未滿 80)
  { name: '台南市仁德區', fee: 80, min: 400 },
  { name: '台南市歸仁區', fee: 80, min: 400 },
  { name: '台南市新化區', fee: 80, min: 400 },
  { name: '台南市新市區', fee: 80, min: 400 },

  // 4. 善化、安定 (滿 500 免運，未滿 150)
  { name: '台南市善化區', fee: 150, min: 500 },
  { name: '台南市安定區', fee: 150, min: 500 },

  // 5. 麻豆、佳里、西港、下營、六甲、官田、七股 (滿 800 免運，未滿 150)
  { name: '台南市麻豆區', fee: 150, min: 800 },
  { name: '台南市佳里區', fee: 150, min: 800 },
  { name: '台南市西港區', fee: 150, min: 800 },
  { name: '台南市下營區', fee: 150, min: 800 },
  { name: '台南市六甲區', fee: 150, min: 800 },
  { name: '台南市官田區', fee: 150, min: 800 },
  { name: '台南市七股區', fee: 150, min: 800 },

  // 6. 新營、鹽水、柳營、後壁、學甲、將軍、北門、大內、山上、龍崎、關廟 (滿 1,000 免運，未滿 200)
  { name: '台南市新營區', fee: 200, min: 1000 },
  { name: '台南市鹽水區', fee: 200, min: 1000 },
  { name: '台南市柳營區', fee: 200, min: 1000 },
  { name: '台南市後壁區', fee: 200, min: 1000 },
  { name: '台南市學甲區', fee: 200, min: 1000 },
  { name: '台南市將軍區', fee: 200, min: 1000 },
  { name: '台南市北門區', fee: 200, min: 1000 },
  { name: '台南市大內區', fee: 200, min: 1000 },
  { name: '台南市山上區', fee: 200, min: 1000 },
  { name: '台南市龍崎區', fee: 200, min: 1000 },
  { name: '台南市關廟區', fee: 200, min: 1000 },

  // 7. 玉井、楠西、左鎮、南化、白河、東山 (滿 1,200 免運，未滿 250)
  { name: '台南市玉井區', fee: 250, min: 1200 },
  { name: '台南市楠西區', fee: 250, min: 1200 },
  { name: '台南市左鎮區', fee: 250, min: 1200 },
  { name: '台南市南化區', fee: 250, min: 1200 },
  { name: '台南市白河區', fee: 250, min: 1200 },
  { name: '台南市東山區', fee: 250, min: 1200 },

  // 8. 高雄 茄萣、湖內 (滿 800 免運，未滿 150)
  { name: '高雄市茄萣區', fee: 150, min: 800 },
  { name: '高雄市湖內區', fee: 150, min: 800 },

  // 9. 高雄 路竹 (滿 1,000 免運，未滿 200)
  { name: '高雄市路竹區', fee: 200, min: 1000 }
];

async function run() {
  console.log('🚀 開始匯入外送區域設定到 Supabase PostgreSQL...');

  let successCount = 0;

  for (const area of areas) {
    // 檢查是否已存在同名區域
    const existing = await prisma.groupBuyCommunity.findFirst({
      where: { communityName: area.name, deletedAt: null }
    });

    if (existing) {
      console.log(`[更新] 區域「${area.name}」已存在，更新運費為 $${area.fee}，滿 $${area.min} 免運`);
      await prisma.groupBuyCommunity.update({
        where: { communityId: existing.communityId },
        data: {
          shippingFee: area.fee,
          freeShippingMin: area.min,
          defaultFreeShipping: false
        }
      });
    } else {
      console.log(`[新增] 區域「${area.name}」：運費 $${area.fee}，滿 $${area.min} 免運`);
      const code = 'C' + Math.random().toString(36).substring(2, 7).toUpperCase();
      await prisma.groupBuyCommunity.create({
        data: {
          communityId: code,
          communityCode: code,
          communityName: area.name,
          shippingFee: area.fee,
          freeShippingMin: area.min,
          defaultFreeShipping: false,
          status: 'ACTIVE',
          orderingMode: 'OPEN'
        }
      });
    }
    successCount++;
  }

  console.log(`\n🎉 匯入完成！成功設定了 ${successCount} 個外送區域。`);
}

run()
  .catch(err => {
    console.error('❌ 匯入失敗:', err);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
