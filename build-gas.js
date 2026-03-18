import fs from 'fs';
import path from 'path';

const distDir = './dist';
const assetsDir = path.join(distDir, 'assets');

const htmlFile = path.join(distDir, 'index.html');
const cssFile = fs.readdirSync(assetsDir).find(f => f.endsWith('.css'));
const jsFile = fs.readdirSync(assetsDir).find(f => f.endsWith('.js'));

let html = fs.readFileSync(htmlFile, 'utf8');
const css = fs.readFileSync(path.join(assetsDir, cssFile), 'utf8');
const js = fs.readFileSync(path.join(assetsDir, jsFile), 'utf8');

// Simple inlining
const output = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Inventory System</title>
  <style>${css}</style>
</head>
<body>
  <div id="root"></div>
  <script>${js}</script>
</body>
</html>`;

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
