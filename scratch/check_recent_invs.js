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
    SELECT invoice_number, invoice_date, net_payable 
    FROM sales_invoices 
    ORDER BY invoice_date DESC 
    LIMIT 5
  `);
  console.log('Recent Invoices:', res.rows);
  
  await client.end();
}

run().catch(console.error);
