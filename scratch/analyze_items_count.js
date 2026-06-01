const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

async function run() {
  try {
    // 1. Total rows in sales_invoice_items
    const res1 = await pool.query(`
      SELECT SUM(quantity) as sum_qty, COUNT(*) as total_rows 
      FROM sales_invoice_items sii
      JOIN sales_invoices si ON sii.invoice_id = si.id
    `);
    console.log("Sales Analysis (sales_invoice_items):", res1.rows[0]);

    // 2. See how Sales Summary calculates "total items"
    // Does it sum(quantity)?
    const res2 = await pool.query(`
      SELECT COUNT(*) as invoice_count, SUM(
        (SELECT SUM(quantity) FROM sales_invoice_items sii WHERE sii.invoice_id = si.id)
      ) as sum_qty_per_invoice
      FROM sales_invoices si
    `);
    console.log("Sales Summary (sales_invoices):", res2.rows[0]);

    // 3. Are there soft-deleted invoices or items?
    const res3 = await pool.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'sales_invoices' AND column_name LIKE '%deleted%'
    `);
    console.log("Deleted columns in sales_invoices:", res3.rows);
    
    // 4. Check if some items have quantity > 1
    const res4 = await pool.query(`
      SELECT COUNT(*) as items_with_qty_gt_1 
      FROM sales_invoice_items 
      WHERE quantity > 1
    `);
    console.log("Items with quantity > 1:", res4.rows[0]);

  } catch(e) {
    console.error(e);
  } finally {
    pool.end();
  }
}
run();
