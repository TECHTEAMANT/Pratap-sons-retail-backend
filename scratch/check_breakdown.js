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
      SUM(ROUND(net_payable)) as net_payable,
      SUM(taxable_value) as taxable_value,
      SUM(total_gst) as total_gst,
      SUM(total_mrp) as total_mrp,
      SUM(total_discount) as total_discount,
      SUM(special_discount) as special_discount,
      SUM(voucher_discount) as voucher_discount,
      SUM(loyalty_redemption_amount) as loyalty,
      SUM(additional_charges_total) as additional_charges
    FROM sales_invoices
  `);
  
  console.log('Sales Invoices Sums:', res.rows[0]);
  
  const resReturns = await client.query(`
    SELECT 
      SUM(ROUND(total_return_amount)) as total_return_amount,
      SUM(total_discount_amount) as return_discount
    FROM sales_returns
  `);
  console.log('Returns Sums:', resReturns.rows[0]);
  
  await client.end();
}

run().catch(console.error);
