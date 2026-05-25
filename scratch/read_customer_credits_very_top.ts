import * as fs from 'fs';

const content = fs.readFileSync('c:/Users/LENOVO/OneDrive/Desktop/pratap sons retail/Pratap-son-retail-frontend/src/components/Reports.tsx', 'utf8');
const lines = content.split('\n');

for (let j = 2659; j < 2695; j++) {
  console.log(`${j + 1}: ${lines[j]}`);
}
