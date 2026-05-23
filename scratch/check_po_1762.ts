import 'reflect-metadata';
import { AppDataSource, initializeDatabase, closeDatabase } from '../src/config/data-source';

async function checkPO() {
  await initializeDatabase();
  const ds = AppDataSource;
  
  const query = `
    SELECT bb.id, bb.design_no, bb.total_quantity, bb.status, bb.barcode_alias_8digit 
    FROM barcode_batches bb
    WHERE bb.po_id = 'd7742f78-f43c-4e10-9889-a281015b3518'
  `;
  const res = await ds.query(query);
  console.log('Barcodes for PO 1762:', res);

  const query2 = `
    SELECT design_no, quantity FROM purchase_items WHERE po_id = 'd7742f78-f43c-4e10-9889-a281015b3518'
  `;
  const res2 = await ds.query(query2);
  console.log('Purchase Items for PO 1762:', res2);

  await closeDatabase();
}

checkPO().catch(console.error);
