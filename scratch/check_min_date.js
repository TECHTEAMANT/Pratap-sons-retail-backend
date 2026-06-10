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
    SELECT MIN(invoice_date) as min_date FROM sales_invoices
  `);
  console.log('Min date:', res.rows[0].min_date);
  
  await client.end();
}

run().catch(console.error);
