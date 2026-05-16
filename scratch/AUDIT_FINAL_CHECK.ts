import { AppDataSource } from '../src/config/data-source';

async function auditFinalCheck() {
    await AppDataSource.initialize();
    const res = await AppDataSource.query(`
        SELECT invoice_number, total_items, status 
        FROM purchase_orders 
        WHERE vendor = '406b0254-b61a-446b-aca4-f8f463fa487a' 
        AND status = 'Completed'
    `);
    console.table(res);
    process.exit(0);
}
auditFinalCheck();
