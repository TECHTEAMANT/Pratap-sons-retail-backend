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
    SELECT *
    FROM sales_invoices
    WHERE invoice_number = 'INV2026000023'
  `);
  
  console.log('Invoice:', res.rows[0]);
  
  await client.end();
}

run().catch(console.error);
