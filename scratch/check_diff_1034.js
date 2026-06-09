const { Client } = require('pg');

const client = new Client({
  host: 'localhost',
  port: 5432,
  database: 'invento_erp',
  user: 'postgres',
  password: 'Root@123',
});

async function run() {
  await client.connect();
  
  const res = await client.query(`
    WITH InvoiceGross AS (
      SELECT 
        si.id as invoice_id,
        si.invoice_number,
        ROUND(si.net_payable) + COALESCE((
          SELECT SUM(ROUND(total_return_amount)) 
          FROM sales_returns 
          WHERE invoice_id = si.id
        ), 0) as summary_gross
      FROM sales_invoices si
    )
    SELECT 
      ig.invoice_number,
      ig.summary_gross,
      ts.total_amount as tally_amount,
      (ig.summary_gross - ts.total_amount) as diff
    FROM InvoiceGross ig
    JOIN tally_sync ts ON ig.invoice_id = ts.invoice_id AND ts.record_type = 'sales'
    WHERE ig.summary_gross != ts.total_amount
    ORDER BY ABS(ig.summary_gross - ts.total_amount) DESC
  `);
  
  console.log('Mismatched Invoices Count:', res.rowCount);
  console.log('Total Difference (Summary Gross - Tally Sync):', res.rows.reduce((sum, r) => sum + Number(r.diff), 0));
  console.log('Sample Mismatches:', res.rows.slice(0, 50));
  
  await client.end();
}

run().catch(console.error);
