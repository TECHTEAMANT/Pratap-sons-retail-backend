import { AppDataSource } from '../src/config/data-source';

async function auditMismatches() {
    await AppDataSource.initialize();
    
    const res = await AppDataSource.query(`
        SELECT 
            po.invoice_number, 
            po.total_items as official, 
            COALESCE(SUM(bb.total_quantity), 0) as physical,
            (po.total_items - COALESCE(SUM(bb.total_quantity), 0)) as diff
        FROM purchase_orders po 
        LEFT JOIN barcode_batches bb ON bb.po_id = po.id AND bb.status != 'deleted'
        WHERE po.status = 'Completed' 
        GROUP BY po.id, po.invoice_number, po.total_items 
        HAVING po.total_items != COALESCE(SUM(bb.total_quantity), 0)
        ORDER BY diff DESC
    `);
    
    console.table(res);
    process.exit(0);
}
auditMismatches();
