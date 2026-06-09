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
    SELECT * FROM sales_returns WHERE total_return_amount = '1720' OR total_return_amount = 1720
  `);
  console.log('Returns with 1720:', res.rows);
  
  await client.end();
}

run().catch(console.error);
