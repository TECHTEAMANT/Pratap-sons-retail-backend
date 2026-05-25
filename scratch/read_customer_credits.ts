import * as fs from 'fs';

const content = fs.readFileSync('c:/Users/LENOVO/OneDrive/Desktop/pratap sons retail/Pratap-son-retail-frontend/src/components/Reports.tsx', 'utf8');
const lines = content.split('\n');

let startLine = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes("activeTab === 'customer-credits'")) {
    startLine = i;
    break;
  }
}

if (startLine !== -1) {
  console.log(`Found activeTab === 'customer-credits' at line ${startLine + 1}`);
  for (let j = startLine - 2; j < Math.min(lines.length, startLine + 150); j++) {
    console.log(`${j + 1}: ${lines[j]}`);
  }
} else {
  console.log('customer-credits block not found');
}
