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
      SELECT si.invoice_number, 
             si.total_mrp as db_mrp, 
             (SELECT SUM(mrp * quantity) FROM sales_invoice_items sii WHERE sii.invoice_id = si.id) as item_mrp
      FROM sales_invoices si
      WHERE si.invoice_date BETWEEN '2026-02-01' AND '2026-06-01'
      AND ABS(si.total_mrp - (SELECT SUM(mrp * quantity) FROM sales_invoice_items sii WHERE sii.invoice_id = si.id)) > 10
      LIMIT 10
    `);
    
    console.log(res.rows);
  } catch(e) {
    console.error(e);
  } finally {
    pool.end();
  }
}
run();
