import fs from 'fs';

const filePath = 'src/services/report.service.ts';
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split(/\r?\n/);

// Find the line where duplication starts:
// It starts right after salesAnalysisReport closes. Let's find the exact end of salesAnalysisReport.
// Looking at the view_file output, it's at line 3334 (1-indexed). So lines 0 to 3333.
let cutIndex = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('import { AppDataSource } from \'../config/data-source\';') && i > 3000) {
    cutIndex = i;
    break;
  }
}

if (cutIndex !== -1) {
  const goodLines = lines.slice(0, cutIndex);
  
  // Clean up any trailing blank lines
  while (goodLines[goodLines.length - 1].trim() === '') {
    goodLines.pop();
  }
  
  goodLines.push('}');
  goodLines.push('');
  goodLines.push('export const reportService = new ReportService();');
  goodLines.push('');
  
  fs.writeFileSync(filePath, goodLines.join('\n'));
  console.log('Truncated duplicated file successfully. Length:', goodLines.length);
} else {
  console.log('Could not find the cut point!');
}
