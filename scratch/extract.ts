import fs from 'fs';

const patchFile = 'scratch/report_diff.patch';
const content = fs.readFileSync(patchFile, 'utf16le'); // PowerShell `>` uses UTF-16LE

// Find salesAnalysisReport
const m1 = content.indexOf('async salesAnalysisReport(');
console.log('salesAnalysisReport at:', m1);

// Save it to a clean text file so we can view it
fs.writeFileSync('scratch/extracted_functions.ts', content, 'utf8');
console.log('Wrote to scratch/extracted_functions.ts');
