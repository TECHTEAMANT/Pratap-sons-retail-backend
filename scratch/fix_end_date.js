const fs = require('fs');
let code = fs.readFileSync('src/services/report.service.ts', 'utf8');

// Replace standard endDate parsing to include 23:59:59
code = code.replace(/const end = filters\.endDate\.split\('T'\)\[0\];/g, 
  "const end = filters.endDate.split('T')[0] + ' 23:59:59';");

code = code.replace(/const endDateStr = filters\.endDate\?\.split\('T'\)\[0\] \|\| '2099-12-31';/g,
  "const endDateStr = (filters.endDate?.split('T')[0] || '2099-12-31') + ' 23:59:59';");

code = code.replace(/const endStr = \(endDate \|\| ''\)\.split\('T'\)\[0\] \|\| '2099-12-31';/g,
  "const endStr = ((endDate || '').split('T')[0] || '2099-12-31') + ' 23:59:59';");

code = code.replace(/const endStr = endDate\.split\('T'\)\[0\];/g,
  "const endStr = endDate.split('T')[0] + ' 23:59:59';");

code = code.replace(/const end = \(filters\.endDate \|\| ''\)\.split\('T'\)\[0\] \|\| '2099-12-31';/g,
  "const end = ((filters.endDate || '').split('T')[0] || '2099-12-31') + ' 23:59:59';");

code = code.replace(/end: filters\.endDate\.split\('T'\)\[0\]/g,
  "end: filters.endDate.split('T')[0] + ' 23:59:59'");

code = code.replace(/params\.push\(filters\.endDate\.split\('T'\)\[0\]\);/g,
  "params.push(filters.endDate.split('T')[0] + ' 23:59:59');");

fs.writeFileSync('src/services/report.service.ts', code);
