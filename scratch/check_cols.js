const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://postgres:Root@123@localhost:5432/invento_erp' });
client.connect().then(async () => {
  const res2 = await client.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'tally_sync'`);
  console.log('tally_sync columns:', res2.rows.map(r => r.column_name));
  client.end();
});
