import { AppDataSource, initializeDatabase } from '../src/config/data-source';

async function diagBarcodeStep() {
  try {
    await initializeDatabase();
    console.log('Connected.\n');

    // Step 1: get all po_ids from purchase items
    let start = Date.now();
    const poRes = await AppDataSource.query(`
      SELECT DISTINCT pi.po_id
      FROM purchase_items pi
      INNER JOIN purchase_orders po ON po.id = pi.po_id
      WHERE po.order_date BETWEEN '2000-01-01' AND '2099-12-31'
    `);
    const poIds = poRes.map((r: any) => r.po_id);
    console.log(`Step 1 - Distinct PO IDs: ${poIds.length} in ${Date.now() - start}ms`);

    // Step 2a: barcode fetch using IN list (current approach)
    start = Date.now();
    const poIdList = poIds.map((id: any) => `'${id}'`).join(',');
    const barcodes1 = await AppDataSource.query(`
      SELECT barcode_alias_8digit, po_id, design_no, color, size, barcode_structured, photos[1] as photo
      FROM barcode_batches
      WHERE status != 'deleted' AND po_id IN (${poIdList})
    `);
    console.log(`Step 2a - Barcodes via IN list: ${barcodes1.length} rows in ${Date.now() - start}ms`);

    // Step 2b: barcode fetch using a JOIN approach (should be faster)
    start = Date.now();
    const barcodes2 = await AppDataSource.query(`
      SELECT bb.barcode_alias_8digit, bb.po_id, bb.design_no, bb.color, bb.size, bb.barcode_structured, bb.photos[1] as photo
      FROM barcode_batches bb
      INNER JOIN purchase_orders po ON po.id = bb.po_id
      WHERE bb.status != 'deleted'
        AND po.order_date BETWEEN '2000-01-01' AND '2099-12-31'
    `);
    console.log(`Step 2b - Barcodes via JOIN purchase_orders: ${barcodes2.length} rows in ${Date.now() - start}ms`);

    // Step 2c: using a JOIN on purchase_items directly
    start = Date.now();
    const barcodes3 = await AppDataSource.query(`
      SELECT DISTINCT ON (bb.barcode_alias_8digit) 
        bb.barcode_alias_8digit, bb.po_id, bb.design_no, bb.color, bb.size, bb.barcode_structured, bb.photos[1] as photo
      FROM barcode_batches bb
      WHERE bb.status != 'deleted'
        AND bb.po_id IS NOT NULL
    `);
    console.log(`Step 2c - All active barcodes (no filter): ${barcodes3.length} rows in ${Date.now() - start}ms`);

    process.exit(0);
  } catch(err) {
    console.error(err);
    process.exit(1);
  }
}
diagBarcodeStep();
