import { prisma } from '../database/context.js';

async function main() {
  console.log('Cleaning up combo product negative inventory snapshots...');
  const comboProducts = await prisma.product.findMany({
    where: { isCombo: true }
  });

  const comboIds = comboProducts.map(p => p.productId);
  console.log('Found combo product IDs:', comboIds);

  if (comboIds.length > 0) {
    // Reset inventory snapshots for combo products to 0
    const updatedSnapshots = await prisma.inventorySnapshot.updateMany({
      where: { productId: { in: comboIds } },
      data: { onHandQty: 0, availableQty: 0 }
    });
    console.log(`Reset ${updatedSnapshots.count} inventory snapshot records for combo products.`);

    // Delete negative inventory batches for combo products if any
    const deletedBatches = await prisma.inventory.deleteMany({
      where: { productId: { in: comboIds }, quantity: { lte: 0 } }
    });
    console.log(`Cleaned up ${deletedBatches.count} negative batch records for combo products.`);
  }

  console.log('Combo cleanup complete!');
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
