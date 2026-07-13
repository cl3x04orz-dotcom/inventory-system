import xlsx from 'xlsx';
import path from 'path';

const excelPath = path.resolve('../scratch/database.xlsx');
const workbook = xlsx.readFile(excelPath);

const targetSheets = [
  'Users', 'Products', 'Inventory', 'Purchases',
  'Sales', 'SalesDetails', 'Expenditures',
  'Payroll_Settings', 'Daily_Records', 'Employee_Profiles',
  'GroupBuy_Communities', 'GroupBuy_Campaigns',
  'Vendors', 'ActivityLogs'
];

targetSheets.forEach(name => {
  const sheet = workbook.Sheets[name];
  if (!sheet) {
    console.log(`[Inspect] 找不到分頁: ${name}`);
    return;
  }
  const rows = xlsx.utils.sheet_to_json(sheet);
  if (rows.length === 0) {
    console.log(`[Inspect] 分頁 ${name} 為空`);
  } else {
    console.log(`[Inspect] 分頁 ${name} 第一列欄位:`, Object.keys(rows[0]));
  }
});
