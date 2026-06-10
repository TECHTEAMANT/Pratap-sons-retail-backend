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
    const { rows: coupons } = await pool.query('SELECT * FROM credit_coupons');
    const { rows: syncs } = await pool.query('SELECT * FROM tally_sync WHERE record_type = \'payment_receipt_return\'');

    console.log(`Total Credit Coupons in DB: ${coupons.length}`);
    console.log(`Total Sales Return Receipts in Tally Sync: ${syncs.length}`);

    // Aggregate Tally amounts vs Coupon amounts
    let totalCouponAmt = 0;
    coupons.forEach(c => totalCouponAmt += Number(c.amount || 0));

    let totalSyncAmt = 0;
    syncs.forEach(s => totalSyncAmt += Number(s.total_amount || 0));

    console.log(`Total Coupon Amount (credit_coupons): ₹${totalCouponAmt.toFixed(2)}`);
    console.log(`Total Sync Amount (payment_receipt_return): ₹${totalSyncAmt.toFixed(2)}`);

    // Let's find matches and mismatches
    let mismatches = [];
    let missingInTally = [];
    let foundInTally = 0;

    for (const c of coupons) {
        // Find the corresponding tally sync record.
        // tally_sync uses invoice_number = sr.return_number.
        // We need to find the sales return for this coupon first to get its return_number.
        const { rows: srRows } = await pool.query('SELECT return_number FROM sales_returns WHERE id = $1', [c.original_sales_return_id]);
        
        let return_number = null;
        if (srRows.length > 0) {
            return_number = srRows[0].return_number;
        } else {
            // Find if coupon code is in sync data
            const matchingSync = syncs.find(s => JSON.stringify(s.sync_data).includes(c.coupon_no));
            if (matchingSync) {
                return_number = matchingSync.invoice_number;
            }
        }

        if (return_number) {
            const syncRecord = syncs.find(s => s.invoice_number === return_number);
            if (!syncRecord) {
                missingInTally.push({ coupon: c.coupon_no, amount: c.amount, return_number });
            } else {
                foundInTally++;
                // Check amount. In tally sync, total_amount might be the whole return, but let's check the specific coupon inside sync_data.
                const pd = syncRecord.sync_data.partyDetail || [];
                // It should have a 'Retail Pending B2C' entry
                let syncCouponAmt = 0;
                pd.forEach(p => {
                    // It's mapped as "Retail Pending B2C" (Debit) wait, no.
                    // Let's check what it's mapped as in the payload.
                    if (p.ledger.includes('Retail Pending') || p.ledger.includes('Advance') || p.ledger.includes('Retail Counter Sales')) {
                        // let's just sum any bill allocation that has the coupon number
                        const allocations = p.BillAllocation || [];
                        allocations.forEach(a => {
                            if (a.name === c.coupon_no || a.name === return_number) {
                                // syncCouponAmt += Number(a.amount || 0); // Need more precise logic, let's just dump the partyDetail
                            }
                        });
                    }
                });

                // Let's just compare the `total_amount` in sync vs `amount` in coupon
                // Wait, one sales return can have multiple things, but usually total_return_amount == coupon amount.
                if (Math.abs(Number(syncRecord.total_amount) - Number(c.amount)) > 1) {
                    mismatches.push({
                        coupon: c.coupon_no,
                        return_number,
                        couponAmount: c.amount,
                        syncTotalAmount: syncRecord.total_amount,
                        syncDataLedgers: pd.map(x => ({ ledger: x.ledger, amt: x.entryAmount, type: x.transactionType }))
                    });
                }
            }
        } else {
            missingInTally.push({ coupon: c.coupon_no, amount: c.amount, return_number: 'UNKNOWN' });
        }
    }

    console.log(`\nCoupons found mapped in Tally Sync: ${foundInTally}`);
    console.log(`Coupons missing in Tally Sync: ${missingInTally.length}`);
    if (missingInTally.length > 0) {
        console.log("Sample missing:");
        console.log(missingInTally.slice(0, 5));
    }

    console.log(`\nAmount mismatches (Coupon Amount != Sync Total Amount): ${mismatches.length}`);
    if (mismatches.length > 0) {
        console.log("Sample mismatches:");
        console.log(mismatches.slice(0, 5));
    }

  } catch(e) {
    console.error(e);
  } finally {
    await pool.end();
  }
}
run();
