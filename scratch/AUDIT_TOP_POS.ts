import { AppDataSource } from '../src/config/data-source';

async function auditTopPOs() {
    await AppDataSource.initialize();
    const res = await AppDataSource.query(`
        SELECT invoice_number, total_items, order_date 
        FROM purchase_orders 
        WHERE order_date BETWEEN '2026-02-01' AND '2026-05-15' 
        AND status != 'deleted' 
        ORDER BY total_items DESC 
        LIMIT 50
    `);
    console.table(res);
    process.exit(0);
}
auditTopPOs();
