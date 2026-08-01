const fs = require('fs');
const path = './backend/prisma/schema.prisma';
let content = fs.readFileSync(path, 'utf8');

// Fix Member
content = content.replace('memberId      String              @id // LINE userId', 'memberId      String              // LINE userId');
content = content.replace('storeCode String @default("MILI001") // Phase 3 isolation', 'storeCode String @default("MILI001") // Phase 3 isolation\n  @@id([memberId, storeCode])');
// Wait, the above replace might replace the first occurrence of storeCode. I should be more precise.
