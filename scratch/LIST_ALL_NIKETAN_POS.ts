import { AppDataSource } from '../src/config/data-source';

async function listAllNiketanPOs() {
    await AppDataSource.initialize();
    
    const res = await AppDataSource.query(`
        SELECT id, po_number, total_items, status, order_date
        FROM purchase_orders 
        WHERE vendor = '850903cf-a0d5-456d-835a-7f835696a9b9'
    `);
    
    console.table(res);
    process.exit(0);
}
listAllNiketanPOs();
