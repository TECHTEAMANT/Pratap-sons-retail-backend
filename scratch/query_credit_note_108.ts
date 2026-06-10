import { AppDataSource } from '../src/config/data-source';

async function run() {
  try {
    await AppDataSource.initialize();
    const records = await AppDataSource.query(`
      SELECT 
        cn.credit_note_number, cn.credit_amount, cn.balance_remaining
      FROM credit_notes cn
      WHERE cn.return_id = '6a5095a5-e477-45fa-adea-57989ff992a5'
    `);
    
    console.log(JSON.stringify(records, null, 2));
  } catch(e) {
    console.error(e);
  } finally {
    if(AppDataSource.isInitialized) await AppDataSource.destroy();
  }
}
run();
