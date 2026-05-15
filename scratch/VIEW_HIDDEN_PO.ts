import { AppDataSource } from '../src/config/data-source';

async function viewHiddenPO() {
    await AppDataSource.initialize();
    
    const res = await AppDataSource.query(`
        SELECT po_number, total_items, status, order_date
        FROM purchase_orders 
        WHERE id = 'b75f1e29-d521-4afc-968f-a5c8ff6a0af6'
    `);
    
    console.table(res);
    process.exit(0);
}
viewHiddenPO();
