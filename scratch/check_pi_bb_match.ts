import { AppDataSource } from '../src/config/data-source';

async function run() {
  await AppDataSource.initialize();
  const res = await AppDataSource.query(`
    SELECT po.status, COUNT(bb.id), SUM(bb.total_quantity)
    FROM barcode_batches bb
    LEFT JOIN purchase_orders po ON po.id = bb.po_id
    WHERE bb.status != 'deleted'
    GROUP BY po.status
  `);
  console.log('Barcode batches PO statuses:', res);
  process.exit(0);
}

run();
