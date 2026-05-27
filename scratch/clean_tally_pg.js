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
  const res = await pool.query(`
    WITH duplicates AS (
      SELECT id,
             ROW_NUMBER() OVER(PARTITION BY invoice_number ORDER BY created_at ASC) as rn
      FROM tally_sync
      WHERE record_type = 'payment_receipt_advance'
    )
    DELETE FROM tally_sync
    WHERE id IN (
      SELECT id FROM duplicates WHERE rn > 1
    );
  `);
  console.log(`Deleted ${res.rowCount} duplicate records.`);
  process.exit(0);
}
run();
