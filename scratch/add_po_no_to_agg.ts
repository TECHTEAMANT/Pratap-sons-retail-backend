import fs from 'fs';

const filePath = 'src/services/report.service.ts';
let content = fs.readFileSync(filePath, 'utf8');

const searchRegex = /t\.product_group,\s*SUM\(t\.opening_qty\) as opening_stock/m;
content = content.replace(searchRegex, "t.product_group,\n        MAX(t.po_no) as po_no,\n        SUM(t.opening_qty) as opening_stock");

fs.writeFileSync(filePath, content);
console.log("Replaced");
