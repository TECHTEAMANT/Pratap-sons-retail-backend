import { AppDataSource } from '../src/config/data-source';

async function auditGhosts() {
    await AppDataSource.initialize();
    
    console.log("🔍 Scanning for 'Ghost' Barcodes (No valid PO link)...");
    
    const res = await AppDataSource.query(`
        SELECT COUNT(*) as count
        FROM barcode_batches bb
        WHERE (bb.po_id IS NULL OR bb.po_id NOT IN (SELECT id FROM purchase_orders))
        AND bb.status != 'deleted'
    `);
    
    console.log(`\n🚨 GHOST BARCODES FOUND: ${res[0].count}`);

    // Check if these ghosts have a date in the range
    const rangeRes = await AppDataSource.query(`
        SELECT COUNT(*) as count
        FROM barcode_batches bb
        WHERE (bb.po_id IS NULL OR bb.po_id NOT IN (SELECT id FROM purchase_orders))
        AND bb.status != 'deleted'
        AND (bb.created_at::date BETWEEN '2026-02-01' AND '2026-05-15')
    `);
    console.log(`🚨 GHOST BARCODES CREATED IN FEB-MAY: ${rangeRes[0].count}`);

    process.exit(0);
}
auditGhosts();
