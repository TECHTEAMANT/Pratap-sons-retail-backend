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
    const res = await pool.query(`
      SELECT bpl.barcode_alias, bpl.quantity_printed, bpl.printed_at, bb.id as batch_id
      FROM barcode_print_logs bpl
      LEFT JOIN barcode_batches bb ON bpl.barcode_alias = bb.barcode_alias_8digit
      WHERE bb.id IS NULL
    `);
    console.log("Printed barcodes not in barcode_batches:", res.rows.length);
    if(res.rows.length > 0) {
      console.log(res.rows.slice(0, 5));
    }
  } catch(e) {
    console.error(e);
  } finally {
    pool.end();
  }
}
run();
