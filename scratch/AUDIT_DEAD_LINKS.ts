import { AppDataSource } from '../src/config/data-source';

async function auditDeadLinks() {
    await AppDataSource.initialize();
    
    const res = await AppDataSource.query(`
        SELECT COUNT(*) as count 
        FROM barcode_batches bb 
        LEFT JOIN purchase_orders po ON po.id = bb.po_id 
        WHERE po.id IS NULL 
        AND bb.po_id IS NOT NULL 
        AND bb.status != 'deleted'
    `);
    
    console.log(`\n👻 BARCODES WITH DEAD PO LINKS: ${res[0].count}`);

    // If we find them, delete them!
    if (res[0].count > 0) {
        await AppDataSource.query(`
            UPDATE barcode_batches bb
            SET status = 'deleted', total_quantity = 0, available_quantity = 0
            FROM purchase_orders po
            WHERE bb.po_id IS NOT NULL
            AND (SELECT id FROM purchase_orders WHERE id = bb.po_id) IS NULL
            AND bb.status != 'deleted'
        `);
        console.log("✅ Dead links cleared.");
    }

    process.exit(0);
}
auditDeadLinks();
