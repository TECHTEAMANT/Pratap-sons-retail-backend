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
           COALESCE((SELECT SUM(ROUND(total_return_amount)) FROM sales_returns sr WHERE sr.invoice_id = si.id), 0) as returns,
           (total_mrp - total_discount - special_discount - voucher_discount - loyalty_redemption_amount + additional_charges_total) as reconstructed
    FROM sales_invoices si 
    WHERE ROUND(si.net_payable) = 0 
    AND COALESCE((SELECT SUM(ROUND(total_return_amount)) FROM sales_returns sr WHERE sr.invoice_id = si.id), 0) > 0
  `);
  console.log('Invoices with Net 0 but Returns > 0:', res.rows);
  
  let totalDiff = 0;
  for (const row of res.rows) {
    const oldGross = Math.round(Number(row.reconstructed) || 0); // because dbNetPayable=0 made dbGross=0 => fallback to reconstructed
    const newGross = Math.round(Number(row.returns) || 0); // because dbGross = 0 + returns
    console.log(`Invoice ${row.invoice_number}: Old Tally Gross = ${oldGross}, New Tally Gross = ${newGross}, Diff = ${newGross - oldGross}`);
    totalDiff += (newGross - oldGross);
  }
  console.log('Total Tally Diff from this fix:', totalDiff);
  
  await client.end();
}

run().catch(console.error);
