import { AppDataSource } from '../src/config/data-source';

async function auditSalesItems() {
    await AppDataSource.initialize();
    
    const res = await AppDataSource.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'sales_invoice_items'
    `);
    
    console.table(res);
    process.exit(0);
}
auditSalesItems();
