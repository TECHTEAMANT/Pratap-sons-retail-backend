import { AppDataSource } from '../src/config/data-source';

async function auditPO() {
    await AppDataSource.initialize();
    
    const res = await AppDataSource.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'purchase_orders'
    `);
    
    console.table(res);
    process.exit(0);
}
auditPO();
