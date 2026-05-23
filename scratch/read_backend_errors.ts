import * as fs from 'fs';

const content = fs.readFileSync('c:/Users/LENOVO/OneDrive/Desktop/pratap sons retail/backend/Pratap-sons-retail-backend/src/services/report.service.ts', 'utf8');
const lines = content.split('\n');

for (let j = Math.max(0, lines.length - 120); j < lines.length; j++) {
  console.log(`${j + 1}: ${lines[j]}`);
}
