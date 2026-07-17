import xlsx from 'xlsx';
import path from 'path';

const excelPath = path.resolve('../scratch/database.xlsx');
console.log(`讀取 Excel: ${excelPath}`);
const workbook = xlsx.readFile(excelPath);

const settingsSheet = workbook.Sheets['Payroll_Settings'];
if (settingsSheet) {
  const data = xlsx.utils.sheet_to_json(settingsSheet);
  console.log('--- Excel Payroll_Settings ---');
  console.log(JSON.stringify(data, null, 2));
} else {
  console.log('找不到 Payroll_Settings');
}

const usersSheet = workbook.Sheets['Users'];
if (usersSheet) {
  const users = xlsx.utils.sheet_to_json(usersSheet);
  console.log('--- Excel Users ---');
  console.log(JSON.stringify(users, null, 2));
}
