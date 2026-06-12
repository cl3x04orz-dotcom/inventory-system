import fs from 'fs';
import path from 'path';

const distDir = './dist';
const htmlFile = path.join(distDir, 'index.html');

let html = fs.readFileSync(htmlFile, 'utf8');
const assetsDir = path.join(distDir, 'assets');
let output = html;

if (fs.existsSync(assetsDir)) {
  const cssFile = fs.readdirSync(assetsDir).find(f => f.endsWith('.css'));
  const jsFile = fs.readdirSync(assetsDir).find(f => f.endsWith('.js'));

  const css = fs.readFileSync(path.join(assetsDir, cssFile), 'utf8');
  // Must escape </script> inside inline JS to prevent premature tag closure
  const js = fs.readFileSync(path.join(assetsDir, jsFile), 'utf8')
    .replace(/<\/script>/gi, '<\\/script>');

  // Simple inlining
  output = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Inventory System</title>
  <style>${css}</style>
</head>
<body>
  <div id="root"></div>
  <script>
    window.addEventListener('error', function(e) {
      document.body.innerHTML = '<div style="color: red; padding: 20px; font-family: sans-serif; word-break: break-all;">' +
        '<h3>System Error</h3>' +
        '<p>Message: ' + e.message + '</p>' +
        '<p>File: ' + e.filename + ':' + e.lineno + ':' + e.colno + '</p>' +
        '<pre style="background: #eee; padding: 10px; overflow: auto;">' + (e.error && e.error.stack ? e.error.stack : '') + '</pre>' +
        '</div>';
    });
    window.addEventListener('unhandledrejection', function(e) {
      document.body.innerHTML = '<div style="color: red; padding: 20px; font-family: sans-serif; word-break: break-all;">' +
        '<h3>Unhandled Promise Rejection</h3>' +
        '<p>Reason: ' + e.reason + '</p>' +
        '<pre style="background: #eee; padding: 10px; overflow: auto;">' + (e.reason && e.reason.stack ? e.reason.stack : '') + '</pre>' +
        '</div>';
    });
  </script>
  <script>${js}</script>
</body>
</html>`;
  // If viteSingleFile is used, dist/index.html is already fully inlined.
  // Inject the error handlers right after the real <body>.
  const errorHandlerScript = `
  <script>
    window.addEventListener('error', function(e) {
      document.body.innerHTML = '<div style="color: red; padding: 20px; font-family: sans-serif; word-break: break-all;">' +
        '<h3>System Error</h3>' +
        '<p>Message: ' + e.message + '</p>' +
        '<p>File: ' + e.filename + ':' + e.lineno + ':' + e.colno + '</p>' +
        '<pre style="background: #eee; padding: 10px; overflow: auto;">' + (e.error && e.error.stack ? e.error.stack : '') + '</pre>' +
        '</div>';
    });
    window.addEventListener('unhandledrejection', function(e) {
      document.body.innerHTML = '<div style="color: red; padding: 20px; font-family: sans-serif; word-break: break-all;">' +
        '<h3>Unhandled Promise Rejection</h3>' +
        '<p>Reason: ' + e.reason + '</p>' +
        '<pre style="background: #eee; padding: 10px; overflow: auto;">' + (e.reason && e.reason.stack ? e.reason.stack : '') + '</pre>' +
        '</div>';
    });
  </script>`;
  
  output = output.replace(/([\s\S]*)(<\/head>\s*<body>)/i, `$1$2${errorHandlerScript}`);
}

// 注入 GAS parameters，以利 iframe 下的前端能獲取到 query 參數，以及當前專案對應的 API 網址
const gasParamsScript = `
  <script>
    window.GAS_PARAMETERS = <?!= typeof parameters !== 'undefined' ? parameters : '{}' ?>;
    window.GAS_API_URL = <?!= typeof currentApiUrl !== 'undefined' ? JSON.stringify(currentApiUrl) : '""' ?>;
  </script>
`;
output = output.replace(/([\s\S]*)(<\/head>\s*<body>)/i, `$1$2${gasParamsScript}`);

fs.writeFileSync('Client.html', output);
console.log('Successfully generated Client.html for GAS');

// ====== Update Code.gs APP_VERSION ======
const codeGsPath = './Code.gs';
if (fs.existsSync(codeGsPath)) {
  let codeGs = fs.readFileSync(codeGsPath, 'utf8');
  const nowStr = process.env.VITE_APP_VERSION || Date.now().toString();
  codeGs = codeGs.replace(/const\s+APP_VERSION\s*=\s*['"](.*?)['"];/, `const APP_VERSION = '${nowStr}';`);
  fs.writeFileSync(codeGsPath, codeGs);
  console.log(`Successfully updated APP_VERSION in Code.gs to ${nowStr}`);
} else {
  console.warn('Code.gs not found. Could not update APP_VERSION.');
}
