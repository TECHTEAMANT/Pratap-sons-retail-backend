import * as fs from 'fs';

const content = fs.readFileSync('c:/Users/LENOVO/OneDrive/Desktop/pratap sons retail/Pratap-son-retail-frontend/src/components/Reports.tsx', 'utf8');
const lines = content.split('\n');

for (let i = 100; i < 165; i++) {
  console.log(`${i + 1}: ${lines[i]}`);
}
