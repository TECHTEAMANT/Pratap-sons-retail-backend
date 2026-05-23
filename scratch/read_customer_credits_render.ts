import * as fs from 'fs';

const content = fs.readFileSync('c:/Users/LENOVO/OneDrive/Desktop/pratap sons retail/Pratap-son-retail-frontend/src/components/Reports.tsx', 'utf8');
const lines = content.split('\n');

let startLine = -1;
for (let i = 2000; i < lines.length; i++) {
  if (lines[i].includes("activeTab === 'customer-credits'") && lines[i].includes('&&')) {
    startLine = i;
    break;
  }
}

if (startLine !== -1) {
  console.log(`Found activeTab === 'customer-credits' render at line ${startLine + 1}`);
  for (let j = startLine - 1; j < Math.min(lines.length, startLine + 180); j++) {
    console.log(`${j + 1}: ${lines[j]}`);
  }
} else {
  console.log('customer-credits render block not found');
}
