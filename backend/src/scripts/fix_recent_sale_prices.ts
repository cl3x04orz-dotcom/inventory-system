import { prisma } from '../database/context.js';

async function main() {
  const saleId = 'GB20261004082623';
  console.log(`Fixing Sale ${saleId}...`);

  const details = await prisma.salesDetail.findMany({ where: { saleId } });
  if (details.length > 0) {
    const splitPrice = 399 / details.length; // 199.5
    for (let i = 0; i < details.length; i++) {
      const d = details[i];
      const subtotal = i === details.length - 1 ? Math.round((399 - splitPrice * i) * 100) / 100 : Math.round(splitPrice * 100) / 100;
      await prisma.salesDetail.update({
        where: { id: d.id },
        data: {
          unitPrice: subtotal / d.sold,
          subtotal: subtotal
        }
      });
    }

    await prisma.sales.update({
      where: { saleId },
      data: { finalTotal: 399, totalCash: 399 }
    });
    console.log(`Sale ${saleId} details successfully updated to total $399!`);
  }
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
