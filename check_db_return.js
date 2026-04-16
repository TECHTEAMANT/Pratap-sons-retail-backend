
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function checkReturn() {
  const { data, error } = await supabase
    .from('sales_returns')
    .select('*')
    .eq('return_number', 'SRET2627000003')
    .single();
    
  if (error) {
    console.error('Error:', error);
    return;
  }
  
  console.log('Record found:');
  console.log(JSON.stringify(data, null, 2));
}

checkReturn();
