import 'reflect-metadata';
import { AppDataSource, initializeDatabase, closeDatabase } from '../src/config/data-source';

async function checkBarcodes() {
  await initializeDatabase();
  const ds = AppDataSource;
  
  const query = `
    SELECT bb.id, bb.po_id, bb.design_no, bb.total_quantity, bb.status, bb.barcode_alias_8digit 
    FROM barcode_batches bb
    WHERE bb.design_no = 'UV3A'
  `;
  const res = await ds.query(query);
  console.log('Barcodes for UV3A:', res);

  await closeDatabase();
}

checkBarcodes().catch(console.error);
