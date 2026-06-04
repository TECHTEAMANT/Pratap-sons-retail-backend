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
        ts.purchase_return_id as pr_id, 
        ts.total_amount as tally_amt, 
        pr.total_return_amount as pr_amt,
        (ts.total_amount - pr.total_return_amount) as diff
      FROM tally_sync ts
      JOIN purchase_returns pr ON pr.id = ts.purchase_return_id
      WHERE ts.record_type = 'purchase_return'
      AND ts.invoice_date BETWEEN '2026-05-01' AND '2026-05-31'
      AND ts.total_amount != pr.total_return_amount;
    `);
    console.log("Purchase Return Mismatches:");
    console.log(res.rows);
  } catch(e) {
    console.error(e);
  } finally {
    pool.end();
  }
}
run();
