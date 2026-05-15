import { AppDataSource } from '../src/config/data-source';

async function checkCost() {
    await AppDataSource.initialize();
    
    // 1. Total Cost in DB
    const res = await AppDataSource.query(`
        SELECT SUM(total_quantity * cost_actual) as cost 
        FROM barcode_batches 
        WHERE status != 'deleted'
    `);
    console.log(`TOTAL DB COST VALUE (All): ${res[0].cost}`);

    // 2. Total Cost in Date Range (Anchored to PO Date)
    const rangeRes = await AppDataSource.query(`
        SELECT SUM(bb.total_quantity * bb.cost_actual) as cost 
        FROM barcode_batches bb
        JOIN purchase_orders po ON po.id = bb.po_id
        WHERE po.order_date BETWEEN '2026-02-01' AND '2026-05-15'
        AND po.status != 'deleted'
        AND bb.status != 'deleted'
    `);
    console.log(`TOTAL DB COST VALUE (Feb-May): ${rangeRes[0].cost}`);

    process.exit(0);
}
checkCost();
