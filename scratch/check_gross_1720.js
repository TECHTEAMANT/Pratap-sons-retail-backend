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
    SELECT si.invoice_number, si.invoice_date, ROUND(si.net_payable) as net, 
           (ROUND(si.net_payable) + COALESCE((SELECT SUM(ROUND(total_return_amount)) FROM sales_returns WHERE invoice_id = si.id), 0)) as gross
    FROM sales_invoices si
    WHERE (ROUND(si.net_payable) + COALESCE((SELECT SUM(ROUND(total_return_amount)) FROM sales_returns WHERE invoice_id = si.id), 0)) = 1720
  `);
  console.log('Invoices with Gross 1720:', res.rows);
  
  await client.end();
}

run().catch(console.error);
