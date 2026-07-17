import { prisma } from '../src/database/context.js';

async function main() {
  const triggers = await prisma.$queryRaw`
    SELECT tgname, relname 
    FROM pg_trigger 
    JOIN pg_class ON pg_class.oid = tgrelid 
    WHERE tgisinternal = false
  `;
  console.log('Triggers:', triggers);
}

main().catch(console.error).finally(() => prisma.$disconnect());
