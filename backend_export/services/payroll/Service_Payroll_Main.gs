/**
 * Service_Payroll_Main.gs
 * [Service] 薪資資料獲取與整體管理
 */

function getPayrollDataService(payload, user) {
  const { month } = payload;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 1. 取得基本資料與日結紀錄
  const settingsSheet = ss.getSheetByName('PayrollSettings');
  const recordSheet = ss.getSheetByName('DailyRecords');
  if (!settingsSheet || !recordSheet) return { error: '薪資系統初始化未完成' };

  const settings = settingsSheet.getDataRange().getValues().slice(1).map(row => ({
    username: row[0],
    baseSalary: Number(row[1]) || 0,
    hourlyRate: Number(row[2]) || 0,
    allowance: Number(row[3]) || 0
  }));

  const records = recordSheet.getDataRange().getValues().slice(1).filter(row => {
    const date = new Date(row[0]);
    return date.getFullYear() === new Date(month).getFullYear() && 
           date.getMonth() === new Date(month).getMonth();
  }).map(row => ({
    date: row[0],
    username: row[1],
    hours: Number(row[2]) || 0,
    note: row[3] || ''
  }));

  return { settings, records };
}

function savePayrollSettingsService(payload, user) {
  const { settings } = payload;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('PayrollSettings') || initPayrollSheet_('PayrollSettings', ['Username', 'BaseSalary', 'HourlyRate', 'Allowance']);
  
  sheet.clearContents();
  sheet.appendRow(['Username', 'BaseSalary', 'HourlyRate', 'Allowance']);
  settings.forEach(s => {
    sheet.appendRow([s.username, s.baseSalary, s.hourlyRate, s.allowance]);
  });
  return { success: true };
}
