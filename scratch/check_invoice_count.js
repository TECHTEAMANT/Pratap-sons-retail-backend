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
    SELECT COUNT(*) FROM sales_invoices
  `);
  console.log('Invoice count:', res.rows[0].count);
  
  await client.end();
}

run().catch(console.error);
