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
        ts.po_id, 
        ts.total_amount as tally_amt, 
        po.total_amount as po_amt,
        (ts.total_amount - po.total_amount) as diff
      FROM tally_sync ts
      JOIN purchase_orders po ON po.id = ts.po_id
      WHERE ts.record_type = 'purchase'
      AND ts.invoice_date BETWEEN '2026-05-01' AND '2026-05-31'
      AND ts.total_amount != po.total_amount;
    `);
    console.log(res.rows);
  } catch(e) {
    console.error(e);
  } finally {
    pool.end();
  }
}
run();
