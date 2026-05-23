import 'reflect-metadata';
import { AppDataSource, initializeDatabase, closeDatabase } from '../src/config/data-source';

async function checkDesignAll() {
  await initializeDatabase();
  const ds = AppDataSource;
  
  const query = `
    SELECT bb.id, po.invoice_number, bb.design_no, sz.name as size, bb.total_quantity, bb.status, bb.barcode_alias_8digit 
    FROM barcode_batches bb
    LEFT JOIN purchase_orders po ON po.id = bb.po_id
    LEFT JOIN sizes sz ON sz.id = bb.size
    WHERE bb.design_no = 'COT FEB 2' OR bb.design_no = 'COT FEB'
  `;
  const res = await ds.query(query);
  console.log('ALL Barcodes for COT FEB 2 / COT FEB:');
  console.table(res);

  await closeDatabase();
}

checkDesignAll().catch(console.error);
