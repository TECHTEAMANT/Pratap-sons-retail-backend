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
      SELECT si.invoice_number, si.total_discount, 
             (SELECT SUM(discount * quantity) FROM sales_invoice_items sii WHERE sii.invoice_id = si.id) as item_discount_sum,
             si.special_discount
      FROM sales_invoices si
      WHERE si.total_discount > (SELECT COALESCE(SUM(discount * quantity), 0) FROM sales_invoice_items sii WHERE sii.invoice_id = si.id) + 1
      LIMIT 10
    `);
    
    console.log(res.rows);
  } catch(e) {
    console.error(e);
  } finally {
    pool.end();
  }
}
run();
