import fs from 'fs';
const file = 'src/services/report.service.ts';
let content = fs.readFileSync(file, 'utf8');

const targetStr = `            FROM sales_invoice_items sii
            LEFT JOIN barcode_batches bb ON bb.barcode_alias_8digit = sii.barcode_8digit
            LEFT JOIN vendors v ON v.id = bb.vendor
            LEFT JOIN product_groups pg ON pg.id = bb.product_group
            LEFT JOIN colors c ON c.id = bb.color
            LEFT JOIN sizes s ON s.id = bb.size
            WHERE sii.barcode_8digit NOT IN (`

const index = content.indexOf(targetStr);
if (index === -1) {
   console.log("Not found");
   process.exit(1);
}

const replacement = `            FROM (
               SELECT barcode_8digit, created_at, id::text, mrp FROM sales_invoice_items
               UNION ALL
               SELECT barcode_8digit, created_at, id::text, 0 as mrp FROM sales_return_items
            ) sii
            LEFT JOIN barcode_batches bb ON bb.barcode_alias_8digit = sii.barcode_8digit
            LEFT JOIN vendors v ON v.id = bb.vendor
            LEFT JOIN product_groups pg ON pg.id = bb.product_group
            LEFT JOIN colors c ON c.id = bb.color
            LEFT JOIN sizes s ON s.id = bb.size
            WHERE sii.barcode_8digit NOT IN (`

const newContent = content.replace(targetStr, replacement);
if (newContent === content) {
   console.log("REPLACE FAILED! Target not found.");
} else {
   fs.writeFileSync(file, newContent);
   console.log("REPLACE SUCCESSFUL!");
}
