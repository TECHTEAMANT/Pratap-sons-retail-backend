/**
 * Fix BarcodeSequence table: reset last_number to match the actual max barcode in DB
 * Run: node fix_barcode_sequence.js
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

  // Check current sequence value
  const seqCheck = await client.query(`SELECT * FROM barcode_sequences LIMIT 5`).catch(() => ({ rows: [] }));
  console.log('\nCurrent barcode_sequences table:', seqCheck.rows);

  // Find actual max in valid range
  const maxRes = await client.query(
    `SELECT MAX(CAST(barcode_alias_8digit AS INTEGER)) AS max_valid
     FROM barcode_batches
     WHERE barcode_alias_8digit ~ '^[0-9]+$'
       AND CAST(barcode_alias_8digit AS INTEGER) < 10000000`
  );
  const maxValid = maxRes.rows[0].max_valid ? parseInt(maxRes.rows[0].max_valid) : 0;
  console.log('\nMax valid barcode (numeric):', maxValid, '->', maxValid.toString().padStart(8, '0'));

  // Update or insert the sequence
  const existing = await client.query(`SELECT id FROM barcode_sequences WHERE id = 1`).catch(() => ({ rows: [] }));
  if (existing.rows.length > 0) {
    await client.query(`UPDATE barcode_sequences SET last_number = $1 WHERE id = 1`, [maxValid]);
    console.log(`\n✅ Updated barcode_sequences.last_number to ${maxValid}`);
  } else {
    // Table might not exist or have different name
    const tables = await client.query(
      `SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE '%barcode%'`
    );
    console.log('\nBarcode-related tables:', tables.rows);
  }

  console.log('\nNext barcode will be:', (maxValid + 1).toString().padStart(8, '0'));
  await client.end();
}

main().catch(err => { console.error(err); process.exit(1); });
