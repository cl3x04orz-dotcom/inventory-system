/**
 * 安全的算式解析工具
 */
export const evaluateFormula = (input) => {
    if (typeof input !== 'string' || !input.trim().startsWith('=')) return input;

    try {
        const rawExpression = input.trim().substring(1);
        // 只允許數字、運算符、括號、小數點
        const expression = rawExpression.replace(/[^0-9+\-*/(). ]/g, '');

        if (!expression.trim()) return input;

        // 使用 Function 建構子進行運算 (相對於 eval 較安全)
        // 雖然在前端環境風險較小，但過濾非法字元是必須的
        const result = new Function(`return ${expression}`)();

        // 檢查結果是否為有效數字
        if (typeof result === 'number' && isFinite(result)) {
            // 四捨五入到小數點後兩位，並移除末尾的 .00
            return Number(result.toFixed(2)).toString();
        }

        return input;
    } catch (e) {
        console.warn('Formula evaluation failed:', e);
        return input;
    }
};
