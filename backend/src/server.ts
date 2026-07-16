import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 本地開發：從上層目錄讀取 .env；雲端部署：直接使用系統環境變數
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config(); // fallback: 讀取同目錄或系統 env

import { buildApp } from './app.js';

const app = buildApp();

const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const host = process.env.HOST || '0.0.0.0';

async function start() {
  try {
    await app.listen({ port, host });
    console.log(`[Server] 後端服務已啟動在 http://${host}:${port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
