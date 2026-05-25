const { Client } = require('pg'); 
const client = new Client({ user: 'postgres', password: 'Root@123', host: 'localhost', port: 5432, database: 'invento_erp' }); 
async function run() { 
  await client.connect(); 
  const res1 = await client.query("SELECT * FROM sales_returns WHERE return_number = 'SRET2627000076'"); 
  if (res1.rows.length === 0) { console.log('No such return'); return; } 
  const retId = res1.rows[0].id; 
  const res2 = await client.query("SELECT * FROM sales_return_items WHERE return_id = $1", [retId]); 
  console.log('Items found:', res2.rows.length); 
  console.log('Sample item:', res2.rows[0]); 
  
  // also, let's fetch a sample from supabase directly to see what error it returns!
  const res3 = await fetch('http://localhost:3000/rest/v1/sales_return_items?select=*,product_item(*,product_group(*))&return_id=eq.' + retId, { headers: { 'apikey': process.env.SUPABASE_KEY || '' } });
  console.log('Supabase fetch product_item status:', res3.status);
  if (!res3.ok) console.log(await res3.text());

  const res4 = await fetch('http://localhost:3000/rest/v1/sales_return_items?select=*,barcode_batches(*,product_groups(*))&return_id=eq.' + retId, { headers: { 'apikey': process.env.SUPABASE_KEY || '' } });
  console.log('Supabase fetch barcode_batches status:', res4.status);
  if (!res4.ok) console.log(await res4.text());

  await client.end(); 
} 
run();
