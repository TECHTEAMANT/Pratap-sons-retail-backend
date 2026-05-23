import { AppDataSource, initializeDatabase } from '../src/config/data-source';

async function testSubqueryJoin() {
  try {
    await initializeDatabase();
    console.log('Database connected.');

    const query = `
      EXPLAIN ANALYZE
      SELECT 
        pi.id as "id",
        pi.design_no as "design",
        pi.quantity as "total_qty",
        pi.cost_per_item as "cost",
        pi.mrp as "mrp",
        pi.hsn_code as "hsn",
        po.invoice_number as "po_no",
        po.order_date as "po_date",
        v.name as "vendorName",
        pg.name as "productGroup",
        cl.name as "color",
        sz.name as "size",
        CASE WHEN pi.mrp <= 1000 THEN 5 ELSE 12 END as "gstRate",
        COALESCE(bs.barcode_alias, 'NO BARCODE') as "barcode_alias",
        COALESCE(bs.barcode, 'NO BARCODE') as "barcode",
        COALESCE(bs.sold_qty, 0) as "soldQty",
        COALESCE(bs.returned_qty, 0) as "returnedQty",
        bs.photo as "photo"
      FROM purchase_items pi
      INNER JOIN purchase_orders po ON po.id = pi.po_id
      LEFT JOIN vendors v ON v.id = po.vendor
      LEFT JOIN product_groups pg ON pg.id = pi.product_group
      LEFT JOIN colors cl ON cl.id = pi.color
      LEFT JOIN sizes sz ON sz.id = pi.size
      LEFT JOIN (
         SELECT 
           bb.po_id,
           bb.design_no,
           bb.color,
           bb.size,
           MIN(bb.barcode_alias_8digit) as barcode_alias,
           MIN(bb.barcode_structured) as barcode,
           MIN(bb.photos[1]) as photo,
           COALESCE(SUM(sii.sold_qty), 0) - COALESCE(SUM(sri.returned_qty), 0) as sold_qty,
           COALESCE(SUM(pri.returned_qty), 0) as returned_qty
         FROM barcode_batches bb
         LEFT JOIN (
           SELECT barcode_8digit, SUM(quantity) as sold_qty
           FROM sales_invoice_items
           GROUP BY barcode_8digit
         ) sii ON sii.barcode_8digit = bb.barcode_alias_8digit
         LEFT JOIN (
           SELECT barcode_8digit, SUM(quantity) as returned_qty
           FROM sales_return_items
           GROUP BY barcode_8digit
         ) sri ON sri.barcode_8digit = bb.barcode_alias_8digit
         LEFT JOIN (
           SELECT barcode_id, SUM(quantity) as returned_qty
           FROM purchase_return_items
           GROUP BY barcode_id
         ) pri ON pri.barcode_id = bb.barcode_alias_8digit
         WHERE bb.status != 'deleted' AND bb.po_id IS NOT NULL
         GROUP BY bb.po_id, bb.design_no, bb.color, bb.size
      ) bs ON bs.po_id = pi.po_id AND bs.design_no = pi.design_no
           AND COALESCE(bs.color::text, '') = COALESCE(pi.color::text, '')
           AND COALESCE(bs.size::text, '') = COALESCE(pi.size::text, '')
      WHERE po.order_date BETWEEN '2000-01-01' AND '2099-12-31'
      ORDER BY po.order_date ASC, pi.design_no ASC
      LIMIT 100000;
    `;

    console.log('Running subquery join query explain analyze...');
    const start = Date.now();
    const res = await AppDataSource.query(query);
    console.log(`Finished in ${Date.now() - start}ms.`);
    console.log(res.map((r: any) => r['QUERY PLAN']).join('\n'));
    await AppDataSource.destroy();
  } catch (err) {
    console.error(err);
  }
}

testSubqueryJoin();
