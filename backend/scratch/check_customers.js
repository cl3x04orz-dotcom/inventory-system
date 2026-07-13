import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: "postgresql://postgres.gsoebguhxkwqesdybjpj:h7832595126H@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres"
    }
  }
});

async function main() {
  const customers = await prisma.customer.findMany();
  console.log("=== DB Customers ===");
  customers.forEach(c => {
    console.log(`${c.customerName}: AI=${c.isAiEnabled}, schedule=${JSON.stringify(c.schedule)}, category=${c.category}`);
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
