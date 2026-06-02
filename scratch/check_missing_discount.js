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
      SELECT si.invoice_number, 
             si.total_mrp, 
             si.net_payable, 
             si.additional_charges_total,
             (si.total_mrp - si.net_payable + COALESCE(si.additional_charges_total, 0)) as math_discount,
             (SELECT SUM(discount * quantity) FROM sales_invoice_items sii WHERE sii.invoice_id = si.id) as item_discount,
             si.special_discount,
             si.voucher_discount,
             si.loyalty_redemption_amount
      FROM sales_invoices si
      WHERE si.invoice_date >= '2026-02-01' AND si.invoice_date <= '2026-06-01'
      AND ABS((si.total_mrp - si.net_payable + COALESCE(si.additional_charges_total, 0)) - 
              (COALESCE((SELECT SUM(discount * quantity) FROM sales_invoice_items sii WHERE sii.invoice_id = si.id), 0) + 
               COALESCE(si.special_discount, 0) + 
               COALESCE(si.voucher_discount, 0) + 
               COALESCE(si.loyalty_redemption_amount, 0))) > 100
      LIMIT 10
    `);
    
    console.log("Invoices where Math Discount != Sum of All Saved Discounts:");
    console.log(res.rows);
  } catch(e) {
    console.error(e);
  } finally {
    pool.end();
  }
}
run();
