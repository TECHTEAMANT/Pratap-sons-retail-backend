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
      SELECT COUNT(*) as exact_matches FROM sales_invoices si
      WHERE si.net_payable = (
        SELECT SUM(sii.mrp - sii.discount) 
        FROM sales_invoice_items sii 
        WHERE sii.invoice_id = si.id
      )
    `);
    
    const res2 = await pool.query(`
      SELECT COUNT(*) as unmatching FROM sales_invoices si
      WHERE ROUND(si.net_payable::numeric, 2) != ROUND((
        SELECT SUM(sii.mrp - sii.discount) 
        FROM sales_invoice_items sii 
        WHERE sii.invoice_id = si.id
      )::numeric, 2)
    `);
    
    console.log("Matching net_payable:", res.rows[0].exact_matches);
    console.log("UNMATCHING net_payable:", res2.rows[0].unmatching);
  } catch(e) {
    console.error(e);
  } finally {
    pool.end();
  }
}
run();
