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
        po.id,
        po.total_amount,
        po.taxable_value,
        po.ledger_discount,
        po.ledger_freight,
        (SELECT SUM(pi.cost_per_item * pi.quantity) FROM purchase_items pi WHERE pi.po_id = po.id) as pi_sum
      FROM purchase_orders po
      WHERE po.order_date BETWEEN '2026-05-01' AND '2026-05-31'
      LIMIT 10;
    `);
    console.log(res.rows);
  } catch(e) {
    console.error(e);
  } finally {
    pool.end();
  }
}
run();
