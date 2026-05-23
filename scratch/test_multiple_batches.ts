import { AppDataSource } from '../src/config/data-source';

async function test() {
  await AppDataSource.initialize();
  const res = await AppDataSource.query(`
    SELECT po_id, design_no, color, size, count(*) 
    FROM barcode_batches 
    WHERE status != 'deleted'
    GROUP BY po_id, design_no, color, size 
    HAVING count(*) > 1 
    LIMIT 5
  `);
  console.log(res);
  process.exit(0);
}
test();
