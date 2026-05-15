import { AppDataSource } from '../src/config/data-source';

async function check() {
    await AppDataSource.initialize();
    const pos = await AppDataSource.query(`
        SELECT po_number, order_date, total_items 
        FROM purchase_orders 
        WHERE po_number IN ('PI2026000256', 'PI2026000260')
    `);
    console.table(pos);
    
    const check1 = await AppDataSource.query(`
        SELECT v.name as vendor_name, COUNT(*) as cnt 
        FROM barcode_batches bb
        LEFT JOIN vendors v ON v.id = bb.vendor
        WHERE bb.design_no = '1' AND bb.status = 'active'
        GROUP BY v.name
    `);
    console.log("Who owns Design '1'?");
    console.table(check1);

    const checkPO = await AppDataSource.query(`
        SELECT COUNT(*) as cnt, po_id FROM barcode_batches 
        WHERE design_no = '1' AND status = 'active'
        GROUP BY po_id
    `);
    console.log("PO links for Design '1':");
    console.table(checkPO);
    
    process.exit(0);
}
check();
