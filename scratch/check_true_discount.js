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
        SUM(si.total_mrp) as total_mrp,
        SUM(si.net_payable) as net_payable,
        SUM(si.additional_charges_total) as extra,
        SUM(si.total_discount) as db_total_discount,
        SUM(si.special_discount) as db_special,
        SUM(si.voucher_discount) as db_voucher
      FROM sales_invoices si
      WHERE si.invoice_date >= '2026-02-01' AND si.invoice_date <= '2026-06-01'
    `);
    
    const row = res.rows[0];
    const totalMrp = parseFloat(row.total_mrp);
    const netPayable = parseFloat(row.net_payable);
    const extra = parseFloat(row.extra);
    
    const trueDiscount = totalMrp - netPayable + extra;
    
    console.log("DB Total Mrp:", totalMrp);
    console.log("DB Net Payable:", netPayable);
    console.log("DB Extra Charges:", extra);
    
    console.log("\nTrue Mathematical Discount:", trueDiscount);
    console.log("What UI is printing for Total Discount:", row.db_total_discount);
    console.log("What UI is printing for Special:", row.db_special);
    console.log("What UI is printing for Voucher:", row.db_voucher);
    
  } catch(e) {
    console.error(e);
  } finally {
    pool.end();
  }
}
run();
