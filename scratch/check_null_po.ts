import 'reflect-metadata';
import { AppDataSource, initializeDatabase, closeDatabase } from '../src/config/data-source';

async function checkNullPO() {
  await initializeDatabase();
  const ds = AppDataSource;
  
  const query = `
    SELECT bb.id, bb.design_no, sz.name as size, bb.total_quantity, bb.status, bb.barcode_alias_8digit 
    FROM barcode_batches bb
    LEFT JOIN sizes sz ON sz.id = bb.size
    WHERE bb.po_id IS NULL
  `;
  const res = await ds.query(query);
  console.log('Barcodes with NULL po_id:');
  console.table(res);

  await closeDatabase();
}

checkNullPO().catch(console.error);
