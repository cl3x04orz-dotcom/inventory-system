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
