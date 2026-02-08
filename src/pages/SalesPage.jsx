import React, { useState, useEffect, useCallback } from 'react';
import { Save, RefreshCw, Calculator, DollarSign, GripVertical, ListOrdered, Printer } from 'lucide-react';

import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { callGAS } from '../utils/api';
import { PRICE_MAP, sortProducts } from '../utils/constants';
import { evaluateFormula } from '../utils/mathUtils';
import MergePrintModal from '../components/MergePrintModal';

const getSafeNum = (v) => {
    if (typeof v === 'string' && v.trim().startsWith('=')) return 0;
    const n = Number(v);
    return isNaN(n) ? 0 : n;
};

export default function SalesPage({ user, apiUrl, logActivity }) {
    const [rows, setRows] = useState([]);
    const [cashCounts, setCashCounts] = useState({ 1000: 0, 500: 0, 100: 0, 50: 0, 10: 0, 5: 0, 1: 0 });
    // Initialize reserve with 5000 for Cash default
    const [reserve, setReserve] = useState(5000);
    const [expenses, setExpenses] = useState({
        stall: 0, cleaning: 0, electricity: 0, gas: 0, parking: 0,
        goods: 0, bags: 0, others: 0, linePay: 0, serviceFee: 0
    });
    const [location, setLocation] = useState(''); // This will be used as "Sales Target"
    const [paymentType, setPaymentType] = useState('CASH');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const [isPrinting, setIsPrinting] = useState(false);
    const [isSorting, setIsSorting] = useState(false);
    const [activeInput, setActiveInput] = useState(null); // { id: string, type: 'row'|'cash'|'expense', field?: string, denom?: number, key?: string }

    // Today Records States (for merge printing)
    const [showTodayRecords, setShowTodayRecords] = useState(false);
    const [todayRecords, setTodayRecords] = useState([]);
    const [selectedSaleIds, setSelectedSaleIds] = useState([]);
    const [isMergePrinting, setIsMergePrinting] = useState(false);
    const [allAvailableProducts, setAllAvailableProducts] = useState([]); // All sorted products for merge print reference




    // [New] Input Mode State for exclusive highlighting
    const [inputMode, setInputMode] = useState('mouse'); // 'mouse' | 'keyboard'

    useEffect(() => {
        const handleMouseMove = () => {
            if (inputMode !== 'mouse') setInputMode('mouse');
        };
        const handleKeyDown = () => {
            if (inputMode !== 'keyboard') setInputMode('keyboard');
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('keydown', handleKeyDown);

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [inputMode]);

    // [Modified] Removed useEffect for paymentType to prevent overwriting cloned data. 
    // Logic moved to manual toggle handlers.

    // ... (load function remains here)

    // ...

    {/* Toggle on Left */ }
    <div className="flex bg-[var(--bg-tertiary)] rounded-lg p-1 border border-[var(--border-primary)] self-start md:self-auto">
        <button
            onClick={() => {
                setPaymentType('CASH');
                setReserve(5000); // Manual reset
            }}
            className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${paymentType === 'CASH'
                ? 'bg-emerald-500 text-white shadow-sm'
                : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
                }`}
        >
            現金
        </button>
        <button
            onClick={() => {
                setPaymentType('CREDIT');
                setReserve(0); // Manual reset
            }}
            className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${paymentType === 'CREDIT'
                ? 'bg-amber-500 text-white shadow-sm'
                : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
                }`}
        >
            賒銷
        </button>
    </div>


    const load = useCallback(async () => {
        try {
            const data = await callGAS(apiUrl, 'getProducts', {}, user.token);
            console.log('Sales Page - Raw Products Data:', data);

            if (Array.isArray(data)) {
                const content = data.filter(p => (Number(p.stock) || 0) > 0 || (Number(p.originalStock) || 0) > 0);
                const sortedProducts = sortProducts(content, 'name');

                // 0. Store all sorted products for merge printing (including those with 0 stock)
                const allSorted = sortProducts(data, 'name');
                setAllAvailableProducts(allSorted);

                // 1. Generate Base Rows
                let finalRows = sortedProducts.map(p => {
                    const systemPrice = Number(p.price) || 0;
                    const mapPrice = PRICE_MAP[p.name] !== undefined ? PRICE_MAP[p.name] : null;

                    const localPriceKey = `last_price_${p.id}`;
                    const localPrice = localStorage.getItem(localPriceKey);

                    let finalPrice = systemPrice;
                    if (mapPrice !== null) finalPrice = mapPrice;
                    if (localPrice !== null) finalPrice = Number(localPrice);

                    return {
                        id: p.id,
                        name: p.name,
                        stock: Number(p.stock) || 0,
                        originalStock: Number(p.originalStock) || 0,
                        picked: 0,
                        original: 0,
                        returns: 0,
                        sold: 0,
                        price: finalPrice,
                        subtotal: 0,
                        sortWeight: p.sortWeight,
                        fromSheet: p._fromSheet
                    };
                });

                // 2. Check & Merge Cloned Data immediately
                const clonedRaw = sessionStorage.getItem('clonedSale');
                if (clonedRaw) {
                    try {
                        const cloned = JSON.parse(clonedRaw);
                        console.log('Sales Page - Applying Cloned Data:', cloned);

                        // Set Form State
                        if (cloned.customer) setLocation(cloned.customer);
                        if (cloned.paymentMethod) setPaymentType(cloned.paymentMethod);
                        if (cloned.reserve !== undefined) setReserve(Number(cloned.reserve));
                        // Restoring Cash Counts
                        if (cloned.cashCounts) {
                            setCashCounts(prev => ({ ...prev, ...cloned.cashCounts }));
                        }
                        if (cloned.expenses) {
                            setExpenses(prev => ({
                                ...prev,
                                ...cloned.expenses
                            }));
                        }

                        // Merge Rows
                        finalRows = finalRows.map(row => {
                            const match = cloned.salesData.find(d => String(d.productId) === String(row.id));
                            if (match) {
                                const updated = {
                                    ...row,
                                    picked: match.picked,
                                    original: match.original,
                                    returns: match.returns,
                                    price: match.unitPrice
                                };
                                updated.sold = getSafeNum(updated.picked) + getSafeNum(updated.original) - getSafeNum(updated.returns);
                                updated.subtotal = updated.sold * getSafeNum(updated.price);
                                return updated;
                            }
                            return row;
                        });

                        // alert('已載入舊單資料 (包含支出與備用金)，請修改後儲存。'); // [Modified] Removed alert for smoother transition
                    } catch (e) {
                        console.error('Failed to parse cloned data', e);
                    }
                }

                // 3. Single State Update
                setRows(finalRows);

            } else {
                console.error('Sales Page - Data is not an array:', data);
            }
        } catch (error) {
            console.error("Fetch products failed", error);
            alert('載入產品失敗: ' + error.message);
        }
    }, [apiUrl, user.token]);

    useEffect(() => {
        const init = async () => {
            if (user?.token) {
                await load();
            }
        };
        init();
    }, [user.token, load]);

    // Recalculate row
    const handleRowChange = (id, field, value) => {
        setRows(prev => prev.map(r => {
            if (r.id !== id) return r;

            // 如果值是公式（以 = 開頭），我們暫存字串不計算數字
            if (typeof value === 'string' && value.trim().startsWith('=')) {
                return { ...r, [field]: value };
            }

            // 1. Propose new values (Keep raw value for current field to allow decimals while typing)
            let newPicked = field === 'picked' ? value : r.picked;
            let newOriginal = field === 'original' ? value : r.original;
            let newReturns = field === 'returns' ? value : r.returns;
            let newPrice = field === 'price' ? value : r.price;

            // 2. Local Price Memory Persistence
            if (field === 'price') {
                localStorage.setItem(`last_price_${id}`, getSafeNum(newPrice).toString());
            }

            // 3. Validate Stock Limits (Use getSafeNum for subtraction/comparison)
            if (getSafeNum(newPicked) > r.stock) newPicked = r.stock;
            if (getSafeNum(newPicked) < 0) newPicked = 0;

            if (getSafeNum(newOriginal) > r.originalStock) newOriginal = r.originalStock;
            if (getSafeNum(newOriginal) < 0) newOriginal = 0;

            // 4. Validate Returns Limit (Cannot return more than taken)
            const totalInHand = getSafeNum(newPicked) + getSafeNum(newOriginal);
            if (getSafeNum(newReturns) > totalInHand) newReturns = totalInHand;
            if (getSafeNum(newReturns) < 0) newReturns = 0;

            // 5. Construct updated row
            const updated = {
                ...r,
                picked: newPicked,
                original: newOriginal,
                returns: newReturns,
                price: newPrice
            };

            // 6. Calculate Sold & Subtotal (Crucial: Use getSafeNum to avoid string concatenation)
            updated.sold = getSafeNum(updated.picked) + getSafeNum(updated.original) - getSafeNum(updated.returns);
            updated.subtotal = updated.sold * (getSafeNum(updated.price) || 0);

            return updated;
        }));
    };

    const handleBlur = (id, field, value) => {
        if (typeof value === 'string' && value.trim().startsWith('=')) {
            const result = evaluateFormula(value);
            handleRowChange(id, field, result);
        } else {
            // Force numeric cleanup on blur (e.g., "10." becomes 10)
            handleRowChange(id, field, getSafeNum(value));
        }
    };

    const handleCashChange = (denom, value) => {
        setCashCounts(prev => ({
            ...prev,
            [denom]: (typeof value === 'string' && value.trim().startsWith('=')) ? value : value
        }));
    };

    const handleCashBlur = (denom, value) => {
        if (typeof value === 'string' && value.trim().startsWith('=')) {
            const result = evaluateFormula(value);
            handleCashChange(denom, result);
        } else {
            handleCashChange(denom, getSafeNum(value));
        }
    };

    const handleReserveChange = (value) => {
        setReserve((typeof value === 'string' && value.trim().startsWith('=')) ? value : value);
    };

    const handleReserveBlur = (value) => {
        if (typeof value === 'string' && value.trim().startsWith('=')) {
            const result = evaluateFormula(value);
            handleReserveChange(result);
        } else {
            handleReserveChange(getSafeNum(value));
        }
    };

    const handleExpenseChange = (key, value) => {
        setExpenses(prev => ({
            ...prev,
            [key]: (typeof value === 'string' && value.trim().startsWith('=')) ? value : value
        }));
    };

    const handleExpenseBlur = (key, value) => {
        if (typeof value === 'string' && value.trim().startsWith('=')) {
            const result = evaluateFormula(value);
            handleExpenseChange(key, result);
        } else {
            handleExpenseChange(key, getSafeNum(value));
        }
    };

    const handleDragEnd = (result) => {
        if (!result.destination) return;

        const items = Array.from(rows);
        const [reorderedItem] = items.splice(result.source.index, 1);
        items.splice(result.destination.index, 0, reorderedItem);

        // Update local state immediately for responsiveness
        setRows(items);
    };

    const toggleSorting = async () => {
        if (isSorting) {
            // Ending sorting mode -> Perform sync
            setIsSubmitting(true); // Reuse submitting overlay if needed, or just silent
            try {
                const productIds = rows.map(r => r.id);
                const res = await callGAS(apiUrl, 'updateProductSortOrder', { productIds }, user.token);
                if (res.success) {
                    alert('順序已儲存！');
                }
            } catch (error) {
                console.error('Failed to sync sort order:', error);
                alert('排序儲存失敗：' + error.message);
            } finally {
                setIsSubmitting(false);
                setIsSorting(false);
            }
        } else {
            // Entering sorting mode
            setIsSorting(true);
        }
    };

    // Navigation Helpers
    const focusAndSelect = (id) => {
        const el = document.getElementById(id);
        if (el) {
            el.focus();
            el.select?.();
            // Ensure the element is scrolled into view smoothly
            el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    };

    const insertMathSymbol = (sym) => {
        if (!activeInput) return;
        const el = document.getElementById(activeInput.id);
        if (el) {
            const start = el.selectionStart;
            const end = el.selectionEnd;
            const text = el.value;
            const before = text.substring(0, start);
            const after = text.substring(end, text.length);

            const newValue = before + sym + after;

            // Programmatically update based on type
            if (activeInput.type === 'row') {
                handleRowChange(activeInput.rowId, activeInput.field, newValue);
            } else if (activeInput.type === 'cash') {
                handleCashChange(activeInput.denom, newValue);
            } else if (activeInput.type === 'expense') {
                handleExpenseChange(activeInput.key, newValue);
            } else if (activeInput.type === 'reserve') {
                handleReserveChange(newValue);
            }

            // Reposition cursor
            const newPos = start + sym.length;
            setTimeout(() => {
                el.selectionStart = el.selectionEnd = newPos;
                el.focus();
            }, 0);
        }
    };

    const MathHelperButtons = ({ inputId }) => (
        <div className="flex gap-1 mb-2 overflow-x-auto pb-1 no-scrollbar">
            {['=', '+', '-', '*', '÷'].map(sym => (
                <button
                    key={sym}
                    onMouseDown={(e) => e.preventDefault()} // Prevent blur
                    onClick={() => insertMathSymbol(sym === '÷' ? '/' : sym)}
                    className="flex-1 h-10 min-w-[44px] rounded-lg bg-white border border-gray-200 text-[#800020] font-bold text-2xl active:bg-gray-100 shadow-sm transition-all flex items-center justify-center pt-0.5"
                >
                    {sym}
                </button>
            ))}
        </div>
    );

    const handleKeyDown = (e, idx, field, prefix = 'input-') => {
        const validKeys = ['Enter', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
        if (!validKeys.includes(e.key)) return;

        // Prevent default scrolling for arrow keys
        if (e.key.startsWith('Arrow')) e.preventDefault();

        const sequence = ['picked', 'original', 'returns', 'price'];
        const colIdx = sequence.indexOf(field);

        // Enter Logic
        if (e.key === 'Enter') {
            e.preventDefault();
            // User requested sequence: picked -> original -> returns -> price -> Next Row picked
            const enterSequence = ['picked', 'original', 'returns', 'price'];
            const currentFieldIdx = enterSequence.indexOf(field);

            if (currentFieldIdx < enterSequence.length - 1 && currentFieldIdx !== -1) {
                // Next field in same row
                const nextField = enterSequence[currentFieldIdx + 1];
                focusAndSelect(`${prefix}${idx}-${nextField}`);
            } else {
                // If it's price (or beyond), move to next row first field
                if (idx < rows.length - 1) {
                    focusAndSelect(`${prefix}${idx + 1}-picked`);
                } else {
                    // Last row last col -> Jump to Sidebar (1000 cash)
                    focusAndSelect('input-cash-1000');
                }
            }
            return;
        }

        // Arrow Logic (Mainly for desktop table, keeps functionality)
        let targetId = null;
        if (e.key === 'ArrowUp') {
            if (idx > 0) targetId = `${prefix}${idx - 1}-${field}`;
        } else if (e.key === 'ArrowDown') {
            if (idx < rows.length - 1) targetId = `${prefix}${idx + 1}-${field}`;
            else targetId = 'input-cash-1000';
        } else if (e.key === 'ArrowLeft') {
            if (colIdx > 0) {
                targetId = `${prefix}${idx}-${sequence[colIdx - 1]}`;
            } else {
                // At the first column (picked), jump to PREVIOUS row's last column (price)
                if (idx > 0) {
                    targetId = `${prefix}${idx - 1}-price`;
                }
            }
        } else if (e.key === 'ArrowRight') {
            if (colIdx < sequence.length - 1) {
                targetId = `${prefix}${idx}-${sequence[colIdx + 1]}`;
            } else {
                // At the last column (price), jump to the NEXT row's first column (picked)
                if (idx < rows.length - 1) {
                    targetId = `${prefix}${idx + 1}-picked`;
                } else {
                    // Last row last col -> Jump to Sidebar
                    targetId = 'input-cash-1000';
                }
            }
        }

        if (targetId) focusAndSelect(targetId);
    };

    const handleSidebarKeyDown = (e, targets = {}) => {
        const { next, prev, up, down, left, right } = targets;
        const validKeys = ['Enter', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
        if (!validKeys.includes(e.key)) return;
        if (e.key.startsWith('Arrow')) e.preventDefault();

        let targetId = null;
        if (e.key === 'Enter') {
            e.preventDefault();
            targetId = next;
        } else if (e.key === 'ArrowDown') {
            targetId = down || next;
        } else if (e.key === 'ArrowUp') {
            targetId = up || prev;
        } else if (e.key === 'ArrowLeft') {
            targetId = left || prev;
        } else if (e.key === 'ArrowRight') {
            targetId = right || next;
        }

        if (targetId) {
            focusAndSelect(targetId);
        } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
            // Top of sidebar -> Back to Table (Last row, last col)
            if (rows.length > 0) {
                focusAndSelect(`input-${rows.length - 1}-price`);
            }
        }
    };

    const totalSalesAmount = rows.reduce((acc, r) => acc + (r.subtotal || 0), 0);
    const totalCashCalc = Object.entries(cashCounts).reduce((acc, [denom, count]) => {
        return acc + (Number(denom) * getSafeNum(count));
    }, 0);
    // If Credit, reserve is 0 effectively, and totalCashNet might not be relevant for balancing but let's keep calc
    const totalCashNet = totalCashCalc - getSafeNum(reserve);

    const totalExpensesPlusLinePay =
        getSafeNum(expenses.stall) + getSafeNum(expenses.cleaning) + getSafeNum(expenses.electricity) +
        getSafeNum(expenses.gas) + getSafeNum(expenses.parking) + getSafeNum(expenses.goods) +
        getSafeNum(expenses.bags) + getSafeNum(expenses.others) + getSafeNum(expenses.linePay);

    const isCredit = paymentType === 'CREDIT';

    // Final Total Calculation Logic
    // 扣除後總金額 = (總金額 - 預備金) + 支出 + Line Pay + 服務費 - 總繳回金額
    // IF CASH: (Total Cash - Reserve) + Expenses + LinePay + ServiceFee - Total Sales Amount
    // IF CREDIT: Just the Total Sales Amount (Product Subtotals)
    const finalTotal = isCredit
        ? totalSalesAmount
        : (totalCashNet + totalExpensesPlusLinePay + getSafeNum(expenses.serviceFee) - totalSalesAmount);

    const handleSubmit = async () => {
        console.log('Save button clicked');
        try {
            const loc = String(location || '').trim();
            if (!loc) {
                alert('請輸入銷售對象！');
                const locationInput = document.getElementById('input-location');
                if (locationInput) locationInput.focus();
                return;
            }

            if (!user || !user.username) {
                console.error('User info missing:', user);
                alert('使用者資訊遺失，請重新登入');
                return;
            }

            const payload = {
                salesRep: user.username,
                customer: location,
                paymentMethod: paymentType,
                salesData: rows.map(r => ({
                    productId: r.id,
                    picked: r.picked,
                    original: r.original,
                    returns: r.returns,
                    sold: r.sold,
                    unitPrice: r.price
                })),
                cashData: { totalCash: paymentType === 'CREDIT' ? 0 : totalCashNet, reserve },
                expenseData: { ...expenses, finalTotal },
                cashCounts: cashCounts // [New] Pass detailed cash counts
            };

            setIsSubmitting(true);

            const res = await callGAS(apiUrl, 'saveSales', payload, user.token);
            if (!res.success) {
                throw new Error(res.error || 'Unknown error from backend');
            }

            // Log activity
            if (logActivity) {
                logActivity({
                    actionType: 'DATA_EDIT',
                    page: '銷售登錄',
                    details: JSON.stringify({
                        customer: location,
                        paymentMethod: paymentType,
                        totalAmount: isCredit ? totalSalesAmount : finalTotal,
                        productCount: rows.filter(r => r.sold > 0).length
                    })
                });
            }

            alert('保存成功！資料已寫入 Google Sheet。');
            sessionStorage.removeItem('clonedSale');
            window.location.reload();

        } catch (e) {
            console.error('handleSubmit error:', e);
            alert('保存失敗: ' + (e.message || e.toString()));
        } finally {
            setIsSubmitting(false);
        }
    };



    const handlePrint = async () => {
        if (rows.length === 0) {
            alert('沒有商品資料，無法列印');
            return;
        }

        setIsPrinting(true);
        try {
            const printPayload = {
                templateId: 'Template_領貨單',
                data: {
                    date: new Date().toISOString(),
                    location: location,
                    salesRep: user.username,
                    totalSalesAmount: isCredit ? totalSalesAmount : finalTotal,
                    totalCashCalc: totalCashNet,
                    finalTotal: finalTotal,
                    reserve: reserve,
                    expenses: expenses,
                    expenses: expenses,
                    rows: rows.map(r => ({
                        name: r.name,
                        stock: r.stock,
                        originalStock: r.originalStock,
                        picked: r.picked,
                        original: r.original,
                        returns: r.returns,
                        sold: r.sold,
                        price: r.price,
                        subtotal: r.subtotal
                    }))
                }
            };

            const response = await callGAS(apiUrl, 'generatePdf', printPayload, user.token);
            if (response.success && response.pdfBase64) {
                // Convert Base64 to Blob and open in new tab
                const byteCharacters = atob(response.pdfBase64);
                const byteNumbers = new Array(byteCharacters.length);
                for (let i = 0; i < byteCharacters.length; i++) {
                    byteNumbers[i] = byteCharacters.charCodeAt(i);
                }
                const byteArray = new Uint8Array(byteNumbers);
                const blob = new Blob([byteArray], { type: 'application/pdf' });
                const blobUrl = URL.createObjectURL(blob);
                window.open(blobUrl, '_blank');
            } else {
                throw new Error(response.error || 'Unknown error');
            }
        } catch (e) {
            console.error('Print failed:', e);
            alert('列印失敗: ' + e.message);
        } finally {
            setIsPrinting(false);
        }
    };

    // Load Today's Sales Records
    const loadTodayRecords = async () => {
        try {
            const records = await callGAS(apiUrl, 'getRecentSalesToday', {}, user.token);
            setTodayRecords(records);
        } catch (error) {
            console.error('載入今日紀錄失敗:', error);
            alert('載入今日紀錄失敗: ' + error.message);
        }
    };

    // Merge Print Handler
    const handleMergePrint = async () => {
        if (selectedSaleIds.length === 0) {
            alert('請至少選擇一筆單據');
            return;
        }

        setIsSubmitting(true);
        try {
            // 1. 提取選中的單據
            const selectedRecords = todayRecords.filter(r => selectedSaleIds.includes(r.saleId));

            // 2. 建立產品 Map（productId -> 各單據的數值陣列）
            const productDataMap = {};

            selectedRecords.forEach(record => {
                record.salesData.forEach(item => {
                    if (!productDataMap[item.productId]) {
                        productDataMap[item.productId] = {
                            productId: item.productId,
                            productName: item.productName,
                            picked: [],
                            original: [],
                            returns: [],
                            sold: [],
                            price: []
                        };
                    }
                    productDataMap[item.productId].picked.push(item.picked);
                    productDataMap[item.productId].original.push(item.original);
                    productDataMap[item.productId].returns.push(item.returns);
                    productDataMap[item.productId].sold.push(item.sold);
                    productDataMap[item.productId].price.push(item.unitPrice);
                });
            });

            // 3. 以主表格目前的品項清單 (rows) 為基底生成 mergedRows
            // 確保 PDF 顯示範圍與主畫面中「可見」的品項完全一致
            const mergedRows = rows.map(row => {
                const p = productDataMap[String(row.id)];

                // 決定單價：優先取自單據，若無則採用主表格目前的單價 (考慮了 PRICE_MAP 與 LocalStorage)
                let displayPrice = '';
                if (p && p.price.length > 0) {
                    displayPrice = p.price[0];
                } else {
                    displayPrice = row.price || '';
                }

                return {
                    name: row.name,
                    stock: 0, // 合併列印時不顯示庫存
                    originalStock: 0,
                    picked: p ? p.picked.filter(v => v !== 0 && v !== '0' && v !== '').join(' / ') : '',
                    original: p ? p.original.filter(v => v !== 0 && v !== '0' && v !== '').join(' / ') : '',
                    returns: p ? p.returns.filter(v => v !== 0 && v !== '0' && v !== '').join(' / ') : '',
                    sold: p ? p.sold.filter(v => v !== 0 && v !== '0' && v !== '').join(' / ') : '',
                    price: displayPrice,
                    subtotal: '' // 合併時不計算小計
                };
            });

            // 4. 調用 PDF 生成
            const printPayload = {
                templateId: 'Template_領貨單',
                data: {
                    date: new Date().toISOString(),
                    location: `合併列印 (${selectedRecords.length} 筆)`,
                    salesRep: user.username,
                    totalSalesAmount: '',
                    totalCashCalc: '',
                    finalTotal: '',
                    reserve: '',
                    expenses: {},
                    rows: mergedRows
                }
            };

            const response = await callGAS(apiUrl, 'generatePdf', printPayload, user.token);
            if (response.success && response.pdfBase64) {
                const byteCharacters = atob(response.pdfBase64);
                const byteNumbers = new Array(byteCharacters.length);
                for (let i = 0; i < byteCharacters.length; i++) {
                    byteNumbers[i] = byteCharacters.charCodeAt(i);
                }
                const byteArray = new Uint8Array(byteNumbers);
                const blob = new Blob([byteArray], { type: 'application/pdf' });
                const blobUrl = URL.createObjectURL(blob);
                window.open(blobUrl, '_blank');
            } else {
                throw new Error(response.error || 'Unknown error');
            }
        } catch (e) {
            console.error('合併列印失敗:', e);
            alert('合併列印失敗: ' + e.message);
        } finally {
            setIsSubmitting(false);
            setIsMergePrinting(false);
        }
    };


    return (
        <>
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 h-full overflow-y-auto xl:overflow-hidden">
                {isSubmitting && (
                    <div className="loading-overlay">
                        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                        <p className="text-lg font-bold text-[var(--text-primary)]">
                            {isMergePrinting ? "資料合併中，請稍後..." : "資料合併中，請稍後..."}
                        </p>
                    </div>
                )}
                {/* Product Table */}
                <div className="xl:col-span-2 glass-panel p-6 overflow-hidden flex flex-col h-auto min-h-[60vh] xl:h-[calc(100vh-10rem)]">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-4">
                        <h2 className="text-xl font-bold flex items-center gap-2 text-[var(--text-primary)]">
                            <RefreshCw size={20} className="text-[var(--accent-blue)]" /> 商品銷售登錄
                        </h2>

                        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-4 w-full md:w-auto">
                            {/* Toggle on Left */}
                            <div className="flex bg-[var(--bg-tertiary)] rounded-lg p-1 border border-[var(--border-primary)] self-start md:self-auto">
                                <button
                                    onClick={() => setPaymentType('CASH')}
                                    className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${paymentType === 'CASH'
                                        ? 'bg-emerald-500 text-white shadow-sm'
                                        : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
                                        }`}
                                >
                                    現金
                                </button>
                                <button
                                    onClick={() => setPaymentType('CREDIT')}
                                    className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${paymentType === 'CREDIT'
                                        ? 'bg-amber-500 text-white shadow-sm'
                                        : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
                                        }`}
                                >
                                    賒銷
                                </button>
                            </div>

                            <div className="flex items-center gap-2 w-full md:w-auto">
                                <label className="text-sm text-[var(--text-secondary)] font-bold whitespace-nowrap">銷售對象:</label>
                                <input
                                    id="input-location"
                                    type="text"
                                    className="input-field py-1 px-3 w-full md:w-48"
                                    placeholder="輸入銷售對象..."
                                    value={location}
                                    onChange={(e) => setLocation(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            // Jump to first product (checks both mobile and desktop IDs)
                                            focusAndSelect('input-m-0-picked') || focusAndSelect('input-0-picked');
                                        }
                                    }}
                                />
                            </div>

                            {/* Drag and Drop Sort Toggle */}
                            <button
                                onClick={toggleSorting}
                                className={`flex items-center gap-2 px-3 py-1 text-xs font-bold rounded-lg border whitespace-nowrap transition-all ${isSorting
                                    ? 'bg-indigo-500 text-white border-indigo-500'
                                    : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] border-[var(--border-primary)] hover:border-[var(--accent-blue)]'
                                    }`}
                            >
                                <ListOrdered size={16} />
                                {isSorting ? '儲存排序' : '自定義排序'}
                            </button>

                            {/* Print Button */}
                            <button
                                onClick={handlePrint}
                                disabled={isPrinting}
                                className={`flex items-center gap-2 px-3 py-1 text-xs font-bold rounded-lg border whitespace-nowrap transition-all ${isPrinting
                                    ? 'bg-gray-400 text-white cursor-not-allowed'
                                    : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] border-[var(--border-primary)] hover:border-[var(--accent-blue)]'
                                    }`}
                            >
                                <Printer size={16} />
                                {isPrinting ? '列印中...' : '列印領貨單'}
                            </button>

                            {/* Merge Print Button */}
                            <button
                                onClick={() => {
                                    setShowTodayRecords(!showTodayRecords);
                                    if (!showTodayRecords) loadTodayRecords();
                                }}
                                className={`flex items-center gap-2 px-3 py-1.5 text-xs font-black rounded-lg border whitespace-nowrap transition-all duration-300 shadow-sm active:scale-95 ${showTodayRecords
                                    ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white border-transparent shadow-blue-500/20 shadow-lg'
                                    : 'bg-white text-gray-500 border-gray-200 hover:border-blue-400 hover:text-blue-600'
                                    }`}
                            >
                                <ListOrdered size={16} strokeWidth={2.5} />
                                合併列印
                            </button>

                        </div>
                    </div>
                    <div className="flex-1 overflow-auto">
                        {/* Mobile Card View (Visible on < md) */}
                        <DragDropContext onDragEnd={handleDragEnd}>
                            <Droppable droppableId="mobile-rows" isDropDisabled={!isSorting}>
                                {(provided) => (
                                    <div
                                        {...provided.droppableProps}
                                        ref={provided.innerRef}
                                        className="md:hidden space-y-4"
                                    >
                                        {rows.map((row, idx) => (
                                            <Draggable key={`${row.id}-${idx}`} draggableId={String(row.id)} index={idx} isDragDisabled={!isSorting}>
                                                {(provided, snapshot) => (
                                                    <div
                                                        ref={provided.innerRef}
                                                        {...provided.draggableProps}
                                                        className={`bg-[var(--bg-secondary)] rounded-xl p-4 border border-[var(--border-primary)] ${snapshot.isDragging ? 'shadow-2xl z-50 ring-2 ring-indigo-500' : ''}`}
                                                    >
                                                        {/* Header: Name & Stock */}
                                                        <div className="flex justify-between items-start mb-2">
                                                            <div className="flex items-center gap-2">
                                                                {isSorting && (
                                                                    <div {...provided.dragHandleProps} className="text-[var(--text-tertiary)] cursor-grab active:cursor-grabbing">
                                                                        <GripVertical size={20} />
                                                                    </div>
                                                                )}
                                                                <div className="font-bold text-[var(--text-primary)] text-lg leading-tight">{row.name}</div>
                                                            </div>
                                                            <div className="text-[10px] font-mono bg-[var(--bg-tertiary)] px-2 py-1 rounded border border-[var(--border-primary)] whitespace-nowrap">
                                                                <span className="text-blue-500 font-bold">{row.stock}</span>
                                                                <span className="text-[var(--text-tertiary)] mx-0.5">/</span>
                                                                <span className="text-orange-500 font-bold">{row.originalStock || 0}</span>
                                                            </div>
                                                        </div>

                                                        {/* Inline Math Helper (Gray Background) */}
                                                        <div className="bg-gray-50 rounded-lg p-2 mb-3 border border-gray-100 min-h-[120px]">
                                                            <MathHelperButtons />
                                                            <div className="grid grid-cols-4 gap-2">
                                                                <div className="flex flex-col gap-1 min-h-[56px]">
                                                                    <label className="text-[10px] text-[var(--text-secondary)] text-center font-bold">領貨</label>
                                                                    <input
                                                                        id={`input-m-${idx}-picked`}
                                                                        type="text"
                                                                        inputMode="decimal"
                                                                        className="input-field text-center p-2 text-base font-bold bg-white"
                                                                        value={row.picked || ''}
                                                                        onChange={(e) => handleRowChange(row.id, 'picked', e.target.value)}
                                                                        onBlur={(e) => handleBlur(row.id, 'picked', e.target.value)}
                                                                        onFocus={() => setActiveInput({ id: `input-m-${idx}-picked`, type: 'row', rowId: row.id, field: 'picked' })}
                                                                        onKeyDown={(e) => handleKeyDown(e, idx, 'picked', 'input-m-')}
                                                                        disabled={isSorting}
                                                                    />
                                                                </div>
                                                                <div className="flex flex-col gap-1 min-h-[56px]">
                                                                    <label className="text-[10px] text-[var(--text-secondary)] text-center font-bold">原貨</label>
                                                                    <input
                                                                        id={`input-m-${idx}-original`}
                                                                        type="text"
                                                                        inputMode="decimal"
                                                                        className="input-field text-center p-2 text-base font-bold bg-white"
                                                                        value={row.original || ''}
                                                                        onChange={(e) => handleRowChange(row.id, 'original', e.target.value)}
                                                                        onBlur={(e) => handleBlur(row.id, 'original', e.target.value)}
                                                                        onFocus={() => setActiveInput({ id: `input-m-${idx}-original`, type: 'row', rowId: row.id, field: 'original' })}
                                                                        onKeyDown={(e) => handleKeyDown(e, idx, 'original', 'input-m-')}
                                                                        disabled={isSorting}
                                                                    />
                                                                </div>
                                                                <div className="flex flex-col gap-1 min-h-[56px]">
                                                                    <label className="text-[10px] text-[var(--text-secondary)] text-center font-bold">退貨</label>
                                                                    <input
                                                                        id={`input-m-${idx}-returns`}
                                                                        type="text"
                                                                        inputMode="decimal"
                                                                        className="input-field text-center p-2 text-base font-bold text-red-600 bg-white"
                                                                        value={row.returns || ''}
                                                                        onChange={(e) => handleRowChange(row.id, 'returns', e.target.value)}
                                                                        onBlur={(e) => handleBlur(row.id, 'returns', e.target.value)}
                                                                        onFocus={() => setActiveInput({ id: `input-m-${idx}-returns`, type: 'row', rowId: row.id, field: 'returns' })}
                                                                        onKeyDown={(e) => handleKeyDown(e, idx, 'returns', 'input-m-')}
                                                                        disabled={isSorting}
                                                                    />
                                                                </div>
                                                                <div className="flex flex-col gap-1 min-h-[56px]">
                                                                    <label className="text-[10px] text-[var(--text-secondary)] text-center font-bold">單價</label>
                                                                    <input
                                                                        id={`input-m-${idx}-price`}
                                                                        type="text"
                                                                        inputMode="decimal"
                                                                        className="input-field text-center p-2 text-base font-bold bg-white"
                                                                        value={row.price}
                                                                        onChange={(e) => handleRowChange(row.id, 'price', e.target.value)}
                                                                        onBlur={(e) => handleBlur(row.id, 'price', e.target.value)}
                                                                        onFocus={() => setActiveInput({ id: `input-m-${idx}-price`, type: 'row', rowId: row.id, field: 'price' })}
                                                                        onKeyDown={(e) => handleKeyDown(e, idx, 'price', 'input-m-')}
                                                                        disabled={isSorting}
                                                                    />
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* Summary Footer */}
                                                        <div className="flex justify-between items-center pt-2 border-t border-[var(--border-primary)]">
                                                            <div className="text-xs text-[var(--text-secondary)]">
                                                                售出: <span className="font-bold text-blue-500 text-sm ml-1">{row.sold}</span>
                                                            </div>
                                                            <div className="text-sm font-bold text-rose-600 font-mono">
                                                                <span className="text-xs text-[var(--text-tertiary)] font-normal mr-1">小計</span>
                                                                ${row.subtotal?.toLocaleString()}
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </Draggable>
                                        ))}
                                        {provided.placeholder}
                                    </div>
                                )}
                            </Droppable>

                            {/* Desktop Table View (Hidden on < md) */}
                            <table className="hidden md:table w-full text-left border-collapse">
                                <thead className="sticky top-0 bg-[var(--bg-secondary)] z-10 text-[var(--text-secondary)] text-xs uppercase font-bold border-b border-[var(--border-primary)]">
                                    <tr>
                                        <th className="p-3 w-10"></th>
                                        <th className="p-3">品項</th>
                                        <th className="p-3 w-20">庫存</th>
                                        <th className="p-3 w-24">領貨(+)</th>
                                        <th className="p-3 w-24">原貨(+)</th>
                                        <th className="p-3 w-24">退貨(-)</th>
                                        <th className="p-3 w-20 text-center">售出</th>
                                        <th className="p-3 w-24">單價</th>
                                        <th className="p-3 w-28 text-right">繳回金額</th>
                                    </tr>
                                </thead>
                                <Droppable droppableId="desktop-rows" isDropDisabled={!isSorting}>
                                    {(provided) => (
                                        <tbody
                                            {...provided.droppableProps}
                                            ref={provided.innerRef}
                                            className="divide-y divide-[var(--border-primary)]"
                                        >
                                            {rows.map((row, idx) => (
                                                <Draggable key={`${row.id}-${idx}`} draggableId={String(row.id)} index={idx} isDragDisabled={!isSorting}>
                                                    {(provided, snapshot) => (
                                                        <tr
                                                            ref={provided.innerRef}
                                                            {...provided.draggableProps}
                                                            className={`transition-colors ${snapshot.isDragging ? 'bg-[var(--bg-tertiary)] shadow-xl z-50' : ''
                                                                } ${inputMode === 'mouse' ? 'hover:bg-[var(--bg-hover)]' : ''
                                                                } ${inputMode === 'keyboard' && activeInput?.rowId === row.id ? 'bg-[var(--bg-hover)]' : ''
                                                                }`}
                                                        >
                                                            <td className="p-3">
                                                                {isSorting && (
                                                                    <div {...provided.dragHandleProps} className="text-[var(--text-tertiary)] cursor-grab active:cursor-grabbing">
                                                                        <GripVertical size={16} />
                                                                    </div>
                                                                )}
                                                            </td>
                                                            <td className="p-3 font-medium text-[var(--text-primary)]">{row.name}</td>
                                                            <td className="p-3 text-[var(--text-secondary)] font-mono tracking-wider">
                                                                <span className="text-blue-500">{row.stock}</span>
                                                                <span className="text-[var(--text-tertiary)] mx-1">/</span>
                                                                <span className="text-orange-500">{row.originalStock || 0}</span>
                                                            </td>
                                                            <td className="p-3">
                                                                <input
                                                                    id={`input-${idx}-picked`}
                                                                    type="text"
                                                                    className="input-field text-center p-1"
                                                                    value={row.picked || ''}
                                                                    onChange={(e) => handleRowChange(row.id, 'picked', e.target.value)}
                                                                    onBlur={(e) => handleBlur(row.id, 'picked', e.target.value)}
                                                                    onFocus={() => setActiveInput({ id: `input-${idx}-picked`, type: 'row', rowId: row.id, field: 'picked' })}
                                                                    onKeyDown={(e) => handleKeyDown(e, idx, 'picked')}
                                                                    disabled={isSorting}
                                                                />
                                                            </td>
                                                            <td className="p-3">
                                                                <input
                                                                    id={`input-${idx}-original`}
                                                                    type="text"
                                                                    className="input-field text-center p-1"
                                                                    value={row.original || ''}
                                                                    onChange={(e) => handleRowChange(row.id, 'original', e.target.value)}
                                                                    onBlur={(e) => handleBlur(row.id, 'original', e.target.value)}
                                                                    onFocus={() => setActiveInput({ id: `input-${idx}-original`, type: 'row', rowId: row.id, field: 'original' })}
                                                                    onKeyDown={(e) => handleKeyDown(e, idx, 'original')}
                                                                    disabled={isSorting}
                                                                />
                                                            </td>
                                                            <td className="p-3">
                                                                <input
                                                                    id={`input-${idx}-returns`}
                                                                    type="text"
                                                                    className="input-field text-center p-1 text-red-600"
                                                                    value={row.returns || ''}
                                                                    onChange={(e) => handleRowChange(row.id, 'returns', e.target.value)}
                                                                    onBlur={(e) => handleBlur(row.id, 'returns', e.target.value)}
                                                                    onFocus={() => setActiveInput({ id: `input-${idx}-returns`, type: 'row', rowId: row.id, field: 'returns' })}
                                                                    onKeyDown={(e) => handleKeyDown(e, idx, 'returns')}
                                                                    disabled={isSorting}
                                                                />
                                                            </td>
                                                            <td className="p-3 text-center font-bold text-blue-500">{row.sold}</td>
                                                            <td className="p-3"><input id={`input-${idx}-price`} type="text" className="input-field text-center p-1 w-20" value={row.price} onChange={(e) => handleRowChange(row.id, 'price', e.target.value)} onBlur={(e) => handleBlur(row.id, 'price', e.target.value)} onFocus={() => setActiveInput({ id: `input-${idx}-price`, type: 'row', rowId: row.id, field: 'price' })} onKeyDown={(e) => handleKeyDown(e, idx, 'price')} disabled={isSorting} /></td>
                                                            <td className="p-3 text-right font-mono text-rose-600">${row.subtotal?.toLocaleString()}</td>
                                                        </tr>
                                                    )}
                                                </Draggable>
                                            ))}
                                            {provided.placeholder}
                                        </tbody>
                                    )}
                                </Droppable>
                            </table>
                        </DragDropContext>
                    </div>
                    <div className="mt-4 pt-4 border-t border-[var(--border-primary)] flex justify-between items-center bg-[var(--bg-secondary)] p-4 rounded-lg">
                        <span className="text-[var(--text-secondary)]">總繳回金額 (商品計算)</span>
                        <span className="text-2xl font-bold text-rose-600">${totalSalesAmount.toLocaleString()}</span>
                    </div>
                </div>

                {/* Right Side: Cash, Expenses & Final Result (Unified Column) */}
                <div className="flex flex-col h-auto xl:h-[calc(100vh-10rem)] gap-6">
                    {/* Scrollable Content: Cash & Expenses */}
                    <div className={`flex-1 xl:overflow-y-auto pr-0 xl:pr-2 space-y-6 transition-opacity ${isCredit ? 'opacity-50 pointer-events-none grayscale' : ''}`}>

                        {/* Overlay for locking if strictly needed, but pointer-events-none does the trick interactively */}

                        <div className="glass-panel p-6 relative">
                            {isCredit && <div className="absolute inset-0 z-50 cursor-not-allowed"></div>}

                            <h2 className="text-lg font-bold mb-4 flex items-center gap-2 text-[var(--text-primary)]">
                                <Calculator size={20} className="text-amber-500" /> 錢點清算
                            </h2>
                            <div className="space-y-3">
                                {[1000, 500, 100, 50, 10, 5, 1].map((denom, idx, arr) => {
                                    const currentId = `input-cash-${denom}`;
                                    const nextId = idx < arr.length - 1 ? `input-cash-${arr[idx + 1]}` : 'input-reserve';
                                    const prevId = idx > 0 ? `input-cash-${arr[idx - 1]}` : null; // null means jump to table
                                    return (
                                        <div key={denom} className="flex items-center gap-4">
                                            <span className="w-12 text-[var(--text-secondary)] font-mono text-right">{denom}</span>
                                            <span className="text-[var(--text-tertiary)]">x</span>
                                            <input
                                                id={currentId}
                                                type="text"
                                                inputMode="decimal"
                                                className="input-field flex-1"
                                                placeholder="0"
                                                value={cashCounts[denom] || ''}
                                                onChange={(e) => handleCashChange(denom, e.target.value)}
                                                onBlur={(e) => handleCashBlur(denom, e.target.value)}
                                                onFocus={() => setActiveInput({ id: currentId, type: 'cash', denom: denom })}
                                                onKeyDown={(e) => handleSidebarKeyDown(e, {
                                                    next: nextId,
                                                    prev: prevId,
                                                    right: nextId,
                                                    left: prevId
                                                })}
                                                disabled={isCredit}
                                            />
                                            <span className="w-20 text-right font-mono text-[var(--text-secondary)]">${(denom * getSafeNum(cashCounts[denom])).toLocaleString()}</span>
                                        </div>
                                    );
                                })}
                                <div className="border-t border-[var(--border-primary)] my-2 pt-2 flex items-center gap-4 text-red-500">
                                    <span className="w-12 text-right">預備金</span>
                                    <span className="text-[var(--text-tertiary)]">-</span>
                                    <input
                                        id="input-reserve"
                                        type="text"
                                        inputMode="decimal"
                                        className="input-field flex-1 border-red-900/50 focus:ring-red-500"
                                        value={reserve}
                                        onChange={(e) => handleReserveChange(e.target.value)}
                                        onBlur={(e) => handleReserveBlur(e.target.value)}
                                        onFocus={() => setActiveInput({ id: 'input-reserve', type: 'reserve' })}
                                        onKeyDown={(e) => handleSidebarKeyDown(e, {
                                            next: 'input-expense-stall',
                                            prev: 'input-cash-1',
                                            right: 'input-expense-stall',
                                            left: 'input-cash-1'
                                        })}
                                        disabled={isCredit}
                                    />
                                </div>
                                <div className="bg-[var(--bg-secondary)] p-3 rounded flex justify-between items-center border border-[var(--border-primary)]">
                                    <span className="text-[var(--text-secondary)]">總金額</span>
                                    <span className="text-xl font-bold text-amber-500">${(isCredit ? 0 : totalCashNet).toLocaleString()}</span>
                                </div>
                            </div>
                        </div>

                        <div className="glass-panel p-6 relative">
                            {isCredit && <div className="absolute inset-0 z-50 cursor-not-allowed"></div>}

                            <h2 className="text-lg font-bold mb-4 text-rose-500">支出與其他</h2>
                            <div className="grid grid-cols-2 gap-3">
                                {['stall:攤位', 'cleaning:清潔', 'electricity:電費', 'gas:加油', 'parking:停車', 'goods:貨款', 'bags:塑膠袋', 'others:其他'].map((item, idx, arr) => {
                                    const [key, label] = item.split(':');
                                    const currentId = `input-expense-${key}`;

                                    // Sequential Navigation
                                    const nextKey = idx < arr.length - 1 ? arr[idx + 1].split(':')[0] : 'linePay';
                                    const nextId = `input-expense-${nextKey}`;
                                    const prevId = idx > 0 ? `input-expense-${arr[idx - 1].split(':')[0]}` : 'input-reserve';

                                    // Grid Navigation (2 columns)
                                    const upKey = idx >= 2 ? arr[idx - 2].split(':')[0] : null;
                                    const downKey = idx < arr.length - 2 ? arr[idx + 2].split(':')[0] : 'linePay';

                                    return (
                                        <div key={key}>
                                            <label className="text-xs text-[var(--text-secondary)] block mb-1">{label}</label>
                                            <input
                                                id={currentId}
                                                type="text"
                                                inputMode="decimal"
                                                className="input-field text-sm"
                                                value={expenses[key] || ''}
                                                onChange={(e) => handleExpenseChange(key, e.target.value)}
                                                onBlur={(e) => handleExpenseBlur(key, e.target.value)}
                                                onFocus={() => setActiveInput({ id: currentId, type: 'expense', key: key })}
                                                onKeyDown={(e) => handleSidebarKeyDown(e, {
                                                    next: nextId,
                                                    prev: prevId,
                                                    right: nextId,
                                                    left: prevId,
                                                    up: upKey ? `input-expense-${upKey}` : 'input-reserve',
                                                    down: downKey.startsWith('input-') ? downKey : `input-expense-${downKey}`
                                                })}
                                                disabled={isCredit}
                                            />
                                        </div>
                                    );
                                })}
                            </div>
                            <div className="mt-4 space-y-3">
                                <div>
                                    <label className="text-xs text-[var(--text-secondary)] block mb-1">Line Pay (收款)</label>
                                    <input
                                        id="input-expense-linePay"
                                        type="text"
                                        inputMode="decimal"
                                        className="input-field border-green-200 text-green-600"
                                        value={expenses.linePay || ''}
                                        onChange={(e) => handleExpenseChange('linePay', e.target.value)}
                                        onBlur={(e) => handleExpenseBlur('linePay', e.target.value)}
                                        onFocus={() => setActiveInput({ id: 'input-expense-linePay', type: 'expense', key: 'linePay' })}
                                        onKeyDown={(e) => handleSidebarKeyDown(e, {
                                            next: 'input-expense-serviceFee',
                                            prev: 'input-expense-others',
                                            right: 'input-expense-serviceFee',
                                            left: 'input-expense-others',
                                            up: 'input-expense-bags' // Index 6 is bags, index 7 is others. LinePay is below both. 
                                        })}
                                        disabled={isCredit}
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-[var(--text-secondary)] block mb-1">服務費 (扣除)</label>
                                    <input
                                        id="input-expense-serviceFee"
                                        type="text"
                                        inputMode="decimal"
                                        className="input-field border-red-200 text-red-600"
                                        value={expenses.serviceFee || ''}
                                        onChange={(e) => handleExpenseChange('serviceFee', e.target.value)}
                                        onBlur={(e) => handleExpenseBlur('serviceFee', e.target.value)}
                                        onFocus={() => setActiveInput({ id: 'input-expense-serviceFee', type: 'expense', key: 'serviceFee' })}
                                        disabled={isCredit}
                                        onKeyDown={(e) => handleSidebarKeyDown(e, {
                                            next: 'btn-save-data',
                                            prev: 'input-expense-linePay',
                                            right: 'btn-save-data',
                                            left: 'input-expense-linePay',
                                            up: 'input-expense-others'
                                        })}
                                    />
                                </div>
                            </div>

                        </div>
                    </div>

                    {/* Final Result Card (Fixed at bottom of the right column) */}
                    <div className="p-6 glass-panel shadow-lg border-t-4 border-t-blue-600 opacity-100 pointer-events-auto">
                        <div className="text-sm text-[var(--text-secondary)] mb-1 font-bold">扣除後總金額 (結算)</div>
                        <div className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-700 to-indigo-700">
                            ${(isCredit ? totalSalesAmount : finalTotal).toLocaleString()}
                        </div>
                        <button id="btn-save-data" onClick={handleSubmit} className="btn-primary w-full mt-6 flex justify-center items-center gap-2 py-4 text-lg">
                            <Save size={20} /> 保存今日資料
                        </button>
                    </div>
                </div>
            </div>


            {/* Merge Print Modal */}
            <MergePrintModal
                show={showTodayRecords}
                onClose={() => {
                    setSelectedSaleIds([]);
                    setShowTodayRecords(false);
                }}
                records={todayRecords}
                selectedIds={selectedSaleIds}
                onToggleSelect={(saleId) => {
                    if (saleId === null) {
                        setSelectedSaleIds([]);
                    } else if (selectedSaleIds.includes(saleId)) {
                        setSelectedSaleIds(selectedSaleIds.filter(id => id !== saleId));
                    } else {
                        setSelectedSaleIds([...selectedSaleIds, saleId]);
                    }
                }}
                onMergePrint={handleMergePrint}
                isPrinting={isMergePrinting}
            />
        </>
    );
}
