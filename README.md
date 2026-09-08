# 🍼 米立微 Milk Zero Waste

> 現代化線上點單 × 門市營運 × 智慧物流大樓配送管理系統

---

## 📖 專案介紹

**米立微 Milk Zero Waste** 是米立微牛奶倉庫的核心營運系統，整合：

* 🛒 **LINE LIFF 線上點單**：住戶一鍵快速訂購，支援多規格口味與獨立「捆裝銷售」配置。
* 🚚 **大樓團購與定期配管理**：大樓定期配月訂單自動無感背景導入，地址大樓前綴智慧匹配。
* 📦 **庫存與物流分貨管理**：實體瓶數與捆裝組數自動雙重換算，物流明細一鍵複製。
* 💰 **財務與薪資統計**：大樓抽成、配送員薪資與利潤毛利精準分析。
* 📊 **智慧領貨 AI 補貨分配**：自動進位箱規與發貨階梯計算。

---

# 🏗 系統架構

```text
┌──────────────────────────────────────────────────────────┐
│                  客人手機 / 員工後台                        │
│                                                          │
│   ┌───────────────────┐     ┌───────────────────────┐   │
│   │  LINE LIFF 下單頁  │     │     後台管理系統        │   │
│   │  (GitHub Pages)   │     │   (GitHub Pages)       │   │
│   └────────┬──────────┘     └──────────┬────────────┘   │
└────────────┼──────────────────────────┼────────────────-─┘
             │ HTTPS                    │ HTTPS (本地 Vite Proxy)
             ▼                          ▼
┌─────────────────────────────────────────────────────────┐
│              Node.js 後端 (Fastify + TypeScript)         │
│              Render.com 雲端部署                          │
│         https://inventory-system-j6rs.onrender.com       │
└──────────────────────────┬──────────────────────────────┘
                           │ Prisma ORM
                           ▼
┌─────────────────────────────────────────────────────────┐
│              PostgreSQL 資料庫 (Supabase)                 │
│   aws-0-ap-northeast-1.pooler.supabase.com              │
└─────────────────────────────────────────────────────────┘
                           
┌─────────────────────────────────────────────────────────┐
│           Google Apps Script (保留，僅限列印)              │
│           合併列印 PDF ➔ Google Drive Docs 模板           │
└─────────────────────────────────────────────────────────┘
```

### 部署資訊

| 項目 | 說明 |
|------|------|
| **前端** | React (Vite) → GitHub Pages |
| **前端網址** | `https://cl3x04orz-dotcom.github.io/inventory-system/` |
| **後端** | Node.js (Fastify) → Render (Free tier) |
| **後端網址** | `https://inventory-system-j6rs.onrender.com` |
| **前台 API 連線** | `https://inventory-system-j6rs.onrender.com/api` ✅ 已確認非 GAS |
| **資料庫** | PostgreSQL (Supabase, ap-northeast-1) |
| **ORM** | Prisma 6.x |
| **認證** | JWT |
| **列印** | Google Apps Script（僅限合併列印 PDF 功能）|

### GitHub Secrets 設定位置

> GitHub → Settings → Secrets and variables → Actions

| Secret 名稱 | 目前的值 |
|-------------|---------|
| `VITE_GAS_API_URL` | `https://inventory-system-j6rs.onrender.com/api` |

> [!NOTE]
> **Render 免費版冷啟動**：服務閒置 15 分鐘後會休眠，第一個請求需等 30~60 秒。客人若看到下單頁面卡住，重新整理一次即可。不影響正常下單流程。

> [!NOTE]
> **客人免登入機制**：前台頁面在背景自動以 `{ username: 'guest', password: 'guest' }` 完成登入。資料庫中的 `guest` 帳號密碼已正確設定為 SHA-256 雜湊值。若前台再度出現登入畫面，先確認 Render 後端是否正常（造訪 `/health` 端點確認回傳 `{ status: "OK" }`）。

### 核心架構原則

* **前後端完全分離**：前端 React (Vite) 透過 GitHub Secrets 中的 `VITE_GAS_API_URL` 連線後端 API。
* **Prisma 強型別約束**：資料庫 Schema 統一由 Prisma 定義，支援 Schema 遷移與強型別開發。
* **Service 商業邏輯集中化**：Controller 僅負責請求分發與輸入校驗，所有核心商業邏輯皆封裝在 Service 層。

---

# 📂 專案結構

```text
inventory-system/
├── src/                    # React (Vite) 前端程式碼
│   ├── api/                # API 封裝與請求層
│   ├── components/         # 共享 UI 元件
│   ├── pages/              # 各個獨立功能頁面
│   └── App.jsx             # 路由與初始化入口
├── backend/                # Node.js + TypeScript 後端
│   ├── prisma/             # Prisma Schema 與資料庫遷移
│   │   └── schema.prisma   # 資料庫核心 Schema 定義
│   └── src/
│       ├── controllers/    # API 控制器與請求入口
│       ├── services/       # 商業邏輯核心層
│       └── routes/         # API 路由配置
├── render.yaml             # Render 雲端部署設定
└── README.md
```

---

# 🚀 本地開發啟動

### 前端
```bash
npm install
npm run dev
# http://localhost:5173/inventory-system/
```

### 後端
```bash
cd backend
npm install       # 自動執行 prisma generate
npm run dev       # http://localhost:3000
```

### 環境變數 (根目錄 `.env`)
```env
DATABASE_URL=postgresql://...@...supabase.com:5432/postgres?sslmode=disable
JWT_SECRET=milipack_super_secret_jwt_key_2026
GAS_API_URL=https://script.google.com/macros/s/.../exec
```

---

# ⚡ 後端開發軍規

### 1. 禁止 N+1 資料庫查詢
```typescript
// ✅ 正確：批量 prefetch + Map 記憶體檢索
const productIds = items.map(i => i.productId).filter(Boolean);
const products = await prisma.product.findMany({
  where: { productId: { in: productIds } }
});
const prodMap = new Map(products.map(p => [p.productId, p]));
```

### 2. 嚴格的事務操作
凡是涉及庫存扣減、奶包金扣抵等需保證 ACID 的操作，一律包裹在 Prisma Transaction 中。

### 3. 物流實體庫存與銷售規格分離
* **庫存盤點**：`Inventory` 與 `SalesDetail.sold` 一律記錄**單瓶/單個**實體單位。
* **捆裝換算**：`isBundle = true` 且 `bundleSize = X` 時，確認出貨後端自動乘以 `X` 扣除實體庫存。

---

# ✅ PR 檢核表

* [ ] 資料庫欄位修改是否已執行 `prisma db push` 並重新 generate Client？
* [ ] 商業邏輯是否皆寫在 `service` 中，Controller 保持乾淨？
* [ ] 是否已徹底移除任何 GAS / Spreadsheet 殘留寫入邏輯？
* [ ] 新增或修改 API 是否維持向下相容？
* [ ] 高頻操作是否做好防重複導入機制？