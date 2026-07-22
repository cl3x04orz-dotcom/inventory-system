/**
 * 專為 Node 後端連線 Google Apps Script Web App 設計的 HTTP 客戶端
 * 解決 Node 內建 fetch 遇到 GAS 302 重新導向時，自動把 POST 改為 GET 導致誤觸發 doGet 回傳 HTML (<doctype) 的致命問題。
 */
export async function callGASFromNode(gasUrl: string, action: string, payload: any, token?: string) {
  const bodyStr = JSON.stringify({
    action,
    token,
    payload
  });

  // 1. 先設定 redirect: 'manual'，以 POST 與 text/plain 傳送 RequestBody 至 Google Apps Script 執行端點
  let response = await fetch(gasUrl, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: bodyStr
  });

  // 2. 當 GAS 執行 doPost 完畢後，會回傳 302 導向至 script.googleusercontent.com/macros/echo 暫存網址下載 JSON 結果
  // 由於該 echo 下載網址僅接受 GET 請求，如果強行用 POST 會引發 405 Method Not Allowed
  let redirects = 0;
  while ([301, 302, 303, 307, 308].includes(response.status) && redirects < 5) {
    const location = response.headers.get('location');
    if (!location) break;
    redirects++;
    response = await fetch(location, {
      method: 'GET',
      redirect: 'manual'
    });
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`GAS 服務回應錯誤 (${response.status}): ${response.statusText} ${errText}`);
  }

  const text = await response.text();
  if (text.trim().startsWith('<')) {
    throw new Error(`GAS 伺服器回傳了 HTML 網頁而非 JSON 資料。可能原因為權限過期或連線轉向異常。內容前段: ${text.slice(0, 150)}`);
  }

  return JSON.parse(text);
}
