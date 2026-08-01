import { BackupService } from '../backend/src/services/backup.service.js';
async function run() {
  try {
    const buffer = await BackupService.exportDatabaseToExcel('MILI001');
    console.log("Success! Buffer size:", buffer.length);
  } catch (err) {
    console.error("Backup failed:", err);
  }
}
run();
