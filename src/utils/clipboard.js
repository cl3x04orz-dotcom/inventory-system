/**
 * 安全剪貼簿複製 Util 函式 (相容 HTTP 區域網路 IP 與非 HTTPS 移動裝置)
 */
export async function copyToClipboard(text) {
  if (!text) return false;

  // 1. 優先使用原生 navigator.clipboard (僅限 HTTPS 或 localhost)
  if (navigator?.clipboard?.writeText && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      console.warn('navigator.clipboard.writeText 失敗，切換至備用複製機制:', err);
    }
  }

  // 2. 備用機制 (適用於 HTTP 區域網路如 192.168.x.x 平板連線)
  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.top = '0';
    textArea.style.left = '0';
    textArea.style.width = '2em';
    textArea.style.height = '2em';
    textArea.style.padding = '0';
    textArea.style.border = 'none';
    textArea.style.outline = 'none';
    textArea.style.boxShadow = 'none';
    textArea.style.background = 'transparent';
    textArea.setAttribute('readonly', '');
    document.body.appendChild(textArea);
    
    // iOS Safari 選擇相容
    if (navigator.userAgent.match(/ipad|iphone/i)) {
      const range = document.createRange();
      range.selectNodeContents(textArea);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      textArea.setSelectionRange(0, 999999);
    } else {
      textArea.focus();
      textArea.select();
    }

    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    return successful;
  } catch (err) {
    console.error('複製失敗:', err);
    return false;
  }
}
