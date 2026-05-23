import { AppDataSource, initializeDatabase } from '../src/config/data-source';

async function runExplain() {
  try {
    await initializeDatabase();
    console.log('Database connected.');

    const query = `
      EXPLAIN ANALYZE WITH sales_by_barcode AS (
        SELECT sii.barcode_8digit, SUM(sii.quantity) as sold_qty
        FROM sales_invoice_items sii
        GROUP BY sii.barcode_8digit
      ),
      returns_by_barcode AS (
        SELECT sri.barcode_8digit, SUM(sri.quantity) as returned_qty
        FROM sales_return_items sri
        GROUP BY sri.barcode_8digit
      ),
      purchase_returns_by_barcode AS (
        SELECT pri.barcode_id, SUM(pri.quantity) as returned_to_vendor_qty
        FROM purchase_return_items pri
        GROUP BY pri.barcode_id
      ),
      barcode_stats AS (
        SELECT 
          bb.po_id,
          bb.design_no,
          bb.color,
          bb.size,
          MIN(bb.barcode_alias_8digit) as barcode_alias,
          MIN(bb.barcode_structured) as barcode,
          MIN(bb.photos[1]) as photo,
          SUM(COALESCE(s.sold_qty, 0) - COALESCE(r.returned_qty, 0)) as sold_qty,
          SUM(COALESCE(pr.returned_to_vendor_qty, 0)) as returned_qty
        FROM barcode_batches bb
        LEFT JOIN sales_by_barcode s ON s.barcode_8digit = bb.barcode_alias_8digit
        LEFT JOIN returns_by_barcode r ON r.barcode_8digit = bb.barcode_alias_8digit
        LEFT JOIN purchase_returns_by_barcode pr ON pr.barcode_id = bb.barcode_alias_8digit
        WHERE bb.status != 'deleted' AND bb.po_id IS NOT NULL
        GROUP BY bb.po_id, bb.design_no, bb.color, bb.size
      )
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
      LEFT JOIN barcode_stats bs ON bs.po_id = pi.po_id AND bs.design_no = pi.design_no 
        AND COALESCE(bs.color::text, '') = COALESCE(pi.color::text, '') 
        AND COALESCE(bs.size::text, '') = COALESCE(pi.size::text, '')
      WHERE po.order_date BETWEEN '2000-01-01' AND '2099-12-31'
      ORDER BY po.order_date ASC, pi.design_no ASC
      LIMIT 50 OFFSET 0;
    `;

    const res = await AppDataSource.query(query);
    console.log(res.map((r: any) => r['QUERY PLAN']).join('\n'));
    await AppDataSource.destroy();
  } catch (err) {
    console.error(err);
  }
}

runExplain();
