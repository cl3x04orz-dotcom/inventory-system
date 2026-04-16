/**
 * Sales_Analytics.gs
 * 客戶數據深度對比分析 (RFM & Comparison)
 */

/**
 * 針對特定銷售對象獲取深度數據分析 (支援週、月、年對比及 RFM 指標)
 * @param {Object} payload { customer, baseStart, baseEnd, compStart, compEnd, mode }
 */
function getCustomerAnalyticsService(payload) {
    const { customer, baseStart, baseEnd, compStart, compEnd, mode } = payload;
    if (!customer) throw new Error("未選取銷售對象");
    
    let bStart = baseStart ? new Date(baseStart) : null;
    let bEnd = baseEnd ? new Date(baseEnd) : null;
    let cStart = compStart ? new Date(compStart) : null;
    let cEnd = compEnd ? new Date(compEnd) : null;

    if (bEnd) bEnd.setHours(23, 59, 59, 999);
    if (cEnd) cEnd.setHours(23, 59, 59, 999);

    if (!bStart && payload.baseMonth) {
        const [y, m] = payload.baseMonth.split('-').map(Number);
        bStart = new Date(y, m - 1, 1);
        bEnd = new Date(y, m, 0, 23, 59, 59, 999);
    }
    if (!cStart && payload.compareMonth) {
        const [y, m] = payload.compareMonth.split('-').map(Number);
        cStart = new Date(y, m - 1, 1);
        cEnd = new Date(y, m, 0, 23, 59, 59, 999);
    }

    if (!bStart || !bEnd || !cStart || !cEnd) throw new Error("日期區間參數缺失");

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const salesSheet = ss.getSheetByName('Sales');
    const detailsSheet = ss.getSheetByName('SalesDetails');
    
    if (!salesSheet || !detailsSheet) {
        throw new Error("系統工作表 (Sales/SalesDetails) 缺失");
    }

    const products = {};
    const productOrder = {};
    const productValues = ss.getSheetByName('Products')?.getDataRange().getValues() || [];
    if (productValues.length > 1) {
        const h = productValues[0].map(v => String(v || '').trim().toLowerCase());
        const pidIdx = h.findIndex(v => v.includes('id') || v.includes('序號') || v.includes('uuid'));
        const nameIdx = h.findIndex(v => v.includes('名稱') || v.includes('name') || v.includes('品項') || v.includes('品名') || v.includes('product'));
        let weightIdx = h.indexOf('排序權重');
        if (weightIdx === -1) weightIdx = h.indexOf('sortweight');
        if (weightIdx === -1) weightIdx = 6; 

        for (let i = 1; i < productValues.length; i++) {
            const pid = pidIdx !== -1 ? String(productValues[i][pidIdx] || "").trim() : "";
            if (pid) {
                products[pid] = nameIdx !== -1 ? String(productValues[i][nameIdx] || "").trim() : pid;
                const weight = productValues[i][weightIdx];
                productOrder[pid] = (weight !== "" && weight !== null && !isNaN(weight)) ? Number(weight) : 99999 + i;
            }
        }
    }

    const salesRows = salesSheet.getDataRange().getValues();
    const detailRows = detailsSheet.getDataRange().getValues();

    if (salesRows.length < 2) return { error: "暫無銷售紀錄" };

    let lastPurchaseDay = null;

    const getRangeStats = (start, end) => {
        const stats = { revenue: 0, transactions: 0, returns: 0, products: {} };
        const matchedIds = new Set();
        
        for (let i = 1; i < salesRows.length; i++) {
            const rowDate = salesRows[i][1];
            if (!(rowDate instanceof Date)) continue;

            const rowCust = String(salesRows[i][6] || '').trim();
            const status = String(salesRows[i][9] || '').toUpperCase();

            if (status !== 'VOID' && rowCust === customer) {
                if (!lastPurchaseDay || rowDate > lastPurchaseDay) lastPurchaseDay = rowDate;

                if (rowDate >= start && rowDate <= end) {
                    matchedIds.add(String(salesRows[i][0]));
                    stats.transactions++;
                }
            }
        }

        const productStats = {};
        for (let i = 1; i < detailRows.length; i++) {
            const saleId = String(detailRows[i][0]);
            if (matchedIds.has(saleId)) {
                const pId = String(detailRows[i][1]);
                const returns = Number(detailRows[i][4] || 0);
                const sold = Number(detailRows[i][5] || 0);
                const amount = Number(detailRows[i][7] || 0);

                stats.revenue += amount;
                stats.returns += returns;

                if (!productStats[pId]) productStats[pId] = { qty: 0, amount: 0 };
                productStats[pId].qty += sold;
                productStats[pId].amount += amount;
            }
        }
        stats.products = productStats;
        return stats;
    };

    try {
        const baseStats = getRangeStats(bStart, bEnd);
        const compStats = getRangeStats(cStart, cEnd);

        const productDiff = [];
        const allPIds = new Set([...Object.keys(baseStats.products), ...Object.keys(compStats.products)]);
        
        allPIds.forEach(pId => {
            const base = baseStats.products[pId] || { qty: 0, amount: 0 };
            const comp = compStats.products[pId] || { qty: 0, amount: 0 };
            const diffQty = base.qty - comp.qty;
            
            productDiff.push({
                pId,
                pName: products[pId] || pId,
                baseQty: base.qty,
                compQty: comp.qty,
                diffQty: diffQty,
                diffPercent: comp.qty > 0 ? (diffQty / comp.qty) * 100 : (base.qty > 0 ? 100 : 0),
                order: productOrder[pId] || 9999
            });
        });

        let recencyDays = -1;
        if (lastPurchaseDay) {
            const now = new Date();
            recencyDays = Math.floor((now - lastPurchaseDay) / (1000 * 60 * 60 * 24));
        }

        return {
            customer,
            mode,
            baseRange: { start: bStart, end: bEnd },
            compRange: { start: cStart, end: cEnd },
            recencyDays,
            kpi: {
                revenue: {
                    current: baseStats.revenue,
                    previous: compStats.revenue,
                    growth: compStats.revenue > 0 ? ((baseStats.revenue - compStats.revenue) / compStats.revenue) * 100 : (baseStats.revenue > 0 ? 100 : 0)
                },
                transactions: {
                    current: baseStats.transactions,
                    previous: compStats.transactions,
                    growth: compStats.transactions > 0 ? (baseStats.transactions - compStats.transactions) : 0
                },
                returns: {
                    current: baseStats.returns,
                    previous: compStats.returns,
                    diff: baseStats.returns - compStats.returns
                }
            },
            productTrends: productDiff
        };
    } catch (e) {
        throw new Error("分析統計過程出錯: " + e.message);
    }
}
