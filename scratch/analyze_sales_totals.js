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
        COUNT(*) as invoice_count,
        SUM(net_payable) as system_total_net,
        SUM(total_mrp) as system_total_mrp
      FROM sales_invoices
      WHERE invoice_date >= '2026-02-01' AND invoice_date <= '2026-05-31'
    `);
    
    console.log("System Totals (Feb - May):", res.rows[0]);

    // Check tally_sync
    const syncRes = await pool.query(`
      SELECT 
        COUNT(*) as sync_count,
        SUM(total_amount) as tally_total_amount
      FROM tally_sync
      WHERE record_type = 'sales' 
      AND invoice_date >= '2026-02-01' AND invoice_date <= '2026-05-31'
      AND sync_status = 'synced'
    `);

    console.log("Tally Sync Totals (synced) (Feb - May):", syncRes.rows[0]);
    
    const syncResAll = await pool.query(`
      SELECT 
        COUNT(*) as sync_count,
        SUM(total_amount) as tally_total_amount
      FROM tally_sync
      WHERE record_type = 'sales' 
      AND invoice_date >= '2026-02-01' AND invoice_date <= '2026-05-31'
    `);

    console.log("Tally Sync Totals (all) (Feb - May):", syncResAll.rows[0]);

    // Check mapping function logic for sales_invoices
    // We don't have direct access here, but we can query to see if there are discrepancies
    // between net_payable and tally_sync's total_amount for specific invoices
    
    const discRes = await pool.query(`
      SELECT 
        s.invoice_number, 
        s.net_payable as sys_net, 
        t.total_amount as tally_total,
        (s.net_payable - t.total_amount) as diff
      FROM sales_invoices s
      JOIN tally_sync t ON s.invoice_number = t.invoice_number AND t.record_type = 'sales'
      WHERE s.invoice_date >= '2026-02-01' AND s.invoice_date <= '2026-05-31'
      AND ABS(s.net_payable - t.total_amount) > 1
      LIMIT 5
    `);
    
    if (discRes.rows.length > 0) {
      console.log("Found invoices with differences between system net_payable and tally_sync total_amount:");
      console.log(discRes.rows);
    } else {
      console.log("All matching invoices have exactly the same net_payable as tally_sync total_amount.");
    }

  } catch(e) {
    console.error(e);
  } finally {
    pool.end();
  }
}
run();
