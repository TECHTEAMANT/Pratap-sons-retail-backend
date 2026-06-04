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
      SELECT COUNT(*) as count
      FROM sales_invoices si
      WHERE si.invoice_date >= '2026-02-01' AND si.invoice_date <= '2026-06-01'
    `);
    
    console.log("Invoice count:", res.rows[0].count);
  } catch(e) {
    console.error(e);
  } finally {
    pool.end();
  }
}
run();
