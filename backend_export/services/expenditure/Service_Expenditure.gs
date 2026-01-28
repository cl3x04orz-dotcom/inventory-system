/**
 * Service_Expenditure.gs
 * [Service] 支出查詢與存檔
 */

function getExpendituresService(payload) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Expenditures');
    if (!sheet) return { error: '找不到名為 Expenditures 的分頁' };

    const data = sheet.getDataRange().getValues();
    if (data.length < 2) return [];

    const headers = data[0];
    const rows = data.slice(1);

    const mapping = {
        "攤位": "stall", "清潔": "cleaning", "電費": "electricity", "加油": "gas",
        "停車": "parking", "貨款": "goods", "塑膠袋": "bags", "其他": "others",
        "Line Pay (收款)": "linePay", "服務費 (扣除)": "serviceFee", "本筆總支出金額": "finalTotal",
        "時間": "date", "日期": "date", "serverTimestamp": "serverTimestamp",
        "對象": "customer", "業務": "salesRep", "備註": "note",
        "薪資發放": "salary", "公積金": "reserve", "車輛保養": "vehicleMaintenance"
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
            Number(payload.stall) || 0, Number(payload.cleaning) || 0,
            Number(payload.electricity) || 0, Number(payload.gas) || 0,
            Number(payload.parking) || 0, Number(payload.goods) || 0,
            Number(payload.bags) || 0, Number(payload.others) || 0,
            Number(payload.linePay) || 0, Number(payload.serviceFee) || 0,
            payload.customer || '', 
            payload.salesRep || payload.operator || '',
            payload.note || '', 
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
