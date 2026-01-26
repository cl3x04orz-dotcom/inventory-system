/**
 * Serves the React App
 */
function doGet() {
    return HtmlService.createTemplateFromFile('Index')
        .evaluate()
        .addMetaTag('viewport', 'width=device-width, initial-scale=1')
        .setTitle('Inventory System')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Main API Router - 實作 RBAC 硬性校驗 (邏輯與功能保持不動，已修正細分權限)
 */
function apiHandler(request) {
    let { action, payload } = request;
    if (action) action = action.trim();
    
    // 檢查 Token (存在於 root 或 payload)
    const token = request.token || (payload && payload.token);
    const user = (typeof verifyToken !== 'undefined' && token) ? verifyToken(token) : null;

    // 公開路徑 (不需要權限)
    if (action === 'login') return login(payload);
    if (action === 'register') return register(payload);
    if (action === 'checkInit') return typeof checkDbInit !== 'undefined' ? checkDbInit() : { success: true };

    // 身份驗證失敗攔截
    if (!user) {
        return { error: 'Unauthorized: No valid token provided' };
    }

    // --- RBAC 細分化權限映射表 (後端最終防線) ---
    // 已更新為細分權限 ID (例如 sales -> sales_entry, sales_report)
    const actionToPermission = {
        // Sales (銷售管理)
        'saveSales': 'sales_entry', 
        'getSalesHistory': 'sales_report',
        'getTemplatesList': 'sales_entry', // Allow sales entry to list templates
        'generatePdf': 'sales_entry', // Allow sales entry to generate PDF
        
        // Purchase (進貨管理)
        'addPurchase': 'purchase_entry', 
        'getPurchaseSuggestions': 'purchase_entry',
        'getPurchaseHistory': 'purchase_history',
        
        // Inventory (庫存管理)
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
        
        // Finance (財務管理)
        'getExpenditures': 'finance_expenditure',
        'saveExpenditure': 'finance_expenditure',
        'getReceivables': 'finance_receivable',
        'markAsPaid': 'finance_receivable',
        'getPayables': 'finance_payable',
        'markPayableAsPaid': 'finance_payable',
        'getProfitAnalysis': 'analytics_profit', // 毛利分析歸類於數據分析

        // Payroll (薪資管理) - 新增
        'getPayrollData': 'finance_payroll',
        'saveDailyRecord': 'finance_payroll',
        'savePayrollSettings': 'finance_payroll',
        'getEmployeeProfile': 'finance_payroll',
        'saveEmployeeProfile': 'finance_payroll',
        
        // Analytics (數據分析)
        'getSalesRanking': 'analytics_sales',
        'getCustomerRanking': 'analytics_customer',
        'getTurnoverRate': 'analytics_turnover',
        
        // System (系統管理)
        'getUsers': 'system_config',
        'addUser': 'system_config',
        'deleteUser': 'system_config',
        'updateUserPermissions': 'system_config',
        'updateUserStatus': 'system_config',
        
        // Activity Logging (操作紀錄)
        'logActivity': null, // 所有人都可以記錄自己的活動
        'getActivityLogs': 'system_activity_logs' // 需要特殊權限才能查看
    };

    // 進行授權校驗 (Authorization)
    if (user.role !== 'BOSS') {
        const requiredPerm = actionToPermission[action];
        const userPerms = user.permissions || [];
        
        // 檢查是否具有「細分權限」或是「大類別權限」(相容舊格式)
        // 例如：若使用者擁有舊的 'sales' 權限，則也能通過 check (sales_entry -> sales)
        const category = requiredPerm ? requiredPerm.split('_')[0] : null;
        const hasPerm = (requiredPerm && userPerms.includes(requiredPerm)) || 
                        (category && userPerms.includes(category));
        
        // 如果該 Action 需要權限，且使用者既無細分權限也無大類別權限，則攔截
        if (requiredPerm && !hasPerm) {
            console.warn(`User ${user.username} 試圖越權執行 ${action} (Need: ${requiredPerm})`);
            return { error: `Forbidden: 您目前不具備執行 [${requiredPerm}] 模組操作的權限` };
        }
    }

    try {
        // 自動注入 Metadata (保留原有邏輯)
        if (payload && typeof payload === 'object') {
            payload.serverTimestamp = new Date();
            if (!payload.operator) {
                payload.operator = user.displayName || user.name || user.username || 'Unknown';
            }
            payload.userRole = user.role;
        }

        switch (action) {
            case 'getMe': return user;
            
            // 庫存與異動
            case 'adjustInventory': return typeof adjustInventoryService !== 'undefined' ? adjustInventoryService(payload, user) : {error: 'Service missing'};
            case 'getAdjustmentHistory': return typeof getAdjustmentHistory !== 'undefined' ? getAdjustmentHistory(payload) : {error: 'Service missing'};

            // User Management (權限管理)
            case 'getUsers': return getUsersService();
            case 'addUser': return addUserService(payload);
            case 'deleteUser': return deleteUserService(payload);
            case 'updateUserPermissions': return updateUserPermissionsService(payload);
            case 'updateUserStatus': return updateUserStatusService(payload);

            // Inventory & Purchase
            case 'getProducts': return typeof getProductsService !== 'undefined' ? getProductsService() : {error: '後端服務缺失: getProductsService'}; 
            case 'updateProductSortOrder': return typeof updateProductSortOrderService !== 'undefined' ? updateProductSortOrderService(payload) : {error: '後端服務缺失: updateProductSortOrderService'};
            case 'getInventory': return typeof getInventoryService !== 'undefined' ? getInventoryService() : {error: '後端服務缺失: getInventoryService'}; 
            case 'getPurchaseSuggestions': return typeof getPurchaseSuggestionsService !== 'undefined' ? getPurchaseSuggestionsService() : {error: '後端服務缺失: getPurchaseSuggestionsService'}; 
            case 'addPurchase': return typeof addPurchaseService !== 'undefined' ? addPurchaseService(payload, user) : {error: '後端服務缺失: addPurchaseService (進貨功能)'}; 
            case 'getPurchaseHistory': return typeof getPurchaseHistory !== 'undefined' ? getPurchaseHistory(payload) : {error: '後端服務缺失: getPurchaseHistory'};
            case 'saveVendorDefault': return typeof saveVendorDefaultService !== 'undefined' ? saveVendorDefaultService(payload) : {error: '後端服務缺失: saveVendorDefaultService'};

            // 估值與盤點
            case 'getInventoryWithSafety': return typeof getInventoryWithSafety !== 'undefined' ? getInventoryWithSafety() : {error: 'Service missing'};
            case 'updateSafetyStock': return typeof updateSafetyStock !== 'undefined' ? updateSafetyStock(payload) : {error: 'Service missing'};
            case 'getInventoryValuation': return typeof getInventoryValuation !== 'undefined' ? getInventoryValuation() : {error: 'Service missing'};
            case 'getInventoryForStocktake': return typeof getInventoryForStocktake !== 'undefined' ? getInventoryForStocktake() : {error: 'Service missing'};
            case 'saveStocktake': return typeof saveStocktake !== 'undefined' ? saveStocktake(payload) : {error: 'Service missing'};
            case 'getStocktakeHistory': return typeof getStocktakeHistory !== 'undefined' ? getStocktakeHistory(payload) : {error: 'Service missing'};

            // Sales & Analytics
            case 'saveSales': return typeof saveSalesService !== 'undefined' ? saveSalesService(payload, user) : {error: 'Service missing'}; 
            case 'getSalesHistory': return typeof getSalesHistory !== 'undefined' ? getSalesHistory(payload) : {error: 'Service missing'}; 
            case 'getTemplatesList': return typeof getTemplatesListService !== 'undefined' ? getTemplatesListService() : {error: 'Service missing'};
            case 'generatePdf': return typeof generatePdfService !== 'undefined' ? generatePdfService(payload) : {error: 'Service missing'}; 
            case 'getSalesRanking': return typeof getSalesRanking !== 'undefined' ? getSalesRanking(payload) : {error: 'Service missing'};
            case 'getCustomerRanking': return typeof getCustomerRanking !== 'undefined' ? getCustomerRanking(payload) : {error: 'Service missing'};
            case 'getProfitAnalysis': return typeof getProfitAnalysis !== 'undefined' ? getProfitAnalysis(payload) : {error: 'Service missing'};
            case 'getTurnoverRate': return typeof getTurnoverRate !== 'undefined' ? getTurnoverRate(payload) : {error: 'Service missing'};
            
            // Payroll
            case 'getPayrollData': return getPayrollDataService(payload, user);
            case 'saveDailyRecord': return saveDailyRecordService(payload, user);
            case 'savePayrollSettings': return savePayrollSettingsService(payload, user);
            case 'getEmployeeProfile': return getEmployeeProfileService(payload, user);
            case 'saveEmployeeProfile': return saveEmployeeProfileService(payload, user);
            case 'savePayrollToExpenditure': return savePayrollToExpenditureService(payload, user);

            // 支出管理
            case 'getExpenditures': return getExpendituresService(payload);
            case 'saveExpenditure': return saveExpenditureService(payload);

            // 帳款管理 (Assuming these are in other files or need to be defined if missing)
            case 'getReceivables': return typeof getReceivablesService !== 'undefined' ? getReceivablesService() : {error: 'Service missing'};
            case 'markAsPaid': return typeof markAsPaidService !== 'undefined' ? markAsPaidService(payload) : {error: 'Service missing'};
            case 'getPayables': return typeof getPayablesService !== 'undefined' ? getPayablesService(payload) : {error: 'Service missing'};
            case 'markPayableAsPaid': return typeof markPayableAsPaidService !== 'undefined' ? markPayableAsPaidService(payload) : {error: 'Service missing'};

            // Activity Logging (操作紀錄)
            case 'logActivity': return typeof logActivityService !== 'undefined' ? logActivityService(payload) : {error: 'Service missing'};
            case 'getActivityLogs': return typeof getActivityLogsService !== 'undefined' ? getActivityLogsService(payload, user.role, user.username) : {error: 'Service missing'};

            default: throw new Error('Unknown action: [' + action + '] (length: ' + (action ? action.length : 0) + ')');
        }
    } catch (error) {
        return { error: error.message };
    }
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
 * [API] 使用者登入 (已修正讀取方式)
 */
function login(payload) {
    if (!payload.username || !payload.password) return { error: "請輸入帳號和密碼" };

    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Users");
    if (!sheet) return { error: "使用者資料庫不存在" };

    var data = sheet.getDataRange().getDisplayValues();
    
    for (var i = 1; i < data.length; i++) {
        var rowUser = data[i][1]; 
        var rowPass = data[i][2]; 
        var rowRole = data[i][3]; 
        var rowStatus = data[i][4]; 
        var rowPerms = data[i][6]; 

        if (String(rowUser).trim() === String(payload.username).trim()) {
            if (rowStatus !== 'ACTIVE') return { error: "此帳號已被停用" };

            var isValidPass = false;
            // 優先檢查純文字密碼
            if (payload.password === rowPass) {
                isValidPass = true;
            } else {
                // 檢查 Hash
                var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, payload.password);
                var computedHash = Utilities.base64Encode(digest);
                if (computedHash === rowPass) isValidPass = true;
            }

            if (isValidPass) {
                var permissions = [];
                try {
                    if (rowPerms && String(rowPerms).trim() !== "") {
                        var permStr = String(rowPerms).trim();
                        permStr = permStr.replace(/[“”]/g, '"').replace(/[’‘]/g, "'");
                        if (permStr.startsWith('[') && permStr.endsWith(']')) {
                            permissions = JSON.parse(permStr);
                        } else {
                            permissions = [permStr];
                        }
                    }
                } catch(e) { permissions = []; }
                
                if (!Array.isArray(permissions)) permissions = [];

                var tokenPayload = {
                    username: rowUser,
                    role: rowRole,
                    timestamp: new Date().getTime(),
                    permissions: permissions 
                };
                
                var token = Utilities.base64Encode(Utilities.newBlob(JSON.stringify(tokenPayload)).getBytes());
                
                return { 
                    success: true, 
                    token: token,
                    username: rowUser, 
                    role: rowRole,
                    permissions: permissions 
                };
            } else {
                return { error: "密碼錯誤" };
            }
        }
    }
    return { error: "找不到此帳號" };
}

/**
 * [Service] 獲取使用者列表 (已修正讀取方式)
 */
function getUsersService() {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Users");
    if (!sheet) return [];
  
    var data = sheet.getDataRange().getDisplayValues();
    var users = [];
    
    for (var i = 1; i < data.length; i++) {
        if(!data[i][1]) continue; 
        
        var perms = [];
        try {
            var rowPerms = data[i][6]; 
            if (rowPerms) {
                var permStr = String(rowPerms).trim();
                permStr = permStr.replace(/[“”]/g, '"').replace(/[’‘]/g, "'");
                if (permStr.startsWith('[')) {
                    perms = JSON.parse(permStr);
                } else if (permStr) {
                    perms = [permStr];
                }
            }
        } catch(e) { perms = []; }
        
        if (!Array.isArray(perms)) perms = [];

        users.push({
            userid: data[i][0],
            username: data[i][1],
            role: data[i][3],
            status: data[i][4],
            permissions: perms
        });
    }
    return users;
}

/**
 * [Service] 更新使用者權限
 */
function updateUserPermissionsService(payload) {
    if (!payload.username) return { error: "Missing username" };

    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Users");
    if (!sheet) return { error: "No Users sheet" };
    
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
        if (data[i][1] == payload.username) {
            var permString = JSON.stringify(payload.permissions || []);
            sheet.getRange(i + 1, 7).setValue(permString); 
            return { success: true };
        }
    }
    return { error: "User not found" };
}

/**
 * [Service] 新增使用者
 */
function addUserService(payload) {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Users");
    if (!sheet) {
        sheet = SpreadsheetApp.getActiveSpreadsheet().insertSheet("Users");
        sheet.appendRow(["UserID", "Username", "PasswordHash", "Role", "Status", "CreatedAt", "Permissions"]);
    }
    
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
        if (data[i][1] == payload.username) {
            return { error: "此帳號(姓名)已存在" };
        }
    }
    
    var newID = Utilities.getUuid(); 
    var timestamp = Utilities.formatDate(new Date(), "Asia/Taipei", "yyyy/MM/dd HH:mm:ss");

    var passwordHash = payload.password;
    if (payload.password) {
        var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, payload.password);
        passwordHash = Utilities.base64Encode(digest);
    }

    sheet.appendRow([
        newID,
        payload.username,
        passwordHash, 
        payload.role || "EMPLOYEE",
        "ACTIVE",
        timestamp,
        "[]"
    ]);
    
    return { success: true };
}

/**
 * [Service] 刪除使用者
 */
function deleteUserService(payload) {
    var targetUser = payload.username;
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Users");
    if (!sheet) return { error: "找不到 Users 資料表" };
    
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
        if (data[i][1] == targetUser) {
            sheet.deleteRow(i + 1);
            return { success: true };
        }
    }
    return { error: "找不到該使用者" };
}

/**
 * [Service] 更新使用者狀態 (鎖定/啟用)
 */
function updateUserStatusService(payload) {
    if (!payload.username || !payload.status) return { error: "Missing parameters" };
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Users");
    if (!sheet) return { error: "No Users sheet" };
    
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
        if (data[i][1] == payload.username) {
            sheet.getRange(i + 1, 5).setValue(payload.status); // Column E
            return { success: true };
        }
    }
    return { error: "User not found" };
}

/**
 * [Helper] 驗證 Token (確保回傳 permissions)
 */
function verifyToken(token) {
    try {
        var json = Utilities.newBlob(Utilities.base64Decode(token)).getDataAsString();
        var user = JSON.parse(json);
        if (!user.permissions) user.permissions = [];
        return user;
    } catch (e) {
        return null;
    }
}

// ----------------------------------------
// 支出管理
// ----------------------------------------
function getExpendituresService(payload) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Expenditures');
    if (!sheet) return { error: '找不到名為 Expenditures 的分頁' };

    const data = sheet.getDataRange().getValues();
    if (data.length < 2) return [];

    const headers = data[0];
    const rows = data.slice(1);

    const mapping = {
        "攤位": "stall",
        "清潔": "cleaning",
        "電費": "electricity",
        "加油": "gas",
        "停車": "parking",
        "貨款": "goods",
        "塑膠袋": "bags",
        "其他": "others",
        "Line Pay (收款)": "linePay",
        "服務費 (扣除)": "serviceFee",
        "本筆總支出金額": "finalTotal",
        "時間": "date",
        "日期": "date",
        "serverTimestamp": "serverTimestamp"
    };

    const start = payload.startDate ? new Date(payload.startDate + 'T00:00:00') : null;
    const end = payload.endDate ? new Date(payload.endDate + 'T23:59:59') : null;

    return rows.map(row => {
        let obj = {};
        headers.forEach((h, i) => {
            const cleanHeader = String(h || '').trim();
            const key = mapping[cleanHeader] || cleanHeader;
            obj[key] = row[i];
        });
        return obj;
    }).filter(item => {
        const itemDate = new Date(item.date || item.serverTimestamp);
        if (isNaN(itemDate.getTime())) return true;
        if (start && itemDate < start) return false;
        if (end && itemDate > end) return false;
        return true;
    });
}

function saveExpenditureService(payload) {
    try {
        const ss = SpreadsheetApp.getActiveSpreadsheet();
        let sheet = ss.getSheetByName('Expenditures');
        
        if (!sheet) {
            sheet = ss.insertSheet('Expenditures');
            sheet.appendRow([
                '時間戳記', '攤位', '清潔', '電費', '加油', '停車',
                '貨款', '塑膠袋', '其他', 'Line Pay', '服務費',
                '對象', '業務', '備註', '(預留)', '車輛保養',
                '薪資發放', '公積金', '結算總額'
            ]);
        }
        
        const timestamp = payload.serverTimestamp || new Date();
        const row = [
            timestamp,
            Number(payload.stall) || 0,
            Number(payload.cleaning) || 0,
            Number(payload.electricity) || 0,
            Number(payload.gas) || 0,
            Number(payload.parking) || 0,
            Number(payload.goods) || 0,
            Number(payload.bags) || 0,
            Number(payload.others) || 0,
            Number(payload.linePay) || 0,
            Number(payload.serviceFee) || 0,
            payload.customer || '',
            payload.salesRep || payload.operator || '',
            '',
            '',
            Number(payload.vehicleMaintenance) || 0,
            Number(payload.salary) || 0,
            Number(payload.reserve) || 0,
            Number(payload.finalTotal) || 0
        ];
        
        sheet.appendRow(row);
        return { success: true, timestamp: timestamp };
    } catch (error) {
        throw new Error('保存支出資料失敗: ' + error.message);
    }
}




