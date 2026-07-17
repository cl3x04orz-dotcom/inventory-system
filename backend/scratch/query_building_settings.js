import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const settings = await prisma.buildingSetting.findMany();
  console.log("=== BuildingSetting ===");
  console.log(settings);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
