const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

async function run() {
  try {
    const res1 = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'barcode_batches'");
    console.log("barcode_batches columns:", res1.rows);
    
    const res2 = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'barcode_print_logs'");
    console.log("barcode_print_logs columns:", res2.rows);
  } catch(e) {
    console.error(e);
  } finally {
    pool.end();
  }
}
run();
