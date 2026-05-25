import { AppDataSource } from '../src/config/data-source';

async function test() {
  await AppDataSource.initialize();

  const start = '2020-01-01';
  const end = '2099-12-31';

  const barcodedQuery = `
    SELECT SUM(bb.total_quantity) as qty
    FROM barcode_batches bb
    INNER JOIN purchase_orders po ON po.id = bb.po_id
    WHERE po.order_date BETWEEN '${start}' AND '${end}' AND po.status = 'Completed' AND bb.status != 'deleted' AND bb.barcode_alias_8digit IS NOT NULL
  `;

  const remainderQuery = `
    SELECT SUM(remainder) as qty FROM (
      SELECT 
         pi.quantity - COALESCE(
           (SELECT SUM(bb.total_quantity) FROM barcode_batches bb WHERE bb.po_id = pi.po_id AND bb.design_no = pi.design_no AND COALESCE(bb.color::text, '') = COALESCE(pi.color::text, '') AND bb.size = pi.size AND bb.status != 'deleted'), 0
         ) as remainder
      FROM purchase_items pi
      INNER JOIN purchase_orders po ON po.id = pi.po_id
      WHERE po.order_date BETWEEN '${start}' AND '${end}' AND po.status = 'Completed'
    ) as sub
    WHERE remainder > 0
  `;

  const barcodedRes = await AppDataSource.query(barcodedQuery);
  const remainderRes = await AppDataSource.query(remainderQuery);

  const barcodedQty = Number(barcodedRes[0]?.qty || 0);
  const remainderQty = Number(remainderRes[0]?.qty || 0);
  console.log("Barcoded Qty:", barcodedQty);
  console.log("Remainder Qty:", remainderQty);
  console.log("Total Qty:", barcodedQty + remainderQty);

  const purchaseTotal = await AppDataSource.query(`SELECT SUM(quantity) as qty FROM purchase_items pi INNER JOIN purchase_orders po ON po.id = pi.po_id WHERE po.order_date BETWEEN '${start}' AND '${end}' AND po.status = 'Completed'`);
  console.log("Actual Purchase DB QTY:", purchaseTotal[0]?.qty);

  process.exit(0);
}
test();
