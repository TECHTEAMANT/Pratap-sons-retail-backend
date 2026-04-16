const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});
pool.query("SELECT id, invoice_number, total_mrp, total_discount, voucher_discount, special_discount, loyalty_redemption_amount, coupon_amount, net_payable FROM sales_invoices WHERE total_mrp = '161380'")
  .then(res => {
    console.log("INVOICE:", JSON.stringify(res.rows[0], null, 2));
    if (res.rows[0]) {
      return pool.query("SELECT * FROM sales_invoice_items WHERE sales_invoice_id = $1", [res.rows[0].id]);
    }
  })
  .then(res => {
    if (res) console.log("ITEMS:", JSON.stringify(res.rows, null, 2));
    pool.end();
  })
  .catch(e => console.error(e));
