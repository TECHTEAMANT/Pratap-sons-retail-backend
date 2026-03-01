/**
 * Fix bad barcodes: renumber 10000001+ barcodes to continue from the last valid barcode
 * Run: node fix_barcodes.js
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

  // Step 1: Find the max barcode in the VALID range (< 10000000)
  const validMaxRes = await client.query(
    `SELECT MAX(CAST(barcode_alias_8digit AS INTEGER)) AS max_valid
     FROM barcode_batches
     WHERE barcode_alias_8digit ~ '^[0-9]+$'
       AND CAST(barcode_alias_8digit AS INTEGER) < 10000000`
  );
  const validMax = validMaxRes.rows[0].max_valid ? parseInt(validMaxRes.rows[0].max_valid) : 0;
  console.log('Highest valid barcode so far:', validMax.toString().padStart(8, '0'));

  // Step 2: Get all bad barcodes (>= 10000000) ordered by barcode
  const badRes = await client.query(
    `SELECT id, barcode_alias_8digit, design_no
     FROM barcode_batches
     WHERE barcode_alias_8digit ~ '^[0-9]+$'
       AND CAST(barcode_alias_8digit AS INTEGER) >= 10000000
     ORDER BY CAST(barcode_alias_8digit AS INTEGER) ASC`
  );

  if (badRes.rows.length === 0) {
    console.log('No bad barcodes found! Nothing to fix.');
    await client.end();
    return;
  }

  console.log(`\nFound ${badRes.rows.length} bad barcodes to renumber:`);
  badRes.rows.forEach(r => console.log(' ', r.barcode_alias_8digit, '->', r.design_no));

  // Step 3: Renumber each bad barcode to the next valid number
  let nextNum = validMax + 1;

  await client.query('BEGIN');
  try {
    for (const row of badRes.rows) {
      const newCode = nextNum.toString().padStart(8, '0');
      console.log(`  Renaming ${row.barcode_alias_8digit} → ${newCode} (design: ${row.design_no})`);
      await client.query(
        `UPDATE barcode_batches SET barcode_alias_8digit = $1 WHERE id = $2`,
        [newCode, row.id]
      );
      nextNum++;
    }
    await client.query('COMMIT');
    console.log('\n✅ All bad barcodes fixed successfully!');
    console.log(`Next barcode will be: ${nextNum.toString().padStart(8, '0')}`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ ERROR - rolled back:', err.message);
    throw err;
  }

  // Step 4: Verification
  console.log('\n=== Verification: current highest barcodes ===');
  const verify = await client.query(
    `SELECT barcode_alias_8digit, design_no
     FROM barcode_batches
     WHERE barcode_alias_8digit ~ '^[0-9]+$'
       AND CAST(barcode_alias_8digit AS INTEGER) >= 10000000
     LIMIT 5`
  );
  if (verify.rows.length === 0) {
    console.log('No barcodes >= 10000000 remain. ✅');
  } else {
    console.log('Still some bad barcodes (unexpected):', verify.rows);
  }

  await client.end();
}

main().catch(err => { console.error(err); process.exit(1); });
