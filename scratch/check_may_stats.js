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
      SELECT COUNT(*) as count FROM sales_invoices si WHERE si.invoice_date BETWEEN '2026-05-01' AND '2026-05-31 23:59:59'
    `);
    console.log("May Invoice count:", res.rows[0].count);
    
    const res2 = await pool.query(`
      SELECT SUM(si.total_mrp) as total_mrp FROM sales_invoices si WHERE si.invoice_date BETWEEN '2026-05-01' AND '2026-05-31 23:59:59'
    `);
    console.log("May Total MRP:", res2.rows[0].total_mrp);
  } catch(e) {
    console.error(e);
  } finally {
    pool.end();
  }
}
run();
