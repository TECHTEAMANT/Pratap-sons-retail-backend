const fs = require('fs');
const env = fs.readFileSync('c:/Users/LENOVO/OneDrive/Desktop/pratap sons retail/Pratap-son-retail-frontend/.env', 'utf8');
const urlMatch = env.match(/VITE_SUPABASE_URL=(.+)/);
const keyMatch = env.match(/VITE_SUPABASE_ANON_KEY=(.+)/);
if (!urlMatch || !keyMatch) { console.log('No keys'); process.exit(1); }
const url = urlMatch[1].trim();
const key = keyMatch[1].trim();
async function test() {
  const res = await fetch(`${url}/rest/v1/purchase_return_items?select=*,item:barcode_batches(mrp,gst_logic,product_group:product_groups(*))&limit=1`, {
    headers: { 'apikey': key, 'Authorization': `Bearer ${key}` }
  });
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
}
test();
