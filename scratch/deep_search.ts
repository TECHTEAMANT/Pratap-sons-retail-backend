import { AppDataSource } from '../src/config/data-source';

async function deepSearch() {
  try {
    await AppDataSource.initialize();
    
    // Search in all tables for the invoice number
    const tables = await AppDataSource.query(`
      SELECT table_name 
      FROM information_schema.columns 
      WHERE column_name = 'invoice_number'
    `);
    
    for (const t of tables) {
      const name = t.table_name;
      const res = await AppDataSource.query(`SELECT * FROM "${name}" WHERE invoice_number LIKE '%334%'`);
      if (res.length > 0) {
        console.log(`FOUND IN TABLE ${name}:`, res);
      }
    }
    
    await AppDataSource.destroy();
  } catch (error) {
    console.error(error);
  }
}

deepSearch();
