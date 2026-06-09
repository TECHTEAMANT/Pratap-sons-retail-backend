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
    WHERE net_payable = 1720 OR ROUND(net_payable) = 1720
  `);
  console.log('Invoices with 1720:', res.rows);
  
  await client.end();
}

run().catch(console.error);
