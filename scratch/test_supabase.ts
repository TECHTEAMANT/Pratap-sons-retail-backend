import { createClient } from '@supabase/supabase-js';
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '');
async function run() {
    const { data, error } = await supabase.from('sales_returns').select('*, credit_coupons(amount)').limit(5);
    console.log(data?.map(d => ({ rn: d.return_number, cc: d.credit_coupons })));
    console.log(error);
}
run();
