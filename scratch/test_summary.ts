import 'reflect-metadata';
import { AppDataSource, initializeDatabase, closeDatabase } from '../src/config/data-source';

async function testSummary() {
  await initializeDatabase();
  const ds = AppDataSource;
  const design = 'SSU-034-25';

  const whereSql = `pi.design_no = '${design}'`;

  const summaryRes = await ds.query(`
          WITH sales_by_barcode AS (
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
              SUM(COALESCE(s.sold_qty, 0) - COALESCE(r.returned_qty, 0)) as sold_qty,
              SUM(COALESCE(pr.returned_to_vendor_qty, 0)) as returned_qty
            FROM barcode_batches bb
            LEFT JOIN sales_by_barcode s ON s.barcode_8digit = bb.barcode_alias_8digit
            LEFT JOIN returns_by_barcode r ON r.barcode_8digit = bb.barcode_alias_8digit
            LEFT JOIN purchase_returns_by_barcode pr ON pr.barcode_id = bb.barcode_alias_8digit
            WHERE bb.status != 'deleted' AND bb.po_id IS NOT NULL
            GROUP BY bb.po_id, bb.design_no
          ),
          grouped_purchases AS (
            SELECT 
              pi.po_id,
              pi.design_no,
              SUM(pi.quantity) as quantity,
              pi.cost_per_item
            FROM purchase_items pi
            INNER JOIN purchase_orders po ON po.id = pi.po_id
            WHERE ${whereSql}
            GROUP BY pi.po_id, pi.design_no, pi.cost_per_item
          )
          SELECT 
            SUM(gp.quantity) as "totalItems",
            SUM(gp.quantity * gp.cost_per_item) as "totalCostValue",
            (SELECT SUM(bs.sold_qty) FROM barcode_stats bs WHERE EXISTS (SELECT 1 FROM grouped_purchases gp2 WHERE gp2.po_id = bs.po_id AND gp2.design_no = bs.design_no)) as "totalSold",
            (SELECT SUM(bs.returned_qty) FROM barcode_stats bs WHERE EXISTS (SELECT 1 FROM grouped_purchases gp2 WHERE gp2.po_id = bs.po_id AND gp2.design_no = bs.design_no)) as "totalReturned"
          FROM grouped_purchases gp
  `);

  console.log('Summary:', summaryRes);

  await closeDatabase();
}

testSummary().catch(console.error);
