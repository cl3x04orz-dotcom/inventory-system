import { safeLocalStorage } from './storage';

export function printNativeSpreadsheetHtml(printData, customConfig = null) {
    let config = customConfig;
    if (!config) {
        const saved = safeLocalStorage.getItem('print_template_config');
        if (saved) {
            try {
                config = JSON.parse(saved);
            } catch (e) {
                console.error(e);
            }
        }
    }
    config = config || {};
    const baseFontSize = config.fontSize || 15;
    const isTwoColumns = config.layout !== 'single_column';
    const showExpenses = config.showExpenses !== false;
    const showCash = config.showCash !== false;
    const showSignatures = config.showSignatures !== false;

    const data = printData.data || printData;
    const dateStr = data.date ? new Date(data.date).toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' }) : new Date().toLocaleDateString('zh-TW');
    const location = data.location || '總部/車次';
    const salesRep = data.salesRep || '業務員';
    const rows = data.rows || [];

    const totalSalesAmount = Number(data.totalSalesAmount || 0).toLocaleString();
    const totalCashCalc = Number(data.totalCashCalc || 0).toLocaleString();
    const finalTotal = Number(data.finalTotal || 0).toLocaleString();
    const reserve = Number(data.reserve || 0).toLocaleString();

    // 解析詳細支出項目 (攤位、清潔、電費、其他)
    const expObj = typeof data.expenses === 'object' && data.expenses !== null ? data.expenses : {};
    const expStall = Number(expObj.stall || 0).toLocaleString();
    const expCleaning = Number(expObj.cleaning || 0).toLocaleString();
    const expElectricity = Number(expObj.electricity || 0).toLocaleString();
    const expOthers = Number(expObj.others || 0).toLocaleString();
    const totalExpenses = Number(
        typeof data.expenses === 'number' ? data.expenses : (Number(expObj.stall || 0) + Number(expObj.cleaning || 0) + Number(expObj.electricity || 0) + Number(expObj.others || 0))
    ).toLocaleString();

    const globalCtx = { dateStr, location, salesRep, totalSalesAmount, totalCashCalc, finalTotal, reserve, totalExpenses };

    const parseVariables = (str, ctx = {}, row = {}) => {
        if (!str) return '';
        return str
            .replace(/\{\{date\}\}/g, ctx.dateStr || '')
            .replace(/\{\{location\}\}/g, ctx.location || '')
            .replace(/\{\{salesRep\}\}/g, ctx.salesRep || '')
            .replace(/\{\{totalSalesAmount\}\}/g, ctx.totalSalesAmount || '')
            .replace(/\{\{totalCashCalc\}\}/g, ctx.totalCashCalc || '')
            .replace(/\{\{reserve\}\}/g, ctx.reserve || '')
            .replace(/\{\{totalExpenses\}\}/g, ctx.totalExpenses || '')
            .replace(/\{\{\#\}\}/g, row.idx !== undefined ? String(row.idx) : '')
            .replace(/\{\{product_name\}\}/g, row.name !== undefined ? String(row.name) : '')
            .replace(/\{\{stock\}\}/g, row.stock ? String(row.stock) : '')
            .replace(/\{\{picked\}\}/g, row.picked ? String(row.picked) : '')
            .replace(/\{\{returns\}\}/g, row.returns ? String(row.returns) : '')
            .replace(/\{\{sold\}\}/g, row.sold ? String(row.sold) : '')
            .replace(/\{\{price\}\}/g, row.price ? Number(row.price).toLocaleString() : '')
            .replace(/\{\{subtotal\}\}/g, '');
    };

    const title = parseVariables(config.title || '銷售與領貨點貨單據', globalCtx);

    let leftRows = rows;
    let rightRows = [];

    if (isTwoColumns) {
        const mid = Math.ceil(rows.length / 2);
        leftRows = rows.slice(0, mid);
        rightRows = rows.slice(mid);
    }

    // 預設與自訂欄位設定
    const defaultCols = [
        { id: 'idx', key: 'idx', label: '編號', width: 6, align: 'center', visible: true },
        { id: 'name', key: 'name', label: '品項', width: 34, align: 'left', visible: true },
        { id: 'stock', key: 'stock', label: '原庫存', width: 12, align: 'center', visible: true },
        { id: 'picked', key: 'picked', label: '領貨數', width: 14, align: 'center', visible: true },
        { id: 'returns', key: 'returns', label: '退貨數', width: 12, align: 'center', visible: true },
        { id: 'sold', key: 'sold', label: '實售數', width: 12, align: 'center', visible: true },
        { id: 'price', key: 'price', label: '單價', width: 10, align: 'right', visible: false },
        { id: 'subtotal', key: 'subtotal', label: '應繳金', width: 12, align: 'right', visible: false }
    ];

    const sanitizeHeaderLabel = (label) => {
        if (!label) return '';
        const clean = label.replace(/\(\{\{.*?\}\}\)/g, '').replace(/\{\{.*?\}\}/g, '').trim();
        if (clean === '小計') return '應繳金';
        if (clean === '補領貨') return '領貨數';
        if (clean === '{{#}}' || clean === '#') return '編號';
        if (clean === '{{product_name}}') return '品項';
        return clean || label;
    };

    const columns = (config.columns && config.columns.length > 0 ? config.columns : defaultCols)
        .filter(c => c.visible !== false)
        .map(c => ({
            ...c,
            label: sanitizeHeaderLabel(c.label)
        }));

    const formatNumberVal = (num) => {
        const val = Number(num || 0);
        if (val === 0 || isNaN(val)) return '';
        if (Number.isInteger(val)) return val.toLocaleString();
        // 小數點只呈現 1 位 (如 11.667 -> 11.6)
        const truncated = Math.floor(val * 10) / 10;
        return truncated.toString();
    };

    const getCellValue = (r, key, idx) => {
        if (key === 'idx') return idx + 1;
        if (key === 'name') return r.name || '';
        if (key === 'subtotal') return ''; // 應繳金直接空白

        if (key === 'stock') {
            const raw = r.originalStock ?? r.stock;
            if (typeof raw === 'string' && raw.trim() !== '') return raw;
            return formatNumberVal(raw);
        }
        if (key === 'picked') {
            const raw = r.picked;
            if (typeof raw === 'string' && raw.trim() !== '') return raw;
            return formatNumberVal(raw);
        }
        if (key === 'returns') {
            const raw = r.returns;
            if (typeof raw === 'string' && raw.trim() !== '') return raw;
            return formatNumberVal(raw);
        }
        if (key === 'sold') {
            const raw = r.sold;
            if (typeof raw === 'string' && raw.trim() !== '') return raw;
            return formatNumberVal(raw);
        }
        if (key === 'price') {
            const raw = r.price;
            if (typeof raw === 'string' && raw.trim() !== '') return raw;
            return formatNumberVal(raw);
        }
        return '';
    };

    const nameFontSize = config.nameFontSize || baseFontSize;

    const renderTableHalf = (items, startIndex) => `
        <table class="data-table">
            <colgroup>
                ${columns.map(c => `<col style="width: ${c.width}%;" />`).join('')}
            </colgroup>
            <thead>
                <tr>
                    ${columns.map(c => {
                        const headerText = sanitizeHeaderLabel(c.label);
                        return `<th style="width: ${c.width}%; text-align: ${c.align || 'center'};">${headerText}</th>`;
                    }).join('')}
                </tr>
            </thead>
            <tbody>
                ${items.map((r, i) => `
                    <tr>
                        ${columns.map(c => {
                            const colKey = c.id || c.key;
                            const val = getCellValue(r, colKey, startIndex + i);
                            const isPicked = colKey === 'picked' && Number(r.picked || 0) > 0;
                            const isName = colKey === 'name';
                            const alignClass = c.align === 'left' ? 'text-left' : c.align === 'right' ? 'text-right' : 'text-center';
                            const extraClass = isPicked ? 'text-red font-black' : (isName ? 'font-black text-truncate' : 'font-bold');
                            const customStyle = isName ? `font-size: ${nameFontSize}px; line-height: 1.2;` : '';
                            return `<td class="${alignClass} ${extraClass}" ${customStyle ? `style="${customStyle}"` : ''}>${val}</td>`;
                        }).join('')}
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;

    const htmlContent = `
    <!DOCTYPE html>
    <html lang="zh-TW">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${title} - ${dateStr}</title>
        <style>
            @page {
                size: A4 portrait;
                margin: 4mm;
            }
            * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            html, body {
                height: 100%;
                margin: 0;
                padding: 0;
                background: #ffffff;
                color: #0f172a;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Microsoft JhengHei", sans-serif;
                font-size: ${baseFontSize}px;
                page-break-inside: avoid;
            }
            .print-wrapper {
                padding: 6px;
                page-break-inside: avoid;
            }
            .header-bar {
                text-align: center;
                border-bottom: 2px solid #000000;
                padding-bottom: 4px;
                margin-bottom: 6px;
            }
            .main-title {
                font-size: ${baseFontSize + 6}px;
                font-weight: 900;
                letter-spacing: 1px;
                color: #000000;
            }
            .meta-grid {
                display: flex;
                justify-content: space-between;
                font-size: ${baseFontSize - 1}px;
                font-weight: 700;
                background: #f8fafc;
                border: 1px solid #000000;
                padding: 4px 8px;
                border-radius: 4px;
                margin-bottom: 6px;
            }
            
            .columns-container {
                display: flex;
                gap: 8px;
                width: 100%;
            }
            .column-half {
                flex: 1;
                width: ${isTwoColumns ? '50%' : '100%'};
            }

            .data-table {
                width: 100%;
                table-layout: fixed; /* 🔒 100% 嚴格固死欄寬，絕對不因文字過長而自動拉寬或縮小框框 */
                border-collapse: collapse;
                margin-bottom: 4px;
                page-break-inside: avoid;
            }
            .data-table th, .data-table td {
                overflow: hidden;
                text-overflow: clip; /* ❌ 100% 絕對不使用 ... 刪節號 */
                white-space: nowrap; /* ❌ 100% 絕對不換行 */
                word-break: keep-all;
            }
            .data-table th {
                background-color: #e2e8f0 !important;
                color: #000000;
                font-weight: 800;
                font-size: ${baseFontSize - 2}px;
                border: 1px solid #000000;
                padding: 2.5px 4px;
                text-align: center;
            }
            .data-table td {
                border: 1px solid #000000;
                padding: 2.5px 4px;
                font-size: ${baseFontSize - 2}px;
            }
            .data-table tr:nth-child(even) {
                background-color: #f8fafc;
            }
            .text-center { text-align: center; }
            .text-right { text-align: right; }
            .font-bold { font-weight: 700; }
            .font-black { font-weight: 900; }
            .text-red { color: #dc2626; }
            .text-truncate {
                white-space: nowrap; /* ❌ 絕對不換行 */
                overflow: hidden;
                text-overflow: clip; /* ❌ 絕對不顯示 ... */
            }
            
            .summary-card {
                border: 2px solid #000000;
                background: #ffffff;
                padding: 6px 10px;
                border-radius: 4px;
                margin-top: 4px;
                page-break-inside: avoid;
            }
            .summary-grid {
                display: grid;
                grid-template-columns: repeat(2, 1fr);
                gap: 4px;
                font-size: ${baseFontSize - 1}px;
                font-weight: 700;
            }
            .expense-detail {
                font-size: ${baseFontSize - 3}px;
                color: #475569;
                margin-top: 2px;
            }
            .signature-area {
                margin-top: 10px;
                display: flex;
                justify-content: space-between;
                font-size: ${baseFontSize - 1}px;
                font-weight: 700;
                padding: 0 12px;
                page-break-inside: avoid;
            }
            .no-print-toolbar {
                background: #eff6ff;
                border: 1px solid #bfdbfe;
                padding: 6px 12px;
                border-radius: 8px;
                margin-bottom: 8px;
                display: flex;
                align-items: center;
                justify-content: space-between;
            }
            .btn-action {
                background: #2563eb;
                color: #ffffff;
                border: none;
                padding: 5px 14px;
                border-radius: 6px;
                font-weight: 700;
                cursor: pointer;
                font-size: 12px;
                box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            }
            @media print {
                .no-print-toolbar { display: none !important; }
                html, body { height: auto; margin: 0; padding: 0; }
                .print-wrapper { padding: 0; }
            }
        </style>
    </head>
    <body>
        <div class="no-print-toolbar">
            <div style="display:flex; align-items:center; gap:8px;">
                <span style="font-size:16px;">⚡</span>
                <span style="font-weight:700; color:#1e40af;">0.1秒極速直印 (字體: ${baseFontSize}px / ${isTwoColumns ? '雙欄' : '單欄'})</span>
            </div>
            <button class="btn-action" onclick="window.print()">🖨️ 立即列印 / 另存 PDF</button>
        </div>

        <div class="print-wrapper">
            <div class="header-bar">
                <div class="main-title">${title}</div>
            </div>
            
            <div class="meta-grid">
                <div>📅 日期：${dateStr}</div>
                <div>📍 營業所：${location}</div>
                <div>👤 業務員：${salesRep}</div>
            </div>

            <div class="columns-container">
                <div class="column-half">
                    ${renderTableHalf(leftRows, 0)}
                </div>
                ${isTwoColumns ? `
                <div class="column-half">
                    ${renderTableHalf(rightRows, leftRows.length)}
                </div>
                ` : ''}
            </div>

            <div class="summary-card">
                <div class="summary-grid">
                    <div>💰 銷售總額：<b>$${totalSalesAmount}</b></div>
                    ${showCash ? `<div>💵 應繳現金：<b style="color:#2563eb; font-size:${baseFontSize + 1}px;">$${totalCashCalc || finalTotal}</b></div>` : ''}
                    ${showExpenses ? `
                    <div>
                        💸 營業總支出：<b>$${totalExpenses}</b>
                        <div class="expense-detail">
                            (攤位:$${expStall} | 清潔:$${expCleaning} | 電費:$${expElectricity} | 其他:$${expOthers})
                        </div>
                    </div>
                    ` : ''}
                    ${showCash ? `<div>🏦 預留金：<b>$${reserve}</b></div>` : ''}
                </div>
            </div>

            ${showSignatures ? `
            <div class="signature-area">
                <div>業務員簽名：__________________</div>
                <div>點貨員簽核：__________________</div>
            </div>
            ` : ''}
        </div>

        <script>
            window.onload = function() {
                setTimeout(function() {
                    window.print();
                }, 250);
            };
        </script>
    </body>
    </html>
    `;

    const win = window.open('', '_blank');
    if (win) {
        win.document.write(htmlContent);
        win.document.close();
    } else {
        alert('請允許瀏覽器彈出視窗以進行列印！');
    }
}
