const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});
pool.query("SELECT invoice_number, total_amount, sync_data->>'partyDetail' AS details FROM tally_sync WHERE record_type = 'payment_receipt_return' AND invoice_number = 'SRET2627000035'").then(res => { console.log(JSON.stringify(res.rows, null, 2)); process.exit(0); });
