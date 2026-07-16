# 🍼 米立微 Milk Zero Waste

> 現代化線上點單 × 門市營運 × 智慧物流大樓配送管理系統

---

## 📖 專案介紹

**米立微 Milk Zero Waste** 是米立微牛奶倉庫營運的核心系統，已全面從舊有的 Google Apps Script (GAS) 架構，升級為現代化的 **PostgreSQL (Supabase) + Prisma ORM + Node.js (TypeScript)** 核心，整合：

* 🛒 **LINE LIFF 線上點單**：住戶一鍵快速訂購，支援多規格口味與獨立「捆裝銷售」配置。
* 🚚 **大樓團購與定期配管理**：大樓定期配月訂單自動無感背景導入，地址大樓前綴智慧匹配。
* 📦 **庫存與物流分貨管理**：實體瓶數與捆裝組數自動雙重換算，物流明細一鍵複製。
* 💰 **財務與薪資統計**：大樓抽成、配送員薪資與利潤毛利精準分析。
* 📊 **智慧領貨 AI 補貨分配**：自動進位箱規與發貨階梯計算。

---

# 🏗 系統架構

```text
       ┌────────────────────────┐
       │     LINE LIFF 前台     │
       │    (GitHub Pages)      │
       └───────────┬────────────┘
                   │ HTTPS API
                   ▼
       ┌────────────────────────┐
       │   Node.js (Express)    │
       │     (TypeScript)       │
       └───────────┬────────────┘
                   │ Prisma Client
                   ▼
       ┌────────────────────────┐
       │  PostgreSQL (Supabase)  │
       │       Database         │
       └───────────┬────────────┘
```

### 核心架構原則：
* **前後端完全分離**：前端 React (Vite) 透過網域 Secrets 連線生產環境 Node.js 後端 API。
* **Prisma 強型別約束**：資料庫 Schema 統一由 Prisma 定義，支援 Schema 遷移與強型別開發。
* **Service 商業邏輯集中化**：Controller 僅負責請求分發與輸入校驗，所有核心商業邏輯（如 FIFO、轉單、定期配、庫存扣減）皆封裝在 Service 層。

# 📂 專案結構

```text
inventory-system/
├── src/                    # React (Vite) 前端程式碼
│   ├── api/                # API 封裝與請求層
│   ├── components/         # 共享 UI 元件
│   ├── pages/              # 各個獨立功能頁面 (如 LiffOrderPage, SubscriptionManagementPage)
│   └── App.jsx             # 路由與初始化入口
├── backend/                # Node.js + TypeScript 後端
│   ├── prisma/             # Prisma Schema 與資料庫遷移
│   │   └── schema.prisma   # 資料庫核心 Schema 定義
│   └── src/
│       ├── controllers/    # API 控制器與請求入口
│       ├── services/       # 商業邏輯核心層 (如 groupbuy.service.ts)
│       └── routes/         # API 路由配置
└── README.md
```

---

# ⚡ 後端開發與效能軍規

### 1. 禁止 N+1 資料庫查詢 (Batch Prefetch)
對於明細中有多個產品的關聯操作，嚴禁在 for 迴圈中逐筆查詢資料庫。必須使用 Prisma `in` 或批量 prefetch 查出後在記憶體中用 Map 檢索：
```typescript
// ✅ 優良範例
const productIds = items.map(i => i.productId).filter(Boolean);
const products = await prisma.product.findMany({
  where: { productId: { in: productIds } }
});
const prodMap = new Map(products.map(p => [p.productId, p]));
```

### 2. 嚴格的事務操作 (Prisma Transaction)
凡是涉及帳戶扣款 (如奶包金扣抵)、庫存扣減等需保證 ACID 特性的商業邏輯，必須包裹在 Prisma Transaction 事務中，確保操作的一致性，防止高併發下的髒讀或數據不一致。

### 3. 物流實體庫存與銷售規格分離
* **庫存盤點**：資料庫中的 `Inventory` 與 `SalesDetail` 的 `sold`（售出數量）一律記錄為 **「單瓶/單個」** 實體庫存單位。
* **捆裝換算**：當設定 `isBundle` 且為 `bundleSize === X` 的商品時，前端單價填「整組售價」，進價成本填「單瓶進價」，確認出貨時後端自動乘以 `X` 扣除實體庫存，保障利潤毛利報表精準對齊。

---

# ✅ 開發與 PR 檢核表 (PR Checklist)

* [ ] 所有資料庫欄位修改是否已同步執行 `prisma db push` 並生成 Client？
* [ ] 商業邏輯是否皆寫在 `service` 中，Controller 保持乾淨？
* [ ] 是否已徹底移除任何歷史 GAS / Spreadsheet 的殘留寫入邏輯？
* [ ] 新增或修改 API 是否維持向下相容，不破壞舊有下單頁面的正常運行？
* [ ] 高頻操作是否做好了防重複導入 (如定期配一鍵轉單的防重機制)？

<!-- Trigger rebuild: 2026-07-16 20:55 -->