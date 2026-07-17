import xlsx from 'xlsx';
import path from 'path';

async function main() {
  const xlsxPath = path.resolve('/Users/mac/Desktop/G/inventory-system/scratch/database.xlsx');
  const workbook = xlsx.readFile(xlsxPath);

  const invSheet = workbook.Sheets['Inventory'];
  if (invSheet) {
    const data = xlsx.utils.sheet_to_json(invSheet, { header: 1 });
    console.log('--- Excel Inventory 中與「蘋果醋」相關的紀錄 ---');
    data.forEach((row, idx) => {
      const rowStr = JSON.stringify(row);
      if (rowStr.includes('蘋果醋') || rowStr.includes('3f35cd3b-ed06-45be-a5bc-d5f757ff044e')) {
        console.log(`第 ${idx + 1} 行:`, row);
      }
    });
  }
}

main().catch(console.error);
