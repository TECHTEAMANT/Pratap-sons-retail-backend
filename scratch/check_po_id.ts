import 'reflect-metadata';
import { AppDataSource, initializeDatabase, closeDatabase } from '../src/config/data-source';

async function checkPoid() {
  await initializeDatabase();
  const ds = AppDataSource;
  const design = 'SSU-034-25';

  const res = await ds.query(`SELECT po_id, created_at FROM barcode_batches WHERE design_no = $1 LIMIT 5`, [design]);
  console.log('Barcode Batches:', res);

  const po = await ds.query(`
    SELECT po.id, po.order_date
    FROM purchase_orders po
    JOIN barcode_batches bb ON bb.po_id = po.id
    WHERE bb.design_no = $1 LIMIT 1
  `, [design]);
  console.log('Purchase Order details:', po);

  await closeDatabase();
}

checkPoid().catch(console.error);
