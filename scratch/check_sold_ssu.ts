import 'reflect-metadata';
import { AppDataSource, initializeDatabase, closeDatabase } from '../src/config/data-source';

async function checkSoldQty() {
  await initializeDatabase();
  const ds = AppDataSource;
  const design = 'SSU-034-25';

  console.log(`Analyzing Design: ${design}`);

  // 1. Check sales_invoice_items
  const salesItems = await ds.query(`
    SELECT si.id, si.invoice_id, s.invoice_number, si.quantity, si.barcode_8digit as barcode, bb.design_no
    FROM sales_invoice_items si
    JOIN sales_invoices s ON s.id = si.invoice_id
    LEFT JOIN barcode_batches bb ON bb.barcode_alias_8digit = si.barcode_8digit
    WHERE bb.design_no = $1 OR si.barcode_8digit IN (SELECT barcode_alias_8digit FROM barcode_batches WHERE design_no = $1)
  `, [design]);
  
  console.log('--- Sales Items ---');
  let totalSold = 0;
  for (const item of salesItems) {
    totalSold += Number(item.quantity);
  }
  console.table(salesItems);
  console.log(`Total Sold Qty (from sales_invoice_items): ${totalSold}`);

  const returnItems = await ds.query(`
    SELECT sri.id, sri.return_id, sr.return_number, sri.quantity, sri.barcode_8digit as barcode, bb.design_no
    FROM sales_return_items sri
    JOIN sales_returns sr ON sr.id = sri.return_id
    LEFT JOIN barcode_batches bb ON bb.barcode_alias_8digit = sri.barcode_8digit
    WHERE bb.design_no = $1 OR sri.barcode_8digit IN (SELECT barcode_alias_8digit FROM barcode_batches WHERE design_no = $1)
  `, [design]);

  console.log('--- Sales Return Items ---');
  let totalReturned = 0;
  for (const item of returnItems) {
    totalReturned += Number(item.quantity);
  }
  console.table(returnItems);
  console.log(`Total Sales Return Qty (from sales_return_items): ${totalReturned}`);
  console.log(`Net Sold Qty: ${totalSold - totalReturned}`);

  // 2. Check barcode_batches for sold_qty
  const barcodeBatches = await ds.query(`
    SELECT id, barcode_alias_8digit, total_quantity, available_quantity, (total_quantity - available_quantity) as diff_sold
    FROM barcode_batches
    WHERE design_no = $1
  `, [design]);
  console.log('--- Barcode Batches ---');
  console.table(barcodeBatches);
  
  // 3. Let's check stock ledger calculation directly for this design
  const stockLedger = await ds.query(`
      SELECT 
        agg.barcode,
        agg.design_no, 
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
          SUM(t.opening_qty) as opening_stock,
          SUM(t.purchased_qty) as purchased_qty,
          SUM(t.sales_return_qty) as sales_return_qty,
          SUM(t.sold_qty) as sold_qty,
          SUM(t.purchase_return_qty) as purchase_return_qty,
          SUM(t.opening_qty + t.purchased_qty + t.sales_return_qty - t.sold_qty - t.purchase_return_qty) as closing_stock
        FROM (
          -- Sales
          SELECT si.barcode_8digit as barcode, bb.design_no, 0 as opening_qty, 0 as purchased_qty, 0 as sales_return_qty, SUM(si.quantity) as sold_qty, 0 as purchase_return_qty
          FROM sales_invoice_items si
          JOIN sales_invoices s ON s.id = si.invoice_id
          JOIN barcode_batches bb ON bb.barcode_alias_8digit = si.barcode_8digit
          WHERE bb.design_no = $1
          GROUP BY si.barcode_8digit, bb.design_no
        ) t
        GROUP BY t.barcode, t.design_no
      ) agg
  `, [design]);
  console.log('--- Stock Ledger Sold Qty calculation ---');
  console.table(stockLedger);

  await closeDatabase();
}

checkSoldQty().catch(console.error);
