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
    SELECT * FROM sales_returns WHERE invoice_id = 'da55de57-826e-4c86-a319-30e8d4c98d43'
  `);
  
  console.log('Returns:', res.rows);
  
  await client.end();
}

run().catch(console.error);
