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
      WITH combined_data AS (
        SELECT 
          po.id as po_id,
          po.total_amount,
          po.taxable_value,
          po.ledger_discount,
          pi.quantity,
          ((pi.cost_per_item * pi.quantity) * (COALESCE(po.total_amount, 0) / COALESCE(NULLIF((COALESCE(po.taxable_value, 0) + COALESCE(po.ledger_discount, 0)), 0), 1))) as cost_val
        FROM purchase_items pi
        INNER JOIN purchase_orders po ON po.id = pi.po_id
        WHERE po.order_date BETWEEN '2026-05-01' AND '2026-05-31'
      )
      SELECT 
        SUM(cost_val) as "totalCost"
      FROM combined_data
    `);
    
    const res2 = await pool.query(`
      SELECT SUM(po.total_amount) as total_purchase
      FROM purchase_orders po
      WHERE po.order_date BETWEEN '2026-05-01' AND '2026-05-31'
    `);

    console.log("Scaled Items Sum:", res.rows[0].totalCost);
    console.log("PO Total Sum:", res2.rows[0].total_purchase);
  } catch(e) {
    console.error(e);
  } finally {
    pool.end();
  }
}
run();
