/**
 * Main_Router.gs
 * 核心管理：處理系統進入點與 API 路由跳轉。
 */

/**
 * Serves the React App
 */
function doGet(e) {
    if (e.parameter && e.parameter.debug === 'version') {
        return ContentService.createTextOutput("Backend Version: v_modular_FINAL").setMimeType(ContentService.MimeType.TEXT);
    }
    return HtmlService.createTemplateFromFile('Index')
        .evaluate()
        .addMetaTag('viewport', 'width=device-width, initial-scale=1')
        .setTitle('Inventory System')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Handle POST requests
 */
function doPost(e) {
    try {
        const request = JSON.parse(e.postData.contents);
        const result = apiHandler(request);
        return ContentService.createTextOutput(JSON.stringify(result))
            .setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
        return ContentService.createTextOutput(JSON.stringify({ error: err.toString() }))
            .setMimeType(ContentService.MimeType.JSON);
    }
}

/**
 * Main API Router - 實作 RBAC 硬性校驗 (核心路由邏輯)
 */
function apiHandler(request) {
    let { action, payload } = request;
    if (action) action = action.trim();
    
    // 檢查 Token (存在於 root 或 payload)
    const token = request.token || (payload && payload.token);
    const user = (typeof verifyToken !== 'undefined' && token) ? verifyToken(token) : null;

    // 公開路徑 (不需要權限)
    if (action === 'login') return typeof login !== 'undefined' ? login(payload) : {error: 'Login service missing'};
    if (action === 'register') return typeof register !== 'undefined' ? register(payload) : {error: 'Register service missing'};
    if (action === 'checkInit') return typeof checkDbInit !== 'undefined' ? checkDbInit() : { success: true };

    // 身份驗證失敗攔截
    if (!user) {
        return { error: 'Unauthorized: No valid token provided' };
    }

    // --- RBAC 細分化權限映射表 ---
    const actionToPermission = {
        'saveSales': 'sales_entry', 
        'getSalesHistory': 'sales_report',
        'addPurchase': 'purchase_entry', 
        'getPurchaseSuggestions': 'purchase_entry',
        'getPurchaseHistory': 'purchase_history',
        'adjustInventory': 'inventory_adjust',
        'getAdjustmentHistory': 'inventory_history',
        'getInventory': 'inventory_adjust',
        'getInventoryWithSafety': 'inventory_adjust',
        'updateSafetyStock': 'inventory_adjust',
        'getInventoryValuation': 'inventory_valuation',
        'getInventoryForStocktake': 'inventory_stocktake',
        'saveStocktake': 'inventory_stocktake',
        'getStocktakeHistory': 'inventory_history',
        'getProducts': 'inventory_adjust',
        'updateProductSortOrder': 'system_config',
        'getExpenditures': 'finance_expenditure',
        'saveExpenditure': 'finance_expenditure',
        'getReceivables': 'finance_receivable',
        'markAsPaid': 'finance_receivable',
        'getPayables': 'finance_payable',
        'markPayableAsPaid': 'finance_payable',
        'getProfitAnalysis': 'analytics_profit',
        'getPayrollData': 'finance_payroll',
        'saveDailyRecord': 'finance_payroll',
        'savePayrollSettings': 'finance_payroll',
        'getEmployeeProfile': 'finance_payroll',
        'saveEmployeeProfile': 'finance_payroll',
        'getSalesRanking': 'analytics_sales',
        'getCustomerRanking': 'analytics_customer',
        'getTurnoverRate': 'analytics_turnover',
        'getUsers': 'system_config',
        'addUser': 'system_config',
        'deleteUser': 'system_config',
        'updateUserPermissions': 'system_config',
        'updateUserStatus': 'system_config',
        'logActivity': null,
        'getActivityLogs': 'system_activity_logs'
    };

    // 授權校驗
    if (user.role !== 'BOSS') {
        const requiredPerm = actionToPermission[action];
        const userPerms = user.permissions || [];
        const category = requiredPerm ? requiredPerm.split('_')[0] : null;
        const hasPerm = (requiredPerm && userPerms.includes(requiredPerm)) || 
                        (category && userPerms.includes(category));
        
        if (requiredPerm && !hasPerm) {
            console.warn(`User ${user.username} 試圖越權執行 ${action} (Need: ${requiredPerm})`);
            return { error: `Forbidden: 您目前不具備執行 [${requiredPerm}] 模組操作的權限` };
        }
    }

    try {
        if (payload && typeof payload === 'object') {
            payload.serverTimestamp = new Date();
            if (!payload.operator) {
                payload.operator = user.displayName || user.name || user.username || 'Unknown';
            }
            payload.userRole = user.role;
        }

        switch (action) {
            case 'getMe': return user;
            case 'adjustInventory': return typeof adjustInventoryService !== 'undefined' ? adjustInventoryService(payload, user) : {error: 'Service missing'};
            case 'getAdjustmentHistory': return typeof getAdjustmentHistory !== 'undefined' ? getAdjustmentHistory(payload) : {error: 'Service missing'};
            case 'getUsers': return typeof getUsersService !== 'undefined' ? getUsersService() : {error: 'Service missing'};
            case 'addUser': return typeof addUserService !== 'undefined' ? addUserService(payload) : {error: 'Service missing'};
            case 'deleteUser': return typeof deleteUserService !== 'undefined' ? deleteUserService(payload) : {error: 'Service missing'};
            case 'updateUserPermissions': return typeof updateUserPermissionsService !== 'undefined' ? updateUserPermissionsService(payload) : {error: 'Service missing'};
            case 'updateUserStatus': return typeof updateUserStatusService !== 'undefined' ? updateUserStatusService(payload) : {error: 'Service missing'};
            case 'getProducts': return typeof getProductsService !== 'undefined' ? getProductsService() : {error: 'Service missing'}; 
            case 'updateProductSortOrder': return typeof updateProductSortOrderService !== 'undefined' ? updateProductSortOrderService(payload) : {error: 'Service missing'};
            case 'getInventory': return typeof getInventoryService !== 'undefined' ? getInventoryService() : {error: 'Service missing'}; 
            case 'getPurchaseSuggestions': return typeof getPurchaseSuggestionsService !== 'undefined' ? getPurchaseSuggestionsService() : {error: 'Service missing'}; 
            case 'addPurchase': return typeof addPurchaseService !== 'undefined' ? addPurchaseService(payload, user) : {error: 'Service missing'}; 
            case 'getPurchaseHistory': return typeof getPurchaseHistory !== 'undefined' ? getPurchaseHistory(payload) : {error: 'Service missing'};
            case 'getInventoryWithSafety': return typeof getInventoryWithSafety !== 'undefined' ? getInventoryWithSafety() : {error: 'Service missing'};
            case 'updateSafetyStock': return typeof updateSafetyStock !== 'undefined' ? updateSafetyStock(payload) : {error: 'Service missing'};
            case 'getInventoryValuation': return typeof getInventoryValuation !== 'undefined' ? getInventoryValuation() : {error: 'Service missing'};
            case 'getInventoryForStocktake': return typeof getInventoryForStocktake !== 'undefined' ? getInventoryForStocktake() : {error: 'Service missing'};
            case 'saveStocktake': return typeof saveStocktake !== 'undefined' ? saveStocktake(payload) : {error: 'Service missing'};
            case 'getStocktakeHistory': return typeof getStocktakeHistory !== 'undefined' ? getStocktakeHistory(payload) : {error: 'Service missing'};
            case 'saveSales': return typeof saveSalesService !== 'undefined' ? saveSalesService(payload, user) : {error: 'Service missing'}; 
            case 'getSalesHistory': return typeof getSalesHistory !== 'undefined' ? getSalesHistory(payload) : {error: 'Service missing'}; 
            case 'getSalesRanking': return typeof getSalesRanking !== 'undefined' ? getSalesRanking(payload) : {error: 'Service missing'};
            case 'getCustomerRanking': return typeof getCustomerRanking !== 'undefined' ? getCustomerRanking(payload) : {error: 'Service missing'};
            case 'getProfitAnalysis': return typeof getProfitAnalysis !== 'undefined' ? getProfitAnalysis(payload) : {error: 'Service missing'};
            case 'getTurnoverRate': return typeof getTurnoverRate !== 'undefined' ? getTurnoverRate(payload) : {error: 'Service missing'};
            case 'getPayrollData': return typeof getPayrollDataService !== 'undefined' ? getPayrollDataService(payload, user) : {error: 'Service missing'};
            case 'saveDailyRecord': return typeof saveDailyRecordService !== 'undefined' ? saveDailyRecordService(payload, user) : {error: 'Service missing'};
            case 'savePayrollSettings': return typeof savePayrollSettingsService !== 'undefined' ? savePayrollSettingsService(payload, user) : {error: 'Service missing'};
            case 'getEmployeeProfile': return typeof getEmployeeProfileService !== 'undefined' ? getEmployeeProfileService(payload, user) : {error: 'Service missing'};
            case 'saveEmployeeProfile': return typeof saveEmployeeProfileService !== 'undefined' ? saveEmployeeProfileService(payload, user) : {error: 'Service missing'};
            case 'savePayrollToExpenditure': return typeof savePayrollToExpenditureService !== 'undefined' ? savePayrollToExpenditureService(payload, user) : {error: 'Service missing'};
            case 'getExpenditures': return typeof getExpendituresService !== 'undefined' ? getExpendituresService(payload) : {error: 'Service missing'};
            case 'saveExpenditure': return typeof saveExpenditureService !== 'undefined' ? saveExpenditureService(payload) : {error: 'Service missing'};
            case 'getReceivables': return typeof getReceivablesService !== 'undefined' ? getReceivablesService() : {error: 'Service missing'};
            case 'markAsPaid': return typeof markAsPaidService !== 'undefined' ? markAsPaidService(payload) : {error: 'Service missing'};
            case 'getPayables': return typeof getPayablesService !== 'undefined' ? getPayablesService(payload) : {error: 'Service missing'};
            case 'markPayableAsPaid': return typeof markPayableAsPaidService !== 'undefined' ? markPayableAsPaidService(payload) : {error: 'Service missing'};
            case 'logActivity': return typeof logActivityService !== 'undefined' ? logActivityService(payload) : {error: 'Service missing'};
            case 'getActivityLogs': return typeof getActivityLogsService !== 'undefined' ? getActivityLogsService(payload, user.role, user.username) : {error: 'Service missing'};
            default: throw new Error('Unknown action: [' + action + ']');
        }
    } catch (error) {
        return { error: error.message };
    }
}
