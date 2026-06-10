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
    console.log("Starting DB Fix for net_payable...");
    // Find all invoices where net_payable does not match reconstructed
    const res = await pool.query(`
      SELECT si.id, si.invoice_number, si.net_payable, si.total_discount, si.special_discount, si.voucher_discount, si.loyalty_redemption_amount, si.additional_charges_total
      FROM sales_invoices si
    `);
    
    let updatedCount = 0;
    
    for (let inv of res.rows) {
      const resItems = await pool.query(`
        SELECT mrp, selling_price, quantity, discount
        FROM sales_invoice_items
        WHERE invoice_id = $1
      `, [inv.id]);
      
      const trueTotalMrp = resItems.rows.reduce((s, i) => s + (Number(i.mrp || 0) * Number(i.quantity || 1)), 0);
      const itemSum = resItems.rows.reduce((s, i) => s + (Number(i.discount || 0) * Number(i.quantity || 1)), 0);
      
      const headerSum = Number(inv.special_discount || 0) + 
                        Number(inv.loyalty_redemption_amount || 0) + 
                        Number(inv.voucher_discount || 0);

      const finalDiscount = Math.max(Math.round(itemSum), Math.round(headerSum));
      
      const trueNetPayable = Math.round(Math.max(0, 
        trueTotalMrp 
        - finalDiscount 
        + Number(inv.additional_charges_total || 0)
      ));
      
      // If db value is off by more than 1 rupee
      if (Math.abs(Number(inv.net_payable) - trueNetPayable) > 1) {
        await pool.query(`
          UPDATE sales_invoices
          SET net_payable = $1
          WHERE id = $2
        `, [trueNetPayable, inv.id]);
        updatedCount++;
      }
    }
    
    console.log("Successfully fixed", updatedCount, "invoices.");
  } catch(e) {
    console.error(e);
  } finally {
    pool.end();
  }
}
run();
