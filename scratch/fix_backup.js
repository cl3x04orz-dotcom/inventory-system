const fs = require('fs');

// 1. Fix api.ts
const apiPath = './backend/src/routes/api.ts';
let apiContent = fs.readFileSync(apiPath, 'utf8');
// It doesn't have storeCode right now
// But wait, user is authenticated and we can use currentStoreCode
apiContent = apiContent.replace(
  'const excelBuffer = await BackupService.exportDatabaseToExcel();',
  '// Ensure currentStoreCode is available\n      const storeCode = user && user.role === "BOSS" && !user.storeCode ? "MILI001" : (user.storeCode || "MILI001");\n      const excelBuffer = await BackupService.exportDatabaseToExcel(storeCode);'
);
fs.writeFileSync(apiPath, apiContent);

// 2. Fix backup.service.ts
const backupPath = './backend/src/services/backup.service.ts';
let backupContent = fs.readFileSync(backupPath, 'utf8');

backupContent = backupContent.replace('async exportDatabaseToExcel() {', 'async exportDatabaseToExcel(storeCode: string) {\n    const where = storeCode ? { storeCode } : {};');

// Replace all findMany() with findMany({ where }) except for models that don't have storeCode directly.
// Let's use a regex to replace findMany() with findMany({ where }) for models.
// But some models like salesDetail might not have storeCode directly. Let's see if salesDetails has storeCode. If not, use { where: { sales: { storeCode } } } 
// wait, instead of guessing, let's just make it robust in TS.
