import fs from 'fs';
const file = 'src/services/report.service.ts';
let content = fs.readFileSync(file, 'utf8');

const target = `      // Step 4c: Batch-fetch sales aggregates for those barcode aliases (fast: uses new index on barcode_8digit)
      const aliases = Array.from(new Set(barcodeBatches.map((bb: any) => bb.barcode_alias_8digit))).filter(Boolean);`;

const replacement = `      // Step 4b.5: Append orphaned sales (items sold but never purchased)
      if (page === 1) {
        const orphanedSalesRes = await AppDataSource.query(\`
            SELECT 
              MIN(sii.id::text) as "id",
              bb.design_no as "design",
              0 as "total_qty",
              bb.cost_actual as "cost",
              MAX(sii.mrp) as "mrp",
              '' as "hsn",
              'OPENING-STOCK' as "po_no",
              MIN(sii.created_at) as "po_date",
              v.name as "vendorName",
              pg.name as "productGroup",
              c.name as "color",
              s.name as "size",
              'OPENING-STOCK' as "po_id",
              bb.color as "color_id",
              bb.size as "size_id",
              bb.barcode_alias_8digit as "barcode_alias_8digit",
              bb.barcode_structured as "barcode_structured"
            FROM sales_invoice_items sii
            LEFT JOIN barcode_batches bb ON bb.barcode_alias_8digit = sii.barcode_8digit
            LEFT JOIN vendors v ON v.id = bb.vendor
            LEFT JOIN product_groups pg ON pg.id = bb.product_group
            LEFT JOIN colors c ON c.id = bb.color
            LEFT JOIN sizes s ON s.id = bb.size
            WHERE sii.barcode_8digit NOT IN (
               SELECT bb2.barcode_alias_8digit 
               FROM barcode_batches bb2 
               INNER JOIN purchase_items pi2 ON pi2.po_id = bb2.po_id AND pi2.design_no = bb2.design_no 
                  AND COALESCE(pi2.color::text, '') = COALESCE(bb2.color::text, '') 
                  AND pi2.size = bb2.size
               WHERE bb2.status != 'deleted' AND bb2.barcode_alias_8digit IS NOT NULL
            )
            GROUP BY bb.barcode_alias_8digit, bb.barcode_structured, bb.design_no, bb.cost_actual, v.name, pg.name, c.name, s.name, bb.color, bb.size
        \`);
        
        orphanedSalesRes.forEach((row: any) => {
            detailedItemsRes.push(row);
            barcodeBatches.push({
               barcode_alias_8digit: row.barcode_alias_8digit,
               barcode_structured: row.barcode_structured,
               photo: null,
               po_id: row.po_id,
               design_no: row.design,
               color: row.color_id,
               size: row.size_id
            });
        });
      }

      // Step 4c: Batch-fetch sales aggregates for those barcode aliases (fast: uses new index on barcode_8digit)
      const aliases = Array.from(new Set(barcodeBatches.map((bb: any) => bb.barcode_alias_8digit))).filter(Boolean);`;

const newContent = content.replace(target, replacement);
if (newContent === content) {
   console.log("REPLACE FAILED! Target not found.");
} else {
   fs.writeFileSync(file, newContent);
   console.log("REPLACE SUCCESSFUL!");
}
