import 'reflect-metadata';
import { AppDataSource, initializeDatabase, closeDatabase } from '../src/config/data-source';

async function checkMissingAppended() {
  await initializeDatabase();
  try {
    const missingSalesRes = await AppDataSource.query(`
        SELECT 
          MIN(sii.id::text) as "id",
          bb.design_no as "design",
          0 as "total_qty",
          bb.cost_actual as "cost",
          sii.mrp as "mrp",
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
        GROUP BY bb.barcode_alias_8digit, bb.barcode_structured, bb.design_no, bb.cost_actual, sii.mrp, v.name, pg.name, c.name, s.name, bb.color, bb.size
    `);
    
    console.log(`Found ${missingSalesRes.length} orphaned sales rows`);
    console.log(missingSalesRes);
    
  } catch (err) {
    console.error(err);
  } finally {
    await closeDatabase();
  }
}
checkMissingAppended().catch(console.error);
