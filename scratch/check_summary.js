const { Client } = require('pg');

const client = new Client({
  host: 'localhost',
  port: 5432,
  database: 'invento_erp',
  user: 'postgres',
  password: 'Root@123',
});

async function run() {
  await client.connect();
  
  const res = await client.query(`
    SELECT 
      COUNT(DISTINCT si.id) as count,
      COALESCE(SUM(ROUND(si.net_payable)), 0) as "totalSales",
      SUM(si.total_mrp) as "totalMRP",
      SUM(si.total_gst) as "totalGST",
      SUM(si.taxable_value) as "taxableValue",
      SUM(si.total_discount) as "totalDiscount",
      SUM(si.special_discount) as "totalSpecialDiscount",
      SUM(si.loyalty_redemption_amount) as "totalLoyalty",
      SUM(si.voucher_discount) as "totalVoucher",
      SUM(si.cgst_5) as "cgst_5",
      SUM(si.sgst_5) as "sgst_5",
      SUM(si.cgst_18) as "cgst_18",
      SUM(si.sgst_18) as "sgst_18",
      SUM(si.additional_charges_total) as "additionalCharges"
    FROM sales_invoices si
  `);
  console.log('Sales Summary Query result:', res.rows[0]);
  
  await client.end();
}

run().catch(console.error);
