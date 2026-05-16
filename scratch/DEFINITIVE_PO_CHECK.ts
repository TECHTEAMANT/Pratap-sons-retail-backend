import { AppDataSource } from '../src/config/data-source';

async function checkPOTotal() {
    await AppDataSource.initialize();
    const res = await AppDataSource.query(`
        SELECT SUM(total_items) as total 
        FROM purchase_orders 
        WHERE order_date BETWEEN '2026-02-01' AND '2026-05-15' 
        AND status != 'deleted'
    `);
    console.log(`OFFICIAL PO ITEM SUM: ${res[0].total}`);
    
    const bbRes = await AppDataSource.query(`
        SELECT COUNT(bb.id) as total
        FROM barcode_batches bb
        JOIN purchase_orders po ON po.id = bb.po_id
        WHERE po.order_date BETWEEN '2026-02-01' AND '2026-05-15'
        AND po.status != 'deleted'
        AND bb.status != 'deleted'
    `);
    console.log(`ACTUAL BARCODE COUNT LINKED TO THESE POs: ${bbRes[0].total}`);

    process.exit(0);
}
checkPOTotal();
