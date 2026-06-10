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
      SELECT si.id, si.net_payable, si.total_discount, si.special_discount, si.voucher_discount, si.loyalty_redemption_amount, si.additional_charges_total
      FROM sales_invoices si
      WHERE si.invoice_date >= '2026-02-01' AND si.invoice_date <= '2026-06-01'
    `);
    
    let sumDbNet = 0;
    let sumReconstructedNet = 0;
    
    for (let inv of res.rows) {
      sumDbNet += parseFloat(inv.net_payable);
      
      const resItems = await pool.query(`
        SELECT mrp, selling_price, quantity, discount
        FROM sales_invoice_items
        WHERE invoice_id = $1
      `, [inv.id]);
      
      const reconstructedMRP = resItems.rows.reduce((s, i) => s + (Number(i.mrp || i.selling_price || 0) * Number(i.quantity || 1)), 0);
      const reconstructedItemDisc = resItems.rows.reduce((s, i) => s + (Number(i.discount || 0) * Number(i.quantity || 1)), 0);
      
      const totalHeaderBundle = (parseFloat(inv.total_discount) || 0) + 
                               (parseFloat(inv.special_discount) || 0) + 
                               (parseFloat(inv.voucher_discount) || 0) + 
                               (parseFloat(inv.loyalty_redemption_amount) || 0);

      const totalDisc = (reconstructedItemDisc > 0.01) ? reconstructedItemDisc : totalHeaderBundle;
      const originalNet = Math.round(reconstructedMRP - totalDisc + (parseFloat(inv.additional_charges_total) || 0));
      
      sumReconstructedNet += originalNet;
    }
    
    console.log("DB SUM:", sumDbNet);
    console.log("CSV Reconstructed SUM:", sumReconstructedNet);
  } catch(e) {
    console.error(e);
  } finally {
    pool.end();
  }
}
run();
