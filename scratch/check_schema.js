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
    SELECT column_name FROM information_schema.columns WHERE table_name = 'sales_returns';
  `);
  console.log(res.rows.map(r => r.column_name));
  
  await client.end();
}

run().catch(console.error);
