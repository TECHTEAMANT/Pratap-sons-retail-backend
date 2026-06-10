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
      WHERE si.invoice_date >= '2026-02-01' AND si.invoice_date <= '2026-05-31'
    `);
    console.log("Sales Analysis (Feb-May):", res1.rows[0]);

    const res2 = await pool.query(`
      SELECT COUNT(*) as invoice_count, SUM(
        (SELECT SUM(quantity) FROM sales_invoice_items sii WHERE sii.invoice_id = si.id)
      ) as sum_qty_per_invoice
      FROM sales_invoices si
      WHERE si.invoice_date >= '2026-02-01' AND si.invoice_date <= '2026-05-31'
    `);
    console.log("Sales Summary (Feb-May):", res2.rows[0]);

  } catch(e) {
    console.error(e);
  } finally {
    pool.end();
  }
}
run();
