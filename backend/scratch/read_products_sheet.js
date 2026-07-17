import xlsx from 'xlsx';

const file = '../scratch/database.xlsx';
const workbook = xlsx.readFile(file);
const sheet = workbook.Sheets['Products'];
const rows = xlsx.utils.sheet_to_json(sheet);

console.log('Headers:', Object.keys(rows[0] || {}));
console.log('Total product rows:', rows.length);

console.log('--- Custom settings found in Excel Products sheet ---');
rows.forEach(r => {
  const packSize = r.packSize || r.PackSize || r['整箱包裝數'] || r['整箱'];
  const steps = r.dispatchSteps || r.DispatchSteps || r['發貨階梯'];
  const threshold = r.roundThreshold || r.RoundThreshold || r['門檻'] || r['進位門檻'];
  const autoSuppress = r.autoSuppress || r.AutoSuppress || r['智慧散貨抑制'] || r['智慧抑制'];
  const maxSuggestion = r.maxSuggestion || r.MaxSuggestion || r['最大建議量'] || r['上限'];

  const hasCustom = 
    (packSize !== undefined && Number(packSize) !== 1) || 
    (steps !== undefined && steps !== '[]' && steps !== '') ||
    (threshold !== undefined && Number(threshold) !== 99) ||
    (autoSuppress !== undefined && autoSuppress !== false && autoSuppress !== 'FALSE') ||
    (maxSuggestion !== undefined && Number(maxSuggestion) !== 0);

  if (hasCustom) {
    console.log(r);
  }
});
