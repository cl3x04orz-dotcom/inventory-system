# POS & ERP Migration Plan (v1 -> v2)

## 🎯 遷移目標 (Migration Objectives)
在不破壞現有「批發/團購銷售流程 (Sales)」與「庫存扣減 (Inventory)」的前提下，擴充支援「門市 POS (Retail POS)」、「混合支付 (SalePayment)」、「商品多條碼 (ProductBarcode)」、「庫存流水帳與快照 (InventoryMovement & InventorySnapshot)」以及「操作稽核 (AuditLog)」。

## 📋 步驟順序 (Sequential Execution)

### Step 1: Schema 擴充 (Additive Changes Only)
所有的變動皆為「非破壞性擴充」：
1. `Sales` 新增選填/預設值欄位：
   - `saleType` (String @default("WHOLESALE"))
   - `receiptNo` (String? @unique)
   - `subtotal` (Decimal @default(0))
   - `discount` (Decimal @default(0))
   - `tax` (Decimal @default(0))
   - `terminalId` (String?)
   - `cashierId` (String?)
2. `SalesDetail` 新增選填/預設值欄位：
   - `productName` (String?)
   - `unitCost` (Decimal @default(0))
   - `discountAmount` (Decimal @default(0))
   - `taxAmount` (Decimal @default(0))
3. 新增獨立資料表：
   - `SalePayment`
   - `ProductBarcode`
   - `InventorySnapshot`
   - `InventoryMovement`
   - `AuditLog`

### Step 2: 執行 Prisma Migration
執行 `npx prisma db push` 或 `npx prisma migrate dev --name add_pos_models` 套用表結構變更。

### Step 3: 資料驗證 (Data Validation)
執行 `backend/scripts/validate-migration.ts` 驗證：
- 既有 `Sales` 筆數與總金額完全一致。
- 既有 `Inventory` 與 `Product` 關聯無損。

### Step 4: 回滾預案 (Rollback Plan)
若 Step 2 發生任何未預期的資料庫異常：
1. 使用 `pg_restore` 恢復先前的 DB 備份 `dump` 檔案。
2. 將 `schema.prisma` 恢復為 `schema-v1.prisma` 之內容。
