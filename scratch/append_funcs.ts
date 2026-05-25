import fs from 'fs';

const patchFile = 'scratch/extracted_functions.ts';
const content = fs.readFileSync(patchFile, 'utf8');

const lines = content.split('\n');
let insideNewFuncs = false;
const extractedLines = [];

for (const line of lines) {
  if (line.includes('async salesAnalysisReport(')) {
    insideNewFuncs = true;
  }
  
  if (insideNewFuncs) {
    if (line.startsWith('+')) {
      extractedLines.push(line.substring(1)); // Remove the '+'
    } else if (line.startsWith(' ')) {
      extractedLines.push(line.substring(1)); // Remove the leading space for context lines
    }
    // If it's a context line or addition, keep it. If it starts with '-', ignore.
  }
}

const cleanedCode = extractedLines.join('\n');

// Since we know the file ends with:
//   }
// }
// export const reportService = new ReportService();

// Let's just append this right before the last closing brace.
const targetFile = 'src/services/report.service.ts';
let targetContent = fs.readFileSync(targetFile, 'utf8');

const insertPos = targetContent.lastIndexOf('}\r\n\r\nexport const reportService = new ReportService();');
if (insertPos === -1) {
    console.error("Could not find insertion point!");
} else {
    const newContent = targetContent.substring(0, insertPos) + '\n' + cleanedCode + '\n' + targetContent.substring(insertPos);
    fs.writeFileSync(targetFile, newContent);
    console.log("Appended missing functions!");
}
