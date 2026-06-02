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
      SELECT invoice_number, total_mrp, net_payable, additional_charges_total, total_discount, special_discount, voucher_discount
      FROM sales_invoices
      WHERE ABS(total_mrp - net_payable + additional_charges_total - total_discount) > 1
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
