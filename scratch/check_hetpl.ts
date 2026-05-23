import 'reflect-metadata';
import { AppDataSource, initializeDatabase, closeDatabase } from '../src/config/data-source';

async function checkInvoice() {
  await initializeDatabase();
  const ds = AppDataSource;
  
  // Find po_id
  const poRes = await ds.query(`SELECT id FROM purchase_orders WHERE invoice_number = 'HETPL/2116'`);
  if (poRes.length === 0) return console.log('PO not found');
  const poId = poRes[0].id;

  const query = `
    SELECT bb.id, bb.design_no, sz.name as size, bb.total_quantity, bb.status, bb.barcode_alias_8digit 
    FROM barcode_batches bb
    LEFT JOIN sizes sz ON sz.id = bb.size
    WHERE bb.po_id = $1
  `;
  const res = await ds.query(query, [poId]);
  console.log('Barcodes for PO HETPL/2116:');
  console.table(res);

  const query2 = `
    SELECT pi.design_no, sz.name as size, pi.quantity 
    FROM purchase_items pi
    LEFT JOIN sizes sz ON sz.id = pi.size
    WHERE pi.po_id = $1
  `;
  const res2 = await ds.query(query2, [poId]);
  console.log('Purchase Items for PO HETPL/2116:');
  console.table(res2);

  await closeDatabase();
}

checkInvoice().catch(console.error);
