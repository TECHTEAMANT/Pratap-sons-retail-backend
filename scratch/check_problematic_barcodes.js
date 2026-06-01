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
      SELECT 
        bb.barcode_alias_8digit,
        bb.total_quantity,
        bb.available_quantity,
        bb.mrp,
        bb.po_id,
        CASE 
          WHEN bb.po_id IS NULL THEN 'Remove (No PO)'
          WHEN bb.available_quantity < 0 THEN 'Remove (Negative)'
          ELSE 'Keep'
        END as recommendation
      FROM barcode_batches bb
      WHERE bb.po_id IS NULL OR bb.available_quantity < 0
    `);
    console.log("Problematic barcodes:", res.rows.length);
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
