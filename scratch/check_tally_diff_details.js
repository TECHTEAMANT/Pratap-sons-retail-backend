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
        po.id, po.total_amount, po.taxable_value, po.ledger_discount, po.ledger_freight, po.manual_gst_amount,
        (SELECT SUM(pi.cost_per_item * pi.quantity) FROM purchase_items pi WHERE pi.po_id = po.id) as pi_sum,
        po.gst_breakdown
      FROM purchase_orders po
      WHERE po.id = '0ed445ed-42bc-4b43-944f-4e4a60aed151' OR po.id = '96181ea6-d704-4e39-954d-d488d3f4234b';
    `);
    console.log(res.rows);
  } catch(e) {
    console.error(e);
  } finally {
    pool.end();
  }
}
run();
