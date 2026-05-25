import 'reflect-metadata';
import { AppDataSource, initializeDatabase, closeDatabase } from '../src/config/data-source';

async function fullAnalyze() {
  await initializeDatabase();
  const ds = AppDataSource;
  const design = 'SSU-034-25';

  const pur = await ds.query(`SELECT SUM(quantity) as pq FROM purchase_items WHERE design_no = $1`, [design]);
  console.log('Purchased Qty:', pur[0].pq);

  const sold = await ds.query(`
    SELECT SUM(si.quantity) as sq
    FROM sales_invoice_items si
    JOIN sales_invoices s ON s.id = si.invoice_id
    LEFT JOIN barcode_batches bb ON bb.barcode_alias_8digit = si.barcode_8digit
    WHERE bb.design_no = $1 OR si.barcode_8digit IN (SELECT barcode_alias_8digit FROM barcode_batches WHERE design_no = $1)
  `, [design]);
  console.log('Gross Sold Qty:', sold[0].sq);

  const returned = await ds.query(`
    SELECT SUM(sri.quantity) as rq
    FROM sales_return_items sri
    JOIN sales_returns sr ON sr.id = sri.return_id
    LEFT JOIN barcode_batches bb ON bb.barcode_alias_8digit = sri.barcode_8digit
    WHERE bb.design_no = $1 OR sri.barcode_8digit IN (SELECT barcode_alias_8digit FROM barcode_batches WHERE design_no = $1)
  `, [design]);
  console.log('Sales Return Qty:', returned[0].rq);
  
  const bb = await ds.query(`
    SELECT SUM(total_quantity) as tq, SUM(available_quantity) as aq
    FROM barcode_batches WHERE design_no = $1 AND status != 'deleted'
  `, [design]);
  console.log('Barcode Batches:', bb[0]);

  await closeDatabase();
}

fullAnalyze().catch(console.error);
