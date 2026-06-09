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
  
  const res1 = await client.query(`
    SELECT SUM(ts.total_amount) as ts_sum 
    FROM tally_sync ts 
    WHERE ts.record_type = 'sales'
  `);
  console.log('Tally Sync Sum:', res1.rows[0].ts_sum);
  
  const res2 = await client.query(`
    SELECT 
      SUM(ROUND(si.net_payable)) + COALESCE((
        SELECT SUM(ROUND(total_return_amount)) 
        FROM sales_returns 
      ), 0) as summary_gross
    FROM sales_invoices si
  `);
  console.log('Summary Gross Sum:', res2.rows[0].summary_gross);
  
  await client.end();
}

run().catch(console.error);
