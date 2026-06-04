const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://postgres:Root@123@localhost:5432/invento_erp' });
client.connect().then(async () => {
  const res = await client.query(`SELECT * FROM tally_sync WHERE id = 'bcfacd4a-9a45-4f4d-a554-4d1f5656d5ab'`);
  console.log(JSON.stringify(res.rows[0].sync_data, null, 2));
  client.end();
}).catch(console.error);
