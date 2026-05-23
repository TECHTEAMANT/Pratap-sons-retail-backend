import 'reflect-metadata';
import { AppDataSource, initializeDatabase, closeDatabase } from '../src/config/data-source';

async function checkInvoice1762() {
  await initializeDatabase();
  const ds = AppDataSource;
  
  const query = `
    SELECT pi.design_no, sz.name as size_name, pi.quantity 
    FROM purchase_items pi
    LEFT JOIN sizes sz ON sz.id = pi.size
    WHERE pi.po_id = 'd7742f78-f43c-4e10-9889-a281015b3518'
  `;
  const res = await ds.query(query);
  console.log('Purchase Items (Invoice 1762):');
  console.table(res);

  const query2 = `
    SELECT bb.design_no, sz.name as size_name, bb.total_quantity 
    FROM barcode_batches bb
    LEFT JOIN sizes sz ON sz.id = bb.size
    WHERE bb.po_id = 'd7742f78-f43c-4e10-9889-a281015b3518'
  `;
  const res2 = await ds.query(query2);
  console.log('Barcode Batches (Invoice 1762):');
  console.table(res2);

  await closeDatabase();
}

checkInvoice1762().catch(console.error);
