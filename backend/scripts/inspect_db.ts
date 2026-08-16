import { prisma } from '../src/database/context.js';

async function main() {
  const settings = await prisma.groupBuySystemSetting.findMany();
  console.log('=== DATABASE SETTINGS ===');
  for (const s of settings) {
    console.log(`Key: ${s.settingKey}`);
    console.log(`Value: ${s.settingValue}`);
    console.log('------------------------');
  }
}

main().catch(err => console.error(err));
