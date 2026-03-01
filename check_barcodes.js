/**
 * Quick diagnostic: show current barcode number state in DB
 * Run: node check_barcodes.js
 */
const { Client } = require('pg');
require('dotenv').config();

const client = new Client({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

async function main() {
  await client.connect();
  console.log('Connected to DB');

  // All distinct barcode values, sorted numerically
  const all = await client.query(
    `SELECT barcode_alias_8digit, COUNT(*) as cnt
     FROM barcode_batches
     WHERE barcode_alias_8digit IS NOT NULL AND barcode_alias_8digit != ''
     GROUP BY barcode_alias_8digit
     ORDER BY CAST(barcode_alias_8digit AS BIGINT) DESC
     LIMIT 20`
  );
  console.log('\n=== Top 20 highest barcodes in DB ===');
  all.rows.forEach(r => console.log(r.barcode_alias_8digit, '  (count:', r.cnt, ')'));

  // Max in valid range (< 10000000)
  const validMax = await client.query(
    `SELECT MAX(CAST(barcode_alias_8digit AS INTEGER)) AS max_valid
     FROM barcode_batches
     WHERE barcode_alias_8digit ~ '^[0-9]+$'
       AND CAST(barcode_alias_8digit AS INTEGER) < 10000000`
  );
  console.log('\n=== Max barcode in valid range (< 10000000) ===');
  console.log('Max valid:', validMax.rows[0].max_valid);
  if (validMax.rows[0].max_valid) {
    const next = parseInt(validMax.rows[0].max_valid) + 1;
    console.log('Next barcode SHOULD BE:', next.toString().padStart(8, '0'));
  }

  // Count barcodes in the bad range
  const badCount = await client.query(
    `SELECT COUNT(*) as cnt FROM barcode_batches
     WHERE barcode_alias_8digit ~ '^[0-9]+$'
       AND CAST(barcode_alias_8digit AS INTEGER) >= 10000000`
  );
  console.log('\n=== Barcodes in bad range (>= 10000000) ===');
  console.log('Count:', badCount.rows[0].cnt);
  
  if (badCount.rows[0].cnt > 0) {
    const badOnes = await client.query(
      `SELECT barcode_alias_8digit, design_no, total_quantity, available_quantity
       FROM barcode_batches
       WHERE barcode_alias_8digit ~ '^[0-9]+$'
         AND CAST(barcode_alias_8digit AS INTEGER) >= 10000000
       ORDER BY CAST(barcode_alias_8digit AS INTEGER) ASC`
    );
    console.log('Bad barcodes:', badOnes.rows);
  }

  await client.end();
}

main().catch(err => { console.error(err); process.exit(1); });
