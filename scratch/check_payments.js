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
    SELECT payment_details, amount_paid FROM sales_invoices
  `);
  
  let totalPayments = 0;
  
  for (const row of res.rows) {
    let details = row.payment_details;
    if (typeof details === 'string') {
      try { details = JSON.parse(details); } catch (e) { details = null; }
    }
    if (details && Array.isArray(details)) {
      for (const p of details) {
        totalPayments += Number(p.amount) || 0;
      }
    } else {
        totalPayments += Number(row.amount_paid) || 0;
    }
  }
  
  console.log('Total Payments from JSON/amount_paid:', totalPayments);
  
  await client.end();
}

run().catch(console.error);
