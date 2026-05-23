import { AppDataSource, initializeDatabase } from '../src/config/data-source';

async function diagSteps() {
  try {
    await initializeDatabase();
    console.log('Connected.\n');

    // Step 1: fetch purchase items
    let t = Date.now();
    const items = await AppDataSource.query(`
      SELECT pi.id, pi.design_no as design, pi.po_id, pi.color as color_id, pi.size as size_id,
        pi.quantity as total_qty, pi.cost_per_item as cost, pi.mrp, pi.hsn_code as hsn,
        po.invoice_number as po_no, po.order_date as po_date,
        v.name as "vendorName", pg.name as "productGroup", cl.name as color, sz.name as size
      FROM purchase_items pi
      INNER JOIN purchase_orders po ON po.id = pi.po_id
      LEFT JOIN vendors v ON v.id = po.vendor
      LEFT JOIN product_groups pg ON pg.id = pi.product_group
      LEFT JOIN colors cl ON cl.id = pi.color
      LEFT JOIN sizes sz ON sz.id = pi.size
      WHERE po.order_date BETWEEN '2000-01-01' AND '2099-12-31'
      ORDER BY po.order_date ASC, pi.design_no ASC
      LIMIT 100000 OFFSET 0
    `);
    console.log(`Step 1 (purchase items, ${items.length} rows): ${Date.now() - t}ms`);

    // Step 2: barcode batches WITHOUT photos
    const poIds = Array.from(new Set(items.map((r: any) => r.po_id))).filter(Boolean);
    const poIdList = (poIds as string[]).map(id => `'${id}'`).join(',');
    t = Date.now();
    const barcodes = await AppDataSource.query(`
      SELECT bb.barcode_alias_8digit, bb.barcode_structured, NULL as photo, bb.po_id, bb.design_no, bb.color, bb.size
      FROM barcode_batches bb
      WHERE bb.status != 'deleted' AND bb.po_id IN (${poIdList})
    `);
    console.log(`Step 2 (barcodes WITHOUT photos, ${barcodes.length} rows): ${Date.now() - t}ms`);

    // Step 3: barcode batches WITH photos (baseline for comparison)
    t = Date.now();
    const barcodesWithPhotos = await AppDataSource.query(`
      SELECT bb.barcode_alias_8digit, bb.photos[1] as photo, bb.po_id, bb.design_no, bb.color, bb.size
      FROM barcode_batches bb
      WHERE bb.status != 'deleted' AND bb.po_id IN (${poIdList})
    `);
    console.log(`Step 3 (barcodes WITH photos, ${barcodesWithPhotos.length} rows): ${Date.now() - t}ms`);

    // Step 4: sales aggregates
    const aliases = Array.from(new Set(barcodes.map((bb: any) => bb.barcode_alias_8digit))).filter(Boolean);
    const aliasesQuery = (aliases as string[]).map(a => `'${String(a).replace(/'/g, "''")}'`).join(',');
    t = Date.now();
    const [sales, salesReturns, purchaseReturns] = await Promise.all([
      AppDataSource.query(`SELECT barcode_8digit, SUM(quantity)::int as qty FROM sales_invoice_items WHERE barcode_8digit IN (${aliasesQuery}) GROUP BY barcode_8digit`),
      AppDataSource.query(`SELECT barcode_8digit, SUM(quantity)::int as qty FROM sales_return_items WHERE barcode_8digit IN (${aliasesQuery}) GROUP BY barcode_8digit`),
      AppDataSource.query(`SELECT barcode_id as barcode_8digit, SUM(quantity)::int as qty FROM purchase_return_items WHERE barcode_id IN (${aliasesQuery}) GROUP BY barcode_id`),
    ]);
    console.log(`Step 4 (sales/returns in parallel, ${sales.length}/${salesReturns.length}/${purchaseReturns.length} rows): ${Date.now() - t}ms`);

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
diagSteps();
