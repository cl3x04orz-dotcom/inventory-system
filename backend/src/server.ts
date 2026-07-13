import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from the root .env file
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

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
