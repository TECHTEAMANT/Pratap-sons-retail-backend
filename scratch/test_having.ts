import 'reflect-metadata';
import { AppDataSource, initializeDatabase, closeDatabase } from '../src/config/data-source';

async function testHaving() {
  await initializeDatabase();
  const ds = AppDataSource;
  const res = await ds.query(`
      SELECT 
          agg.barcode,
          agg.opening_stock,
          agg.purchased_qty,
          agg.sales_return_qty,
          agg.sold_qty,
          agg.purchase_return_qty,
          agg.closing_stock
      FROM (
        SELECT 
          t.barcode,
          SUM(t.opening_qty) as opening_stock,
          SUM(t.purchased_qty) as purchased_qty,
          SUM(t.sales_return_qty) as sales_return_qty,
          SUM(t.sold_qty) as sold_qty,
          SUM(t.purchase_return_qty) as purchase_return_qty,
          SUM(t.opening_qty + t.purchased_qty + t.sales_return_qty - t.sold_qty - t.purchase_return_qty) as closing_stock
        FROM (
        SELECT bb.barcode_alias_8digit as barcode,
               0 as opening_qty, SUM(bb.total_quantity) as purchased_qty, 0 as sales_return_qty, 0 as sold_qty, 0 as purchase_return_qty
        FROM barcode_batches bb
        WHERE bb.barcode_alias_8digit = '00002944' AND bb.status != 'deleted'
        GROUP BY bb.barcode_alias_8digit
        ) t
        GROUP BY t.barcode
      ) agg
      HAVING agg.opening_stock != 0 OR agg.purchased_qty != 0 OR agg.sales_return_qty != 0 OR agg.sold_qty != 0 OR agg.purchase_return_qty != 0
  `);
  console.log('Result with HAVING:', res);

  await closeDatabase();
}

testHaving().catch(console.error);
