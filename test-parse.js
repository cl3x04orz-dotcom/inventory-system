const fs = require('fs');
const babel = require('@babel/parser');
const checkFiles = ['src/pages/LiffOrderPage.jsx', 'src/pages/GroupBuySettingsPage.jsx', 'backend/src/services/groupbuy.service.ts'];
for(let file of checkFiles) {
  const code = fs.readFileSync(file, 'utf8');
  try {
    babel.parse(code, { sourceType: 'module', plugins: ['jsx', 'typescript'] });
    console.log(`✅ ${file} parsed perfectly`);
  } catch(e) {
    console.log(`❌ Error in ${file}:`, e.message, e.loc);
  }
}
