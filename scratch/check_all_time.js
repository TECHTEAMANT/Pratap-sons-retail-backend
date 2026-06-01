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
    const res1 = await pool.query(`
      SELECT SUM(quantity) as sum_qty, COUNT(*) as total_rows 
      FROM sales_invoice_items
    `);
    const res2 = await pool.query(`
      SELECT SUM(quantity) as sum_qty, COUNT(*) as total_rows 
      FROM sales_return_items
    `);
    
    console.log("All time sold:", res1.rows[0]);
    console.log("All time returned:", res2.rows[0]);
    
    const sold_rows = parseInt(res1.rows[0].total_rows);
    const returned_rows = parseInt(res2.rows[0].total_rows);
    console.log("Total rows in Sales Analysis (Sold + Returned):", sold_rows + returned_rows);
    
    const sold_qty = parseInt(res1.rows[0].sum_qty);
    const returned_qty = parseInt(res2.rows[0].sum_qty);
    console.log("Net Quantity (Sold Qty - Returned Qty):", sold_qty - returned_qty);
    
  } catch(e) {
    console.error(e);
  } finally {
    pool.end();
  }
}
run();
