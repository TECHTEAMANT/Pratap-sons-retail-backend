import { AppDataSource } from '../src/config/data-source';

async function auditPoTotals() {
    await AppDataSource.initialize();
    
    const res = await AppDataSource.query(`
        SELECT status, SUM(total_items) as total 
        FROM purchase_orders 
        GROUP BY status
    `);
    
    console.table(res);
    process.exit(0);
}
auditPoTotals();
