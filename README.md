# Inventory System (庫存管理系統)

一個基於 React (Vite) 前端與 Google Apps Script (GAS) 後端的庫存管理系統。

## 技術棧
- 前端：React 19 (Vite)
- 後端：Google Apps Script
- 資料庫：Google Sheets (Google 試算表)
- UI 庫：Lucide React, Tailwind CSS

## 環境變數設定

本專案使用 Vite 開發，環境變數需以 `VITE_` 開頭。請參考 `.env.example` 建立 `.env` 檔案。

```env
VITE_GAS_API_URL=你的_GAS_API_網址
```

## 本機開發

1. 複製儲存庫
2. 執行 `npm install`
3. 建立 `.env` 並填入 `VITE_GAS_API_URL`
4. 執行 `npm run dev`

## 自動化部署 (GitHub Actions)

本專案已設定 GitHub Actions 自動部署至 GitHub Pages。

### 1. 取得 Google Apps Script 網址
1. 開啟您的 GAS 專案（例如 `Code.gs` 或 `Payroll.gs` 所在的編輯畫面）。
2. 在右上角選擇 **部署 (Deploy)** -> **管理部署 (Manage deployments)**。
3. 找到狀態為「已啟用」的 Web App 部署。
4. 點擊 **網址 (URL)** 下方的複製按鈕。

### 2. 在 GitHub 設定 Secret
為了安全起見，API 網址不應直接寫在工作流檔案中。請依照以下步驟設定：
1. **開啟您的 GitHub 儲存庫頁面** (例如 `https://github.com/cl3x04orz-dotcom/inventory-system`)。
2. 點擊頂端標籤列最右側的 **Settings (設定)**。
3. 在左側側邊欄中，向下捲動找到 **Security (安全性)** 區塊。
4. 點選 **Secrets and variables** -> **Actions**。
5. 點擊右側綠色的 **New repository secret** 按鈕。
6. 在 **Name** 欄位輸入：`VITE_GAS_API_URL`
7. 在 **Secret** 欄位貼上您剛才複製的 **Google Apps Script 網址**。
8. 點擊 **Add secret** 完成設定。

### 3. 觸發部署
每當您執行 `git push` 將程式碼推送到 `main` 分支時，GitHub Actions 就會自動帶入此 Secret 進行 Build 並部署。

### 4. 開啟 GitHub Pages (首次設定)
1. 進入 **Settings** -> **Pages**。
2. Build and deployment -> Source 選擇 **Deploy from a branch**。
3. Branch 選擇 `gh-pages` 且目錄為 `/(root)`。
