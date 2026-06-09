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
    SELECT 
      SUM(ROUND(si.net_payable)) + COALESCE((SELECT SUM(ROUND(total_return_amount)) FROM sales_returns), 0) as gross_net,
      SUM(total_mrp) - SUM(total_discount) - SUM(special_discount) - SUM(voucher_discount) - SUM(loyalty_redemption_amount) + SUM(additional_charges_total) as mathematical_net
    FROM sales_invoices si
  `);
  
  console.log('Sums:', res.rows[0]);
  
  await client.end();
}

run().catch(console.error);
