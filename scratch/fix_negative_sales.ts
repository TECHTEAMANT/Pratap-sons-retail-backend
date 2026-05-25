import fs from 'fs';
const file = 'src/services/report.service.ts';
let content = fs.readFileSync(file, 'utf8');

content = content.replace("if (remSold > 0) {", "if (remSold !== 0) {");
content = content.replace("if (remRet > 0) {", "if (remRet !== 0) {");

fs.writeFileSync(file, content);
console.log("REPLACE SUCCESSFUL!");
