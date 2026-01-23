/**
 * Helper_Payroll_Commons.gs
 * [Helper] 薪資模組共用邏輯 (初始化分頁、年資試算)
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

function calculateSeniorityAndLeave_(joinedDateStr) {
    if (!joinedDateStr) return { seniorityText: '資料未設定', estimatedLeaveDays: 0 };
    const joined = new Date(joinedDateStr);
    const today = new Date();
    let totalMonths = (today.getFullYear() - joined.getFullYear()) * 12 + (today.getMonth() - joined.getMonth());
    if (today.getDate() < joined.getDate()) totalMonths--;

    const years = Math.floor(totalMonths / 12);
    const months = totalMonths % 12;
    let seniorityText = (years > 0 ? years + " 年 " : "") + (months > 0 ? months + " 個月" : "");
    if (!seniorityText) seniorityText = "未滿 1 個月";

    let leaveDays = 0;
    const yFloat = totalMonths / 12;
    if (yFloat >= 0.5 && yFloat < 1) leaveDays = 3;
    else if (yFloat >= 1 && yFloat < 2) leaveDays = 7;
    else if (yFloat >= 2 && yFloat < 3) leaveDays = 10;
    else if (yFloat >= 3 && yFloat < 5) leaveDays = 14;
    else if (yFloat >= 5 && yFloat < 10) leaveDays = 15;
    else if (yFloat >= 10) leaveDays = 15 + Math.min(15, Math.floor(yFloat - 10) + 1);

    return { seniorityText, estimatedLeaveDays: leaveDays };
}
