import { AppDataSource } from '../src/config/data-source';

async function checkSchema() {
    await AppDataSource.initialize();
    
    const res = await AppDataSource.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'sales_invoices'
    `);
    
    console.table(res);
    process.exit(0);
}
checkSchema();
