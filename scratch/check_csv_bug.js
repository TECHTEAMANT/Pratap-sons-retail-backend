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
        si.invoice_number,
        si.total_mrp,
        si.net_payable,
        (SELECT SUM(discount * quantity) FROM sales_invoice_items sii WHERE sii.invoice_id = si.id) as item_discount,
        si.special_discount,
        si.voucher_discount,
        si.loyalty_redemption_amount
      FROM sales_invoices si
      WHERE si.invoice_number = 'INV2026000352'
    `);
    
    const inv = res.rows[0];
    console.log("DB Record:", inv);
    
    const reconstructedMRP = parseFloat(inv.total_mrp);
    const reconstructedItemDisc = parseFloat(inv.item_discount) || 0;
    
    const totalHeaderBundle = (parseFloat(inv.total_discount) || 0) + 
                             (parseFloat(inv.special_discount) || 0) + 
                             (parseFloat(inv.voucher_discount) || 0) + 
                             (parseFloat(inv.loyalty_redemption_amount) || 0);

    const totalDisc = (reconstructedItemDisc > 0.01) ? reconstructedItemDisc : totalHeaderBundle;
    const originalNet = Math.round(reconstructedMRP - totalDisc);
    
    console.log("CSV Calculated totalDisc:", totalDisc);
    console.log("CSV Calculated Net Amount:", originalNet);
    console.log("True DB net_payable:", inv.net_payable);
    
  } catch(e) {
    console.error(e);
  } finally {
    pool.end();
  }
}
run();
