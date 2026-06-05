const { Client } = require('pg');
const client = new Client({ connectionString: 'postgres://postgres:Root@123@localhost:5432/invento_erp' });
client.connect().then(async () => {
  const start = '2026-06-01T00:00:00.000Z';
  const end = '2026-06-04T23:59:59.999Z';

  // Total refunds
  const refunds = await client.query("SELECT sum(refund_amount) FROM sales_returns WHERE return_date >= $1 AND return_date <= $2 AND refund_amount > 0", [start, end]);
  console.log('Total Cash/Bank Refunds:', refunds.rows[0].sum);

  // Total coupons issued
  const coupons = await client.query("SELECT sum(credit_coupon_amount) FROM sales_returns WHERE return_date >= $1 AND return_date <= $2 AND credit_coupon_amount > 0", [start, end]);
  console.log('Total Coupons Issued:', coupons.rows[0].sum);

  // Unsynced invoices
  const unsynced = await client.query("SELECT sum(total_amount) FROM sales_invoices WHERE invoice_date >= $1 AND invoice_date <= $2 AND id NOT IN (SELECT invoice_id FROM tally_sync WHERE record_type = 'sales_invoice' AND sync_status = 'synced' AND invoice_id IS NOT NULL)", [start, end]);
  console.log('Total Unsynced Invoices:', unsynced.rows[0].sum);

  // Total Advances collected
  const advColl = await client.query("SELECT sum(amount) FROM sales_order_advances WHERE created_at >= $1 AND created_at <= $2", [start, end]);
  console.log('Total Advances Collected:', advColl.rows[0].sum);

  client.end();
}).catch(console.error);
