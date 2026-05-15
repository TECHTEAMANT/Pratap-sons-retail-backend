import { AppDataSource } from '../src/config/data-source';

async function viewHiddenPO2() {
    await AppDataSource.initialize();
    
    const res = await AppDataSource.query(`
        SELECT po_number, total_items, status, order_date
        FROM purchase_orders 
        WHERE id = 'a24286b7-1570-475b-b424-7a314a270c81'
    `);
    
    console.table(res);
    process.exit(0);
}
viewHiddenPO2();
