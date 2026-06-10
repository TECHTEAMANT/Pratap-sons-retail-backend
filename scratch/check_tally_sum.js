const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://postgres:Root@123@localhost:5432/invento_erp' });
client.connect().then(async () => {
  const res2 = await client.query(`SELECT SUM(total_amount) as total FROM tally_sync WHERE record_type = 'purchase' AND invoice_date >= '2026-05-01' AND invoice_date < '2026-06-01'`);
  console.log('Tally Sync Purchase total (May):', res2.rows[0].total);
  
  const res3 = await client.query(`SELECT SUM(total_amount) as total FROM tally_sync WHERE record_type = 'purchase'`);
  console.log('Tally Sync Purchase total (ALL):', res3.rows[0].total);
  client.end();
});
