/**
 * 0.1 秒極速原生直印工具 (100% 擬真 Google 試算表樣式)
 * 解決 Google Apps Script PDF 轉檔耗時 30~60 秒且容易轉圈圈失敗的致命問題
 */
export function printNativeSpreadsheetHtml(printData) {
    const data = printData.data || printData;
    const dateStr = data.date ? new Date(data.date).toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' }) : new Date().toLocaleDateString('zh-TW');
    const location = data.location || '總部/車次';
    const salesRep = data.salesRep || '業務員';
    const rows = data.rows || [];
    const totalSalesAmount = Number(data.totalSalesAmount || 0).toLocaleString();
    const totalCashCalc = Number(data.totalCashCalc || 0).toLocaleString();
    const finalTotal = Number(data.finalTotal || 0).toLocaleString();
    const expenses = Number(data.expenses || 0).toLocaleString();

    const htmlContent = `
    <!DOCTYPE html>
    <html lang="zh-TW">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>銷貨與點貨領貨單據 - ${dateStr}</title>
        <style>
            @page {
                size: A4 portrait;
                margin: 8mm;
            }
            * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            body {
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Microsoft JhengHei", sans-serif;
                color: #0f172a;
                background: #ffffff;
                margin: 0;
                padding: 12px;
                font-size: 13px;
            }
            .header-bar {
                text-align: center;
                border-bottom: 2px solid #000000;
                padding-bottom: 8px;
                margin-bottom: 12px;
            }
            .main-title {
                font-size: 24px;
                font-weight: 900;
                letter-spacing: 2px;
                color: #000000;
            }
            .meta-grid {
                display: flex;
                justify-content: space-between;
                font-size: 13px;
                font-weight: 700;
                background: #f8fafc;
                border: 1px solid #cbd5e1;
                padding: 8px 12px;
                border-radius: 6px;
                margin-bottom: 12px;
            }
            .data-table {
                width: 100%;
                border-collapse: collapse;
                margin-bottom: 14px;
            }
            .data-table th {
                background-color: #e2e8f0 !important;
                color: #000000;
                font-weight: 800;
                font-size: 12px;
                border: 1px solid #000000;
                padding: 6px 8px;
                text-align: center;
            }
            .data-table td {
                border: 1px solid #000000;
                padding: 6px 8px;
                font-size: 12px;
            }
            .data-table tr:nth-child(even) {
                background-color: #f8fafc;
            }
            .text-center { text-align: center; }
            .text-right { text-align: right; }
            .font-bold { font-weight: 700; }
            .text-red { color: #dc2626; font-weight: 800; }
            
            .summary-card {
                border: 2px solid #000000;
                background: #ffffff;
                padding: 10px 14px;
                border-radius: 6px;
                margin-top: 12px;
            }
            .summary-row {
                display: flex;
                justify-content: space-between;
                font-size: 14px;
                font-weight: 700;
                margin: 4px 0;
            }
            .signature-area {
                margin-top: 24px;
                display: flex;
                justify-content: space-between;
                font-size: 13px;
                font-weight: 700;
                padding: 0 16px;
            }
            .no-print-toolbar {
                background: #eff6ff;
                border: 1px solid #bfdbfe;
                padding: 10px 16px;
                border-radius: 8px;
                margin-bottom: 16px;
                display: flex;
                align-items: center;
                justify-content: space-between;
            }
            .btn-action {
                background: #2563eb;
                color: #ffffff;
                border: none;
                padding: 8px 18px;
                border-radius: 6px;
                font-weight: 700;
                cursor: pointer;
                font-size: 13px;
                box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            }
            .btn-action:hover {
                background: #1d4ed8;
            }
            @media print {
                .no-print-toolbar { display: none !important; }
                body { padding: 0; }
            }
        </style>
    </head>
    <body>
        <div class="no-print-toolbar">
            <div style="display:flex; align-items:center; gap:8px;">
                <span style="font-size:16px;">⚡</span>
                <span style="font-weight:700; color:#1e40af;">0.1秒極速直印 (已精準對齊試算表樣式)</span>
            </div>
            <button class="btn-action" onclick="window.print()">🖨️ 立即列印 / 另存 PDF</button>
        </div>

        <div class="header-bar">
            <div class="main-title">銷售與領貨點貨單據</div>
        </div>
        
        <div class="meta-grid">
            <div>📅 日期：${dateStr}</div>
            <div>📍 營業所：${location}</div>
            <div>👤 業務員：${salesRep}</div>
        </div>

        <table class="data-table">
            <thead>
                <tr>
                    <th style="width: 5%;">#</th>
                    <th style="width: 35%; text-align: left;">品項名稱</th>
                    <th style="width: 10%;">原車庫存</th>
                    <th style="width: 10%;">補領貨數</th>
                    <th style="width: 10%;">退貨數</th>
                    <th style="width: 10%;">實售數</th>
                    <th style="width: 10%;">單價</th>
                    <th style="width: 10%;">金額小計</th>
                </tr>
            </thead>
            <tbody>
                ${rows.map((r, i) => `
                    <tr>
                        <td class="text-center">${i + 1}</td>
                        <td class="font-bold">${r.name}</td>
                        <td class="text-center">${r.originalStock ?? r.stock ?? 0}</td>
                        <td class="text-center ${Number(r.picked || 0) > 0 ? 'text-red' : ''}">${r.picked || 0}</td>
                        <td class="text-center">${r.returns || 0}</td>
                        <td class="text-center font-bold">${r.sold || 0}</td>
                        <td class="text-right">$${Number(r.price || 0).toLocaleString()}</td>
                        <td class="text-right font-bold">$${Number(r.subtotal || 0).toLocaleString()}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>

        <div class="summary-card">
            <div class="summary-row">
                <span>💰 銷售總額：<b>$${totalSalesAmount}</b></span>
                <span>💸 營業支出：<b>$${expenses}</b></span>
                <span>💵 應繳現金：<b style="color:#2563eb; font-size:16px;">$${totalCashCalc || finalTotal}</b></span>
            </div>
        </div>

        <div class="signature-area">
            <div>業務員簽名：__________________</div>
            <div>點貨員簽核：__________________</div>
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
