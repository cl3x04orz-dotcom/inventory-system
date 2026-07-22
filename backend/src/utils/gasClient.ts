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

  // 1. 先設定 redirect: 'manual' 取得 302/307 導向網址，確保以 POST 與 text/plain 送到最後端點
  let currentUrl = gasUrl;
  let response = await fetch(currentUrl, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: bodyStr
  });

  // 如果遇到 301, 302, 303, 307, 308 轉向，手動跟隨但強制維持 POST 請求與 Body
  let redirects = 0;
  while ([301, 302, 303, 307, 308].includes(response.status) && redirects < 5) {
    const location = response.headers.get('location');
    if (!location) break;
    currentUrl = location;
    redirects++;
    response = await fetch(currentUrl, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: bodyStr
    });
  }

  if (!response.ok) {
    throw new Error(`GAS 服務回應錯誤 (${response.status}): ${response.statusText}`);
  }

  const text = await response.text();
  if (text.trim().startsWith('<')) {
    throw new Error(`GAS 伺服器回傳了 HTML 網頁而非 JSON 資料。可能原因為權限過期或連線轉向異常。內容前段: ${text.slice(0, 150)}`);
  }

  return JSON.parse(text);
}
