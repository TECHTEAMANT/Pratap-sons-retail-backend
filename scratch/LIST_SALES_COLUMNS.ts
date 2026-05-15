import { AppDataSource } from '../src/config/data-source';

async function listSalesColumns() {
    await AppDataSource.initialize();
    
    const res = await AppDataSource.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'sales_invoice_items'
    `);
    
    console.log(res.map((r: any) => r.column_name).join(', '));
    process.exit(0);
}
listSalesColumns();
