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
      id,
      invoice_number,
      ROUND(net_payable) as net_payable,
      (
        total_mrp 
        - total_discount 
        - special_discount 
        - voucher_discount 
        - loyalty_redemption_amount 
        + additional_charges_total
      ) as mathematical_net,
      ROUND(net_payable) - (
        total_mrp 
        - total_discount 
        - special_discount 
        - voucher_discount 
        - loyalty_redemption_amount 
        + additional_charges_total
      ) as diff
    FROM sales_invoices
    WHERE ABS(ROUND(net_payable) - (
        total_mrp 
        - total_discount 
        - special_discount 
        - voucher_discount 
        - loyalty_redemption_amount 
        + additional_charges_total
      )) > 10
    ORDER BY ABS(ROUND(net_payable) - (
        total_mrp 
        - total_discount 
        - special_discount 
        - voucher_discount 
        - loyalty_redemption_amount 
        + additional_charges_total
      )) DESC
    LIMIT 20
  `);
  
  console.log('Mismatched Invoices Count:', res.rowCount);
  console.log('Sample Mismatches:', res.rows);
  
  await client.end();
}

run().catch(console.error);
