import { AppDataSource } from '../src/config/data-source';

async function auditAbdulHakim() {
    await AppDataSource.initialize();
    const res = await AppDataSource.query(`
        SELECT po.invoice_number, po.order_date, po.status, po.total_items, v.name as vendor_name
        FROM purchase_orders po
        JOIN vendors v ON v.id = po.vendor
        WHERE v.name LIKE '%ABDUL HAKIM%'
    `);
    console.table(res);
    process.exit(0);
}
auditAbdulHakim();
