const fs = require('fs');
const path = './backend/prisma/schema.prisma';
let content = fs.readFileSync(path, 'utf8');

const skipModels = ['User', 'StoreSetting'];
const lines = content.split('\n');

let currentModel = null;
let hasStoreCode = false;
let modelStartLine = -1;
let modelsToUpdate = [];

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const match = line.match(/^model\s+(\w+)\s*\{/);
  if (match) {
    currentModel = match[1];
    hasStoreCode = false;
    modelStartLine = i;
  } else if (currentModel && line.includes('storeCode')) {
    hasStoreCode = true;
  } else if (currentModel && line.startsWith('}')) {
    if (!hasStoreCode && !skipModels.includes(currentModel)) {
      modelsToUpdate.push({ model: currentModel, endLine: i });
    }
    currentModel = null;
  }
}

console.log('Missing storeCode in models:', modelsToUpdate.map(m => m.model));

// Insert in reverse order to preserve line indices
for (let i = modelsToUpdate.length - 1; i >= 0; i--) {
  const { model, endLine } = modelsToUpdate[i];
  lines.splice(endLine, 0, '  storeCode String @default("MILI001") // Phase 3 isolation');
  
  // If Vendor, we also need to fix the @id
  if (model === 'Vendor') {
    for (let j = modelStartLine; j < endLine; j++) {
      if (lines[j].includes('vendorName') && lines[j].includes('@id')) {
        lines[j] = lines[j].replace('@id', '');
        lines.splice(endLine, 0, '  @@id([vendorName, storeCode])');
        break;
      }
    }
  }
}

fs.writeFileSync(path, lines.join('\n'));
console.log('Done modifying schema.prisma');
