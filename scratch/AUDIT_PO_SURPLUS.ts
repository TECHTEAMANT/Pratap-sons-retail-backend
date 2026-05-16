import { AppDataSource } from '../src/config/data-source';

async function auditPOItems() {
    await AppDataSource.initialize();
    
    console.log("🔍 Auditing PO Barcode Counts vs Official Totals...");
    
    const res = await AppDataSource.query(`
        SELECT 
            po.invoice_number, 
            po.total_items as official_count,
            COUNT(bb.id) as barcode_count,
            COUNT(bb.id) - po.total_items as surplus
        FROM purchase_orders po
        JOIN barcode_batches bb ON bb.po_id = po.id
        WHERE po.status != 'deleted'
        AND bb.status != 'deleted'
        GROUP BY po.id, po.invoice_number, po.total_items
        HAVING COUNT(bb.id) > po.total_items
        ORDER BY surplus DESC
        LIMIT 20
    `);
    
    console.table(res);
    
    const totalSurplus = await AppDataSource.query(`
        SELECT SUM(surplus) as total
        FROM (
            SELECT COUNT(bb.id) - po.total_items as surplus
            FROM purchase_orders po
            JOIN barcode_batches bb ON bb.po_id = po.id
            WHERE po.status != 'deleted'
            AND bb.status != 'deleted'
            GROUP BY po.id, po.total_items
            HAVING COUNT(bb.id) > po.total_items
        ) as sub
    `);
    
    console.log(`\n🚨 TOTAL SURPLUS BARCODES FOUND: ${totalSurplus[0].total}`);
    
    process.exit(0);
}
auditPOItems();
