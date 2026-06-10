import { AppDataSource } from '../src/config/data-source';

async function run() {
  try {
    await AppDataSource.initialize();
    
    // Check credit coupons
    const coupons = await AppDataSource.query(`
      SELECT * 
      FROM credit_coupons 
      WHERE created_from_return = 'SRET2026000004'
    `);
    
    // Check return details
    const returnDetails = await AppDataSource.query(`
      SELECT *
      FROM sales_returns 
      WHERE return_number = 'SRET2026000004'
    `);

    console.log("Coupons:", JSON.stringify(coupons, null, 2));
    console.log("ReturnDetails:", JSON.stringify(returnDetails, null, 2));
  } catch(e) {
    console.error(e);
  } finally {
    if(AppDataSource.isInitialized) await AppDataSource.destroy();
  }
}
run();
