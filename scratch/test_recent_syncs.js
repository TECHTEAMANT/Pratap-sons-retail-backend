const { Pool } = require('pg');
require('dotenv').config();

async function run() {
  const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  });

  try {
    const { rows: syncs } = await pool.query('SELECT record_type, sync_status, invoice_number, total_amount FROM tally_sync ORDER BY created_at DESC LIMIT 5');
    console.log("Recent tally_sync records:");
    console.log(syncs);
  } catch(e) {
    console.error(e);
  } finally {
    await pool.end();
  }
}
run();
