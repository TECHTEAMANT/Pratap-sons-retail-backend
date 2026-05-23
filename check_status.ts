import 'reflect-metadata';
import { AppDataSource, initializeDatabase, closeDatabase } from './src/config/data-source';

async function analyzeStatuses() {
  await initializeDatabase();
  const ds = AppDataSource;
  
  const res = await ds.query('SELECT status, COUNT(*) FROM barcode_batches GROUP BY status');
  console.log('Barcode statuses:');
  console.table(res);
  
  const res2 = await ds.query('SELECT SUM(quantity) as sum_pi FROM purchase_items');
  console.log('Total purchase items quantity:', res2[0].sum_pi);

  const res3 = await ds.query(`
    SELECT COUNT(*) as missing_barcodes 
    FROM purchase_items pi
    WHERE NOT EXISTS (
      SELECT 1 FROM barcode_batches bb 
      WHERE bb.po_id = pi.po_id AND bb.design_no = pi.design_no
    )
  `);
  console.log('Purchase items with NO barcodes generated at all:', res3[0].missing_barcodes);

  await closeDatabase();
}
analyzeStatuses().catch(console.error);
