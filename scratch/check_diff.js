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
  
  const res1 = await client.query('SELECT count(*), sum(ROUND(net_payable)) FROM sales_invoices');
  console.log('Sales Invoices:', res1.rows[0]);
  
  const res2 = await client.query("SELECT count(*), sum(total_amount) FROM tally_sync WHERE record_type = 'sales'");
  console.log('Tally Sync Sales:', res2.rows[0]);

  // Find the exact invoices missing or having mismatched amounts
  const res3 = await client.query(`
    SELECT si.invoice_number, ROUND(si.net_payable) as si_amt, ts.total_amount as ts_amt
    FROM sales_invoices si
    LEFT JOIN tally_sync ts ON si.id = ts.invoice_id AND ts.record_type = 'sales'
    WHERE ts.total_amount IS NULL OR ROUND(si.net_payable) != ts.total_amount
  `);
  console.log('Mismatched Invoices Count:', res3.rowCount);
  console.log('Sample Mismatches:', res3.rows.slice(0, 5));
  
  await client.end();
}

run().catch(console.error);
