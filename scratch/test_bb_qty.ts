import { AppDataSource } from '../src/config/data-source';

async function test() {
  await AppDataSource.initialize();
  const res = await AppDataSource.query(`
    SELECT 
      SUM(bb.total_quantity) as sum_bb_qty,
      SUM(pi.quantity) as sum_pi_qty
    FROM barcode_batches bb
    INNER JOIN purchase_items pi ON pi.po_id = bb.po_id AND pi.design_no = bb.design_no
      AND COALESCE(pi.color::text, '') = COALESCE(bb.color::text, '')
      AND pi.size = bb.size
    WHERE bb.status != 'deleted'
  `);
  console.log(res);

  const res2 = await AppDataSource.query(`
    SELECT SUM(total_quantity) FROM barcode_batches WHERE status != 'deleted'
  `);
  console.log("Total from bb only:", res2);

  process.exit(0);
}
test();
