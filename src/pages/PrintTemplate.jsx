import React from 'react';

const PrintTemplate = ({ data }) => {
    const {
        rows,
        cashCounts,
        reserve,
        expenses,
        location,
        salesRep,
        totalSalesAmount,
        totalCashCalc,
        totalCashNet,
        finalTotal,
        paymentType
    } = data;

    const today = new Date();
    const dateStr = `${today.getMonth() + 1}/${today.getDate()}`;

    // Split at 質立優格
    const splitIndex = rows.findIndex(r => r.name === '質立優格');
    const leftRows = splitIndex !== -1 ? rows.slice(0, splitIndex + 1) : rows;
    const rightRows = splitIndex !== -1 ? rows.slice(splitIndex + 1) : [];

    const cashDenoms = [1000, 500, 100, 50, 10, 5, 1];

    return (
        <div className="print-only w-[210mm] h-[297mm] bg-white p-2 mx-auto text-[10px] font-sans">
            {/* Header */}
            <table className="w-full border-2 border-black mb-1">
                <tbody>
                    <tr className="h-8">
                        <td className="border-r border-black px-2 font-bold bg-gray-50 w-16">日期</td>
                        <td className="border-r border-black px-2 text-center font-bold w-24">{dateStr}</td>
                        <td className="border-r border-black px-2 font-bold bg-gray-50 w-16">地點</td>
                        <td className="border-r border-black px-2 text-center font-bold flex-1">{location}</td>
                        <td className="border-r border-black px-2 font-bold bg-gray-50 w-24">領貨人姓名</td>
                        <td className="px-2 text-center font-bold w-32">{salesRep}</td>
                    </tr>
                </tbody>
            </table>

            {/* Main Content */}
            <div className="flex gap-0 mb-1">
                {/* Left Products */}
                <div className="flex-1">
                    <table className="w-full border-2 border-black border-collapse">
                        <thead>
                            <tr className="bg-yellow-300 h-7">
                                <th className="border border-black px-1 font-bold">品項</th>
                                <th className="border border-black px-1 font-bold w-12">領貨量</th>
                                <th className="border border-black px-1 font-bold w-12">原貨量</th>
                                <th className="border border-black px-1 font-bold w-12">退回量</th>
                                <th className="border border-black px-1 font-bold w-12">售出</th>
                                <th className="border border-black px-1 font-bold w-12">單價</th>
                                <th className="border border-black px-1 font-bold w-16">繳回金</th>
                            </tr>
                        </thead>
                        <tbody>
                            {leftRows.map((r, i) => (
                                <tr key={i} className="h-6">
                                    <td className="border border-black px-1">{r.name}</td>
                                    <td className="border border-black px-1 text-center">{r.picked || ''}</td>
                                    <td className="border border-black px-1 text-center">{r.original || ''}</td>
                                    <td className="border border-black px-1 text-center text-red-600 font-bold">{r.returns || ''}</td>
                                    <td className="border border-black px-1 text-center font-bold">{r.sold || ''}</td>
                                    <td className="border border-black px-1 text-center text-red-600">{r.price || ''}</td>
                                    <td className="border border-black px-1 text-right">{r.subtotal || ''}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Right Products */}
                <div className="flex-1">
                    <table className="w-full border-2 border-l-0 border-black border-collapse">
                        <thead>
                            <tr className="bg-yellow-300 h-7">
                                <th className="border border-black px-1 font-bold">品項</th>
                                <th className="border border-black px-1 font-bold w-12">領貨量</th>
                                <th className="border border-black px-1 font-bold w-12">原貨量</th>
                                <th className="border border-black px-1 font-bold w-12">退回量</th>
                                <th className="border border-black px-1 font-bold w-12">售出</th>
                                <th className="border border-black px-1 font-bold w-12">單價</th>
                                <th className="border border-black px-1 font-bold w-16">繳回金</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rightRows.map((r, i) => (
                                <tr key={i} className="h-6">
                                    <td className="border border-black px-1">{r.name}</td>
                                    <td className="border border-black px-1 text-center">{r.picked || ''}</td>
                                    <td className="border border-black px-1 text-center">{r.original || ''}</td>
                                    <td className="border border-black px-1 text-center text-red-600 font-bold">{r.returns || ''}</td>
                                    <td className="border border-black px-1 text-center font-bold">{r.sold || ''}</td>
                                    <td className="border border-black px-1 text-center text-red-600">{r.price || ''}</td>
                                    <td className="border border-black px-1 text-right">{r.subtotal || ''}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Footer */}
            <div className="flex gap-1">
                {/* Left - Total */}
                <div className="flex-1 border-2 border-black p-2">
                    <div className="text-sm font-bold mb-1">總收入</div>
                    <div className="text-2xl font-bold">{totalSalesAmount?.toLocaleString()}</div>
                    {paymentType === 'CREDIT' && (
                        <div className="mt-2 bg-red-500 text-white text-center py-1 font-bold">更新表單</div>
                    )}
                </div>

                {/* Right - Cash & Expenses */}
                <div className="w-80 border-2 border-black">
                    <table className="w-full border-collapse">
                        <thead>
                            <tr className="bg-gray-100 h-6">
                                <th className="border border-black px-1 font-bold" colSpan="2">預備金</th>
                                <th className="border border-black px-1 font-bold">5000</th>
                                <th className="border border-black px-1 font-bold">合計</th>
                                <th className="border border-black px-1 font-bold">{totalCashCalc?.toLocaleString()}</th>
                            </tr>
                            <tr className="bg-gray-100 h-6">
                                <th className="border border-black px-1 font-bold">現金</th>
                                <th className="border border-black px-1 font-bold w-12">數量</th>
                                <th className="border border-black px-1 font-bold w-16">計算</th>
                                <th className="border border-black px-1 font-bold w-16">攤位</th>
                                <th className="border border-black px-1 font-bold w-16">支出</th>
                            </tr>
                        </thead>
                        <tbody>
                            {cashDenoms.map((denom, i) => (
                                <tr key={denom} className="h-6">
                                    <td className="border border-black px-1 text-right font-bold">{denom}</td>
                                    <td className="border border-black px-1 text-center">{cashCounts[denom] || ''}</td>
                                    <td className="border border-black px-1 text-right">{(denom * (cashCounts[denom] || 0)) || ''}</td>
                                    <td className="border border-black px-1">
                                        {i === 0 && '攤位'}
                                        {i === 1 && '清潔'}
                                        {i === 2 && '電費'}
                                        {i === 3 && '加油'}
                                        {i === 4 && '停車'}
                                        {i === 5 && '塑膠袋'}
                                    </td>
                                    <td className="border border-black px-1 text-right">
                                        {i === 0 && (expenses.stall || '')}
                                        {i === 1 && (expenses.cleaning || '')}
                                        {i === 2 && (expenses.electricity || '')}
                                        {i === 3 && (expenses.gas || '')}
                                        {i === 4 && (expenses.parking || '')}
                                        {i === 5 && (expenses.bags || '')}
                                    </td>
                                </tr>
                            ))}
                            <tr className="h-6 bg-gray-100">
                                <td className="border border-black px-1 font-bold" colSpan="3"></td>
                                <td className="border border-black px-1 font-bold">其他</td>
                                <td className="border border-black px-1 text-right font-bold">{expenses.others || ''}</td>
                            </tr>
                            <tr className="h-6 bg-gray-100">
                                <td className="border border-black px-1 font-bold" colSpan="3"></td>
                                <td className="border border-black px-1 font-bold">貨款</td>
                                <td className="border border-black px-1 text-right font-bold"></td>
                            </tr>
                            <tr className="h-6 bg-gray-100">
                                <td className="border border-black px-1 font-bold" colSpan="3"></td>
                                <td className="border border-black px-1 font-bold text-green-600">其他</td>
                                <td className="border border-black px-1 text-right font-bold text-green-600">LINE</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default PrintTemplate;
