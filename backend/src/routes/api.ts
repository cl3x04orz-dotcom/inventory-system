import { FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';
import { apiRouter } from '../controllers/api.controller.js';

const JWT_SECRET = process.env.JWT_SECRET || 'your-jwt-secret';

// Actions that do not require authentication
const publicActions = ['login', 'register', 'checkInit', 'loginAdminByPassword', 'v2_getLiffInitData', 'v2_createOrder', 'v1_getMember', 'v1_saveMember', 'v1_getOrders', 'v1_reorder'];

// Action to Permission mapping (from Code.gs)
const actionPermissions: Record<string, string> = {
  saveSales: 'sales_entry',
  getSalesHistory: 'sales_report',
  getReportDataBatch: 'sales_report',
  getRecentSalesToday: 'sales_entry',
  getSalesByDateRange: 'sales_report',
  getTemplatesList: 'sales_entry',
  generatePdf: 'sales_entry',
  getSmartPickSuggestion: 'sales_entry',
  getAllUniqueCustomers: 'sales_entry',
  initSalesPageData: 'sales_entry',
  updateCustomerSettings: 'sales_entry',

  addPurchase: 'purchase_entry',
  getPurchaseSuggestions: 'purchase_entry',
  getPurchaseHistory: 'purchase_history',
  voidAndFetchPurchase: 'purchase_history',
  confirmPurchaseReceipt: 'purchase_entry',
  getVendors: 'purchase_entry',
  updateVendorStatus: 'purchase_entry',
  updateVendorSortOrder: 'purchase_entry',

  adjustInventory: 'inventory_adjust',
  getAdjustmentHistory: 'inventory_history',
  getInventory: 'inventory_adjust',
  getInventoryWithSafety: 'inventory_adjust',
  updateSafetyStock: 'inventory_adjust',
  getInventoryValuation: 'inventory_valuation',
  getInventoryForStocktake: 'inventory_stocktake',
  saveStocktake: 'inventory_stocktake',
  getStocktakeHistory: 'inventory_history',
  updateProductSortOrder: 'system_config',
  updateProductDetails: 'system_config',
  updateProductPurchasable: 'system_config',

  getPendingOrders: 'sales_pending',
  updatePendingOrder: 'sales_pending',
  confirmPendingOrder: 'sales_pending',
  deletePendingOrder: 'sales_pending',
  batchConfirmPendingOrders: 'sales_pending',
  batchConfirmPayments: 'sales_pending',
  batchDeletePendingOrders: 'sales_pending',
  saveGroupBinding: 'sales_pending',
  updateOrderStatus: 'sales_pending',
  saveBuildingSettings: 'sales_pending',
  admin_getMembers: 'sales_pending',
  admin_adjustWallet: 'sales_pending',
  getCommunities: 'sales_pending',
  saveCommunityArea: 'system_config',
  deleteCommunityArea: 'system_config',

  getUsers: 'system_config',
  addUser: 'system_config',
  deleteUser: 'system_config',
  updateUserPermissions: 'system_config',
  updateUserStatus: 'system_config',
  updateUserPassword: 'system_config',

  getActivityLogs: 'system_activity_logs'
};

export async function apiRoutes(app: FastifyInstance) {
  app.post('/api', async (request, reply) => {
    const { action, payload, token } = request.body as {
      action: string;
      payload: any;
      token?: string;
    };

    if (!action) {
      return reply.status(400).send({ error: 'Missing action parameter' });
    }

    const trimmedAction = action.trim();
    let user: any = null;

    // 1. Authenticate token if action is not public
    if (!publicActions.includes(trimmedAction)) {
      if (!token) {
        return reply.status(401).send({ error: 'Unauthorized: No valid token provided' });
      }

      try {
        user = jwt.verify(token, JWT_SECRET);
      } catch (err) {
        return reply.send({ error: 'TokenExpired' }); // Match Apps Script return for client-side auto-renew
      }

      // 2. Perform RBAC validation (BOSS bypasses all checks)
      if (user.role !== 'BOSS') {
        const requiredPerm = actionPermissions[trimmedAction];
        if (requiredPerm) {
          const userPerms = user.permissions || [];
          const category = requiredPerm.split('_')[0];
          const hasPerm = userPerms.includes(requiredPerm) || userPerms.includes(category);

          if (!hasPerm) {
            return reply.status(403).send({
              error: `Forbidden: 您目前不具備執行 [${requiredPerm}] 模組操作的權限`
            });
          }
        }
      }
    }

    try {
      // 3. Inject operator and metadata into payload (from Code.gs)
      const enrichedPayload = payload ? { ...payload } : {};
      enrichedPayload.serverTimestamp = new Date();
      if (!enrichedPayload.operator) {
        enrichedPayload.operator = user ? (user.displayName || user.name || user.username || 'Unknown') : 'System';
      }
      enrichedPayload.userRole = user ? user.role : 'Guest';
      enrichedPayload.rawToken = token;

      // 4. Route to Controller
      const result = await apiRouter(trimmedAction, enrichedPayload, user);
      return result;
    } catch (error: any) {
      app.log.error(error);
      return reply.send({ error: error.message || 'Internal Server Error' });
    }
  });

  // GET /api/backup - 一鍵備份資料庫並下載 Excel 檔
  app.get('/api/backup', async (request, reply) => {
    const { token, secret } = request.query as { token?: string; secret?: string };

    const BACKUP_SECRET_KEY = process.env.BACKUP_SECRET_KEY || 'milipack_db_backup_secure_secret_2026_xyz';
    let isAuthorized = false;

    if (secret && secret === BACKUP_SECRET_KEY) {
      isAuthorized = true;
    } else if (token) {
      try {
        const user = jwt.verify(token, JWT_SECRET) as any;
        if (user.role === 'BOSS') {
          isAuthorized = true;
        }
      } catch (err) {
        return reply.status(401).send({ error: 'TokenExpired' });
      }
    }

    if (!isAuthorized) {
      return reply.status(403).send({ error: 'Forbidden: 權限不足或無效的金鑰/Token' });
    }

    try {

      // 動態載入 BackupService 避免循環依賴
      const { BackupService } = await import('../services/backup.service.js');
      const excelBuffer = await BackupService.exportDatabaseToExcel();

      const timeStr = new Date().toISOString().replace(/[-:T]/g, '').substring(0, 14);
      const filename = `database_backup_${timeStr}.xlsx`;

      reply
        .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        .header('Content-Disposition', `attachment; filename="${filename}"`)
        .send(excelBuffer);
    } catch (err: any) {
      app.log.error(err);
      return reply.status(500).send({ error: err.message || '備份下載失敗' });
    }
  });
}
