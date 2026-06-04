import { Pool } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function main() {
  try {
    const res = await pool.query(`
      SELECT 
        pr.return_number,
        pri.barcode_id,
        pri.quantity,
        pri.cost,
        pri.cost_val,
        pri.gst_amount,
        pri.discount,
        pr.total_return_amount,
        pr.total_item_discount,
        pr.ledger_discount
      FROM purchase_return_items pri
      JOIN purchase_returns pr ON pr.id = pri.purchase_return_id
      WHERE pr.return_date >= '2026-05-01'
      ORDER BY pr.return_number DESC
      LIMIT 10
    `);
    console.table(res.rows);
  } finally {
    pool.end();
  }
}

main();
