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
      (total_mrp - total_discount - special_discount - voucher_discount - loyalty_redemption_amount + additional_charges_total) as reconstructed 
    FROM sales_invoices si 
    WHERE ROUND(si.net_payable) = 0 
    AND NOT EXISTS (SELECT 1 FROM sales_returns sr WHERE sr.invoice_id = si.id)
  `);
  console.log('Invoices with Net 0 and no returns:', res.rows);
  
  let totalReconstructed = 0;
  for (const row of res.rows) {
    totalReconstructed += Math.round(Number(row.reconstructed) || 0);
  }
  console.log('Total Reconstructed Fallback Amount:', totalReconstructed);
  
  await client.end();
}

run().catch(console.error);
