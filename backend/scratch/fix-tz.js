import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log('Shifting database timestamps back by 8 hours to fix Excel timezone parsing...');
  
  const tables = [
    { name: 'Sales', field: 'date' },
    { name: 'Expenditure', field: 'timestamp' },
    { name: 'Purchase', field: 'date' },
    { name: 'DailyRecord', field: 'date' },
    { name: 'DailyRecord', field: 'timestamp' },
    { name: 'Inventory', field: 'entryDate' }
  ];

  for (const table of tables) {
    try {
      console.log(`Updating ${table.name}.${table.field}...`);
      const count = await prisma.$executeRawUnsafe(
        `UPDATE "${table.name}" SET "${table.field}" = "${table.field}" - INTERVAL '8 hours'`
      );
      console.log(`Updated ${count} rows in ${table.name}`);
    } catch (err) {
      console.error(`Failed to update ${table.name}.${table.field}:`, err.message);
    }
  }

  console.log('Timezone shift completed!');
}

main().catch(console.error).finally(() => prisma.$disconnect());
