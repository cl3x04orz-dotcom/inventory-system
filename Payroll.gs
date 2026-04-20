/**
 * [Service] 獲取薪資資料 (正式版：連動業績與記錄)
 */
function getPayrollDataService(payload, user) {
    const { year, month, targetUser } = payload;

    // 權限檢查：只有 BOSS 可以查詢他人資料，一般員工只能查詢自己的模式
    const isAdmin = user.role === 'BOSS';
    const isOwner = String(targetUser || '').trim() === String(user.username || '').trim();
    if (!isAdmin && !isOwner) {
        throw new Error('權限不足：您只能查詢自己的薪資資料');
    }

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
    let config = { baseSalary: 30000, attendanceBonus: 0, insurance: 0, monthlyOffDays: 8, bonusTiers: [], empType: 'FULL_TIME', hourlyWage: 0, commissionRate: 0 };
    const settingsSheet = initPayrollSheet_('Payroll_Settings', ['Username', 'BaseSalary', 'AttendanceBonus', 'Insurance', 'OffDaysStandard', 'BonusTiersJson', 'EmpType', 'HourlyWage', 'CommissionRate']);
    const settingsData = settingsSheet.getDataRange().getValues();
    for (let i = 1; i < settingsData.length; i++) {
        if (settingsData[i][0] === targetUser) {
            config = {
                baseSalary: Number(settingsData[i][1]),
                attendanceBonus: Number(settingsData[i][2]),
                insurance: Number(settingsData[i][3]),
                monthlyOffDays: Number(settingsData[i][4]),
                bonusTiers: JSON.parse(settingsData[i][5] || '[]'),
                empType: String(settingsData[i][6] || 'FULL_TIME'),
                hourlyWage: Number(settingsData[i][7] || 0),
                commissionRate: Number(settingsData[i][8] || 0) // Col 8: 抽成比率 (小數，如 0.005 = 0.5%)
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
        const sCustIdx = findIdx(sHeaders, ['客戶', '地點', 'location', 'customer']);
        
        const categoryMap = typeof getCustomerCategoryMap_ !== 'undefined' ? getCustomerCategoryMap_() : {};
        
        const validSalesMap = {}; 
        const excludedSalesMap = {}; // 用於記錄哪些單據屬於批發，明細表處理時也需排除
        if (sDateIdx !== -1 && sUserIdx !== -1) {
            for (let i = 1; i < salesRows.length; i++) {
                const row = salesRows[i];
                if (!row[sDateIdx]) continue;

                // [終極防禦] 不要依賴特定欄位 index。逐格掃描整個 row，只要有 VOID 就跳過，避免任何試算表欄位偏移
                let isRowVoid = false;
                for (let c = 0; c < row.length; c++) {
                    const cellTxt = String(row[c] || '').trim().toUpperCase();
                    if (cellTxt === 'VOID' || cellTxt.includes('[VOID]')) {
                        isRowVoid = true;
                        break;
                    }
                }
                if (isRowVoid) continue;

                const d = (row[sDateIdx] instanceof Date) ? row[sDateIdx] : new Date(row[sDateIdx]);
                if (isNaN(d.getTime())) continue;

                if (d.getFullYear() === year && (d.getMonth() + 1) === month) {
                    const rowUser = String(row[sUserIdx] || '').trim().toLowerCase();
                    const matchUser = targetUserName.toLowerCase();
                    const matchId = targetUserId.toLowerCase();

                    if (rowUser === matchUser || (matchId && rowUser === matchId)) {
                        const dateKey = Utilities.formatDate(d, ssTimezone, "yyyy-MM-dd");
                        const sid = sIdIdx !== -1 ? String(row[sIdIdx]).trim() : ("ROW_" + i);
                        
                        // [新增] 檢查客戶類別，若是「批發」則排除在業績之外
                        const customerName = sCustIdx !== -1 ? String(row[sCustIdx] || "").trim() : "";
                        if (categoryMap[customerName] === '批發') {
                           excludedSalesMap[sid] = true;
                           continue; 
                        }

                        validSalesMap[sid] = dateKey;
                        
                        // [直接抓取 F 欄位數值]
                        if (sFinalIdx !== -1) {
                            const val = parseMoney(row[sFinalIdx]);
                            // 判斷是否要顯示備註 (不再扣減員工薪資，只留備註)
                            if (Math.abs(val) > 0.01) {
                                // (使用者要求：重新啟用盤損計算邏輯)
                                if (val < 0) {
                                    const absLoss = Math.abs(val);
                                    salesShortage += absLoss;
                                    if (!dailyRecords[dateKey]) dailyRecords[dateKey] = {};
                                    dailyRecords[dateKey].loss = (dailyRecords[dateKey].loss || 0) + absLoss;
                                }
                                
                                // 不論正負都紀錄在備註中供參考
                                if (!dailyRecords[dateKey]) dailyRecords[dateKey] = {};
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
                        
                        // [New] 累加當日工時
                        const sWorkHoursIdx = 14; // O 欄位: 工時
                        const wHours = Number(row[sWorkHoursIdx]) || 0;
                        if (wHours > 0) {
                            if (!dailyRecords[dateKey]) dailyRecords[dateKey] = {};
                            dailyRecords[dateKey].workHours = (dailyRecords[dateKey].workHours || 0) + wHours;
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
    let generalLeaveDays = 0;
    let specialLeaveDays = 0;
    let sickLeaveDays = 0;
    let totalSpecialLeaveUsed = 0; // 跨月累積已請特休
    let manualLoss = 0;
    const recordSheet = initPayrollSheet_('Daily_Records', ['Date', 'Username', 'Type', 'Value', 'Note', 'Timestamp']);
    const recordRows = recordSheet.getDataRange().getValues();

    // Deduplication Strategy: Map<DateString, RowData>
    // Keep only the latest record based on Timestamp for each day
    const effectiveRecords = {}; // Key: "yyyy-MM-dd", Value: RowData
    const specialLeaveHistory = {}; // To deduplicate cross-month history too if needed, or just count unique days

    for (let i = 1; i < recordRows.length; i++) {
        const row = recordRows[i];
        if (!row[0]) continue;
        const rowUser = String(row[1]).trim().toLowerCase();
        if (rowUser !== targetUser.toLowerCase()) continue;

        const d = (row[0] instanceof Date) ? row[0] : new Date(row[0]);
        const dateKey = Utilities.formatDate(d, ssTimezone, "yyyy-MM-dd");
        const timestamp = (row[5] instanceof Date) ? row[5].getTime() : 0;

        // Effective Record Logic: Only keep the latest record for this specific date
        if (!effectiveRecords[dateKey] || timestamp > effectiveRecords[dateKey].timestamp) {
            effectiveRecords[dateKey] = {
                date: d,
                type: row[2],
                value: parseMoney(row[3]),
                note: row[4],
                timestamp: timestamp
            };
        }
    }

    // Process effective records
    for (const [dateKey, rec] of Object.entries(effectiveRecords)) {
        const d = rec.date;
        const type = rec.type;
        const val = rec.value;

        // Global stats (cross month)
        if (type === 'SPECIAL_LEAVE') {
            totalSpecialLeaveUsed++;
        }

        // Current month stats - Use Utilities.formatDate to ensure timezone consistency
        const recordYear = Number(Utilities.formatDate(d, ssTimezone, "yyyy"));
        const recordMonth = Number(Utilities.formatDate(d, ssTimezone, "M"));
        
        if (recordYear === year && recordMonth === month) {
            if (!dailyRecords[dateKey]) dailyRecords[dateKey] = {};
            
            // Reset flags to ensure no double counting status
            // Note: salesShortage (loss) from Sales is already in dailyRecords[dateKey].loss, keep it.
            // But we overwrite status flags.
            
            if (type === 'LEAVE') {
                dailyRecords[dateKey].isLeave = true;
                generalLeaveDays++;
            } else if (type === 'SPECIAL_LEAVE') {
                dailyRecords[dateKey].isSpecialLeave = true;
                specialLeaveDays++;
            } else if (type === 'SICK_LEAVE') {
                dailyRecords[dateKey].isSickLeave = true;
                sickLeaveDays++;
            } else if (type === 'LOSS') {
                const absLoss = Math.abs(val);
                dailyRecords[dateKey].loss = (dailyRecords[dateKey].loss || 0) + absLoss;
                manualLoss += absLoss;
            }
            
            if (rec.note) {
                dailyRecords[dateKey].note = (dailyRecords[dateKey].note ? dailyRecords[dateKey].note + " | " : "") + rec.note;
            }
        }
    }

    // Count default leave days: days with no sales and no explicit leave record
    // This matches the frontend logic where default status is "休假"
    const daysInMonth = new Date(year, month, 0).getDate();
    for (let day = 1; day <= daysInMonth; day++) {
        const d = new Date(year, month - 1, day);
        const offset = d.getTimezoneOffset() * 60000;
        const localDate = new Date(d.getTime() - offset);
        const dateKey = localDate.toISOString().split('T')[0];
        
        const hasSales = (dailyData[dateKey] || 0) > 0;
        const hasRecord = dailyRecords[dateKey];
        const hasExplicitLeave = hasRecord && (hasRecord.isLeave || hasRecord.isSpecialLeave || hasRecord.isSickLeave);
        
        // If no sales and no explicit leave record, count as general leave (default state)
        if (!hasSales && !hasExplicitLeave) {
            if (!dailyRecords[dateKey]) dailyRecords[dateKey] = {};
            dailyRecords[dateKey].isLeave = true;
            generalLeaveDays++;
        }
    }

    // 4. 計算獎金 (依員工類型分流)
    const isPartTimeCalc = config.empType === 'PART_TIME';
    let bonus = 0;
    let commissionAmount = 0; // 抽成金額 (工讀生專用)

    if (isPartTimeCalc) {
        // 工讀生：業績 × 抽成比率
        commissionAmount = totalSales * (config.commissionRate || 0);
        bonus = commissionAmount;
    } else {
        // 正職：業績達標級距獎金
        const sortedTiers = (config.bonusTiers || []).sort((a, b) => b.threshold - a.threshold);
        for (const tier of sortedTiers) {
            if (totalSales >= tier.threshold) {
                bonus = tier.bonus;
                break;
            }
        }
    }

    // 5. 總結
    const finalLoss = manualLoss + salesShortage;
    
    // [修正] 保持數據獨立，不要在此預扣盤損，否則前端欄位會變成 0
    // 實領薪資計算時才會進行最後加計與扣除

    // 計算總工時
    let totalWorkHours = 0;
    for (const key in dailyRecords) {
        if (dailyRecords[key].workHours) {
            totalWorkHours += dailyRecords[key].workHours;
        }
    }

    const isPartTime = config.empType === 'PART_TIME';
    const calculatedBase = isPartTime ? (totalWorkHours * (config.hourlyWage || 0)) : config.baseSalary;

    // 全勤獎金邏輯：一般休假天數在月休標準內（含）即可領取；特休與病假不影響全勤
    const hasAttendanceBonus = (generalLeaveDays <= config.monthlyOffDays);
    // 出勤補貼：少休補錢，多休扣錢 (標準天數 - 實際休假天數) × 1000 (僅正職適用)
    const leaveCompensation = isPartTime ? 0 : (config.monthlyOffDays - generalLeaveDays) * 1000;
    
    const sickLeaveDeduction = isPartTime ? 0 : (sickLeaveDays * 500);
    // 只扣勞健保
    const finalInsurance = config.insurance || 0;

    // 盤損/扣款 扣 業績獎金
    const finalBonus = Math.max(0, bonus - finalLoss);

    const summary = {
        sales: totalSales,
        bonus: finalBonus,
        commissionAmount: commissionAmount,   // 工讀生：純抽成金額（未扣盤損）
        commissionRate: config.commissionRate, // 工讀生：抽成比率
        generalLeaveDays: generalLeaveDays,
        specialLeaveDays: specialLeaveDays,
        sickLeaveDays: sickLeaveDays,
        attendanceBonus: hasAttendanceBonus ? config.attendanceBonus : 0,
        leaveCompensation: leaveCompensation,
        sickLeaveDeduction: sickLeaveDeduction,
        insurance: finalInsurance,
        loss: finalLoss,
        totalWorkHours: totalWorkHours,
        calculatedBase: calculatedBase,
        // finalSalary: 底薪/時薪小計 + 全勤 + 補貼，並扣除保險與病假扣款 (不扣盤損，不加業績獎金)
        finalSalary: calculatedBase + (hasAttendanceBonus ? config.attendanceBonus : 0) + leaveCompensation - finalInsurance - sickLeaveDeduction
    };

    // [新增] 生日月份提醒檢查 (強化版：同時支援日期格式與字串格式，並統一帳號比對)
    let isBirthdayMonth = false;
    const profileSheet = initPayrollSheet_('Employee_Profiles', ['Username', 'JoinedDate', 'Birthday', 'IdentityID', 'Contact', 'Note']);
    const profileData = profileSheet.getDataRange().getValues();
    const cleanTargetUser = String(targetUser || '').trim().toLowerCase();
    
    for (let i = 1; i < profileData.length; i++) {
        const rowUser = String(profileData[i][0] || '').trim().toLowerCase();
        if (rowUser === cleanTargetUser) {
            const rawBday = profileData[i][2];
            let bMonth = -1;
            
            if (rawBday instanceof Date) {
              bMonth = rawBday.getMonth() + 1;
            } else {
              const bdayStr = String(rawBday || '');
              // Try parsing as Date first
              const parsedDate = new Date(bdayStr);
              if (!isNaN(parsedDate.getTime())) {
                  bMonth = parsedDate.getMonth() + 1;
              } else {
                  // Fallback: simple numeric extraction for "MM/DD"
                  // But avoid year inputs like "2026/01/01" -> 2026
                  // Look for pattern digit+separator+digit
                  const parts = bdayStr.match(/(\d+)[/.-](\d+)/);
                  if (parts) {
                      bMonth = parseInt(parts[1], 10);
                  } else {
                      // Last resort, just first digit
                      const matches = bdayStr.match(/\d+/);
                      if (matches) {
                          bMonth = parseInt(matches[0], 10);
                      }
                  }
              }
            }
            
            if (bMonth > 0 && bMonth === parseInt(month, 10)) {
                isBirthdayMonth = true;
            }
            break;
        }
    }

    return { config, summary, dailyData, dailyRecords, isBirthdayMonth, totalSpecialLeaveUsed, _gsVersion: 'V_VOID_FIXED_494' };
}

/**
 * [Service] 儲存每日記錄 (休假/盤點損失)
 */
function saveDailyRecordService(payload, user) {
    // 權限檢查：只有 BOSS 可以編輯每日紀錄
    if (user.role !== 'BOSS') {
        throw new Error('權限不足：您沒有權限編輯出勤紀錄');
    }

    const { date, username, type, value, note } = payload;
    const sheet = initPayrollSheet_('Daily_Records', ['Date', 'Username', 'Type', 'Value', 'Note', 'Timestamp']);
    const data = sheet.getDataRange().getValues();
    const targetDateStr = Utilities.formatDate(new Date(date), "GMT+8", "yyyy-MM-dd");
    let foundRow = -1;
    
    // Fix: Search only not by Type to avoid duplicate entries for the same day
    for (let i = 1; i < data.length; i++) {
        const dStr = Utilities.formatDate(new Date(data[i][0]), "GMT+8", "yyyy-MM-dd");
        if (dStr === targetDateStr && data[i][1] === username) {
            foundRow = i + 1;
            break;
        }
    }

    if (foundRow > 0) {
        // Update existing row
        sheet.getRange(foundRow, 3, 1, 4).setValues([[type, value, note, new Date()]]);
    } else {
        // Create new row
        sheet.appendRow([new Date(date), username, type, value, note, new Date()]);
    }
    return { success: true };
}

/**
 * [Service] 取得員工類型 (輕量查詢，供銷售頁面決定是否顯示工時輸入欄)
 * 任何登入的員工都可以查詢自己的類型
 */
function getEmpTypeService(payload, user) {
    const targetUser = payload.targetUser || user.username;
    const sheet = initPayrollSheet_('Payroll_Settings', ['Username', 'BaseSalary', 'AttendanceBonus', 'Insurance', 'OffDaysStandard', 'BonusTiersJson', 'EmpType', 'HourlyWage']);
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
        if (String(data[i][0]).trim() === String(targetUser).trim()) {
            return { empType: String(data[i][6] || 'FULL_TIME') };
        }
    }
    return { empType: 'FULL_TIME' }; // 預設正職
}

/**
 * [Service] 儲存薪資參數設定
 */
function savePayrollSettingsService(payload, user) {
    // 權限檢查：只有 BOSS 可以修改設定
    if (user.role !== 'BOSS') {
        throw new Error('權限不足：您沒有權限修改薪資設定');
    }

    const { targetUser, baseSalary, attendanceBonus, insurance, monthlyOffDays, bonusTiers, empType, hourlyWage, commissionRate } = payload;
    const sheet = initPayrollSheet_('Payroll_Settings', ['Username', 'BaseSalary', 'AttendanceBonus', 'Insurance', 'OffDaysStandard', 'BonusTiersJson', 'EmpType', 'HourlyWage', 'CommissionRate']);
    const data = sheet.getDataRange().getValues();
    let foundRow = -1;
    for (let i = 1; i < data.length; i++) {
        if (data[i][0] === targetUser) {
            foundRow = i + 1;
            break;
        }
    }
    const finalEmpType = empType || 'FULL_TIME';
    const finalHourlyWage = Number(hourlyWage) || 0;
    const finalCommissionRate = Number(commissionRate) || 0; // 儲存為小數 (0.005 = 0.5%)
    const rowValue = [targetUser, baseSalary, attendanceBonus, insurance, monthlyOffDays, JSON.stringify(bonusTiers), finalEmpType, finalHourlyWage, finalCommissionRate];
    if (foundRow > 0) {
        sheet.getRange(foundRow, 1, 1, 9).setValues([rowValue]);
    } else {
        sheet.appendRow(rowValue);
    }
    return { success: true };
}

/**
 * [Service] 獲取員工基本資料與年資試算
 */
function getEmployeeProfileService(payload, user) {
    const { targetUser } = payload;
    
    // 權限檢查：只有 BOSS 可以查詢他人資料
    const isAdmin = user.role === 'BOSS';
    const isOwner = String(targetUser || '').trim() === String(user.username || '').trim();
    if (!isAdmin && !isOwner) {
        throw new Error('權限不足：您只能查詢自己的基本資料');
    }

    const sheet = initPayrollSheet_('Employee_Profiles', ['Username', 'JoinedDate', 'Birthday', 'IdentityID', 'Contact', 'Note']);
    const data = sheet.getDataRange().getValues();
    let profile = { username: targetUser, joinedDate: '', birthday: '', identityId: '', contact: '', note: '' };
    
    for (let i = 1; i < data.length; i++) {
        if (data[i][0] === targetUser) {
            profile = {
                username: data[i][0],
                joinedDate: data[i][1] ? Utilities.formatDate(new Date(data[i][1]), "GMT+8", "yyyy-MM-dd") : '',
                birthday: data[i][2] ? String(data[i][2]) : '',
                identityId: data[i][3] ? String(data[i][3]) : '',
                contact: data[i][4] ? String(data[i][4]) : '',
                note: data[i][5] ? String(data[i][5]) : ''
            };
            break;
        }
    }

    // 計算年資與特休
    const seniorityInfo = calculateSeniorityAndLeave_(profile.joinedDate);

    return { profile, ...seniorityInfo };
}

/**
 * [Service] 儲存員工基本資料
 */
function saveEmployeeProfileService(payload, user) {
    // 權限檢查：只有 BOSS 可以修改基本資料
    if (user.role !== 'BOSS') {
        throw new Error('權限不足：您沒有權限修改基本資料');
    }

    const { username, joinedDate, birthday, identityId, contact, note } = payload;
    const sheet = initPayrollSheet_('Employee_Profiles', ['Username', 'JoinedDate', 'Birthday', 'IdentityID', 'Contact', 'Note']);
    const data = sheet.getDataRange().getValues();
    let foundRow = -1;
    
    for (let i = 1; i < data.length; i++) {
        if (data[i][0] === username) {
            foundRow = i + 1;
            break;
        }
    }

    const rowValue = [username, joinedDate, birthday, identityId, contact, note];
    if (foundRow > 0) {
        sheet.getRange(foundRow, 1, 1, 6).setValues([rowValue]);
    } else {
        sheet.appendRow(rowValue);
    }
    return { success: true };
}

/**
 * [Helper] 即時試算年資與特休天數
 */
function calculateSeniorityAndLeave_(joinedDateStr) {
    if (!joinedDateStr) return { seniorityText: '資料未設定', estimatedLeaveDays: 0 };
    
    const joined = new Date(joinedDateStr);
    const today = new Date();
    
    // 計算差異
    let diffMs = today - joined;
    if (diffMs < 0) return { seniorityText: '尚未到職', estimatedLeaveDays: 0 };

    // 換算年月日 (簡單估算)
    let totalMonths = (today.getFullYear() - joined.getFullYear()) * 12 + (today.getMonth() - joined.getMonth());
    if (today.getDate() < joined.getDate()) totalMonths--;

    const years = Math.floor(totalMonths / 12);
    const months = totalMonths % 12;

    let seniorityText = "";
    if (years > 0) seniorityText += years + " 年 ";
    if (months > 0) seniorityText += months + " 個月";
    if (!seniorityText) seniorityText = "未滿 1 個月";

    // 勞基法特休天數映射 (年資滿額)
    let leaveDays = 0;
    const yFloat = totalMonths / 12;

    if (yFloat >= 0.5 && yFloat < 1) leaveDays = 3;
    else if (yFloat >= 1 && yFloat < 2) leaveDays = 7;
    else if (yFloat >= 2 && yFloat < 3) leaveDays = 10;
    else if (yFloat >= 3 && yFloat < 5) leaveDays = 14;
    else if (yFloat >= 5 && yFloat < 10) leaveDays = 15;
    else if (yFloat >= 10) {
        leaveDays = 15 + Math.min(15, Math.floor(yFloat - 10) + 1); // 每年加1天，上限30天
    }

    return { seniorityText, estimatedLeaveDays: leaveDays };
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

/**
 * [Service] 將薪資存檔至 Expenditures (薪資發放欄位)
 */
function savePayrollToExpenditureService(payload, user) {
    // 權限檢查：只有 BOSS 可以存檔薪資
    if (user.role !== 'BOSS') {
        throw new Error('權限不足：只有管理員可以存檔薪資');
    }

    const { targetUser, year, month, finalSalary } = payload;
    
    if (!targetUser || !year || !month || finalSalary === undefined) {
        throw new Error('缺少必要參數');
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const expSheet = ss.getSheetByName('Expenditures');
    
    if (!expSheet) {
        throw new Error('找不到 Expenditures 分頁');
    }

    // 建立日期 (該月份的第一天)
    const recordDate = new Date(year, month - 1, 1);
    
    // 取得現有資料
    const data = expSheet.getDataRange().getValues();
    const headers = data[0].map(h => String(h || '').trim());
    
    // 動態找尋欄位索引
    const findIndex = (keywords) => {
        return headers.findIndex(h => keywords.some(k => h.includes(k)));
    };
    
    const idxTime = findIndex(['時間', '戳記']);
    const idxRep = findIndex(['業務', '人員', 'Operator']);
    const idxSalary = findIndex(['薪資']);
    const idxTotal = findIndex(['總額', '結算', 'Total']);
    const idxCust = findIndex(['對象', '客戶', 'Customer']);
    const idxId = findIndex(['編號', 'ID']);
    const idxDate = headers.lastIndexOf('日期'); // 通常最後一欄是純日期

    // 檢查基本欄位是否存在
    if (idxSalary === -1) {
        throw new Error('Expenditures 表中找不到「薪資發放」欄位，請確認表頭設定');
    }

    const currentTimestamp = new Date();
    
    // 定義覆蓋的關鍵字 (根據使用者需求: YYYY年MM月薪資結算)
    const targetNote = year + '年' + month + '月薪資結算';
    
    // 備註欄位索引
    const idxNote = findIndex(['備註', 'Note']);
    
    // [修改] 搜尋是否已有該月份的薪資紀錄 (比對 備註 + 人員)
    // 這樣可以確保同一個月同一個人只會有一筆結算紀錄，避免重複
    let foundRowIndex = -1;
    
    if (idxNote !== -1 && idxRep !== -1) {
        for (let i = 1; i < data.length; i++) {
            const row = data[i];
            const rowNote = String(row[idxNote] || '').trim();
            const rowRep = String(row[idxRep] || '').trim();
            
            // 嚴格比對備註文字與人員名稱
            if (rowNote === targetNote && rowRep === targetUser) {
                foundRowIndex = i + 1; // 轉為 1-based index (Spreadsheet row)
                break;
            }
        }
    }

    if (foundRowIndex > 0) {
        // [覆蓋模式] 更新現有資料
        // 更新時間、薪資金額 (其餘欄位如日期若需更新也可在此加入，目前僅更新核心資訊)
        if (idxTime !== -1) expSheet.getRange(foundRowIndex, idxTime + 1).setValue(currentTimestamp);
        if (idxSalary !== -1) expSheet.getRange(foundRowIndex, idxSalary + 1).setValue(finalSalary);
        
        return { success: true, message: '已更新 ' + year + '/' + month + ' 薪資記錄 (覆蓋舊檔)' };
    } else {
        // [新增模式] 建立新的一列
        const newRow = new Array(headers.length).fill('');
        
        // 填入已知欄位
        if (idxId !== -1) newRow[idxId] = ''; // 銷售編號固定空白
        if (idxTime !== -1) newRow[idxTime] = currentTimestamp;
        if (idxCust !== -1) newRow[idxCust] = targetUser;
        if (idxRep !== -1) newRow[idxRep] = targetUser;
        if (idxSalary !== -1) newRow[idxSalary] = finalSalary;
        if (idxTotal !== -1) newRow[idxTotal] = 0; // 本筆總支出金額固定為 0
        if (idxDate !== -1) newRow[idxDate] = currentTimestamp;
        
        // 寫入關鍵備註，供下次覆蓋比對使用
        if (idxNote !== -1) newRow[idxNote] = targetNote;
    
        expSheet.appendRow(newRow);
        
        return { success: true, message: '薪資記錄已新增至 Expenditures' };
    }
}


/**
 * [診斷] 直接在 GAS 編輯器執行：
 * 選取此函數 → 點「執行」→ 看「執行記錄 (Logs)」
 */
// A1 4/3 - 最終部署確認版
// A2 4/3 - 全新 GAS ID 501 部署與 GitHub Secrets 同步版
function debugPayrollIssues() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // 1. 檢查 Daily_Records LOSS 記錄
  const recSheet = ss.getSheetByName('Daily_Records');
  if (recSheet) {
    const rows = recSheet.getDataRange().getValues();
    const lossRows = rows.filter((r, i) => i > 0 && String(r[2]).trim() === 'LOSS');
    console.log('=== Daily_Records LOSS 共 ' + lossRows.length + ' 筆 ===');
    lossRows.forEach(r => {
      console.log('  日期=' + r[0] + ' 使用者=' + r[1] + ' 值=' + r[3] + ' 備註=' + r[4]);
    });
  }

  // 2. 檢查 Sales 表 VOID 統計
  const salesSheet = ss.getSheetByName('Sales');
  if (salesSheet) {
    const sRows = salesSheet.getDataRange().getValues();
    let voidCount = 0, nonVoidCount = 0;
    sRows.slice(1).forEach(row => {
      let isVoid = false;
      for (let c = 0; c < row.length; c++) {
        const t = String(row[c] || '').trim().toUpperCase();
        if (t === 'VOID' || t.includes('[VOID]')) { isVoid = true; break; }
      }
      isVoid ? voidCount++ : nonVoidCount++;
    });
    console.log('=== Sales：VOID 行=' + voidCount + '，正常行=' + nonVoidCount + ' ===');
  }

  // 3. 印出 Sales Headers 確認欄位
  if (salesSheet) {
    const hdrs = salesSheet.getRange(1, 1, 1, salesSheet.getLastColumn()).getValues()[0];
    console.log('=== Sales Headers ===');
    hdrs.forEach((h, i) => console.log('  [' + i + '] ' + h));
  }
}
