import fs from 'fs';
const file = 'src/services/report.service.ts';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/rowSold = Math\.min\(rowTotalQty, remSold\);/g, "rowSold = remSold;");
content = content.replace(/remainingSoldMap\.set\(key, remSold - rowSold\);/g, "remainingSoldMap.set(key, 0);");

content = content.replace(/rowReturned = Math\.min\(rowTotalQty - rowSold, remRet\);/g, "rowReturned = remRet;");
content = content.replace(/remainingReturnedMap\.set\(key, remRet - rowReturned\);/g, "remainingReturnedMap.set(key, 0);");

fs.writeFileSync(file, content);
console.log("Replaced");
