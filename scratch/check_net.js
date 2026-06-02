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
      SELECT SUM(net_payable) as sum_net_payable
      FROM sales_invoices
      WHERE invoice_date >= '2026-02-01' AND invoice_date <= '2026-06-01'
    `);
    console.log("DB SUM(net_payable):", res.rows[0].sum_net_payable);

    const res2 = await pool.query(`
      SELECT SUM(total_return_amount) as sum_return_amt
      FROM sales_returns
      WHERE return_date >= '2026-02-01' AND return_date <= '2026-06-01'
    `);
    console.log("DB SUM(returns):", res2.rows[0].sum_return_amt);
    
    console.log("DB Net (Gross - Returns):", parseFloat(res.rows[0].sum_net_payable) - parseFloat(res2.rows[0].sum_return_amt || 0));
  } catch(e) {
    console.error(e);
  } finally {
    pool.end();
  }
}
run();
