import fs from 'fs';
const file = 'src/services/report.service.ts';
let content = fs.readFileSync(file, 'utf8');

const targetStr = `            FROM (
               SELECT barcode_8digit, created_at, id::text, mrp FROM sales_invoice_items
               UNION ALL
               SELECT barcode_8digit, created_at, id::text, 0 as mrp FROM sales_return_items
            ) sii`;

const index = content.indexOf(targetStr);
if (index === -1) {
   console.log("Not found");
   process.exit(1);
}

const replacement = `            FROM (
               SELECT barcode_8digit, created_at, id::text, mrp FROM sales_invoice_items
               UNION ALL
               SELECT barcode_8digit, created_at, id::text, 0 as mrp FROM sales_return_items
               UNION ALL
               SELECT barcode_id as barcode_8digit, created_at, id::text, 0 as mrp FROM purchase_return_items
            ) sii`;

const newContent = content.replace(targetStr, replacement);
if (newContent === content) {
   console.log("REPLACE FAILED! Target not found.");
} else {
   fs.writeFileSync(file, newContent);
   console.log("REPLACE SUCCESSFUL!");
}
