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
    const { rows: salesReturns } = await pool.query("SELECT * FROM sales_returns WHERE credit_coupon_no IS NOT NULL");
    console.log(`Found ${salesReturns.length} returns with coupons`);
    
    // Fetch coupons
    const srIds = salesReturns.map(sr => sr.id);
    let placeholders = srIds.map((_, i) => '$' + (i + 1)).join(',');
    const { rows: coupons } = await pool.query(`SELECT original_sales_return_id, amount FROM credit_coupons WHERE original_sales_return_id IN (${placeholders})`, srIds);
    
    const couponsMap = new Map();
    coupons.forEach(c => couponsMap.set(c.original_sales_return_id, parseFloat(c.amount)));

    // Generate payloads
    const syncPayloads = [];
    
    for (const sr of salesReturns) {
        const totalAmount = Math.round(parseFloat(sr.total_return_amount || 0));
        const actualCouponAmount = couponsMap.has(sr.id) ? couponsMap.get(sr.id) : null;
        
        let couponAmount = actualCouponAmount !== null ? Math.round(actualCouponAmount) : totalAmount;
        if (couponAmount > totalAmount) couponAmount = totalAmount;
        if (couponAmount < 0) couponAmount = 0;
        let pendingOffsetAmount = totalAmount - couponAmount;

        const date = sr.return_date.toISOString().split('T')[0].split('-').reverse().join('-');

        const refName = sr.credit_coupon_no || sr.return_number;
        const invRefName = sr.invoice_number || sr.return_number;

        const partyDetail = [
            {
                ledger: "Retail Sales Return B2C",
                entryAmount: totalAmount,
                transactionType: "debit",
                BillAllocation: [
                    {
                        typeOfRef: "Agst Ref",
                        name: sr.return_number,
                        billDueDate: date,
                        amount: totalAmount,
                        transactionType: "debit"
                    }
                ]
            }
        ];

        if (couponAmount > 0) {
            partyDetail.push({
                ledger: "Retail Credit Coupon B2C",
                entryAmount: couponAmount,
                transactionType: "credit", 
                BillAllocation: [
                    {
                        typeOfRef: "New Ref",
                        name: refName,
                        billDueDate: date,
                        amount: couponAmount,
                        transactionType: "credit"
                    }
                ]
            });
        }

        if (pendingOffsetAmount > 0) {
            partyDetail.push({
                ledger: "Retail Pending B2C",
                entryAmount: pendingOffsetAmount,
                transactionType: "credit", 
                BillAllocation: [
                    {
                        typeOfRef: "Agst Ref",
                        name: invRefName,
                        billDueDate: date,
                        amount: pendingOffsetAmount,
                        transactionType: "credit"
                    }
                ]
            });
        }

        const tallyData = {
            company: "69a95f9f5f297c00251a0e7f",
            voucherType: "Retail Sales Return Receipt",
            isOptional: false,
            voucherNumber: (sr.credit_coupon_no || sr.return_number) + "-R",
            date: date,
            partyDetail: partyDetail,
            narration: `Credit Coupon Issued against Sales Return #${sr.return_number}. Coupon: ${sr.credit_coupon_no}`,
            termsAndCondition: ""
        };

        syncPayloads.push([
            'payment_receipt_return',
            sr.id,
            sr.return_number,
            sr.return_date,
            sr.customer_name || '',
            sr.customer_mobile || '',
            totalAmount,
            JSON.stringify(tallyData),
            'pending'
        ]);
    }

    // Insert payloads
    for (const p of syncPayloads) {
        await pool.query(`
            INSERT INTO tally_sync (record_type, sales_return_id, invoice_number, invoice_date, customer_name, customer_mobile, total_amount, sync_data, sync_status)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `, p);
    }

    console.log(`Successfully generated and inserted ${syncPayloads.length} receipt records.`);
  } catch(e) {
    console.error(e);
  } finally {
    await pool.end();
  }
}
run();
