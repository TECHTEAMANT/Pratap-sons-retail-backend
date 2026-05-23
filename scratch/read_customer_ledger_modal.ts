import * as fs from 'fs';

const content = fs.readFileSync('c:/Users/LENOVO/OneDrive/Desktop/pratap sons retail/Pratap-son-retail-frontend/src/components/Reports.tsx', 'utf8');
const lines = content.split('\n');

let startLine = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('selectedCustomerLedgerId') && lines[i].includes('&&') && i > 1000) {
    startLine = i;
    break;
  }
}

if (startLine !== -1) {
  console.log(`Found selectedCustomerLedgerId render block at line ${startLine + 1}`);
  for (let j = startLine - 2; j < Math.min(lines.length, startLine + 150); j++) {
    console.log(`${j + 1}: ${lines[j]}`);
  }
} else {
  // Let's search for customerLedgerData
  let startLine2 = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('customerLedgerData') && lines[i].includes('&&') && i > 1000) {
      startLine2 = i;
      break;
    }
  }
  if (startLine2 !== -1) {
    console.log(`Found customerLedgerData render block at line ${startLine2 + 1}`);
    for (let j = startLine2 - 2; j < Math.min(lines.length, startLine2 + 150); j++) {
      console.log(`${j + 1}: ${lines[j]}`);
    }
  } else {
    console.log('Customer Ledger render block not found');
  }
}
