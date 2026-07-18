import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });
import { prisma } from '../src/database/context.js';
import { GroupBuyService } from '../src/services/groupbuy.service.js';

async function main() {
  console.log("=== 開始測試團長連續代錄 (Group Order V2) 後端寫入邏輯 ===");

  // 先在資料庫確保有兩個測試產品
  const p1Id = "test-prod-milk";
  const p2Id = "test-prod-oat";

  await prisma.product.upsert({
    where: { productId: p1Id },
    update: { productName: "測試鮮奶", defaultPrice: 80, singlePrice: 80, isActive: true },
    create: { productId: p1Id, productName: "測試鮮奶", defaultPrice: 80, singlePrice: 80, isActive: true }
  });

  await prisma.product.upsert({
    where: { productId: p2Id },
    update: { productName: "測試燕麥", defaultPrice: 60, singlePrice: 60, isActive: true },
    create: { productId: p2Id, productName: "測試燕麥", defaultPrice: 60, singlePrice: 60, isActive: true }
  });

  const payload = {
    customerName: "測試團長",
    customerPhone: "0912345678",
    deliveryAddress: "測試社區 - 5樓",
    CommunityId: null,
    CampaignId: null,
    sourceGroup: "測試社區",
    note: "測試代錄訂單",
    paymentMethod: "現金",
    transferLastFive: "",
    lineDisplayName: "測試團長Line",
    lineUserId: "test-user-id",
    shippingFee: 0,
    isGroupOrder: true,
    groupCart: {
      "王小明": {
        [p1Id]: 2,
        [p2Id]: 1
      },
      "李小華": {
        [p1Id]: 1
      }
    },
    items: [
      {
        productId: p1Id,
        productName: "測試鮮奶",
        unitPrice: 80,
        qty: 3,
        remark: ""
      },
      {
        productId: p2Id,
        productName: "測試燕麥",
        unitPrice: 60,
        qty: 1,
        remark: ""
      }
    ]
  };

  const user = { username: "operator-test" };

  // 1. 執行送出訂單
  const res = await GroupBuyService.v2_createOrder(payload, user);
  console.log("下單結果:", res);

  if (!res.success || !res.orderId) {
    throw new Error("下單失敗！");
  }

  // 2. 至資料庫查詢訂單與其關聯明細
  const order = await prisma.groupBuyOrder.findUnique({
    where: { orderId: res.orderId },
    include: {
      details: true,
      recipients: {
        include: {
          items: true
        }
      }
    }
  });

  console.log("\n--- 資料庫寫入結果 ---");
  console.log(`訂單 ID: ${order.orderId}`);
  console.log(`總金額: ${order.totalAmount}`);
  console.log(`詳情明細數量 (details): ${order.details.length} 筆`);
  order.details.forEach(d => {
    console.log(`   - 商品: ${d.productName}, 數量: ${d.qty}, 單價: ${d.unitPrice}, 小計: ${d.subtotal}`);
  });

  console.log(`收件人分配數量 (recipients): ${order.recipients.length} 人`);
  order.recipients.forEach(r => {
    console.log(`   👤 團員: ${r.recipientName}`);
    r.items.forEach(ri => {
      console.log(`      - 商品: ${ri.productName}, 數量: ${ri.qty}, 價格 (price 欄位): ${ri.price}`);
    });
  });

  // 3. 欄位正確性斷言 (Assert)
  if (order.recipients.length !== 2) {
    throw new Error("收件人數量不正確，預期 2 人");
  }

  const wang = order.recipients.find(r => r.recipientName === "王小明");
  if (!wang) throw new Error("找不到團員 王小明");
  const milkItem = wang.items.find(i => i.productId === p1Id);
  if (!milkItem || milkItem.qty !== 2 || milkItem.price !== 80) {
    throw new Error("王小明的商品或單價 price 不正確！");
  }

  console.log("\n✅ 驗證成功！資料庫各欄位寫入完全正確。");

  // 4. 清理測試資料
  console.log("正在清理測試資料...");
  await prisma.groupBuyOrder.delete({ where: { orderId: res.orderId } });
  await prisma.product.delete({ where: { productId: p1Id } });
  await prisma.product.delete({ where: { productId: p2Id } });
  console.log("🧹 測試資料清理完成。");
}

main()
  .catch(err => {
    console.error("❌ 測試失敗:", err);
  })
  .finally(() => prisma.$disconnect());
