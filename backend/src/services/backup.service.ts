import { prisma } from '../database/context.js';
import xlsx from 'xlsx';

export const BackupService = {
  async exportDatabaseToExcel() {
    // 1. 查詢所有資料表內容
    const users = await prisma.user.findMany();
    const products = await prisma.product.findMany();
    const inventories = await prisma.inventory.findMany();
    const purchases = await prisma.purchase.findMany();
    const sales = await prisma.sales.findMany();
    const salesDetails = await prisma.salesDetail.findMany();
    const expenditures = await prisma.expenditure.findMany();
    const payrollSettings = await prisma.payrollSetting.findMany();
    const dailyRecords = await prisma.dailyRecord.findMany();
    const employeeProfiles = await prisma.employeeProfile.findMany();
    const groupBuyCommunities = await prisma.groupBuyCommunity.findMany();
    const groupBuyCampaigns = await prisma.groupBuyCampaign.findMany();
    const groupBuyAuditLogs = await prisma.groupBuyAuditLog.findMany();
    const groupBuyOrderStatusHistories = await prisma.groupBuyOrderStatusHistory.findMany();
    const groupBuyNotifications = await prisma.groupBuyNotification.findMany();
    const groupBuySystemSettings = await prisma.groupBuySystemSetting.findMany();
    const vendors = await prisma.vendor.findMany();
    const activityLogs = await prisma.activityLog.findMany();

    // 2. 建立新 Workbook
    const wb = xlsx.utils.book_new();

    // 輔助函數：將物件陣列轉換成 worksheet 並加入 workbook 中
    const appendSheet = (data: any[], sheetName: string) => {
      // 處理 Decimal 類型與 Date 類型，轉換成 plain 格式以利 Excel 寫入
      const plainData = data.map((item) => {
        const plainItem: any = {};
        for (const [key, value] of Object.entries(item)) {
          if (value instanceof Date) {
            // 轉成台北時間 (UTC+8) 的字串以符合原 Excel 格式
            const d = new Date(value.getTime() + 8 * 60 * 60 * 1000);
            plainItem[key] = d.toISOString().replace('T', ' ').substring(0, 19);
          } else if (value && typeof value === 'object' && value.constructor.name === 'Decimal') {
            plainItem[key] = Number(value);
          } else if (typeof value === 'object' && value !== null) {
            plainItem[key] = JSON.stringify(value);
          } else {
            plainItem[key] = value;
          }
        }
        return plainItem;
      });

      const ws = xlsx.utils.json_to_sheet(plainData);
      xlsx.utils.book_append_sheet(wb, ws, sheetName);
    };

    // 3. 依原本 schema / seed 對齊的分頁名稱，填入資料
    appendSheet(users, 'Users');
    appendSheet(products, 'Products');
    appendSheet(inventories, 'Inventory');
    appendSheet(purchases, 'Purchases');
    appendSheet(sales, 'Sales');
    appendSheet(salesDetails, 'SalesDetails');
    appendSheet(expenditures, 'Expenditures');
    appendSheet(payrollSettings, 'Payroll_Settings');
    appendSheet(dailyRecords, 'Daily_Records');
    appendSheet(employeeProfiles, 'Employee_Profiles');
    appendSheet(groupBuyCommunities, 'GroupBuy_Communities');
    appendSheet(groupBuyCampaigns, 'GroupBuy_Campaigns');
    appendSheet(groupBuyAuditLogs, 'GroupBuy_AuditLogs');
    appendSheet(groupBuyOrderStatusHistories, 'GroupBuy_OrderStatusHistory');
    appendSheet(groupBuyNotifications, 'GroupBuy_Notifications');
    appendSheet(groupBuySystemSettings, 'GroupBuy_SystemSettings');
    appendSheet(vendors, 'Vendors');
    appendSheet(activityLogs, 'ActivityLogs');

    // 4. 生成 Excel Buffer (寫入記憶體二進制中)
    const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
    return buf;
  }
};
