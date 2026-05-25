import 'reflect-metadata';
import { AppDataSource, initializeDatabase, closeDatabase } from './src/config/data-source';

async function testMissingQty() {
  await initializeDatabase();
  const ds = AppDataSource;
  
  const res = await ds.query(`
    SELECT SUM(pi.quantity) as missing_qty
    FROM purchase_items pi
    WHERE NOT EXISTS (
      SELECT 1 FROM barcode_batches bb 
      WHERE bb.po_id = pi.po_id AND bb.design_no = pi.design_no
    )
  `);
  console.log('Missing quantity (NO barcodes generated):', res[0].missing_qty);

  const res2 = await ds.query(`
    WITH ValidMatches AS (
      SELECT 
        pi.po_id, 
        pi.design_no, 
        SUM(pi.quantity) as ordered_qty,
        (
          SELECT SUM(bb.total_quantity)
          FROM barcode_batches bb 
          WHERE bb.po_id = pi.po_id AND bb.design_no = pi.design_no AND bb.status != 'deleted'
        ) as generated_qty
      FROM purchase_items pi
      GROUP BY pi.po_id, pi.design_no
    )
    SELECT 
      SUM(ordered_qty - COALESCE(generated_qty, 0)) as total_undergenerated
    FROM ValidMatches
    WHERE COALESCE(generated_qty, 0) < ordered_qty
  `);
  console.log("Total missing/undergenerated barcodes:", res2[0].total_undergenerated);

  await closeDatabase();
}
testMissingQty().catch(console.error);
