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
      SELECT si.id, si.invoice_number, si.net_payable, sr.total_return_amount
      FROM sales_invoices si
      JOIN sales_returns sr ON sr.invoice_id = si.id
      LIMIT 3
    `);
    
    console.log(res.rows);

    // Let's get the original MRP and discount for the first invoice
    if (res.rows.length > 0) {
      const invId = res.rows[0].id;
      const res2 = await pool.query(`
        SELECT mrp, selling_price, quantity, discount
        FROM sales_invoice_items
        WHERE invoice_id = $1
      `, [invId]);
      console.log("Items for", res.rows[0].invoice_number, res2.rows);
    }
  } catch(e) {
    console.error(e);
  } finally {
    pool.end();
  }
}
run();
