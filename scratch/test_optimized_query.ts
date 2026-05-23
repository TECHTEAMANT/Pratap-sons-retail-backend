import { AppDataSource, initializeDatabase } from '../src/config/data-source';

async function testOptimized() {
  try {
    await initializeDatabase();
    console.log('Database connected.');

    const query = `
      EXPLAIN ANALYZE
      WITH paginated_items AS (
        SELECT 
          pi.id as "id",
          pi.design_no as "design",
          pi.quantity as "total_qty",
          pi.cost_per_item as "cost",
          pi.mrp as "mrp",
          pi.hsn_code as "hsn",
          po.invoice_number as "po_no",
          po.order_date as "po_date",
          po.vendor as "vendor_id",
          pi.product_group as "product_group_id",
          pi.color as "color_id",
          pi.size as "size_id",
          pi.po_id as "po_id"
        FROM purchase_items pi
        INNER JOIN purchase_orders po ON po.id = pi.po_id
        WHERE po.order_date BETWEEN '2000-01-01' AND '2099-12-31'
        ORDER BY po.order_date ASC, pi.design_no ASC
        LIMIT 100000 OFFSET 0
      )
      SELECT 
        p.id as "id",
        p.design as "design",
        p.total_qty as "total_qty",
        p.cost as "cost",
        p.mrp as "mrp",
        p.hsn as "hsn",
        p.po_no as "po_no",
        p.po_date as "po_date",
        v.name as "vendorName",
        pg.name as "productGroup",
        cl.name as "color",
        sz.name as "size",
        CASE WHEN p.mrp <= 1000 THEN 5 ELSE 12 END as "gstRate",
        COALESCE(stats.barcode_alias, 'NO BARCODE') as "barcode_alias",
        COALESCE(stats.barcode, 'NO BARCODE') as "barcode",
        COALESCE(stats.sold_qty, 0) as "soldQty",
        COALESCE(stats.returned_qty, 0) as "returnedQty",
        stats.photo as "photo"
      FROM paginated_items p
      LEFT JOIN vendors v ON v.id = p.vendor_id
      LEFT JOIN product_groups pg ON pg.id = p.product_group_id
      LEFT JOIN colors cl ON cl.id = p.color_id
      LEFT JOIN sizes sz ON sz.id = p.size_id
      LEFT JOIN LATERAL (
        SELECT 
          MIN(bb.barcode_alias_8digit) as barcode_alias,
          MIN(bb.barcode_structured) as barcode,
          MIN(bb.photos[1]) as photo,
          SUM(COALESCE(
            (SELECT SUM(sii.quantity) FROM sales_invoice_items sii WHERE sii.barcode_8digit = bb.barcode_alias_8digit), 0
          ) - COALESCE(
            (SELECT SUM(sri.quantity) FROM sales_return_items sri WHERE sri.barcode_8digit = bb.barcode_alias_8digit), 0
          )) as sold_qty,
          SUM(COALESCE(
            (SELECT SUM(pri.quantity) FROM purchase_return_items pri WHERE pri.barcode_id = bb.barcode_alias_8digit), 0
          )) as returned_qty
        FROM barcode_batches bb
        WHERE bb.po_id = p.po_id 
          AND bb.design_no = p.design 
          AND COALESCE(bb.color::text, '') = COALESCE(p.color_id::text, '') 
          AND COALESCE(bb.size::text, '') = COALESCE(p.size_id::text, '')
          AND bb.status != 'deleted'
        GROUP BY bb.po_id, bb.design_no, bb.color, bb.size
      ) stats ON true
      ORDER BY p.po_date ASC, p.design ASC;
    `;

    console.log('Running optimized query explain analyze...');
    const start = Date.now();
    const res = await AppDataSource.query(query);
    console.log(`Finished in ${Date.now() - start}ms.`);
    console.log(res.map((r: any) => r['QUERY PLAN']).join('\n'));
    await AppDataSource.destroy();
  } catch (err) {
    console.error(err);
  }
}

testOptimized();
