import { AppDataSource } from '../src/config/data-source';

async function run() {
  try {
    await AppDataSource.initialize();
    
    // Check receipts
    const receipts = await AppDataSource.query(`
      SELECT r.receipt_number, r.receipt_date, ri.amount_paid 
      FROM receipt_items ri
      JOIN receipts r ON r.id = ri.receipt_id
      WHERE ri.invoice_id = '8eed9130-bb3d-4c5e-b095-93dfade48b93'
    `);
    
    console.log("Receipts:", JSON.stringify(receipts, null, 2));
  } catch(e) {
    console.error(e);
  } finally {
    if(AppDataSource.isInitialized) await AppDataSource.destroy();
  }
}
run();
