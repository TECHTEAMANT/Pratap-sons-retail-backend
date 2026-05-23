import 'reflect-metadata';
import { AppDataSource, initializeDatabase, closeDatabase } from '../src/config/data-source';

async function checkFuzzy() {
  await initializeDatabase();
  const ds = AppDataSource;
  
  const query = `
    SELECT bb.id, po.invoice_number, bb.design_no, sz.name as size, bb.total_quantity, bb.status, bb.barcode_alias_8digit 
    FROM barcode_batches bb
    LEFT JOIN purchase_orders po ON po.id = bb.po_id
    LEFT JOIN sizes sz ON sz.id = bb.size
    WHERE bb.design_no ILIKE '%COT FEB%'
  `;
  const res = await ds.query(query);
  console.log('Fuzzy Search for COT FEB:');
  console.table(res);

  await closeDatabase();
}

checkFuzzy().catch(console.error);
