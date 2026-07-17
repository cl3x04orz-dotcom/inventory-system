import xlsx from 'xlsx';
import path from 'path';

const file = '/Users/mac/Desktop/G/inventory-system/scratch/database.xlsx';
const workbook = xlsx.readFile(file);
const salesSheet = workbook.Sheets['Sales'];
const rows = xlsx.utils.sheet_to_json(salesSheet);

const targetRows = rows.filter(row => {
  const cust = String(row.Location || row.Customer || row.customer || '');
  const total = Number(row.FinalTotal || row.finalTotal || 0);
  return cust.includes('大仁') && total === 4200;
});

console.log('--- 找到符合條件的 Sales 行 ---');
targetRows.forEach((r, idx) => {
  console.log(`[${idx}]`, JSON.stringify(r, null, 2));
});
