import { AppDataSource } from '../src/config/data-source';

async function auditGhost() {
    await AppDataSource.initialize();
    
    const res = await AppDataSource.query(`
        SELECT po.po_number, po.vendor as vendor_id, v.name as vendor_name
        FROM purchase_orders po
        LEFT JOIN vendors v ON v.id = po.vendor
        WHERE po.po_number = 'PI2026000391'
    `);
    
    console.table(res);
    process.exit(0);
}
auditGhost();
