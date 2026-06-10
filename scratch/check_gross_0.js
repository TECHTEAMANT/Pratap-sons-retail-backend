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
    SELECT si.invoice_number, si.net_payable, 
      (total_mrp - total_discount - special_discount - voucher_discount - loyalty_redemption_amount + additional_charges_total) as reconstructed,
      ROUND(si.net_payable) + COALESCE((SELECT SUM(ROUND(total_return_amount)) FROM sales_returns sr WHERE sr.invoice_id = si.id), 0) as db_gross
    FROM sales_invoices si 
    WHERE ROUND(si.net_payable) + COALESCE((SELECT SUM(ROUND(total_return_amount)) FROM sales_returns sr WHERE sr.invoice_id = si.id), 0) <= 0
  `);
  console.log('Invoices with db_gross <= 0:', res.rows);
  
  await client.end();
}

run().catch(console.error);
