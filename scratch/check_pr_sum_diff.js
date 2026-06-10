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
      SELECT SUM(total_amount) as tally_amt
      FROM tally_sync
      WHERE record_type = 'purchase_return'
      AND invoice_date BETWEEN '2026-05-01' AND '2026-05-31';
    `);
    
    const res2 = await pool.query(`
      SELECT SUM(total_return_amount) as pr_amt
      FROM purchase_returns
      WHERE return_date BETWEEN '2026-05-01' AND '2026-05-31'
      AND status != 'Draft';
    `);

    console.log("Tally Sync Total:", res.rows[0].tally_amt);
    console.log("Purchase Return Total:", res2.rows[0].pr_amt);
  } catch(e) {
    console.error(e);
  } finally {
    pool.end();
  }
}
run();
