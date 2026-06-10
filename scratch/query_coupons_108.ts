import { AppDataSource } from '../src/config/data-source';

async function run() {
  try {
    await AppDataSource.initialize();
    
    // Check coupons
    const coupons = await AppDataSource.query(`
      SELECT *
      FROM credit_coupons 
      WHERE original_sales_return_id = (SELECT id FROM sales_returns WHERE return_number = 'SRET2026000018')
    `);

    console.log("Coupons:", JSON.stringify(coupons, null, 2));
  } catch(e) {
    console.error(e);
  } finally {
    if(AppDataSource.isInitialized) await AppDataSource.destroy();
  }
}
run();
