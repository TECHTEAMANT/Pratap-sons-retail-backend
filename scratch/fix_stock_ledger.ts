import fs from 'fs';

const filePath = 'src/services/report.service.ts';
let content = fs.readFileSync(filePath, 'utf8');

// Search for both occurrences (might use \n instead of \r\n)
const marker = '// Stock Ledger Report';
let pos1 = -1, pos2 = -1;

for (let i = 0; i < content.length - marker.length; i++) {
  if (content.substring(i, i + marker.length) === marker) {
    if (pos1 === -1) pos1 = i;
    else { pos2 = i; break; }
  }
}

console.log('Marker 1 at:', pos1);
console.log('Marker 2 at:', pos2);
console.log('File length:', content.length);

if (pos1 >= 0 && pos2 >= 0) {
  // Remove everything between pos1 and pos2
  const fixed = content.substring(0, pos1) + content.substring(pos2);
  console.log('Fixed length:', fixed.length);
  fs.writeFileSync(filePath, fixed);
  console.log('Done!');
} else {
  console.log('Could not find both markers');
  // Show what we found around pos1
  if (pos1 >= 0) {
    console.log('Context at pos1:', content.substring(pos1, pos1 + 100));
  }
}
