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
  
  const res3 = await client.query(`
    SELECT si.invoice_number, ROUND(si.net_payable) as si_amt, ts.total_amount as ts_amt,
           (ROUND(si.net_payable) - ts.total_amount) as diff
    FROM sales_invoices si
    LEFT JOIN tally_sync ts ON si.id = ts.invoice_id AND ts.record_type = 'sales'
    WHERE ts.total_amount IS NULL OR ROUND(si.net_payable) > ts.total_amount
    ORDER BY diff DESC
  `);
  console.log('Mismatched Invoices Count where si_amt > ts_amt:', res3.rowCount);
  console.log('Sample Mismatches (si_amt > ts_amt):', res3.rows.slice(0, 10));
  
  const res4 = await client.query(`
    SELECT SUM(ROUND(si.net_payable) - COALESCE(ts.total_amount, 0)) as total_missing
    FROM sales_invoices si
    LEFT JOIN tally_sync ts ON si.id = ts.invoice_id AND ts.record_type = 'sales'
    WHERE ROUND(si.net_payable) > COALESCE(ts.total_amount, 0)
  `);
  console.log('Total Missing Amount:', res4.rows[0]);
  
  await client.end();
}

run().catch(console.error);
