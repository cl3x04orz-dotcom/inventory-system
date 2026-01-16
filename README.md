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

### 1. 設定 GitHub Secrets
為了安全起見，API 網址不應直接寫在工作流檔案中。請在 GitHub 儲存庫設定：
1. 進入 GitHub Repository -> **Settings** -> **Secrets and variables** -> **Actions**。
2. 點擊 **New repository secret**。
3. Name: `VITE_GAS_API_URL`
4. Value: (貼上您的 Google Apps Script 部署網址，例如：`https://script.google.com/macros/s/.../exec`)

### 2. 觸發部署
每當您推送到 `main` 分支時，GitHub Actions 會自動執行：
- 安裝依賴
- 帶入 `VITE_GAS_API_URL` 進行 Build
- 將生成的 `dist` 目錄部署到 `gh-pages` 分支

### 3. 開啟 GitHub Pages (首次設定)
1. 進入 **Settings** -> **Pages**。
2. Build and deployment -> Source 選擇 **Deploy from a branch**。
3. Branch 選擇 `gh-pages` 且目錄為 `/(root)`。
