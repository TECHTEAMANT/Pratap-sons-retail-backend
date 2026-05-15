import { AppDataSource } from '../src/config/data-source';

async function auditOverage() {
    await AppDataSource.initialize();
    console.log("🔍 Checking for POs with more barcodes than items...");
    const res = await AppDataSource.query(`
        SELECT 
            po.invoice_number, 
            po.total_items as official_count, 
            COUNT(bb.id) as barcode_count,
            (COUNT(bb.id) - po.total_items) as extra_items
        FROM purchase_orders po 
        LEFT JOIN barcode_batches bb ON bb.po_id = po.id 
        WHERE po.status = 'Completed' 
        GROUP BY po.id, po.invoice_number, po.total_items 
        HAVING COUNT(bb.id) > po.total_items
        ORDER BY extra_items DESC
    `);
    console.table(res);
    
    const totalExtra = res.reduce((acc: number, curr: any) => acc + Number(curr.extra_items), 0);
    console.log(`\n🚨 TOTAL EXTRA BARCODES FOUND: ${totalExtra}`);
    
    process.exit(0);
}
auditOverage();
