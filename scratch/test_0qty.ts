import 'reflect-metadata';
import { AppDataSource, initializeDatabase, closeDatabase } from '../src/config/data-source';

async function check0Qty() {
  await initializeDatabase();
  const ds = AppDataSource;
  const res = await ds.query(`SELECT barcode_alias_8digit, design_no, total_quantity, status FROM barcode_batches WHERE total_quantity = 0 LIMIT 1`);
  console.log('Barcode with 0 qty:', res);

  if (res.length > 0) {
    const b = res[0].barcode_alias_8digit;
    const ledger = await ds.query(`
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
        WHERE bb.barcode_alias_8digit = $1 AND bb.status != 'deleted'
        GROUP BY bb.barcode_alias_8digit
        ) t
        GROUP BY t.barcode
      ) agg
    `, [b]);
    console.log('Ledger row for this barcode:', ledger);
  }

  await closeDatabase();
}

check0Qty().catch(console.error);
