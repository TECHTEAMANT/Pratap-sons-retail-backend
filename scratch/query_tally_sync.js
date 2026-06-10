const { Client } = require('pg');
const client = new Client({ connectionString: 'postgres://postgres:Root@123@localhost:5432/invento_erp' });
client.connect().then(() => client.query("SELECT sync_data, record_type FROM tally_sync WHERE record_type = 'payment_receipt_return' AND sync_status = 'synced' LIMIT 1"))
.then(res => { 
  console.log(JSON.stringify(res.rows, null, 2)); 
  client.end(); 
})
.catch(err => console.error(err));
