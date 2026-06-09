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
    SELECT id, return_number, total_return_amount, status 
    FROM sales_returns 
    WHERE status = 'cancelled' OR status != 'completed'
  `);
  console.log('Non-completed Returns:', res.rows);
  
  await client.end();
}

run().catch(console.error);
