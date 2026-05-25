import 'reflect-metadata';
import { AppDataSource, initializeDatabase, closeDatabase } from '../src/config/data-source';

async function checkStockLedger() {
  await initializeDatabase();
  const ds = AppDataSource;
  
  const query = `
      SELECT 
        agg.barcode,
        agg.design_no, 
        agg.product_group, 
        agg.opening_stock,
        agg.purchased_qty,
        agg.sales_return_qty,
        agg.sold_qty,
        agg.purchase_return_qty,
        agg.closing_stock
      FROM (
        SELECT 
          t.barcode,
          t.design_no,
          t.product_group,
          SUM(t.opening_qty) as opening_stock,
          SUM(t.purchased_qty) as purchased_qty,
          SUM(t.sales_return_qty) as sales_return_qty,
          SUM(t.sold_qty) as sold_qty,
          SUM(t.purchase_return_qty) as purchase_return_qty,
          SUM(t.opening_qty + t.purchased_qty + t.sales_return_qty - t.sold_qty - t.purchase_return_qty) as closing_stock
        FROM (
        SELECT bb.barcode_alias_8digit as barcode, bb.design_no, pg.name as product_group,
               0 as opening_qty, SUM(bb.total_quantity) as purchased_qty, 0 as sales_return_qty, 0 as sold_qty, 0 as purchase_return_qty
        FROM barcode_batches bb
        LEFT JOIN product_groups pg ON pg.id = bb.product_group
        LEFT JOIN purchase_orders po ON po.id = bb.po_id
        WHERE bb.status != 'deleted' AND bb.design_no = 'COT FEB 2'
        GROUP BY bb.barcode_alias_8digit, bb.design_no, pg.name
        ) t
        WHERE t.barcode IS NOT NULL
        GROUP BY t.barcode, t.design_no, t.product_group
      ) agg
  `;
  const res = await ds.query(query);
  console.log('Stock Ledger for COT FEB 2:');
  console.table(res);

  await closeDatabase();
}

checkStockLedger().catch(console.error);
