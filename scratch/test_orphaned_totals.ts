import 'reflect-metadata';
import { AppDataSource, initializeDatabase, closeDatabase } from '../src/config/data-source';

async function testTotals() {
  await initializeDatabase();
  try {
    const res = await AppDataSource.query(`
      WITH valid_barcodes AS (
        SELECT bb2.barcode_alias_8digit 
        FROM barcode_batches bb2 
        INNER JOIN purchase_items pi2 ON pi2.po_id = bb2.po_id AND pi2.design_no = bb2.design_no 
        WHERE bb2.status != 'deleted' AND bb2.barcode_alias_8digit IS NOT NULL
      )
      SELECT 
        (SELECT SUM(quantity) FROM sales_invoice_items WHERE barcode_8digit NOT IN (SELECT barcode_alias_8digit FROM valid_barcodes)) as gross_sales,
        (SELECT SUM(quantity) FROM sales_return_items WHERE barcode_8digit NOT IN (SELECT barcode_alias_8digit FROM valid_barcodes)) as sales_returns
    `);
    console.log(res);
  } catch (err) {
    console.error(err);
  } finally {
    await closeDatabase();
  }
}
testTotals().catch(console.error);
