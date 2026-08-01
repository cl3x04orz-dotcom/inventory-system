const fs = require('fs');
const path = './backend/prisma/schema.prisma';
const content = fs.readFileSync(path, 'utf8');
const models = ['User', 'Product', 'Inventory', 'Purchase', 'Sales', 'Expenditure', 'PayrollSetting', 'DailyRecord', 'EmployeeProfile', 'GroupBuyCommunity', 'GroupBuyCampaign', 'GroupBuyAuditLog', 'GroupBuyOrderStatusHistory', 'GroupBuyNotification', 'GroupBuySystemSetting', 'Vendor', 'ActivityLog'];
const missing = [];
models.forEach(model => {
  const regex = new RegExp(`model\\s+${model}\\s+\\{([^}]*)\\}`);
  const match = content.match(regex);
  if (match) {
    if (!match[1].includes('storeCode')) {
      missing.push(model);
    }
  } else {
    console.log(`Model ${model} not found!`);
  }
});
console.log('Missing storeCode in models:', missing);
