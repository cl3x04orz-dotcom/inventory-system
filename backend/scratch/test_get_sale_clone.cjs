const { SalesService } = require('../src/services/sales.service.ts');
const { prisma } = require('../src/database/context.js');

async function run() {
  const result = await SalesService.getSaleToClone({ saleId: '188be89c-60ac-4220-9a02-ecad860d105e' });
  console.log('Result from getSaleToClone:');
  console.dir(result, { depth: null });
  await prisma.$disconnect();
}

run().catch(console.error);
