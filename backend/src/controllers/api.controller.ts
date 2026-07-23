import { UserService } from '../services/user.service.js';
import { ProductService } from '../services/product.service.js';
import { SalesService } from '../services/sales.service.js';
import { PurchaseService } from '../services/purchase.service.js';
import { InventoryService } from '../services/inventory.service.js';
import { FinanceService } from '../services/finance.service.js';
import { BillService } from '../services/bill.service.js';
import { AnalyticsService } from '../services/analytics.service.js';
import { PayrollService } from '../services/payroll.service.js';
import { GroupBuyService } from '../services/groupbuy.service.js';
import { PromotionService } from '../services/promotion.service.js';
import { callGASFromNode } from '../utils/gasClient.js';

export async function apiRouter(action: string, payload: any, user: any): Promise<any> {
  switch (action) {
    // 1. 會員與權限 (User & Authentication)
    case 'login':
      return UserService.login(payload);
    case 'getUsers':
      return UserService.getUsers();
    case 'addUser':
      return UserService.addUser(payload);
    case 'deleteUser':
      return UserService.deleteUser(payload);
    case 'updateUserPermissions':
      return UserService.updateUserPermissions(payload);
    case 'updateUserStatus':
      return UserService.updateUserStatus(payload);
    case 'updateUserPassword':
      return UserService.updateUserPassword(payload);
    case 'renewToken':
      return UserService.renewToken(payload, user);

    // 2. 商品主檔 (Products)
    case 'getProducts':
      return ProductService.getProducts(payload);
    case 'updateProductSortOrder':
      return ProductService.updateProductSortOrder(payload);
    case 'updateProductDetails':
      return ProductService.updateProductDetails(payload, user);
    case 'updateProductPurchasable':
      return ProductService.updateProductPurchasable(payload, user);

    // 3. 銷售與收支 (Sales & Report)
    case 'saveSales':
      return SalesService.saveSales(payload, user);
    case 'getSaleToClone':
      return SalesService.getSaleToClone(payload);
    case 'voidAndFetchSale':
      return SalesService.voidAndFetchSale(payload, user);
    case 'getSalesHistory':
      return SalesService.getSalesHistory(payload, user);
    case 'getReportDataBatch':
      return SalesService.getReportDataBatch(payload, user);
    case 'initSalesPageData':
      return SalesService.initSalesPageData(payload, user);
    case 'getSalesByDateRange':
      return SalesService.getSalesByDateRange(payload);
    case 'getSmartPickSuggestion':
      return SalesService.getSmartPickSuggestion(payload);
    case 'updateCustomerSettings':
      return SalesService.updateCustomerSettings(payload);
    case 'generatePdf': {
      const gasUrl = process.env.GAS_API_URL;
      if (!gasUrl) {
        throw new Error('未在後端 .env 中設定 GAS_API_URL');
      }
      return await callGASFromNode(gasUrl, 'generatePdf', payload, user?.gasToken || payload.rawToken);
    }

    // 4. 進貨作業與管理 (Purchases)
    case 'getPurchaseSuggestions':
      return PurchaseService.getPurchaseSuggestions();
    case 'addPurchase':
      return PurchaseService.addPurchase(payload, user);
    case 'getVendors':
      return PurchaseService.getVendors();
    case 'updateVendorStatus':
      return PurchaseService.updateVendorStatus(payload);
    case 'updateVendorSortOrder':
      return PurchaseService.updateVendorSortOrder(payload);
    case 'saveVendorDefault':
      return PurchaseService.saveVendorDefault(payload);
    case 'getPurchaseHistory':
      return PurchaseService.getPurchaseHistory(payload);
    case 'voidAndFetchPurchase':
      return PurchaseService.voidAndFetchPurchase(payload, user);
    case 'confirmPurchaseReceipt':
      return PurchaseService.confirmPurchaseReceipt(payload, user);

    // 5. 庫存作業與盤點 (Inventory & Stocktake)
    case 'getInventory':
      return InventoryService.getInventory();
    case 'getInventoryWithSafety':
      return InventoryService.getInventoryWithSafety();
    case 'updateSafetyStock':
      return InventoryService.updateSafetyStock(payload);
    case 'adjustInventory':
      return InventoryService.adjustInventory(payload, user);
    case 'getAdjustmentHistory':
      return InventoryService.getAdjustmentHistory(payload);
    case 'getInventoryForStocktake':
      return InventoryService.getInventoryForStocktake();
    case 'saveStocktake':
      return InventoryService.saveStocktake(payload);
    case 'getStocktakeHistory':
      return InventoryService.getStocktakeHistory(payload);
    case 'getInventoryValuation':
      return InventoryService.getInventoryValuation();

    // 6. 財務與支出管理 (Finance & Expenditures)
    case 'getExpenditures':
      return FinanceService.getExpenditures(payload, user);
    case 'saveExpenditure':
      return FinanceService.saveExpenditure(payload);
    case 'savePayrollToExpenditure':
      return FinanceService.savePayrollToExpenditure(payload, user);

    // 7. 帳款管理 (Receivables & Payables)
    case 'getReceivables':
      return BillService.getReceivables(payload);
    case 'markAsPaid':
      return BillService.markAsPaid(payload);
    case 'markAsUnpaid':
      return BillService.markAsUnpaid(payload);
    case 'getPayables':
      return BillService.getPayables(payload);
    case 'markPayableAsPaid':
      return BillService.markPayableAsPaid(payload);

    // 8. 數據分析 (Analytics)
    case 'getProfitAnalysis':
      return AnalyticsService.getProfitAnalysis(payload);
    case 'getSalesRanking':
      return AnalyticsService.getSalesRanking(payload);
    case 'getCustomerRanking':
      return AnalyticsService.getCustomerRanking(payload);
    case 'getCustomerAnalytics':
      return AnalyticsService.getCustomerAnalytics(payload);

    // 9. 薪資與人事管理 (Payroll & Personnel)
    case 'getPayrollData':
      return PayrollService.getPayrollData(payload, user);
    case 'saveDailyRecord':
      return PayrollService.saveDailyRecord(payload, user);
    case 'savePayrollSettings':
      return PayrollService.savePayrollSettings(payload, user);
    case 'getEmployeeProfile':
      return PayrollService.getEmployeeProfile(payload, user);
    case 'saveEmployeeProfile':
      return PayrollService.saveEmployeeProfile(payload, user);
    case 'getEmpType':
      return PayrollService.getEmpType(payload, user);

    // 5. 版本與初始化檢查 (Misc)
    case 'checkInit':
      return { status: 'ok', initialized: true };
    case 'getVersion':
      return { version: '1.0.0-node' };

    // 10. 團購訂單管理 (GroupBuy Orders)
    case 'getPendingOrders':
      return GroupBuyService.getPendingOrders(payload, user);
    case 'savePendingOrder':
      return GroupBuyService.savePendingOrder(payload, user);
    case 'updatePendingOrder':
      return GroupBuyService.updatePendingOrder(payload, user);
    case 'confirmPendingOrder':
      return GroupBuyService.confirmPendingOrder(payload, user);
    case 'deletePendingOrder':
      return GroupBuyService.deletePendingOrder(payload, user);
    case 'batchConfirmPendingOrders':
      return GroupBuyService.batchConfirmPendingOrders(payload, user);
    case 'batchConfirmPayments':
      return GroupBuyService.batchConfirmPayments(payload, user);
    case 'batchDeletePendingOrders':
      return GroupBuyService.batchDeletePendingOrders(payload, user);
    case 'updateOrderStatus':
      return GroupBuyService.updateOrderStatus(payload, user);
    case 'getBuildingSettings':
      return GroupBuyService.getBuildingSettings(payload, user);
    case 'saveBuildingSettings':
      return GroupBuyService.saveBuildingSettings(payload, user);
    case 'deleteBuildingSettings':
      return GroupBuyService.deleteBuildingSettings(payload, user);
    case 'renameBuildingSettings':
      return GroupBuyService.renameBuildingSettings(payload, user);
    case 'reorderBuildings':
      return GroupBuyService.reorderBuildings(payload, user);
    case 'saveCommunityShipping':
      return GroupBuyService.saveCommunityShipping(payload, user);
    // 8. 訂閱與預購 (Subscriptions)
    case 'getSubscriptions':
      return GroupBuyService.getSubscriptions(payload, user);
    case 'saveSubscription':
      return GroupBuyService.saveSubscription(payload, user);
    case 'deleteSubscription':
      return GroupBuyService.deleteSubscription(payload, user);
    case 'generateSubscriptionOrders':
      return GroupBuyService.generateSubscriptionOrders(payload, user);
    case 'getGroupBindings':
      return GroupBuyService.getGroupBindings(payload, user);

    // 9. 促銷活動 (Promotions)
    case 'getPromotions':
      return PromotionService.getPromotions(payload);
    case 'createPromotion':
      return PromotionService.createPromotion(payload, user);
    case 'updatePromotion':
      return PromotionService.updatePromotion(payload, user);
    case 'deletePromotion':
      return PromotionService.deletePromotion(payload, user);
    case 'saveGroupBinding':
      return GroupBuyService.saveGroupBinding(payload, user);
    case 'v2_getLiffInitData':
      return GroupBuyService.v2_getLiffInitData(payload, user);
    case 'v2_createOrder':
      return GroupBuyService.v2_createOrder(payload, user);
    case 'getCommunities':
      return GroupBuyService.getCommunities(payload, user);
    case 'saveCommunityArea':
      return GroupBuyService.saveCommunityArea(payload, user);
    case 'deleteCommunityArea':
      return GroupBuyService.deleteCommunityArea(payload, user);
    case 'getCommunityCustomPrices':
      return GroupBuyService.getCommunityCustomPrices(payload, user);
    case 'saveCommunityCustomPrice':
      return GroupBuyService.saveCommunityCustomPrice(payload, user);
    case 'deleteCommunityCustomPrice':
      return GroupBuyService.deleteCommunityCustomPrice(payload, user);

    // 11. LIFF V1 會員相關與後台管理
    case 'v1_getMember':
      return GroupBuyService.v1_getMember(payload, user);
    case 'v1_saveMember':
      return GroupBuyService.v1_saveMember(payload, user);
    case 'v1_getOrders':
      return GroupBuyService.v1_getOrders(payload, user);
    case 'v1_reorder':
      return GroupBuyService.v1_reorder(payload, user);
    case 'admin_getMembers':
      return GroupBuyService.admin_getMembers(payload, user);
    case 'admin_adjustWallet':
      return GroupBuyService.admin_adjustWallet(payload, user);

    default:
      console.warn(`[Controller] 未移植或不支援的 Action: ${action}`);
      throw new Error(`後端尚未移植或不支援該操作: [${action}]`);
  }
}
