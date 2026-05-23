import fs from 'fs';

// 1. Fix backend orphaned query
const backendFile = 'src/services/report.service.ts';
let backendContent = fs.readFileSync(backendFile, 'utf8');

const targetOrphaned = `               WHERE bb2.status != 'deleted' AND bb2.barcode_alias_8digit IS NOT NULL
            )
            GROUP BY`;

const replacementOrphaned = `               WHERE bb2.status != 'deleted' AND bb2.barcode_alias_8digit IS NOT NULL
            )
            \${(() => {
              const clauses = [];
              if (filters.vendorId) clauses.push(\`bb.vendor::text = '\${filters.vendorId}'\`);
              if (filters.design) clauses.push(\`bb.design_no ILIKE '%\${filters.design}%'\`);
              if (filters.barcode) clauses.push(\`(bb.barcode_alias_8digit ILIKE '%\${filters.barcode}%' OR bb.barcode_structured ILIKE '%\${filters.barcode}%')\`);
              if (filters.productGroup) clauses.push(\`pg.name ILIKE '%\${filters.productGroup}%'\`);
              if (filters.size) clauses.push(\`s.name ILIKE '%\${filters.size}%'\`);
              if (filters.color) clauses.push(\`c.name ILIKE '%\${filters.color}%'\`);
              if (filters.poInvoiceNumber) clauses.push(\`'OPENING-STOCK' ILIKE '%\${filters.poInvoiceNumber}%'\`);
              return clauses.length > 0 ? ' AND ' + clauses.join(' AND ') : '';
            })()}
            GROUP BY`;

backendContent = backendContent.replace(targetOrphaned, replacementOrphaned);
fs.writeFileSync(backendFile, backendContent);
console.log("Backend fixed.");

// 2. Fix frontend export logic
const frontendFile = '../Pratap-son-retail-frontend/src/components/Reports.tsx';
let frontendContent = fs.readFileSync(frontendFile, 'utf8');

frontendContent = frontendContent.replace(/exportMode: true,\s*includePhotos: false/g, 'exportMode: true,\n                          includePhotos: true');

fs.writeFileSync(frontendFile, frontendContent);
console.log("Frontend fixed.");
