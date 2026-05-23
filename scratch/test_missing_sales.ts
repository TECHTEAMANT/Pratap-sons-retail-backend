import 'reflect-metadata';
import { AppDataSource, initializeDatabase, closeDatabase } from '../src/config/data-source';

async function checkMissingSales() {
  await initializeDatabase();
  try {
    // 1. Get net sales of items that are NOT in purchase_items
    const missingSales = await AppDataSource.query(`
      WITH valid_barcodes AS (
        SELECT bb.barcode_alias_8digit
        FROM barcode_batches bb
        INNER JOIN purchase_items pi ON pi.po_id = bb.po_id AND pi.design_no = bb.design_no 
             AND COALESCE(pi.color::text, '') = COALESCE(bb.color::text, '') 
             AND pi.size = bb.size
        WHERE bb.status != 'deleted' AND bb.barcode_alias_8digit IS NOT NULL
      )
      SELECT 
        (SELECT SUM(quantity) FROM sales_invoice_items sii WHERE sii.barcode_8digit NOT IN (SELECT barcode_alias_8digit FROM valid_barcodes)) as gross_sales,
        (SELECT SUM(quantity) FROM sales_return_items sri WHERE sri.barcode_8digit NOT IN (SELECT barcode_alias_8digit FROM valid_barcodes)) as sales_returns
    `);
    
    console.log("Missing Sales details:", missingSales);
    
  } catch (err) {
    console.error(err);
  } finally {
    await closeDatabase();
  }
}
checkMissingSales().catch(console.error);
