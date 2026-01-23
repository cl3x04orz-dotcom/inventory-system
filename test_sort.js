const sortProducts = (list, nameKey) => {
    return [...list].sort((a, b) => {
        // 1. 優先權重排序 (只要有設定 sortWeight 就使用，包括 0)
        const hasWeightA = a.sortWeight !== undefined && a.sortWeight !== null;
        const hasWeightB = b.sortWeight !== undefined && b.sortWeight !== null;

        // 如果兩者都有權重，按權重排序（數字小的在前）
        if (hasWeightA && hasWeightB) {
            const wA = Number(a.sortWeight);
            const wB = Number(b.sortWeight);
            if (wA !== wB) return wA - wB;
        }

        // 如果只有一個有權重，有權重的排前面
        if (hasWeightA && !hasWeightB) return -1;
        if (!hasWeightA && hasWeightB) return 1;

        // 2. 次要：字母排序（兩者都沒權重時）
        return String(a[nameKey] || '').localeCompare(String(b[nameKey] || ''), 'zh-Hant');
    });
};

const testData = [
    { name: "一日綠", sortWeight: 30 },
    { name: "三福布蕾", sortWeight: 10 },
    { name: "NoWeight", sortWeight: undefined },
    { name: "ZeroWeight", sortWeight: 0 }
];

console.log("Original:", testData);
const sorted = sortProducts(testData, 'name');
console.log("Sorted:", sorted);

// Expected order:
// 1. ZeroWeight (0)
// 2. 三福布蕾 (10)
// 3. 一日綠 (30)
// 4. NoWeight (undefined)
