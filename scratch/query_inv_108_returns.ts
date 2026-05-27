import { AppDataSource } from '../src/config/data-source';

async function run() {
  try {
    await AppDataSource.initialize();
    const records = await AppDataSource.query(`
      SELECT 
        sr.id, sr.return_number, sr.total_return_amount,
        cc.coupon_no, cc.amount as coupon_amount
      FROM sales_returns sr
      LEFT JOIN credit_coupons cc ON cc.original_sales_return_id = sr.id
      WHERE sr.invoice_number = 'INV2026000108'
    `);
    
    console.log(JSON.stringify(records, null, 2));
  } catch(e) {
    console.error(e);
  } finally {
    if(AppDataSource.isInitialized) await AppDataSource.destroy();
  }
}
run();
