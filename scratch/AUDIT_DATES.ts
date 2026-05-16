import { AppDataSource } from '../src/config/data-source';

async function auditDates() {
    await AppDataSource.initialize();
    const res = await AppDataSource.query(`
        SELECT order_date, SUM(total_items) as total 
        FROM purchase_orders 
        WHERE order_date >= '2026-02-01' 
        AND status != 'deleted'
        GROUP BY order_date 
        ORDER BY order_date ASC
    `);
    console.table(res);
    process.exit(0);
}
auditDates();
