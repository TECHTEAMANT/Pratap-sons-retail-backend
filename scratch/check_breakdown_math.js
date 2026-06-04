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
        SUM(si.total_mrp) as total_mrp,
        SUM(si.net_payable) as net_payable,
        SUM(si.additional_charges_total) as extra,
        SUM(si.special_discount) as special,
        SUM(si.voucher_discount) as voucher,
        SUM(si.loyalty_redemption_amount) as loyalty
      FROM sales_invoices si
      WHERE si.invoice_date BETWEEN '2026-02-01' AND '2026-06-01'
    `);
    
    const retRes = await pool.query(`
      SELECT SUM(sr.total_return_amount) as returns
      FROM sales_returns sr
      WHERE sr.return_date BETWEEN '2026-02-01' AND '2026-06-01'
    `);

    const row = res.rows[0];
    const retRow = retRes.rows[0];

    const totalMRP = parseFloat(row.total_mrp) || 0;
    const netSales = parseFloat(row.net_payable) || 0;
    const returnAmount = parseFloat(retRow.returns) || 0;
    const additionalCharges = parseFloat(row.extra) || 0;

    const trueGrossSales = netSales + returnAmount;
    const totalDiscountAll = totalMRP - trueGrossSales + additionalCharges;

    const totalSpecialDiscount = parseFloat(row.special) || 0;
    const totalLoyalty = parseFloat(row.loyalty) || 0;
    const totalVoucher = parseFloat(row.voucher) || 0;

    const baseTotalDiscount = Math.max(0, totalDiscountAll - totalSpecialDiscount - totalLoyalty - totalVoucher);

    console.log("Financial Breakdown Logic:");
    console.log("Total MRP:", totalMRP);
    console.log("Net Sales:", netSales);
    console.log("Returns:", returnAmount);
    console.log("Gross Sales:", trueGrossSales);
    console.log("Total Discount All:", totalDiscountAll);
    console.log("Base Discount:", baseTotalDiscount);
    console.log("Special Discount:", totalSpecialDiscount);
    console.log("Voucher Discount:", totalVoucher);
    
  } catch(e) {
    console.error(e);
  } finally {
    pool.end();
  }
}
run();
