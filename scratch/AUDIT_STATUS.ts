import { AppDataSource } from '../src/config/data-source';

async function auditStatus() {
    await AppDataSource.initialize();
    
    console.log("🔍 Analyzing PO Item Sums by Status (Feb-May)...");
    
    const res = await AppDataSource.query(`
        SELECT status, SUM(total_items) as total 
        FROM purchase_orders 
        WHERE order_date BETWEEN '2026-02-01' AND '2026-05-15'
        GROUP BY status
    `);
    
    console.table(res);

    process.exit(0);
}
auditStatus();
