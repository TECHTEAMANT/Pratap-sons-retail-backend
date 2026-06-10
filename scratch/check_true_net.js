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
      SELECT si.id, si.invoice_number, si.net_payable, si.total_discount, si.special_discount, si.voucher_discount, si.loyalty_redemption_amount, si.additional_charges_total
      FROM sales_invoices si
      WHERE si.invoice_number = 'INV2627000535'
    `);
    
    const invoice = res.rows[0];
    const resItems = await pool.query(`
        SELECT mrp, selling_price, quantity, discount
        FROM sales_invoice_items
        WHERE invoice_id = $1
    `, [invoice.id]);
    
    invoice.items = resItems.rows;

    const trueTotalMrp = (invoice.items || []).reduce((sum, i) => sum + (Number(i.mrp || 0) * Number(i.quantity || 1)), 0);
    const itemSum = (invoice.items || []).reduce((sum, i) => sum + (Number(i.discount || 0) * Number(i.quantity || 1)), 0);
    
    const headerSum = Number(invoice.special_discount || 0) + 
                      Number(invoice.loyalty_redemption_amount || 0) + 
                      Number(invoice.voucher_discount || 0);

    const finalDiscount = Math.max(Math.round(itemSum), Math.round(headerSum));
    
    const trueNetPayable = Math.round(Math.max(0, 
      trueTotalMrp 
      - finalDiscount 
      - Number(invoice.coupon_amount || 0)
      + Number(invoice.additional_charges_total || 0)
    ));
    
    console.log("Invoice.items length:", invoice.items.length);
    console.log("trueTotalMrp:", trueTotalMrp);
    console.log("trueNetPayable:", trueNetPayable);
    console.log("DB net_payable:", invoice.net_payable);

  } catch(e) {
    console.error(e);
  } finally {
    pool.end();
  }
}
run();
