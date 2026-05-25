import { AppDataSource } from '../src/config/data-source';

async function test() {
  await AppDataSource.initialize();

  console.log("--- Searching for SS--15723 ---");
  const pm1 = await AppDataSource.query(`SELECT * FROM product_masters WHERE design_no ILIKE '%SS--15723%' OR design_no ILIKE '%OR-315%'`);
  console.log("Product Masters:", pm1);

  const pi1 = await AppDataSource.query(`
    SELECT pi.id, pi.design_no, po.po_number, po.invoice_number, pi.quantity, pi.po_id
    FROM purchase_items pi
    INNER JOIN purchase_orders po ON po.id = pi.po_id
    WHERE pi.design_no ILIKE '%SS--15723%' OR pi.design_no ILIKE '%OR-315%'
  `);
  console.log("Purchase Items:", pi1);

  const bb1 = await AppDataSource.query(`
    SELECT id, barcode_alias_8digit, design_no, po_id, total_quantity
    FROM barcode_batches
    WHERE design_no ILIKE '%SS--15723%' OR design_no ILIKE '%OR-315%'
  `);
  console.log("Barcode Batches:", bb1);

  process.exit(0);
}
test();
