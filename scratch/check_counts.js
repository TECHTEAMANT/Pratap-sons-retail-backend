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
    const res = await pool.query(`
      SELECT 
        COUNT(sii.id) as rows_count,
        SUM(sii.quantity) as sum_qty
      FROM sales_invoice_items sii
      JOIN sales_invoices si ON sii.invoice_id = si.id
      WHERE si.invoice_date >= '2026-02-01' AND si.invoice_date <= '2026-05-31'
    `);
    console.log("Stats:", res.rows[0]);
  } catch(e) {
    console.error(e);
  } finally {
    pool.end();
  }
}
run();
