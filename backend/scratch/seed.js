import dotenv from 'dotenv';
import xlsx from 'xlsx';
import path from 'path';
import { PrismaClient } from '@prisma/client';

dotenv.config({ path: '../.env' });

const prisma = new PrismaClient();

function parseExcelDate(val) {
  if (!val) return null;
  if (val instanceof Date) {
    const d = new Date(val.getTime());
    d.setHours(d.getHours() - 8);
    return d;
  }
  if (typeof val === 'number') {
    const date = new Date(Math.round((val - 25569) * 86400 * 1000));
    if (isNaN(date.getTime())) return null;
    // 減去 8 小時以調整時區偏移 (台北為 UTC+8)
    date.setHours(date.getHours() - 8);
    return date;
  }
  const d = new Date(val);
  if (!isNaN(d.getTime())) {
    d.setHours(d.getHours() - 8);
    return d;
  }
  return null;
}

function parseDecimal(val) {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') return val;
  const cleaned = String(val).replace(/[$, ]/g, '');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
}

function parseInteger(val) {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') return Math.round(val);
  const parsed = parseInt(val, 10);
  return isNaN(parsed) ? 0 : parsed;
}

function parseBoolean(val) {
  if (val === undefined || val === null) return false;
  if (typeof val === 'boolean') return val;
  const str = String(val).trim().toUpperCase();
  return str === 'TRUE' || str === 'YES' || str === '是' || str === '1';
}

function parseJson(val, fallback = []) {
  if (!val) return fallback;
  if (typeof val === 'object') return val;
  try {
    const cleaned = String(val).replace(/[“”]/g, '"').replace(/[’‘]/g, "'");
    return JSON.parse(cleaned);
  } catch (e) {
    if (typeof val === 'string') {
      return val.split(',').map(s => s.trim()).filter(Boolean);
    }
    return fallback;
  }
}

async function main() {
  const excelPath = path.resolve('../scratch/database.xlsx');
  console.log(`[Seed] 讀取 Excel 檔案: ${excelPath}`);
  const workbook = xlsx.readFile(excelPath);

  function getSheetData(sheetName) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      console.warn(`[Seed] 警告：找不到分頁 [${sheetName}]`);
      return [];
    }
    return xlsx.utils.sheet_to_json(sheet, { defval: "" });
  }

  console.log('[Seed] 清空舊資料（按外鍵相依性順序）...');
  await prisma.salesDetail.deleteMany();
  await prisma.expenditure.deleteMany();
  await prisma.inventory.deleteMany();
  await prisma.purchase.deleteMany();
  await prisma.groupBuyCampaign.deleteMany();
  await prisma.groupBuyOrderStatusHistory.deleteMany();
  await prisma.groupBuyNotification.deleteMany();
  await prisma.dailyRecord.deleteMany();
  await prisma.employeeProfile.deleteMany();
  await prisma.payrollSetting.deleteMany();
  await prisma.activityLog.deleteMany();
  await prisma.groupBuyAuditLog.deleteMany();

  await prisma.sales.deleteMany();
  await prisma.product.deleteMany();
  await prisma.user.deleteMany();
  await prisma.groupBuyCommunity.deleteMany();
  await prisma.groupBuySystemSetting.deleteMany();
  await prisma.vendor.deleteMany();
  console.log('[Seed] 清空完成，開始匯入新資料...');

  // 1. Users
  console.log('[Seed] 導入 Users...');
  const usersRows = getSheetData('Users');
  const users = usersRows.map(row => ({
    userId: String(row.UserID || row.userId || '').trim(),
    username: String(row.Username || row.username || '').trim(),
    passwordHash: String(row.PasswordHash || row.passwordHash || '').trim(),
    role: String(row.Role || row.role || 'EMPLOYEE').trim().toUpperCase(),
    status: String(row.Status || row.status || 'ACTIVE').trim().toUpperCase(),
    createdAt: parseExcelDate(row.CreatedAt || row.createdAt || row['日期']) || new Date(),
    permissions: parseJson(row.Permissions || row.permissions, [])
  })).filter(u => u.username && u.passwordHash);

  for (const u of users) {
    await prisma.user.upsert({
      where: { username: u.username },
      update: u,
      create: u
    });
  }
  console.log(`[Seed] 已導入 ${users.length} 位使用者`);

  // 2. Products
  console.log('[Seed] 備份既有商品排序權重...');
  const existingDbProducts = await prisma.product.findMany({
    select: { productId: true, sortWeight: true }
  });
  const existingSortWeights = new Map(existingDbProducts.map(p => [p.productId, p.sortWeight]));

  console.log('[Seed] 導入 Products...');
  const productsRows = getSheetData('Products');
  const products = productsRows.map(row => {
    const productId = String(row.id ?? row.ProductID ?? row.productId ?? '').trim();
    const productName = String(row.name ?? row.ProductName ?? row.productName ?? '').trim();
    const price = parseDecimal(row['Price/單價'] ?? row.defaultPrice ?? row.DefaultPrice);
    const singlePrice = parseDecimal(row.single_price ?? row.singlePrice ?? price);
    const savedWeight = existingSortWeights.get(productId);
    
    return {
      productId,
      productName,
      category: String(row['分類'] ?? row['Category/分類'] ?? row.category ?? '').trim() || null,
      defaultPrice: price,
      reserve: parseDecimal(row['最新成本/備用'] ?? row.reserve ?? row.Reserve),
      safetyStock: parseInteger(row['安全庫存'] ?? row.safetyStock ?? row.SafetyStock),
      sortWeight: savedWeight !== undefined ? savedWeight : parseInteger(row['排序權重'] ?? row.sortWeight ?? row.SortWeight ?? 0),
      isActive: parseBoolean(row['是否上架'] ?? row.isActive ?? true),
      imageUrl: String(row['圖片網址'] || row.imageUrl || '').trim() || null,
      expiryDate: row['有效日期'] ? String(row['有效日期']).trim() : null,
      hasFlavorAttributes: parseBoolean(row.has_flavor_attributes ?? row.hasFlavorAttributes),
      flavorChoices: parseJson(row.flavor_choices ?? row.flavorChoices, []),
      singlePrice,
      hasVolumePricing: parseBoolean(row.has_volume_pricing ?? row.hasVolumePricing),
      volumePricingSettings: row.volume_pricing_settings ? parseJson(row.volume_pricing_settings, null) : null
    };
  }).filter(p => p.productId && p.productName);

  await prisma.product.createMany({ data: products });
  console.log(`[Seed] 已導入 ${products.length} 個商品`);

  const validProductIds = new Set(products.map(p => p.productId));

  // 3. Inventory
  console.log('[Seed] 導入 Inventory...');
  const inventoryRows = getSheetData('Inventory');
  const inventories = inventoryRows.map(row => ({
    batchId: String(row.id || row.BatchID || row.batchId || '').trim(),
    productId: String(row.ProductID || row.productId || '').trim(),
    quantity: parseInteger(row.Quantity || row.quantity),
    expiryDate: parseExcelDate(row.Expiry || row.expiryDate || row.ExpiryDate),
    entryDate: parseExcelDate(row['Timestamp |'] || row.entryDate || row.EntryDate) || new Date(),
    type: String(row.Type || row.type || 'STOCK').trim().toUpperCase(),
    cost: parseDecimal(row.Cost || row.cost),
    productName: String(row.ProductName || row.productName || '').trim() || null
  })).filter(inv => inv.productId && validProductIds.has(inv.productId));

  await prisma.inventory.createMany({ data: inventories });
  console.log(`[Seed] 已導入 ${inventories.length} 筆庫存紀錄`);

  // 4. Purchases
  console.log('[Seed] 導入 Purchases...');
  const purchasesRows = getSheetData('Purchases');
  const purchases = purchasesRows.map(row => ({
    purchaseId: String(row.ID || row.PurchaseID || row.purchaseId || '').trim(),
    date: parseExcelDate(row.Date || row.date) || new Date(),
    vendor: String(row.Vendor || row.vendor || '').trim() || null,
    productId: String(row.ProductID || row.productId || '').trim(),
    quantity: parseInteger(row.Quantity || row.quantity),
    unitPrice: parseDecimal(row.UnitPrice || row.unitPrice),
    expiryDate: parseExcelDate(row.Expiry || row.expiryDate || row.ExpiryDate),
    buyer: String(row.Buyer || row.buyer || '').trim() || null,
    paymentMethod: String(row.PaymentMethod || row.paymentMethod || '').trim() || null,
    status: String(row.Status || row.status || 'ORDERED').trim().toUpperCase(),
    operator: String(row.Operator || row.operator || '').trim() || 'System'
  })).filter(p => p.purchaseId && p.productId);

  await prisma.purchase.createMany({ data: purchases });
  console.log(`[Seed] 已導入 ${purchases.length} 筆進貨紀錄`);

  // 5. Sales
  console.log('[Seed] 導入 Sales...');
  const salesRows = getSheetData('Sales');
  const sales = salesRows.map(row => ({
    saleId: String(row.SaleID || row.saleId || '').trim(),
    date: parseExcelDate(row.Date || row.date) || new Date(),
    salesRep: String(row.SalesRep || row.salesRep || '').trim(),
    totalCash: parseDecimal(row.TotalCash || row.totalCash),
    reserve: parseDecimal(row.Reserve || row.reserve),
    finalTotal: parseDecimal(row.FinalTotal || row.finalTotal),
    customer: String(row.Location || row.Customer || row.customer || '').trim() || null,
    operator: String(row.Operator || row.operator || row.OperatorID || '').trim() || 'System',
    paymentMethod: String(row['Payment Method'] || row.paymentMethod || row.PaymentMethod || '').trim() || null,
    status: String(row.Status || row.status || 'COMPLETED').trim().toUpperCase(),
    workHours: parseDecimal(row.WorkHours || row.workHours || row['工時'] || 0),
    paymentDate: parseExcelDate(row.PaymentDate || row.paymentDate),
    actualPaymentMethod: String(row.ActualPaymentMethod || row.actualPaymentMethod || '').trim() || null
  })).filter(s => s.saleId);

  await prisma.sales.createMany({ data: sales });
  console.log(`[Seed] 已導入 ${sales.length} 筆銷售訂單`);

  const validSaleIds = new Set(sales.map(s => s.saleId));

  // 6. SalesDetails
  console.log('[Seed] 導入 SalesDetails...');
  const salesDetailsRows = getSheetData('SalesDetails');
  const salesDetails = salesDetailsRows.map(row => ({
    saleId: String(row.SaleID || row.saleId || '').trim(),
    productId: String(row.ProductID || row.productId || '').trim(),
    picked: parseInteger(row.Picked || row.picked),
    original: parseInteger(row.Original || row.original),
    returnQty: parseInteger(row.Return || row.return || row.returnQty || 0),
    sold: parseInteger(row.Sold || row.sold),
    unitPrice: parseDecimal(row.UnitPrice || row.unitPrice),
    subtotal: parseDecimal(row.Subtotal || row.subtotal)
  })).filter(sd => sd.saleId && sd.productId && validSaleIds.has(sd.saleId) && validProductIds.has(sd.productId));

  await prisma.salesDetail.createMany({ data: salesDetails });
  console.log(`[Seed] 已導入 ${salesDetails.length} 筆銷售明細`);

  // 7. Expenditures
  console.log('[Seed] 導入 Expenditures...');
  const expendituresRows = getSheetData('Expenditures');
  const expenditures = expendituresRows.map(row => ({
    saleId: String(row['銷售編號 (跟 Sales 表對齊用)'] || row.saleId || row.SaleID || '').trim(),
    stall: parseDecimal(row['攤位'] || row.stall),
    cleaning: parseDecimal(row['清潔'] || row.cleaning),
    electricity: parseDecimal(row['電費'] || row.electricity),
    gas: parseDecimal(row['加油'] || row.gas),
    parking: parseDecimal(row['停車'] || row.parking),
    goods: parseDecimal(row['貨款'] || row.goods),
    bags: parseDecimal(row['塑膠袋'] || row.bags),
    others: parseDecimal(row['其他'] || row.others),
    linePay: parseDecimal(row['Line Pay (收款)'] || row.linePay),
    serviceFee: parseDecimal(row['服務費 (扣除)'] || row.serviceFee),
    totalDeductions: parseDecimal(row['本筆總支出金額'] || row.totalDeductions),
    customer: String(row['銷售對象'] || row.customer || '').trim() || null,
    salesRep: String(row['業務人員'] || row.salesRep || '').trim() || null,
    timestamp: parseExcelDate(row['日期'] || row.timestamp) || new Date(),
    vehicleMaintenance: parseDecimal(row.vehicleMaintenance || row.VehicleMaintenance),
    salary: parseDecimal(row.salary || row.Salary),
    reserve: parseDecimal(row.reserve || row.Reserve),
    note: String(row.note || row.Note || '').trim() || null,
    paymentMethod: String(row.paymentMethod || row.PaymentMethod || '').trim() || null,
    paymentDate: parseExcelDate(row.paymentDate || row.PaymentDate || row['付款日期'])
  })).filter(exp => exp.saleId);

  await prisma.expenditure.createMany({ data: expenditures });
  console.log(`[Seed] 已導入 ${expenditures.length} 筆支出/薪資記錄`);

  // 8. Payroll_Settings
  console.log('[Seed] 導入 Payroll_Settings...');
  const payrollSettingsRows = getSheetData('Payroll_Settings');
  const payrollSettings = payrollSettingsRows.map(row => ({
    username: String(row.Username || row.username || '').trim(),
    baseSalary: parseDecimal(row.BaseSalary || row.baseSalary),
    attendanceBonus: parseDecimal(row.AttendanceBonus || row.attendanceBonus),
    insurance: parseDecimal(row.Insurance || row.insurance),
    offDaysStandard: parseInteger(row.MonthlyOffDays || row.offDaysStandard || 8),
    bonusTiersJson: parseJson(row.BonusTiersJSON || row.bonusTiersJson, []),
    empType: String(row.EmpType || row.empType || row.__EMPTY || 'FULL_TIME').trim().toUpperCase(),
    hourlyWage: parseDecimal(row.HourlyWage || row.hourlyWage || row.__EMPTY_1),
    commissionRate: parseDecimal(row.CommissionRate || row.commissionRate || row.__EMPTY_2)
  })).filter(p => p.username);

  await prisma.payrollSetting.createMany({ data: payrollSettings });
  console.log(`[Seed] 已導入 ${payrollSettings.length} 筆員工薪資設定`);

  // 9. Daily_Records
  console.log('[Seed] 導入 Daily_Records...');
  const dailyRecordsRows = getSheetData('Daily_Records');
  const dailyRecords = dailyRecordsRows.map(row => ({
    date: parseExcelDate(row.Date || row.date) || new Date(),
    username: String(row.Username || row.username || '').trim(),
    type: String(row.Type || row.type || 'WORK').trim().toUpperCase(),
    value: parseDecimal(row.Value || row.value),
    note: String(row.Note || row.note || '').trim() || null,
    timestamp: parseExcelDate(row.Timestamp || row.timestamp) || new Date()
  })).filter(dr => dr.username);

  await prisma.dailyRecord.createMany({ data: dailyRecords });
  console.log(`[Seed] 已導入 ${dailyRecords.length} 筆每日出勤與扣款紀錄`);

  // 10. Employee_Profiles
  console.log('[Seed] 導入 Employee_Profiles...');
  const employeeProfilesRows = getSheetData('Employee_Profiles');
  const employeeProfiles = employeeProfilesRows.map(row => ({
    username: String(row.Username || row.username || '').trim(),
    joinedDate: row.JoinedDate ? String(row.JoinedDate).trim() : null,
    birthday: row.Birthday ? String(row.Birthday).trim() : null,
    identityId: row.IdentityID || row.identityId ? String(row.IdentityID || row.identityId).trim() : null,
    contact: row.Contact || row.contact ? String(row.Contact || row.contact).trim() : null,
    note: row.Note || row.note ? String(row.Note || row.note).trim() : null
  })).filter(ep => ep.username);

  await prisma.employeeProfile.createMany({ data: employeeProfiles });
  console.log(`[Seed] 已導入 ${employeeProfiles.length} 筆員工基本資料`);

  // 11. GroupBuy_Communities
  console.log('[Seed] 導入 GroupBuy_Communities...');
  const gbCommunitiesRows = getSheetData('GroupBuy_Communities');
  const gbCommunities = gbCommunitiesRows.map(row => ({
    communityId: String(row.CommunityId || row.communityId || '').trim(),
    communityCode: String(row.CommunityCode || row.communityCode || '').trim(),
    communityName: String(row.CommunityName || row.communityName || '').trim(),
    communityType: String(row.CommunityType || row.communityType || '').trim() || null,
    orderingMode: String(row.OrderingMode || row.orderingMode || '').trim() || null,
    serviceArea: String(row.ServiceArea || row.serviceArea || '').trim() || null,
    isDefault: parseBoolean(row.IsDefault || row.isDefault),
    icon: String(row.Icon || row.icon || '').trim() || null,
    contactPerson: String(row.ContactPerson || row.contactPerson || '').trim() || null,
    contactPhone: String(row.ContactPhone || row.contactPhone || '').trim() || null,
    openMessage: String(row.OpenMessage || row.openMessage || '').trim() || null,
    closeMessage: String(row.CloseMessage || row.closeMessage || '').trim() || null,
    defaultDeliveryTime: String(row.DefaultDeliveryTime || row.defaultDeliveryTime || '').trim() || null,
    defaultFreeShipping: parseBoolean(row.DefaultFreeShipping || row.defaultFreeShipping),
    defaultPaymentMethods: parseJson(row.DefaultPaymentMethods || row.defaultPaymentMethods, []),
    defaultRoute: String(row.DefaultRoute || row.defaultRoute || '').trim() || null,
    deliveryInstruction: String(row.DeliveryInstruction || row.deliveryInstruction || '').trim() || null,
    status: String(row.Status || row.status || 'ACTIVE').trim().toUpperCase(),
    notes: String(row.Notes || row.notes || '').trim() || null,
    createdBy: String(row.CreatedBy || row.createdBy || '').trim() || null,
    updatedBy: String(row.UpdatedBy || row.updatedBy || '').trim() || null,
    createdAt: parseExcelDate(row.CreatedAt || row.createdAt) || new Date(),
    updatedAt: parseExcelDate(row.UpdatedAt || row.updatedAt) || new Date(),
    deletedAt: parseExcelDate(row.DeletedAt || row.deletedAt)
  })).filter(c => c.communityId && c.communityCode);

  await prisma.groupBuyCommunity.createMany({ data: gbCommunities });
  console.log(`[Seed] 已導入 ${gbCommunities.length} 個團購社區`);

  // 12. GroupBuy_Campaigns
  console.log('[Seed] 導入 GroupBuy_Campaigns...');
  const gbCampaignsRows = getSheetData('GroupBuy_Campaigns');
  const gbCampaigns = gbCampaignsRows.map(row => ({
    campaignId: String(row.CampaignId || row.campaignId || '').trim(),
    communityId: String(row.CommunityId || row.communityId || '').trim(),
    campaignName: String(row.CampaignName || row.campaignName || '').trim(),
    campaignType: String(row.CampaignType || row.campaignType || '').trim() || null,
    campaignStatus: String(row.CampaignStatus || row.campaignStatus || 'DRAFT').trim().toUpperCase(),
    version: parseInteger(row.Version || row.version || 1),
    allowReorder: parseBoolean(row.AllowReorder ?? row.allowReorder ?? true),
    themeColor: String(row.ThemeColor || row.themeColor || '').trim() || null,
    displayOrder: parseInteger(row.DisplayOrder || row.displayOrder),
    priority: parseInteger(row.Priority || row.priority),
    publishedAt: parseExcelDate(row.PublishedAt || row.publishedAt),
    startTime: parseExcelDate(row.StartTime || row.startTime),
    endTime: parseExcelDate(row.EndTime || row.endTime),
    deliveryDate: parseExcelDate(row.DeliveryDate || row.deliveryDate),
    deliveryStartTime: String(row.DeliveryStartTime || row.deliveryStartTime || '').trim() || null,
    deliveryEndTime: String(row.DeliveryEndTime || row.deliveryEndTime || '').trim() || null,
    systemAnnouncement: String(row.SystemAnnouncement || row.systemAnnouncement || '').trim() || null,
    groupAnnouncement: String(row.GroupAnnouncement || row.groupAnnouncement || '').trim() || null,
    createdBy: String(row.CreatedBy || row.createdBy || '').trim() || null,
    updatedBy: String(row.UpdatedBy || row.updatedBy || '').trim() || null,
    createdAt: parseExcelDate(row.CreatedAt || row.createdAt) || new Date(),
    updatedAt: parseExcelDate(row.UpdatedAt || row.updatedAt) || new Date()
  })).filter(cam => cam.campaignId && cam.communityId);

  await prisma.groupBuyCampaign.createMany({ data: gbCampaigns });
  console.log(`[Seed] 已導入 ${gbCampaigns.length} 個團購活動`);

  // 13. GroupBuy_AuditLogs
  console.log('[Seed] 導入 GroupBuy_AuditLogs...');
  const gbAuditLogsRows = getSheetData('GroupBuy_AuditLogs');
  const gbAuditLogs = gbAuditLogsRows.map(row => ({
    module: String(row.Module || row.module || '').trim(),
    action: String(row.Action || row.action || '').trim(),
    targetId: String(row.TargetId || row.targetId || '').trim() || null,
    fieldName: String(row.FieldName || row.fieldName || '').trim() || null,
    oldValue: String(row.OldValue || row.oldValue || '').trim() || null,
    newValue: String(row.NewValue || row.newValue || '').trim() || null,
    operator: String(row.Operator || row.operator || '').trim(),
    ipAddress: String(row.IPAddress || row.ipAddress || '').trim() || null,
    device: String(row.Device || row.device || '').trim() || null,
    createdAt: parseExcelDate(row.CreatedAt || row.createdAt) || new Date()
  }));

  await prisma.groupBuyAuditLog.createMany({ data: gbAuditLogs });
  console.log(`[Seed] 已導入 ${gbAuditLogs.length} 筆團購稽核日誌`);

  // 14. GroupBuy_OrderStatusHistory
  console.log('[Seed] 導入 GroupBuy_OrderStatusHistory...');
  const gbStatusHistoryRows = getSheetData('GroupBuy_OrderStatusHistory');
  const gbStatusHistories = gbStatusHistoryRows.map(row => ({
    orderId: String(row.OrderId || row.orderId || '').trim(),
    status: String(row.Status || row.status || '').trim(),
    remark: String(row.Remark || row.remark || '').trim() || null,
    operator: String(row.Operator || row.operator || '').trim(),
    createdAt: parseExcelDate(row.CreatedAt || row.createdAt) || new Date()
  })).filter(h => h.orderId && h.status);

  await prisma.groupBuyOrderStatusHistory.createMany({ data: gbStatusHistories });
  console.log(`[Seed] 已導入 ${gbStatusHistories.length} 筆團購訂單歷程`);

  // 15. GroupBuy_Notifications
  console.log('[Seed] 導入 GroupBuy_Notifications...');
  const gbNotificationsRows = getSheetData('GroupBuy_Notifications');
  const gbNotifications = gbNotificationsRows.map(row => ({
    orderId: String(row.OrderId || row.orderId || '').trim(),
    memberId: String(row.MemberId || row.memberId || '').trim() || null,
    type: String(row.Type || row.type || '').trim(),
    line: parseBoolean(row.LINE ?? row.line),
    email: parseBoolean(row.Email ?? row.email),
    push: parseBoolean(row.Push ?? row.push),
    content: String(row.Content || row.content || '').trim(),
    status: String(row.Status || row.status || 'PENDING').trim().toUpperCase(),
    createdAt: parseExcelDate(row.CreatedAt || row.createdAt) || new Date()
  })).filter(n => n.orderId && n.type);

  await prisma.groupBuyNotification.createMany({ data: gbNotifications });
  console.log(`[Seed] 已導入 ${gbNotifications.length} 筆團購通知紀錄`);

  // 16. GroupBuy_SystemSettings
  console.log('[Seed] 導入 GroupBuy_SystemSettings...');
  const gbSystemSettingsRows = getSheetData('GroupBuy_SystemSettings');
  const gbSystemSettings = gbSystemSettingsRows.map(row => ({
    settingKey: String(row.SettingKey || row.settingKey || '').trim(),
    settingValue: String(row.SettingValue || row.settingValue || '').trim()
  })).filter(s => s.settingKey);

  await prisma.groupBuySystemSetting.createMany({ data: gbSystemSettings });
  console.log(`[Seed] 已導入 ${gbSystemSettings.length} 筆團購系統設定`);

  // 17. Vendors
  console.log('[Seed] 導入 Vendors...');
  const vendorsRows = getSheetData('Vendors');
  const vendors = vendorsRows.map(row => {
    const vendorName = String(row['廠商名稱'] || row.vendorName || row.vendor || '').trim();
    const paymentMethod = String(row['預設支付方式'] || row.paymentMethod || 'CASH').trim().toUpperCase();
    const lineGroupId = String(row['LINE群組ID'] || row.lineGroupId || row.groupId || '').trim();
    const orderDays = String(row['叫貨星期'] || row['叫貨日'] || row['星期'] || row['排程'] || row.orderDays || '').trim();
    const deliveryDays = String(row['到貨星期'] || row['到貨日'] || row.deliveryDays || '').trim();

    return {
      vendorName,
      paymentMethod,
      lineGroupId: lineGroupId || null,
      orderDays: orderDays || null,
      deliveryDays: deliveryDays || null
    };
  }).filter(v => v.vendorName);

  await prisma.vendor.createMany({ data: vendors });
  console.log(`[Seed] 已導入 ${vendors.length} 家廠商設定`);

  // 18. ActivityLogs
  console.log('[Seed] 導入 ActivityLogs...');
  const activityLogsSheet = workbook.Sheets['ActivityLogs'];
  let activityLogs = [];
  if (activityLogsSheet) {
    // 由於 ActivityLogs 沒有標題列，使用自訂 Header 來解析
    const rows = xlsx.utils.sheet_to_json(activityLogsSheet, {
      header: ['Timestamp', 'Username', 'ActionType', 'Page', 'Details', 'UserAgent', 'ScreenResolution', 'IPAddress'],
      defval: ""
    });
    activityLogs = rows.map(row => ({
      timestamp: parseExcelDate(row.Timestamp) || new Date(),
      username: String(row.Username || '').trim(),
      actionType: String(row.ActionType || '').trim(),
      page: String(row.Page || '').trim() || null,
      details: String(row.Details || '').trim() || null,
      userAgent: String(row.UserAgent || '').trim() || null,
      screenResolution: String(row.ScreenResolution || '').trim() || null,
      ipAddress: String(row.IPAddress || '').trim() || null
    })).filter(l => l.username && l.actionType);
  }

  if (activityLogs.length > 0) {
    await prisma.activityLog.createMany({ data: activityLogs });
  }
  console.log(`[Seed] 已導入 ${activityLogs.length} 筆操作日誌`);

  console.log('[Seed] 🎉 所有資料移轉與資料庫 initialization 完成！');
}

main()
  .catch(async (e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
