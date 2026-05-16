import { AppDataSource } from '../src/config/data-source';

async function manualCount() {
    await AppDataSource.initialize();
    const res = await AppDataSource.query(`
        SELECT COUNT(*) as total
        FROM barcode_batches bb
        LEFT JOIN purchase_orders po ON po.id = bb.po_id
        WHERE (COALESCE(po.order_date, bb.created_at)::date BETWEEN '2026-02-01' AND '2026-05-15')
        AND bb.status != 'deleted'
    `);
    console.log(`TOTAL ITEMS IN DATE RANGE: ${res[0].total}`);
    
    // Check for items with no PO again, just in case
    const noPORes = await AppDataSource.query(`
        SELECT COUNT(*) as count 
        FROM barcode_batches 
        WHERE po_id IS NULL AND status != 'deleted'
    `);
    console.log(`ITEMS WITH NO PO: ${noPORes[0].count}`);

    process.exit(0);
}
manualCount();
