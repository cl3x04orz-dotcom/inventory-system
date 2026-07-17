const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/components/MergePrintModal.jsx');
const content = fs.readFileSync(filePath, 'utf8');

let braces = 0;
let parens = 0;
let inString = false;
let stringChar = '';
let inComment = false;
let inLineComment = false;

let braceStack = [];
let parenStack = [];

function getLineAndCol(index) {
    const lines = content.slice(0, index).split('\n');
    return { line: lines.length, col: lines[lines.length - 1].length + 1 };
}

for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const nextChar = content[i+1];
    
    if (inLineComment) {
        if (char === '\n') inLineComment = false;
        continue;
    }
    if (inComment) {
        if (char === '*' && nextChar === '/') {
            inComment = false;
            i++;
        }
        continue;
    }
    if (inString) {
        if (char === '\\') {
            i++; 
        } else if (char === stringChar) {
            inString = false;
        }
        continue;
    }
    
    if (char === '/' && nextChar === '/') {
        inLineComment = true;
        i++;
        continue;
    }
    if (char === '/' && nextChar === '*') {
        inComment = true;
        i++;
        continue;
    }
    if (char === '"' || char === "'" || char === '`') {
        inString = true;
        stringChar = char;
        continue;
    }
    
    if (char === '{') {
        braces++;
        braceStack.push({ index: i, ...getLineAndCol(i) });
    }
    if (char === '}') {
        braces--;
        if (braceStack.length > 0) {
            braceStack.pop();
        } else {
            console.log(`Extra closing brace '}' at Line ${getLineAndCol(i).line}, Col ${getLineAndCol(i).col}`);
        }
    }
    if (char === '(') {
        parens++;
        parenStack.push({ index: i, ...getLineAndCol(i) });
    }
    if (char === ')') {
        parens--;
        if (parenStack.length > 0) {
            parenStack.pop();
        } else {
            console.log(`Extra closing paren ')' at Line ${getLineAndCol(i).line}, Col ${getLineAndCol(i).col}`);
        }
    }
}

console.log('Final Braces count (unmatched):', braces);
if (braceStack.length > 0) {
    console.log('Unclosed braces start at:');
    braceStack.forEach(b => console.log(`  { at Line ${b.line}, Col ${b.col}`));
}

console.log('Final Parens count (unmatched):', parens);
if (parenStack.length > 0) {
    console.log('Unclosed parens start at:');
    parenStack.forEach(p => console.log(`  ( at Line ${p.line}, Col ${p.col}`));
}
