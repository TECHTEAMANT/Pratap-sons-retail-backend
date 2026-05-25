import * as fs from 'fs';

const content = fs.readFileSync('c:/Users/LENOVO/OneDrive/Desktop/pratap sons retail/Pratap-son-retail-frontend/src/components/Reports.tsx', 'utf8');
const lines = content.split('\n');

let searchBlock = false;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('const reportTabs') || lines[i].includes('const tabs = [')) {
    searchBlock = true;
  }
  if (searchBlock) {
    console.log(`${i + 1}: ${lines[i]}`);
    if (lines[i].includes('];')) {
      searchBlock = false;
    }
  }
}
