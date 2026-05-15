import { AppDataSource } from '../src/config/data-source';

async function checkMixed() {
    await AppDataSource.initialize();
    
    const res = await AppDataSource.query(`
        SELECT po.id, po.po_number, po.vendor as vendor_id, v.name as vendor_name
        FROM purchase_orders po
        LEFT JOIN vendors v ON v.id = po.vendor
        WHERE po.id = 'a24286b7-1570-475b-b424-7a314a270c81'
    `);
    
    console.table(res);
    process.exit(0);
}
checkMixed();
