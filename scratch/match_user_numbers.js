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
      SELECT SUM(quantity) as sum_qty
      FROM sales_invoice_items sii
      JOIN sales_invoices si ON sii.invoice_id = si.id
      WHERE si.invoice_date >= '2026-02-01' AND si.invoice_date <= '2026-05-31'
    `);
    const grossQty = parseInt(res.rows[0].sum_qty) || 0;

    const res2 = await pool.query(`
      SELECT SUM(sri.quantity) as sum_qty
      FROM sales_return_items sri
      JOIN sales_returns sr ON sri.return_id = sr.id
      WHERE sr.return_date >= '2026-02-01' AND sr.return_date <= '2026-05-31'
    `);
    const returnQty = parseInt(res2.rows[0].sum_qty) || 0;

    console.log("grossQty:", grossQty);
    console.log("returnQty:", returnQty);
    console.log("grossQty - returnQty:", grossQty - returnQty);

    const res3 = await pool.query(`
      SELECT SUM(quantity) as sum_qty
      FROM sales_invoice_items sii
      JOIN sales_invoices si ON sii.invoice_id = si.id
      WHERE si.invoice_date >= '2026-02-01' AND si.invoice_date <= '2026-05-27'
    `);
    const res4 = await pool.query(`
      SELECT SUM(sri.quantity) as sum_qty
      FROM sales_return_items sri
      JOIN sales_returns sr ON sri.return_id = sr.id
      WHERE sr.return_date >= '2026-02-01' AND sr.return_date <= '2026-05-27'
    `);
    console.log("Until May 27 - gross:", res3.rows[0].sum_qty, "return:", res4.rows[0].sum_qty);
    console.log("Net Until May 27:", parseInt(res3.rows[0].sum_qty) - parseInt(res4.rows[0].sum_qty));
    
  } catch(e) {
    console.error(e);
  } finally {
    pool.end();
  }
}
run();
