const { Client } = require('pg'); 
const client = new Client({ user: 'postgres', password: 'Root@123', host: 'localhost', port: 5432, database: 'invento_erp' }); 
async function run() { 
  await client.connect(); 
  const res = await client.query("DELETE FROM tally_sync WHERE record_type = 'sales_return' AND invoice_number = 'SRET2627000076'"); 
  console.log('Deleted rows:', res.rowCount); 
  await client.end(); 
} 
run();
