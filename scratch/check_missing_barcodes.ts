import 'reflect-metadata';
import { AppDataSource, initializeDatabase, closeDatabase } from './src/config/data-source';

async function checkBarcodes() {
  await initializeDatabase();
  const ds = AppDataSource;
  
  const query = `
    SELECT bb.id, bb.po_id, bb.design_no, v.name as vendor, bb.total_quantity, bb.status, bb.barcode_alias_8digit 
    FROM barcode_batches bb
    LEFT JOIN vendors v ON v.id = bb.vendor
    WHERE bb.design_no = '1' AND v.name = 'JAMNADAS BECHARDAS & SONS'
  `;
  const res = await ds.query(query);
  console.log(res);

  const query2 = `
    SELECT po.invoice_number, pi.design_no, pi.quantity, pi.po_id
    FROM purchase_items pi
    JOIN purchase_orders po ON po.id = pi.po_id
    LEFT JOIN vendors v ON v.id = po.vendor
    WHERE pi.design_no = '1' AND v.name = 'JAMNADAS BECHARDAS & SONS'
  `;
  const res2 = await ds.query(query2);
  console.log('Purchase Items:', res2);

  await closeDatabase();
}

checkBarcodes().catch(console.error);
