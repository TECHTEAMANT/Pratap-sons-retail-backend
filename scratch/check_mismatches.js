const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://postgres:Root@123@localhost:5432/invento_erp' });
client.connect().then(async () => {
  const res = await client.query(`
    SELECT ts.invoice_number, ts.total_amount as ts_amt, pr.total_return_amount as pr_amt
    FROM tally_sync ts
    JOIN purchase_returns pr ON pr.return_number = ts.invoice_number
    WHERE ts.record_type = 'purchase_return' AND ROUND(ts.total_amount) != ROUND(pr.total_return_amount)
  `);
  console.log('Mismatches:', res.rows);
  client.end();
});
