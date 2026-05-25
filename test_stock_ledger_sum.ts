import 'reflect-metadata';
import { AppDataSource, initializeDatabase, closeDatabase } from './src/config/data-source';

async function testStockLedger() {
  await initializeDatabase();
  const ds = AppDataSource;
  
  const query = `
    SELECT SUM(purchased_qty) as total_purchased 
    FROM (
        SELECT COUNT(bb.id) as purchased_qty
        FROM barcode_batches bb
        LEFT JOIN purchase_orders po ON po.id = bb.po_id
        WHERE bb.status != 'deleted'
        GROUP BY bb.barcode_alias_8digit, bb.design_no
    ) t
  `;
  const res = await ds.query(query);
  console.log('Total Purchased Qty (Stock Ledger logic):', res[0].total_purchased);
  await closeDatabase();
}
testStockLedger().catch(console.error);
