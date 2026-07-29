import React from 'react';

/**
 * 門市 POS 收據/發票列印元件
 * 支援 80mm 熱感應出單機
 */
export function POSReceiptPrint({ receiptData }) {
  if (!receiptData) return null;

  const {
    storeName = '米立微門市',
    receiptNo = '',
    date = new Date().toLocaleString('zh-TW'),
    cashier = '管理員',
    items = [],
    pricing = {},
    paymentMethod = '現金',
    receivedAmount = 0
  } = receiptData;

  return (
    <div className="pos-receipt-print-area hidden print:block print:w-[80mm] print:p-2 print:text-black print:font-mono text-xs">
      <style>{`
        @media print {
          @page {
            size: 80mm auto;
            margin: 0;
          }
          body * {
            visibility: hidden;
          }
          .pos-receipt-print-area, .pos-receipt-print-area * {
            visibility: visible;
          }
          .pos-receipt-print-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 80mm;
          }
        }
      `}</style>

      {/* Header */}
      <div className="text-center font-bold text-base mb-1">{storeName}</div>
      <div className="text-center text-[10px] mb-2">{date}</div>
      <div className="border-b border-dashed border-black pb-1 mb-2">
        <div>單號：{receiptNo}</div>
        <div>收銀：{cashier}</div>
      </div>

      {/* Items */}
      <div className="mb-2">
        <div className="flex justify-between font-bold border-b border-black pb-1 mb-1">
          <span>品名 / 數量</span>
          <span>小計</span>
        </div>
        {items.map((item, idx) => (
          <div key={idx} className="flex justify-between py-0.5">
            <span className="truncate max-w-[55mm]">{item.productName} × {item.qty}</span>
            <span>${((item.unitPrice * item.qty) - (item.discountAmount || 0)).toLocaleString()}</span>
          </div>
        ))}
      </div>

      {/* Totals */}
      <div className="border-t border-dashed border-black pt-2 mb-2 space-y-1">
        <div className="flex justify-between">
          <span>小計</span>
          <span>${pricing.subtotal?.toLocaleString() || 0}</span>
        </div>
        {pricing.discountAmount > 0 && (
          <div className="flex justify-between text-red-600">
            <span>折扣</span>
            <span>-${pricing.discountAmount?.toLocaleString() || 0}</span>
          </div>
        )}
        <div className="flex justify-between font-bold text-sm border-t border-black pt-1">
          <span>總計</span>
          <span>${pricing.grandTotal?.toLocaleString() || 0}</span>
        </div>
        <div className="flex justify-between pt-1">
          <span>付款方式</span>
          <span>{paymentMethod}</span>
        </div>
        <div className="flex justify-between">
          <span>實收</span>
          <span>${receivedAmount.toLocaleString()}</span>
        </div>
        <div className="flex justify-between">
          <span>找零</span>
          <span>${pricing.changeAmount?.toLocaleString() || 0}</span>
        </div>
      </div>

      {/* Footer */}
      <div className="text-center text-[10px] mt-4 pt-2 border-t border-black">
        感謝您的光臨，歡迎再次惠顧！
      </div>
    </div>
  );
}
