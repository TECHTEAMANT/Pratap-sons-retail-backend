const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://postgres:Root@123@localhost:5432/invento_erp' });
client.connect().then(async () => {
  const res = await client.query(`SELECT * FROM tally_sync WHERE id = '6b635519-b7a9-496b-8c68-e7cd2a1cff34'`);
  console.log(JSON.stringify(res.rows[0].sync_data, null, 2));
  client.end();
}).catch(console.error);
