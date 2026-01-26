function testAuth() {
  // 隨便呼叫一個外部網站，強制觸發「外部請求」的權限要求視窗
  console.log("正在測試連線...");
  UrlFetchApp.fetch("https://www.google.com");
  console.log("授權成功！");
}
