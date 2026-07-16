# 🍼 米立微 Milk Zero Waste

> 線上點單 × 團購配送 × 門市營運後台管理系統

---

## 📖 專案介紹

**米立微 Milk Zero Waste** 為米立微牛奶倉庫的核心營運系統，整合：

* 🛒 LINE LIFF 線上點單
* 🏪 門市 POS 管理
* 🚚 大樓團購配送
* 📦 庫存管理
* 💰 對帳與營收統計
* 👥 會員管理
* 📊 營運分析

系統以 **Google Apps Script (GAS)** 為後端，搭配 **React** 前端與 **Google Spreadsheet** 作為資料儲存，透過 Git 管理版本。

目前專案已超過 **10,000 行程式碼**，採用模組化架構，並遵循嚴格的效能與維護規範。

---

# 🏗 系統架構

```text
React (LINE LIFF)
        │
        ▼
 Google Apps Script
        │
        ▼
Application Service
        │
        ▼
 Repository Layer
        │
        ▼
Google Spreadsheet
```

核心原則：

* UI 不碰資料庫
* Business Logic 不碰 Spreadsheet
* Repository 專責資料存取
* 所有商業邏輯集中於 Service

---

# 📂 專案結構

```text
src/

├── api/
├── pages/
├── components/
├── services/
├── repositories/
├── mappers/
├── models/
├── utils/
├── config/
└── types/
```

GAS

```text
backend/

├── controllers/
├── services/
├── repositories/
├── mappers/
├── config/
├── triggers/
├── utils/
└── tests/
```

---

# ⚙ 技術棧

### Frontend

* React
* React Router
* Axios
* Vite

### Backend

* Google Apps Script
* Spreadsheet Service
* CacheService
* LockService
* Trigger

### Database

Google Spreadsheet

（未來可平滑遷移 PostgreSQL）

---

# 🚀 核心設計理念

## Repository Pattern

所有 Spreadsheet 操作只能存在 Repository。

禁止：

* Service 使用 SpreadsheetApp
* Controller 使用 SpreadsheetApp

只能：

```text
Controller
    ↓
Service
    ↓
Repository
    ↓
Spreadsheet
```

---

## DTO + Mapper

Spreadsheet 永遠只存二維陣列。

Repository 回傳 DTO。

Mapper 負責：

* Row → DTO
* DTO → Row

前端不得解析 Spreadsheet 欄位。

---

## Service Layer

所有商業邏輯集中於 Service。

例如：

* 建立訂單
* 扣庫存
* 建立會員
* 發送通知
* 對帳

不得直接寫於 Controller。

---

# ⚡ 效能軍規

## 1. 禁止迴圈內讀寫 Spreadsheet

❌

```javascript
for (...) {
    sheet.getRange(...).getValue();
}
```

✅

```javascript
const values = sheet.getDataRange().getValues();

for (...) {
    // Memory 運算
}

sheet.getRange(...).setValues(result);
```

---

## 2. API 合併

前端不得同時呼叫多支初始化 API。

必須：

```text
initPageData()
```

一次回傳：

* 商品
* 分類
* 使用者
* 權限
* 系統設定

---

## 3. LockService 最小化

Lock 僅能存在：

* 寫入
* 扣庫存
* 更新訂單

所有運算必須於 Lock 前完成。

---

## 4. Client Cache

固定資料：

* 商品分類
* Banner
* RichMenu
* Logo

使用：

* localStorage
* sessionStorage

避免重複呼叫 GAS。

---

## 5. CacheService

GAS 端快取：

* 商品
* 分類
* 公告
* 設定

減少 Spreadsheet 存取。

---

## 6. Trigger 分流

前台：

* 下單
* 查詢

後台 Trigger：

* 每日對帳
* FIFO
* 營收統計
* 歷史封存

---

# 📦 Spreadsheet 管理

所有 Spreadsheet：

* 不超過數千列
* 定期封存
* 歷史資料移至 Archive

避免：

* 讀取速度下降
* 觸發 GAS Timeout

---

# 🔒 Git Workflow

禁止：

```text
git push origin main
```

所有功能：

```text
feature/xxxx
```

Bug：

```text
bugfix/xxxx
```

流程：

```text
Feature Branch
        │
        ▼
Pull Request
        │
        ▼
Code Review
        │
        ▼
Merge Main
```

---

# ✅ Pull Request Checklist

每次 PR 必須確認：

* [ ] 無迴圈內 Spreadsheet I/O
* [ ] 無新增重複 Utility
* [ ] 無直接操作 Spreadsheet
* [ ] 使用 Repository
* [ ] 使用 Mapper
* [ ] LockService 範圍最小化
* [ ] API 相容
* [ ] 不影響 LIFF 效能

---

# 🧩 Coding Standards

Function：

* 建議 50 行內
* 最多 100 行

命名：

```text
getProducts()

createOrder()

updateCustomer()

deleteInventory()
```

禁止：

```text
aaa()

bbb()

test2()

go()
```

---

# 📋 API Response

統一格式：

```json
{
  "success": true,
  "data": {},
  "message": "",
  "errorCode": null
}
```

Error Code：

```text
OUT_OF_STOCK

MEMBER_NOT_FOUND

LOCK_TIMEOUT

ORDER_DUPLICATED

INVALID_COUPON
```

---

# 🤖 AI Coding Rules

AI 不得：

* 修改 Architecture
* 修改 Repository Interface
* 修改 DTO
* 修改 API Response
* 修改 Config
* 繞過 Repository
* 新增重複 Utility
* 大量跨模組重構

AI 必須：

* 沿用既有架構
* 保持向下相容
* Small PR
* 維持命名規範
* 維持效能

---

# 🛣 未來 Roadmap

Phase 1

* React + GAS + Spreadsheet

Phase 2

* Repository 完整抽象化
* Cache 最佳化

Phase 3

* PostgreSQL
* Node.js API
* Cloud Run / Render

Phase 4

* Docker
* CI/CD
* 自動化測試
* SaaS 多租戶架構

---

# 👨💻 Maintainer

**成哥｜米立微營運團隊**

---

> 「最低成本，不代表最低品質；每一行程式碼的優化，都直接影響第一線顧客的體驗。」

<!-- Trigger rebuild: 2026-07-16 20:20 -->