/**
 * Service_Payroll_Details.gs
 * [Service] 員工基本資料、年資與薪資存檔至支出
 */

function getEmployeeProfileService(payload, user) {
    const { targetUser } = payload;
    const isAdmin = user.role === 'BOSS';
    const isOwner = String(targetUser || '').trim() === String(user.username || '').trim();
    if (!isAdmin && !isOwner) throw new Error('權限不足');

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
    return { profile, ...calculateSeniorityAndLeave_(profile.joinedDate) };
}

function saveEmployeeProfileService(payload, user) {
    if (user.role !== 'BOSS') throw new Error('權限不足');
    const { username, joinedDate, birthday, identityId, contact, note } = payload;
    const sheet = initPayrollSheet_('Employee_Profiles', ['Username', 'JoinedDate', 'Birthday', 'IdentityID', 'Contact', 'Note']);
    const data = sheet.getDataRange().getValues();
    let foundRow = -1;
    for (let i = 1; i < data.length; i++) {
        if (data[i][0] === username) { foundRow = i + 1; break; }
    }
    const rowValue = [username, joinedDate, birthday, identityId, contact, note];
    if (foundRow > 0) sheet.getRange(foundRow, 1, 1, 6).setValues([rowValue]);
    else sheet.appendRow(rowValue);
    return { success: true };
}

function savePayrollToExpenditureService(payload, user) {
    if (user.role !== 'BOSS') throw new Error('權限不足');
    const { targetUser, year, month, finalSalary } = payload;
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const expSheet = ss.getSheetByName('Expenditures');
    if (!expSheet) throw new Error('找不到 Expenditures 分頁');

    const targetNote = year + '年' + month + '月薪資結算';
    const data = expSheet.getDataRange().getValues();
    const headers = data[0].map(h => String(h || '').trim());
    const idxRep = headers.findIndex(h => h.includes('業務') || h.includes('人員'));
    const idxSalary = headers.findIndex(h => h.includes('薪資'));
    const idxNote = headers.findIndex(h => h.includes('備註'));

    let foundRowIndex = -1;
    for (let i = 1; i < data.length; i++) {
        if (String(data[i][idxNote] || '').trim() === targetNote && String(data[i][idxRep] || '').trim() === targetUser) {
            foundRowIndex = i + 1; break;
        }
    }

    if (foundRowIndex > 0) {
        expSheet.getRange(foundRowIndex, idxSalary + 1).setValue(finalSalary);
        return { success: true, message: '已更新薪資結算' };
    } else {
        const newRow = new Array(headers.length).fill('');
        newRow[headers.findIndex(h => h.includes('時間'))] = new Date();
        newRow[headers.findIndex(h => h.includes('對象'))] = targetUser;
        newRow[idxRep] = targetUser;
        newRow[idxSalary] = finalSalary;
        newRow[idxNote] = targetNote;
        expSheet.appendRow(newRow);
        return { success: true, message: '薪資記錄已新增' };
    }
}
