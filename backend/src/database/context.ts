import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { AsyncLocalStorage } from 'async_hooks';
import { PrismaClient, Prisma } from '@prisma/client';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

import fs from 'fs';
if (process.platform === 'darwin' && !process.env.SSL_CERT_FILE) {
  const defaultMacCert = '/etc/ssl/cert.pem';
  if (fs.existsSync(defaultMacCert)) {
    process.env.SSL_CERT_FILE = defaultMacCert;
  }
}

const globalPrisma = new PrismaClient();

// Storage to hold the active TransactionClient during a transaction context
const txStorage = new AsyncLocalStorage<Prisma.TransactionClient>();

/**
 * Returns either the active transaction client or the default prisma client.
 */
export function getDbClient(): Prisma.TransactionClient | PrismaClient {
  return txStorage.getStore() || globalPrisma;
}

export const prisma = new Proxy(globalPrisma, {
  get(target, prop) {
    const client = getDbClient();
    const value = Reflect.get(client, prop);
    if (typeof value === 'function') {
      return value.bind(client);
    }
    return value;
  }
}) as unknown as PrismaClient;

/**
 * Executes a callback within a database transaction context, propagating the transaction client
 * implicitly via AsyncLocalStorage to any repositories/services called inside the callback.
 */
export async function runInTransaction<T>(fn: () => Promise<T>): Promise<T> {
  const currentStore = txStorage.getStore();
  if (currentStore) {
    // Already in a transaction context, simply execute the function to avoid nested transactions
    return fn();
  }

  return prisma.$transaction(async (tx) => {
    return txStorage.run(tx, fn);
  }, {
    maxWait: 15000,
    timeout: 30000
  });
}
