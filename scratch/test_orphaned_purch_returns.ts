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
           AND COALESCE(pi2.color::text, '') = COALESCE(bb2.color::text, '') 
           AND pi2.size = bb2.size
        WHERE bb2.status != 'deleted' AND bb2.barcode_alias_8digit IS NOT NULL
      )
      SELECT 
        (SELECT SUM(quantity) FROM purchase_return_items) as total_purch_returns,
        (SELECT SUM(quantity) FROM purchase_return_items WHERE barcode_id NOT IN (SELECT barcode_alias_8digit FROM valid_barcodes)) as orphaned_purch_returns
    `);
    console.log(res);
  } catch (err) {
    console.error(err);
  } finally {
    await closeDatabase();
  }
}
testTotals().catch(console.error);
