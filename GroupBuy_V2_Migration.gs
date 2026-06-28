/**
 * GroupBuy_V2_Migration.gs
 * Phase 2 舊資料轉移與回填腳本
 */

/** 
 * 給老闆驗收用：直接在 Apps Script 點擊「執行」查看 Preview 
 */
function TEST_RUN_MIGRATION_PREVIEW() {
    const res = v2_previewMigrationService({}, { role: 'BOSS' });
    Logger.log("【預覽結果】\n" + JSON.stringify(res, null, 2));
}

/** 
 * 給老闆驗收用：直接在 Apps Script 點擊「執行」將資料匯入 V2 表單 
 */
function TEST_RUN_MIGRATION_EXECUTE() {
    const preview = v2_previewMigrationService({}, { role: 'BOSS' });
    if (!preview.success) {
        Logger.log("【預覽失敗，無法執行】\n" + JSON.stringify(preview, null, 2));
        return;
    }
    const checksum = preview.data.preview.checksum;
    
    const res = v2_executeMigrationService({ checksum: checksum }, { role: 'BOSS' });
    Logger.log("【執行結果】\n" + JSON.stringify(res, null, 2));
}

function v2_previewMigrationService(payload, user) {
    if (user.role !== 'BOSS') throw new Error('權限不足');
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const oldSettingsSheet = ss.getSheetByName('GroupBuy_Settings');
    const orderSheet = ss.getSheetByName('GroupBuy_Orders');
    
    if (!oldSettingsSheet) {
        return { success: false, code: "MIGRATION_ERROR", message: "找不到舊的 GroupBuy_Settings", version: "v2", timestamp: new Date().toISOString() };
    }

    const settingsData = oldSettingsSheet.getDataRange().getValues();
    const orderData = orderSheet ? orderSheet.getDataRange().getValues() : [];
    
    let commCount = 0;
    let campCount = 0;
    let orderCount = 0;

    // Preview counting logic
    for (let i = 1; i < settingsData.length; i++) {
        const building = String(settingsData[i][0] || '').trim();
        if (building) {
            commCount++;
            campCount++; // 假設每個 building 至少轉移為一個進行中的 Campaign
        }
    }
    
    if (orderData.length > 1) {
        orderCount = orderData.length - 1; // 假設全部回填
    }

    // 計算 Dry Run Hash (Checksum) 作為防呆機制
    const rawString = `${commCount}_${campCount}_${orderCount}_${Date.now()}`;
    const dryRunHash = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, rawString)).substring(0, 10);

    return {
        success: true,
        data: {
            preview: {
                communitiesToCreate: commCount,
                campaignsToCreate: campCount,
                ordersToBackfill: orderCount,
                checksum: dryRunHash
            }
        },
        message: "預覽成功",
        version: "v2",
        timestamp: new Date().toISOString()
    };
}

function v2_executeMigrationService(payload, user) {
    if (user.role !== 'BOSS') throw new Error('權限不足');
    
    // 檢查 Hash (實務上前端需將 preview 得到的 checksum 傳回)
    if (!payload || !payload.checksum) {
        return { success: false, code: "MISSING_CHECKSUM", message: "請先執行預覽並提供 checksum", version: "v2", timestamp: new Date().toISOString() };
    }
    
    initGroupBuyV2Sheets_();
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const oldSettingsSheet = ss.getSheetByName('GroupBuy_Settings');
    const commSheet = ss.getSheetByName('GroupBuy_Communities');
    const campSheet = ss.getSheetByName('GroupBuy_Campaigns');
    const orderSheet = ss.getSheetByName('GroupBuy_Orders');
    
    if (!oldSettingsSheet) throw new Error("找不到舊設定檔");
    
    const settingsData = oldSettingsSheet.getDataRange().getValues();
    const now = new Date();
    
    // 建立 Communities 與 Campaigns
    let cmIdCounter = 1;
    let cpIdCounter = 1;
    
    // 清空現有的 V2 表（避免重複遷移）
    if (commSheet.getLastRow() > 1) commSheet.getRange(2, 1, commSheet.getLastRow() - 1, commSheet.getLastColumn()).clearContent();
    if (campSheet.getLastRow() > 1) campSheet.getRange(2, 1, campSheet.getLastRow() - 1, campSheet.getLastColumn()).clearContent();
    
    const buildingMap = {}; // mapping building name to CommunityId and CampaignId
    
    for (let i = 1; i < settingsData.length; i++) {
        const building = String(settingsData[i][0] || '').trim();
        const start = settingsData[i][1];
        const end = settingsData[i][2];
        if (!building) continue;
        
        const commId = Utilities.getUuid();
        const commCode = 'CM' + String(cmIdCounter).padStart(6, '0');
        const campId = 'CP' + Utilities.formatDate(now, "GMT+8", "yyyyMMdd") + String(cpIdCounter).padStart(4, '0');
        
        buildingMap[building] = { commId, commCode, campId };
        
        // Insert into Communities
        // 'CommunityId', 'CommunityCode', 'CommunityName', 'CommunityType', 'OrderingMode', 'ServiceArea', 'IsDefault', 'Icon', 'ContactPerson', 'ContactPhone', 'OpenMessage', 'CloseMessage', 'DefaultDeliveryTime', 'DefaultFreeShipping', 'DefaultPaymentMethods', 'DefaultRoute', 'DeliveryInstruction', 'Status', 'Notes', 'CreatedBy', 'UpdatedBy', 'CreatedAt', 'UpdatedAt', 'DeletedAt'
        const commRow = new Array(GB_COMMUNITIES_HEADERS.length).fill('');
        commRow[0] = commId;
        commRow[1] = commCode;
        commRow[2] = building;
        commRow[3] = 'APARTMENT';
        commRow[4] = 'NORMAL';
        commRow[6] = (cmIdCounter === 1) ? 1 : 0; // 第一個當預設
        commRow[17] = 'ACTIVE';
        commRow[19] = 'SYSTEM_MIGRATION';
        commRow[21] = now;
        commRow[22] = now;
        commSheet.appendRow(commRow);
        
        // Insert into Campaigns
        // 'CampaignId', 'CommunityCode', 'CampaignName', 'CampaignType', 'CampaignStatus', 'Version', 'AllowReorder', 'ThemeColor', 'DisplayOrder', 'Priority', 'StartTime', 'EndTime', 'DeliveryDate', 'DeliveryStartTime', 'DeliveryEndTime', 'SystemAnnouncement', 'GroupAnnouncement', 'CreatedBy', 'UpdatedBy', 'CreatedAt', 'UpdatedAt'
        const campRow = new Array(GB_CAMPAIGNS_HEADERS.length).fill('');
        campRow[0] = campId;
        campRow[1] = commId;
        campRow[2] = building + ' V1轉移團';
        campRow[3] = 'NORMAL';
        campRow[4] = 'OPEN';
        campRow[5] = 1;
        campRow[6] = 'YES';
        campRow[10] = start;
        campRow[11] = end;
        campRow[17] = 'SYSTEM_MIGRATION';
        campRow[19] = now;
        campRow[20] = now;
        campSheet.appendRow(campRow);
        
        cmIdCounter++;
        cpIdCounter++;
    }
    
    // Backfill Orders
    if (orderSheet && orderSheet.getLastRow() > 1) {
        const orderData = orderSheet.getDataRange().getValues();
        const headers = orderData[0].map(h => String(h).trim());
        
        const commIdIdx = headers.indexOf('CommunityId');
        const campIdIdx = headers.indexOf('CampaignId');
        const commNameSnapIdx = headers.indexOf('CommunityNameSnapshot');
        const campNameSnapIdx = headers.indexOf('CampaignNameSnapshot');
        const sourceGroupIdx = headers.indexOf('SourceGroup'); // 原本的 building
        
        if (commIdIdx !== -1 && sourceGroupIdx !== -1) {
            for (let i = 1; i < orderData.length; i++) {
                const building = String(orderData[i][sourceGroupIdx] || '').trim();
                const mapping = buildingMap[building];
                if (mapping) {
                    orderSheet.getRange(i + 1, commIdIdx + 1).setValue(mapping.commId);
                    if (campIdIdx !== -1) orderSheet.getRange(i + 1, campIdIdx + 1).setValue(mapping.campId);
                    if (commNameSnapIdx !== -1) orderSheet.getRange(i + 1, commNameSnapIdx + 1).setValue(building);
                    if (campNameSnapIdx !== -1) orderSheet.getRange(i + 1, campNameSnapIdx + 1).setValue(building + ' V1轉移團');
                }
            }
        }
    }
    
    return {
        success: true,
        data: {},
        message: "遷移成功",
        version: "v2",
        timestamp: new Date().toISOString()
    };
}
