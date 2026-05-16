import { AppDataSource } from '../src/config/data-source';

async function checkReturnsSchema() {
    await AppDataSource.initialize();
    
    const res = await AppDataSource.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'purchase_return_items'
    `);
    
    console.table(res);
    process.exit(0);
}
checkReturnsSchema();
