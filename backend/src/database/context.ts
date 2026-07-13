import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { AsyncLocalStorage } from 'async_hooks';
import { PrismaClient, Prisma } from '@prisma/client';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

export const prisma = new PrismaClient();

// Storage to hold the active TransactionClient during a transaction context
const txStorage = new AsyncLocalStorage<Prisma.TransactionClient>();

/**
 * Returns either the active transaction client or the default prisma client.
 */
export function getDbClient(): Prisma.TransactionClient | PrismaClient {
  return txStorage.getStore() || prisma;
}

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
  });
}
