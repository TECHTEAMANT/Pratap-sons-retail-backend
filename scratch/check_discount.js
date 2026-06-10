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
      SELECT si.id, si.invoice_number, si.total_discount, si.special_discount, si.voucher_discount, si.loyalty_redemption_amount
      FROM sales_invoices si
      WHERE si.invoice_date >= '2026-02-01' AND si.invoice_date <= '2026-06-01'
    `);
    
    let sumDbTotalDiscount = 0;
    let sumDbSpecial = 0;
    let sumDbLoyalty = 0;
    
    let sumCsvBaseDiscount = 0;
    let sumCsvSpecial = 0;
    let sumCsvLoyalty = 0;
    
    for (let inv of res.rows) {
      // Summary cards directly use si.total_discount, special_discount, etc.
      sumDbTotalDiscount += parseFloat(inv.total_discount || 0);
      sumDbSpecial += parseFloat(inv.special_discount || 0);
      sumDbLoyalty += parseFloat(inv.loyalty_redemption_amount || 0);
      
      // CSV logic:
      const resItems = await pool.query(`
        SELECT discount, quantity
        FROM sales_invoice_items
        WHERE invoice_id = $1
      `, [inv.id]);
      
      const reconstructedItemDisc = resItems.rows.reduce((s, i) => s + (Number(i.discount || 0) * Number(i.quantity || 1)), 0);
      
      const visualItemDiscount = Math.max(0, reconstructedItemDisc - (parseFloat(inv.special_discount) || 0) - (parseFloat(inv.loyalty_redemption_amount) || 0) - (parseFloat(inv.voucher_discount) || 0));
      
      sumCsvBaseDiscount += visualItemDiscount;
      sumCsvSpecial += parseFloat(inv.special_discount || 0);
      sumCsvLoyalty += parseFloat(inv.loyalty_redemption_amount || 0);
    }
    
    console.log("DB Sum (Summary Cards):");
    console.log("total_discount:", sumDbTotalDiscount);
    console.log("special_discount:", sumDbSpecial);
    console.log("loyalty:", sumDbLoyalty);
    console.log("Overall DB Discount Sum:", sumDbTotalDiscount + sumDbSpecial + sumDbLoyalty);
    
    console.log("\nCSV Sum:");
    console.log("base_discount:", sumCsvBaseDiscount);
    console.log("special_discount:", sumCsvSpecial);
    console.log("loyalty:", sumCsvLoyalty);
    console.log("Overall CSV Discount Sum:", sumCsvBaseDiscount + sumCsvSpecial + sumCsvLoyalty);

  } catch(e) {
    console.error(e);
  } finally {
    pool.end();
  }
}
run();
