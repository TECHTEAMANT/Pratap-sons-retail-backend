import * as fs from 'fs';

const content = fs.readFileSync('c:/Users/LENOVO/OneDrive/Desktop/pratap sons retail/Pratap-son-retail-frontend/src/components/Reports.tsx', 'utf8');
const lines = content.split('\n');

for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('id:') && lines[i].includes('name:') && (lines[i].includes('icon:') || lines[i].includes('Icon'))) {
    console.log(`${i + 1}: ${lines[i].trim()}`);
  }
}
