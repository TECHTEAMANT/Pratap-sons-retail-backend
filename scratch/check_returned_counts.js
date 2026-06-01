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
      SELECT SUM(sri.quantity) as sum_returned_qty, COUNT(sri.id) as return_rows
      FROM sales_return_items sri
      JOIN sales_returns sr ON sri.return_id = sr.id
      WHERE sr.return_date >= '2026-02-01' AND sr.return_date <= '2026-05-31'
    `);
    console.log("Returned Items Stats:", res.rows[0]);
  } catch(e) {
    console.error(e);
  } finally {
    pool.end();
  }
}
run();
