/**
 * [Service] 獲取薪資資料 (正式版：連動業績與記錄)
 */
function getPayrollDataService(payload) {
    const { year, month, targetUser } = payload;
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const ssTimezone = ss.getSpreadsheetTimeZone();
    
    // 助手：解析金額 (處理逗號、貨幣符號)
    const parseMoney = (val) => {
        if (typeof val === 'number') return val;
        if (!val) return 0;
        const clean = String(val).replace(/[$, ]/g, '');
        return parseFloat(clean) || 0;
    };

    // 助手：模糊標題查找 (增加排除關鍵字功能)
    const findIdx = (headers, keywords, excludes = []) => {
        return headers.findIndex(h => {
            const lowH = String(h || '').toLowerCase();
            const matches = keywords.some(k => lowH.includes(k.toLowerCase()));
            const isExcluded = excludes.some(e => lowH.includes(e.toLowerCase()));
            return matches && !isExcluded;
        });
    };

    // 1. 取得設定
    let config = { baseSalary: 30000, attendanceBonus: 0, insurance: 0, monthlyOffDays: 8, bonusTiers: [] };
    const settingsSheet = initPayrollSheet_('Payroll_Settings', ['Username', 'BaseSalary', 'AttendanceBonus', 'Insurance', 'OffDaysStandard', 'BonusTiersJson']);
    const settingsData = settingsSheet.getDataRange().getValues();
    for (let i = 1; i < settingsData.length; i++) {
        if (settingsData[i][0] === targetUser) {
            config = {
                baseSalary: Number(settingsData[i][1]),
                attendanceBonus: Number(settingsData[i][2]),
                insurance: Number(settingsData[i][3]),
                monthlyOffDays: Number(settingsData[i][4]),
                bonusTiers: JSON.parse(settingsData[i][5] || '[]')
            };
            break;
        }
    }

    // 2. 彙整當月業績 (處理 SaleID 關聯與模糊標題比對)
    const dailyData = {};
    const dailyRecords = {}; 
    let totalSales = 0;
    let salesShortage = 0;
    
    // [身分識別] 找出目標使用者的 ID (代碼) 與 姓名
    let targetUserId = "";
    let targetUserName = String(targetUser || '').trim();
    const usersSheet = ss.getSheetByName('Users') || ss.getSheetByName('使用者');
    if (usersSheet) {
        const usersData = usersSheet.getDataRange().getValues();
        const uHeaders = usersData[0].map(h => String(h || '').trim().toLowerCase());
        const uidIdx = uHeaders.findIndex(h => h.includes('id'));
        const unameIdx = uHeaders.findIndex(h => h.includes('name') || h.includes('名稱') || h.includes('帳號'));

        for (let i = 1; i < usersData.length; i++) {
            const uName = String(usersData[i][unameIdx === -1 ? 1 : unameIdx]).trim();
            const uId = String(usersData[i][uidIdx === -1 ? 0 : uidIdx]).trim();
            if (uName === targetUserName || uId === targetUserName) {
                targetUserId = uId;
                targetUserName = uName;
                break;
            }
        }
    }

    const salesSheet = ss.getSheetByName('Sales') || ss.getSheetByName('銷售') || ss.getSheetByName('銷售紀錄') || ss.getSheetByName('Orders');
    const salesDetailsSheet = ss.getSheetByName('SalesDetails') || ss.getSheetByName('銷售明細') || ss.getSheetByName('OrderDetails');
    
    if (salesSheet) {
        const salesRows = salesSheet.getDataRange().getValues();
        const sHeaders = salesRows[0].map(h => String(h || '').trim());
        const sDateIdx = findIdx(sHeaders, ['日期', 'date', 'time']);
        const sUserIdx = findIdx(sHeaders, ['業務', 'rep', 'user', 'operator', '帳號', '姓名']);
        const sIdIdx = findIdx(sHeaders, ['saleid', '訂單', '編號', 'id']);
        
        // 抓取 F 欄位 (FinalTotal / 結算) 做為金額落差來源
        const sFinalIdx = findIdx(sHeaders, ['finaltotal', '結算'], ['cash', '實收', '現金']);
        const sCashIdx = findIdx(sHeaders, ['totalcash', '實收', '現金', 'cash']);

        const validSalesMap = {}; 
        if (sDateIdx !== -1 && sUserIdx !== -1) {
            for (let i = 1; i < salesRows.length; i++) {
                const row = salesRows[i];
                if (!row[sDateIdx]) continue;
                const d = (row[sDateIdx] instanceof Date) ? row[sDateIdx] : new Date(row[sDateIdx]);
                if (isNaN(d.getTime())) continue;

                if (d.getFullYear() === year && (d.getMonth() + 1) === month) {
                    const rowUser = String(row[sUserIdx] || '').trim().toLowerCase();
                    const matchUser = targetUserName.toLowerCase();
                    const matchId = targetUserId.toLowerCase();

                    if (rowUser === matchUser || (matchId && rowUser === matchId)) {
                        const dateKey = Utilities.formatDate(d, ssTimezone, "yyyy-MM-dd");
                        const sid = sIdIdx !== -1 ? String(row[sIdIdx]).trim() : ("ROW_" + i);
                        validSalesMap[sid] = dateKey;
                        
                        // [直接抓取 F 欄位數值]
                        if (sFinalIdx !== -1) {
                            const val = parseMoney(row[sFinalIdx]);
                            // 判斷是否要計入虧損 (只有負數才扣除)
                            if (Math.abs(val) > 0.01) {
                                if (!dailyRecords[dateKey]) dailyRecords[dateKey] = {};
                                
                                // 只有負數才加進虧損總額
                                if (val < 0) {
                                    const lossAmt = Math.abs(val);
                                    dailyRecords[dateKey].loss = (dailyRecords[dateKey].loss || 0) + lossAmt;
                                    salesShortage += lossAmt;
                                }
                                
                                // 不論正負都紀錄在備註中供參考
                                const noteTxt = "[結算:" + val.toFixed(1) + "]";
                                dailyRecords[dateKey].note = (dailyRecords[dateKey].note ? dailyRecords[dateKey].note + " " : "") + noteTxt;
                            }
                        }
                        
                        // 無明細表之備援方案 (如果沒有明細表，還是需要業績總額，這裡仍保留尋找 Total 的邏輯供業績使用)
                        const sTotalIdx = findIdx(sHeaders, ['金額', 'amount', 'total'], ['final', '結算', 'cash']);
                        if (!salesDetailsSheet && sTotalIdx !== -1) {
                           const rowAmt = parseMoney(row[sTotalIdx]);
                           dailyData[dateKey] = (dailyData[dateKey] || 0) + rowAmt;
                           totalSales += rowAmt;
                        }
                    }
                }
            }
        }

        if (salesDetailsSheet) {
            const detailRows = salesDetailsSheet.getDataRange().getValues();
            const dHeaders = detailRows[0].map(h => String(h || '').trim());
            const dIdIdx = findIdx(dHeaders, ['saleid', '訂單', '編號', 'id']);
            const dTotalIdx = findIdx(dHeaders, ['subtotal', '小計', '金額', '總計', 'amount']);

            if (dIdIdx !== -1 && dTotalIdx !== -1) {
                for (let i = 1; i < detailRows.length; i++) {
                    const row = detailRows[i];
                    const sid = String(row[dIdIdx]).trim();
                    const dateKey = validSalesMap[sid];
                    if (dateKey) {
                        const amount = parseMoney(row[dTotalIdx]);
                        dailyData[dateKey] = (dailyData[dateKey] || 0) + amount;
                        totalSales += amount;
                    }
                }
            }
        }
    }

    // 3. 取得出勤與手動記錄
    let leaveDays = 0;
    let manualLoss = 0;
    const recordSheet = initPayrollSheet_('Daily_Records', ['Date', 'Username', 'Type', 'Value', 'Note', 'Timestamp']);
    const recordRows = recordSheet.getDataRange().getValues();
    for (let i = 1; i < recordRows.length; i++) {
        const row = recordRows[i];
        if (!row[0]) continue;
        const d = (row[0] instanceof Date) ? row[0] : new Date(row[0]);
        if (d.getFullYear() === year && (d.getMonth() + 1) === month && String(row[1]).trim() === targetUser) {
            const dateKey = Utilities.formatDate(d, ssTimezone, "yyyy-MM-dd");
            const type = row[2];
            const val = parseMoney(row[3]);
            if (!dailyRecords[dateKey]) dailyRecords[dateKey] = {};
            
            if (type === 'LEAVE') {
                dailyRecords[dateKey].isLeave = true;
                leaveDays++;
            } else if (type === 'LOSS') {
                dailyRecords[dateKey].loss = (dailyRecords[dateKey].loss || 0) + val;
                manualLoss += val;
            }
            if (row[4]) {
                dailyRecords[dateKey].note = (dailyRecords[dateKey].note ? dailyRecords[dateKey].note + " | " : "") + row[4];
            }
        }
    }

    // 4. 計算獎金
    let bonus = 0;
    const sortedTiers = (config.bonusTiers || []).sort((a, b) => b.threshold - a.threshold);
    for (const tier of sortedTiers) {
        if (totalSales >= tier.threshold) {
            bonus = tier.bonus;
            break;
        }
    }

    // 5. 總結
    const finalLoss = manualLoss + salesShortage;
    const summary = {
        sales: totalSales,
        bonus: bonus,
        leaveDays: leaveDays,
        attendanceBonus: (leaveDays === 0) ? config.attendanceBonus : 0,
        insurance: config.insurance,
        loss: finalLoss,
        finalSalary: config.baseSalary + bonus + ((leaveDays === 0) ? config.attendanceBonus : 0) - config.insurance - finalLoss
    };

    return { config, summary, dailyData, dailyRecords };
}

/**
 * [Service] 儲存每日記錄 (休假/盤點損失)
 */
function saveDailyRecordService(payload) {
    const { date, username, type, value, note } = payload;
    const sheet = initPayrollSheet_('Daily_Records', ['Date', 'Username', 'Type', 'Value', 'Note', 'Timestamp']);
    const data = sheet.getDataRange().getValues();
    const targetDateStr = Utilities.formatDate(new Date(date), "GMT+8", "yyyy-MM-dd");
    let foundRow = -1;
    
    for (let i = 1; i < data.length; i++) {
        const dStr = Utilities.formatDate(new Date(data[i][0]), "GMT+8", "yyyy-MM-dd");
        if (dStr === targetDateStr && data[i][1] === username && data[i][2] === type) {
            foundRow = i + 1;
            break;
        }
    }

    if (foundRow > 0) {
        sheet.getRange(foundRow, 4, 1, 3).setValues([[value, note, new Date()]]);
    } else {
        sheet.appendRow([new Date(date), username, type, value, note, new Date()]);
    }
    return { success: true };
}

/**
 * [Service] 儲存薪資參數設定
 */
function savePayrollSettingsService(payload) {
    const { targetUser, baseSalary, attendanceBonus, insurance, monthlyOffDays, bonusTiers } = payload;
    const sheet = initPayrollSheet_('Payroll_Settings', ['Username', 'BaseSalary', 'AttendanceBonus', 'Insurance', 'OffDaysStandard', 'BonusTiersJson']);
    const data = sheet.getDataRange().getValues();
    let foundRow = -1;
    for (let i = 1; i < data.length; i++) {
        if (data[i][0] === targetUser) {
            foundRow = i + 1;
            break;
        }
    }
    const rowValue = [targetUser, baseSalary, attendanceBonus, insurance, monthlyOffDays, JSON.stringify(bonusTiers)];
    if (foundRow > 0) {
        sheet.getRange(foundRow, 1, 1, 6).setValues([rowValue]);
    } else {
        sheet.appendRow(rowValue);
    }
    return { success: true };
}

/**
 * [Helper] 初始化薪資相關分頁
 */
function initPayrollSheet_(name, headers) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(name);
    if (!sheet) {
        sheet = ss.insertSheet(name);
        sheet.appendRow(headers);
    }
    return sheet;
}
