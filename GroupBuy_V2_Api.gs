/**
 * GroupBuy_V2_Api.gs
 * Phase 2 後端 API Controllers
 */

function v2_getLiffInitDataService(payload) {
    const commCode = payload.c; // 預期從前端傳來 ?c=CM000001
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const commSheet = ss.getSheetByName(GB_COMMUNITIES_SHEET_NAME);
    const campSheet = ss.getSheetByName(GB_CAMPAIGNS_SHEET_NAME);
    
    if (!commSheet || !campSheet) {
        return ApiResponse.error("DB_NOT_READY", "系統維護中");
    }
    
    const commData = commSheet.getDataRange().getValues();
    let targetComm = null;
    let defaultComm = null;
    const headers = commData[0].map(h => String(h).trim());
    
    const idIdx = headers.indexOf('CommunityId');
    const codeIdx = headers.indexOf('CommunityCode');
    const isDefaultIdx = headers.indexOf('IsDefault');
    const statusIdx = headers.indexOf('Status');
    
    for (let i = 1; i < commData.length; i++) {
        const row = commData[i];
        if (row[statusIdx] !== Enums.CommunityStatus.ACTIVE) continue;
        
        const commObj = {
            CommunityId: row[idIdx],
            CommunityCode: row[codeIdx],
            CommunityName: row[headers.indexOf('CommunityName')],
            OrderingMode: row[headers.indexOf('OrderingMode')],
            OpenMessage: row[headers.indexOf('OpenMessage')],
            CloseMessage: row[headers.indexOf('CloseMessage')]
        };
        
        if (row[codeIdx] === commCode) {
            targetComm = commObj;
            break;
        }
        if (row[isDefaultIdx] == 1) {
            defaultComm = commObj;
        }
    }
    
    const activeComm = targetComm || defaultComm;
    if (!activeComm) {
        return ApiResponse.error("COMMUNITY_NOT_FOUND", "找不到對應的社區入口");
    }
    
    // 找出對應的 Campaign (NextOpenTime 動態運算)
    const campData = campSheet.getDataRange().getValues();
    const campHeaders = campData[0].map(h => String(h).trim());
    let activeCampaign = null;
    let nextCampaign = null;
    const now = new Date();
    
    for (let i = 1; i < campData.length; i++) {
        const row = campData[i];
        if (row[campHeaders.indexOf('CommunityId')] !== activeComm.CommunityId) continue;
        
        const status = row[campHeaders.indexOf('CampaignStatus')];
        const startTime = new Date(row[campHeaders.indexOf('StartTime')]);
        
        if (status === Enums.CampaignStatus.OPEN) {
            activeCampaign = {
                CampaignId: row[campHeaders.indexOf('CampaignId')],
                CampaignName: row[campHeaders.indexOf('CampaignName')],
                ThemeColor: row[campHeaders.indexOf('ThemeColor')],
                SystemAnnouncement: row[campHeaders.indexOf('SystemAnnouncement')],
                GroupAnnouncement: row[campHeaders.indexOf('GroupAnnouncement')]
            };
            break; // 找到正在進行中的就不用找 Next 了
        } else if (status === Enums.CampaignStatus.DRAFT || status === Enums.CampaignStatus.CLOSED) {
            if (startTime > now) {
                if (!nextCampaign || startTime < nextCampaign.startTime) {
                    nextCampaign = {
                        startTime: startTime,
                        CampaignName: row[campHeaders.indexOf('CampaignName')]
                    };
                }
            }
        }
    }
    
    return ApiResponse.success({
        community: activeComm,
        activeCampaign: activeCampaign,
        nextOpenTime: nextCampaign ? nextCampaign.startTime : null
    });
}

function v2_getCommunitiesService(payload) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const commSheet = ss.getSheetByName(GB_COMMUNITIES_SHEET_NAME);
    if (!commSheet) return ApiResponse.error("DB_NOT_READY", "Communities表未準備好");

    const data = commSheet.getDataRange().getValues();
    const headers = data[0].map(h => String(h).trim());
    const results = [];
    for (let i = 1; i < data.length; i++) {
        const row = data[i];
        if (row[headers.indexOf('DeletedAt')]) continue; // skip soft deleted
        let obj = {};
        headers.forEach((h, idx) => {
            obj[h] = row[idx];
        });
        results.push(obj);
    }
    return ApiResponse.success({ communities: results });
}

function v2_getCampaignsService(payload) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const campSheet = ss.getSheetByName(GB_CAMPAIGNS_SHEET_NAME);
    if (!campSheet) return ApiResponse.error("DB_NOT_READY", "Campaigns表未準備好");

    const data = campSheet.getDataRange().getValues();
    const headers = data[0].map(h => String(h).trim());
    const results = [];
    for (let i = 1; i < data.length; i++) {
        const row = data[i];
        let obj = {};
        headers.forEach((h, idx) => {
            obj[h] = row[idx];
        });
        results.push(obj);
    }
    return ApiResponse.success({ campaigns: results });
}

function v2_saveCommunityService(payload, user) {
    if (user.role !== 'BOSS') return ApiResponse.error("PERMISSION_DENIED", "權限不足");
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const commSheet = ss.getSheetByName(GB_COMMUNITIES_SHEET_NAME);
    const data = commSheet.getDataRange().getValues();
    const headers = data[0].map(h => String(h).trim());
    const now = new Date();
    
    let isNew = !payload.CommunityId;
    let targetRowIdx = -1;
    
    if (!isNew) {
        targetRowIdx = data.findIndex(row => row[headers.indexOf('CommunityId')] === payload.CommunityId);
        if (targetRowIdx === -1) return ApiResponse.error("NOT_FOUND", "找不到指定的社區");
    }
    
    const rowData = isNew ? new Array(headers.length).fill("") : data[targetRowIdx];
    
    if (isNew) {
        rowData[headers.indexOf('CommunityId')] = Utilities.getUuid();
        rowData[headers.indexOf('CreatedAt')] = now;
        rowData[headers.indexOf('CreatedBy')] = user.id || "SYSTEM";
    }
    
    // Update fields
    const allowedFields = ['CommunityCode', 'CommunityName', 'CommunityType', 'OrderingMode', 'ServiceArea', 'IsDefault', 'Icon', 'ContactPerson', 'ContactPhone', 'OpenMessage', 'CloseMessage', 'DefaultDeliveryTime', 'DefaultFreeShipping', 'DefaultRoute', 'DeliveryInstruction', 'Status', 'Notes'];
    allowedFields.forEach(f => {
        if (payload[f] !== undefined) rowData[headers.indexOf(f)] = payload[f];
    });
    
    if (payload.DefaultPaymentMethods !== undefined) {
        rowData[headers.indexOf('DefaultPaymentMethods')] = JSON.stringify(payload.DefaultPaymentMethods);
    }
    
    rowData[headers.indexOf('UpdatedAt')] = now;
    rowData[headers.indexOf('UpdatedBy')] = user.id || "SYSTEM";
    
    if (isNew) {
        commSheet.appendRow(rowData);
    } else {
        commSheet.getRange(targetRowIdx + 1, 1, 1, headers.length).setValues([rowData]);
    }
    
    return ApiResponse.success({ CommunityId: rowData[headers.indexOf('CommunityId')] });
}

function v2_saveCampaignService(payload, user) {
    if (user.role !== 'BOSS') return ApiResponse.error("PERMISSION_DENIED", "權限不足");
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const campSheet = ss.getSheetByName(GB_CAMPAIGNS_SHEET_NAME);
    const data = campSheet.getDataRange().getValues();
    const headers = data[0].map(h => String(h).trim());
    const now = new Date();
    
    let isNew = !payload.CampaignId;
    let targetRowIdx = -1;
    
    if (!isNew) {
        targetRowIdx = data.findIndex(row => row[headers.indexOf('CampaignId')] === payload.CampaignId);
        if (targetRowIdx === -1) return ApiResponse.error("NOT_FOUND", "找不到指定的檔期");
    }
    
    const rowData = isNew ? new Array(headers.length).fill("") : data[targetRowIdx];
    
    if (isNew) {
        const dateStr = Utilities.formatDate(now, "GMT+8", "yyyyMMdd");
        rowData[headers.indexOf('CampaignId')] = 'CP' + dateStr + Utilities.getUuid().substring(0,4);
        rowData[headers.indexOf('CreatedAt')] = now;
        rowData[headers.indexOf('CreatedBy')] = user.id || "SYSTEM";
        rowData[headers.indexOf('Version')] = 1;
    } else {
        rowData[headers.indexOf('Version')] = Number(rowData[headers.indexOf('Version')] || 0) + 1;
    }
    
    const allowedFields = ['CommunityId', 'CampaignName', 'CampaignType', 'CampaignStatus', 'AllowReorder', 'ThemeColor', 'DisplayOrder', 'Priority', 'StartTime', 'EndTime', 'DeliveryDate', 'DeliveryStartTime', 'DeliveryEndTime', 'SystemAnnouncement', 'GroupAnnouncement'];
    allowedFields.forEach(f => {
        if (payload[f] !== undefined) rowData[headers.indexOf(f)] = payload[f];
    });
    
    if (payload.CampaignStatus === Enums.CampaignStatus.OPEN && !rowData[headers.indexOf('PublishedAt')]) {
        rowData[headers.indexOf('PublishedAt')] = now;
    }
    
    rowData[headers.indexOf('UpdatedAt')] = now;
    rowData[headers.indexOf('UpdatedBy')] = user.id || "SYSTEM";
    
    if (isNew) {
        campSheet.appendRow(rowData);
    } else {
        campSheet.getRange(targetRowIdx + 1, 1, 1, headers.length).setValues([rowData]);
    }
    
    return ApiResponse.success({ CampaignId: rowData[headers.indexOf('CampaignId')] });
}
