import fs from 'fs';

// 2. Fix frontend export logic
const frontendFile = '../../Pratap-son-retail-frontend/src/components/Reports.tsx';
let frontendContent = fs.readFileSync(frontendFile, 'utf8');

frontendContent = frontendContent.replace(/exportMode: true,\s*includePhotos: false/g, 'exportMode: true,\n                          includePhotos: true');

fs.writeFileSync(frontendFile, frontendContent);
console.log("Frontend fixed.");
