const https = require('https');

const url = 'https://cl3x04orz-dotcom.github.io/inventory-system/assets/index-335f3fab.js';

https.get(url, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    // 尋找類似 "VITE_GAS_API_URL" 的打包常數值，或者 search 常數名
    // 比如：const GAS_API_URL = window.GAS_API_URL || "..."
    const index = data.indexOf('window.GAS_API_URL');
    if (index !== -1) {
      console.log('Found window.GAS_API_URL context:');
      console.log(data.substring(index - 100, index + 300));
    } else {
      console.log('window.GAS_API_URL not found');
    }
  });
});
