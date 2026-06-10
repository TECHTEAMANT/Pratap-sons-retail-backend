import { AppDataSource } from '../src/config/data-source';

async function run() {
  try {
    await AppDataSource.initialize();
    const records = await AppDataSource.query(`
      SELECT sr.created_at, 
        sr.id, sr.return_number, sr.total_return_amount, sr.total_discount_amount,
        sri.barcode_8digit, sri.quantity, sri.mrp, sri.return_amount, sri.discount_amount
      FROM sales_returns sr
      JOIN sales_return_items sri ON sri.return_id = sr.id
      WHERE sr.return_number = 'SRET2627000065'
    `);
    
    console.log(JSON.stringify(records, null, 2));
  } catch(e) {
    console.error(e);
  } finally {
    if(AppDataSource.isInitialized) await AppDataSource.destroy();
  }
}
run();
