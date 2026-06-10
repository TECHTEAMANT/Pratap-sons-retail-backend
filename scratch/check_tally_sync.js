const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://postgres:Root@123@localhost:5432/invento_erp' });
client.connect().then(async () => {
  const res = await client.query(`SELECT sync_status, error_message, count(*) FROM tally_sync GROUP BY sync_status, error_message`);
  console.log('Errors in tally_sync:', res.rows);
  
  const res2 = await client.query(`SELECT SUM(tally_amount) as total FROM tally_sync WHERE record_type = 'purchase'`);
  console.log('Tally Sync Purchase total:', res2.rows[0].total);
  client.end();
});
