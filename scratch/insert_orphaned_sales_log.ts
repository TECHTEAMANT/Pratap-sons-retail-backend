import fs from 'fs';
const file = 'src/services/report.service.ts';
let content = fs.readFileSync(file, 'utf8');

const targetStr = `        orphanedSalesRes.forEach((row: any) => {
            detailedItemsRes.push(row);`;

const index = content.indexOf(targetStr);
if (index === -1) {
   console.log("Not found");
   process.exit(1);
}

const replacement = `        console.log(\`Found \${orphanedSalesRes.length} orphaned sales!\`);
        orphanedSalesRes.forEach((row: any) => {
            detailedItemsRes.push(row);`;

content = content.replace(targetStr, replacement);
fs.writeFileSync(file, content);
console.log("Success");
