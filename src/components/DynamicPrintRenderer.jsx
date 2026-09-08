import React, { useMemo } from 'react';

const DynamicPrintRenderer = ({ layout, data }) => {
    if (!layout || !layout.grid) return null;

    const { grid } = layout;

    // 1. Flatten Data for easy lookup
    const replacements = useMemo(() => {
        const today = new Date();
        return {
            '{{date}}': `${today.getMonth() + 1}/${today.getDate()}`,
            '{{location}}': data.location || '',
            '{{sales_rep}}': data.salesRep || '',
            '{{total_sales}}': data.totalSalesAmount?.toLocaleString() || '0',
            '{{total_cash}}': data.totalCashCalc?.toLocaleString() || '0',
            '{{final_total}}': data.finalTotal?.toLocaleString() || '0',
            '{{reserve}}': data.reserve?.toLocaleString() || '0',
            // Expenses
            '{{exp_stall}}': data.expenses?.stall || '',
            '{{exp_cleaning}}': data.expenses?.cleaning || '',
            '{{exp_electricity}}': data.expenses?.electricity || '',
            '{{exp_others}}': data.expenses?.others || '',
        };
    }, [data]);

    // 2. Identify Product Row Template and detect column strategies
    let productRowIndex = -1;
    const colStrategies = []; // Array of { type: 'all'|'until'|'after'|..., target: string }

    // Helper to determine list strategy from cell value
    const getStrategy = (val) => {
        if (!val) return null;
        if (val.includes('{{product_name}}')) return { type: 'all' };
        if (val.includes('{{products_left}}')) return { type: 'left' };
        if (val.includes('{{products_right}}')) return { type: 'right' };

        const untilMatch = val.match(/\{\{products_until:(.+?)\}\}/);
        if (untilMatch) return { type: 'until', target: untilMatch[1] };

        const fromMatch = val.match(/\{\{products_from:(.+?)\}\}/);
        if (fromMatch) return { type: 'from', target: fromMatch[1] };

        const afterMatch = val.match(/\{\{products_after:(.+?)\}\}/);
        if (afterMatch) return { type: 'after', target: afterMatch[1] };

        return null;
    };

    // Scan grid to find the product row and map column strategies
    for (let r = 0; r < grid.length; r++) {
        const row = grid[r];
        let currentStrategy = { type: 'all' }; // Default

        // First pass: detect if this is a product row
        if (row.some(cell => cell && getStrategy(String(cell.value)))) {
            productRowIndex = r;

            // Second pass: map strategies to columns
            for (let c = 0; c < row.length; c++) {
                const cell = row[c];
                const val = cell ? String(cell.value) : '';
                const newStrategy = getStrategy(val);

                if (newStrategy) {
                    currentStrategy = newStrategy;
                }
                colStrategies[c] = currentStrategy;
            }
            break;
        }
    }

    // 3. Helper to filter products
    const getFilteredList = (strategy) => {
        const all = data.rows || [];
        if (!strategy) return all;

        switch (strategy.type) {
            case 'left':
                const lIdx = all.findIndex(x => x.name === '質立優格');
                return lIdx !== -1 ? all.slice(0, lIdx + 1) : all;
            case 'right':
                const rIdx = all.findIndex(x => x.name === '質立優格');
                return rIdx !== -1 ? all.slice(rIdx + 1) : [];
            case 'until':
                const uIdx = all.findIndex(x => x.name === strategy.target);
                return uIdx !== -1 ? all.slice(0, uIdx + 1) : all;
            case 'from':
                const fIdx = all.findIndex(x => x.name === strategy.target);
                return fIdx !== -1 ? all.slice(fIdx) : [];
            case 'after':
                const aIdx = all.findIndex(x => x.name === strategy.target);
                return aIdx !== -1 ? all.slice(aIdx + 1) : [];
            default:
                return all;
        }
    };

    // 4. Render Rows
    const renderRows = () => {
        const output = [];

        for (let r = 0; r < grid.length; r++) {
            const row = grid[r];

            if (r === productRowIndex) {
                // Parallel Rendering Logic
                const uniqueStrategies = [];
                const seenStrats = new Set();
                colStrategies.forEach(s => {
                    if (s) {
                        const key = `${s.type}:${s.target || ''}`;
                        if (!seenStrats.has(key)) {
                            seenStrats.add(key);
                            uniqueStrategies.push(s);
                        }
                    }
                });

                const listsMap = new Map();
                let maxRows = 0;
                uniqueStrategies.forEach(s => {
                    const list = getFilteredList(s);
                    const key = `${s.type}:${s.target || ''}`;
                    listsMap.set(key, list);
                    if (list.length > maxRows) maxRows = list.length;
                });

                for (let i = 0; i < maxRows; i++) {
                    const rowCells = [];

                    for (let c = 0; c < row.length; c++) {
                        const cell = row[c];
                        if (!cell) {
                            rowCells.push(null);
                            continue;
                        }

                        const strat = colStrategies[c];
                        const listKey = strat ? `${strat.type}:${strat.target || ''}` : null;
                        const list = listKey ? listsMap.get(listKey) : null;
                        const prod = list ? list[i] : null;

                        let newVal = "";
                        if (prod) {
                            newVal = String(cell.value)
                                .replace(/\{\{product_name\}\}/g, prod.name)
                                .replace(/\{\{products_left\}\}/g, prod.name)
                                .replace(/\{\{products_right\}\}/g, prod.name)
                                .replace(/\{\{products_until:.+?\}\}/g, prod.name)
                                .replace(/\{\{products_from:.+?\}\}/g, prod.name)
                                .replace(/\{\{products_after:.+?\}\}/g, prod.name)
                                .replace(/\{\{stock\}\}/g, `${prod.stock}/${prod.originalStock || 0}`)
                                .replace(/\{\{picked\}\}/g, prod.picked || '')
                                .replace(/\{\{original\}\}/g, prod.original || '')
                                .replace(/\{\{returns\}\}/g, prod.returns || '')
                                .replace(/\{\{sold\}\}/g, prod.sold || '')
                                .replace(/\{\{price\}\}/g, prod.price || '')
                                .replace(/\{\{subtotal\}\}/g, prod.subtotal?.toLocaleString() || '');
                        } else {
                            newVal = "";
                        }

                        rowCells.push({
                            ...cell,
                            value: newVal
                        });
                    }

                    output.push(
                        <tr key={`prod-row-${i}`} style={{ height: 'auto' }}>
                            {rowCells.map((cell, c) => renderCell(cell, `prod-${i}-${c}`))}
                        </tr>
                    );
                }

                // --- FILLER ROWS INJECTION ---
                // Calculate how many empty rows we need to fill the page height.
                // Assuming standard row height ~24px (approx).
                // Max rows for A4 Portrait roughly 38-40 rows total (excluding header/footer).
                // So if we have 20 products, we add ~18 filler rows.

                const estimatedTotalSlots = 42;
                const currentRowCount = grid.length + maxRows;
                const neededFillers = Math.max(0, estimatedTotalSlots - currentRowCount);

                if (neededFillers > 0) {
                    for (let f = 0; f < neededFillers; f++) {
                        // Create a blank row mirroring the structure of the product row
                        const fillerCells = [];
                        for (let c = 0; c < row.length; c++) {
                            const cell = row[c];
                            if (!cell) { fillerCells.push(null); continue; }
                            fillerCells.push({
                                ...cell,
                                value: '', // Empty
                                style: { ...cell.style, height: '24px' } // Maintain height
                            });
                        }
                        output.push(
                            <tr key={`filler-row-${f}`} style={{ height: 'auto' }}>
                                {fillerCells.map((cell, c) => renderCell(cell, `filler-${f}-${c}`))}
                            </tr>
                        );
                    }
                }
                // -----------------------------
            } else {
                // Normal Row
                output.push(
                    <tr key={`r-${r}`} style={{ height: '24px' }}>
                        {row.map((cell, c) => renderCell(cell, `cell-${r}-${c}`))}
                    </tr>
                );
            }
        }
        return output;
    };

    const renderCell = (cell, key) => {
        if (!cell) return null; // Skipped due to merge

        let displayValue = cell.value;
        // Scalar Replacement
        if (typeof displayValue === 'string') {
            Object.keys(replacements).forEach(tag => {
                displayValue = displayValue.replace(tag, replacements[tag]);
            });
        }

        const style = {
            backgroundColor: cell.style.backgroundColor,
            fontWeight: cell.style.fontWeight,
            color: cell.style.color,
            textAlign: cell.style.textAlign,
            verticalAlign: cell.style.verticalAlign === 'middle' ? 'middle' : 'top',
            fontSize: cell.style.fontSize,
            border: cell.style.border,
            padding: '2px 4px',
            whiteSpace: 'pre-wrap'
        };

        return (
            <td
                key={key}
                colSpan={cell.colSpan}
                rowSpan={cell.rowSpan}
                style={style}
            >
                {displayValue}
            </td>
        );
    };

    // Helper to calculate max content rows for scaling
    let maxContentRows = 0;
    if (productRowIndex !== -1) {
        const uniqueStrategies = [];
        const uniqueKeys = new Set();
        colStrategies.forEach(s => {
            if (s) {
                const k = `${s.type}:${s.target || ''}`;
                if (!uniqueKeys.has(k)) { uniqueKeys.add(k); uniqueStrategies.push(s); }
            }
        });

        let maxListLen = 0;
        uniqueStrategies.forEach(s => {
            const l = getFilteredList(s);
            if (l.length > maxListLen) maxListLen = l.length;
        });
        maxContentRows = maxListLen;
    }

    // Calculate scale factor: Prioritize Width ("Full Bleed") and only shrink height if REAL content overflows
    const calculateScale = () => {
        // 1. Determine effective rows (ignore bottom empty rows)
        let effectiveRowIndex = grid.length - 1;
        while (effectiveRowIndex >= 0) {
            const row = grid[effectiveRowIndex];
            // Check if row has any meaningful content or borders (simplification: check value)
            const hasContent = row.some(c => c && c.value && String(c.value).trim() !== '');
            if (hasContent) break;
            effectiveRowIndex--;
        }

        // Add a buffer for footer/margins (e.g. +5 rows)
        const baseRows = effectiveRowIndex + 5;

        // Add dynamic product rows count
        const totalRowsEstimate = baseRows + (productRowIndex !== -1 ? maxContentRows : 0);

        // Standard A4 printable height ~ 288mm (297 - 4.73*2)
        // Estimated row height ~ 7.5mm

        const estimatedHeightMM = totalRowsEstimate * 7.5;
        // User margins: Top/Bot 0.473cm (=9.46mm total), Page 297mm. Available: ~287.5mm
        const maxPageHeightMM = 287.5;

        // Auto-Fit Logic:
        // If content is TALLER than page, Shrink it.
        // If content is SHORTER, do NOT Zoom In (it looks weird). 
        // Instead, rely on CSS 'height: 100%' to stretch the rows nicely.

        let scale = 1;
        if (estimatedHeightMM > maxPageHeightMM) {
            scale = maxPageHeightMM / estimatedHeightMM;
            // Min scale clamp
            scale = Math.max(0.6, scale);
        }

        return scale;
    };

    const scaleFactor = calculateScale();

    return (
        <div
            className="print-only bg-white flex flex-col"
            style={{
                zoom: scaleFactor,
                width: '100vw',   // Use viewport units for print context reliability
                height: '100vh',  // Force full height of the print page
                // Strict User Margins: Top/Bottom 0.473cm, Left/Right 0.43cm
                padding: '0.473cm 0.43cm',
                boxSizing: 'border-box'
            }}
        >
            <table
                className="w-full border-collapse"
                style={{
                    tableLayout: 'fixed',
                    width: '100%',
                    height: '100%', // FORCE TABLE TO FILL VERTICAL SPACE
                    fontSize: '10pt',
                    lineHeight: '1.2',
                }}
            >
                <tbody>
                    {renderRows()}
                </tbody>
            </table>
        </div>
    );
};

export default DynamicPrintRenderer;
