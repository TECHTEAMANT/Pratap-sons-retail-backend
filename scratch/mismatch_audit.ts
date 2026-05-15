import { AppDataSource } from '../src/config/data-source';

async function check() {
    await AppDataSource.initialize();
    console.log("Database Connected. Analyzing Mismatches...");
    
    const mismatches = await AppDataSource.query(`
        SELECT 
            po.po_number, 
            po.order_date,
            po.total_items as "PO_Total", 
            SUM(bb.total_quantity) as "Barcode_Total",
            (SUM(bb.total_quantity) - po.total_items) as "Difference"
        FROM purchase_orders po
        JOIN barcode_batches bb ON bb.po_id = po.id
        WHERE po.order_date >= '2026-02-01'
        GROUP BY po.id, po.po_number, po.order_date, po.total_items
        HAVING po.total_items != SUM(bb.total_quantity)
        ORDER BY "Difference" DESC
    `);
    
    if (mismatches.length === 0) {
        console.log("✅ No mismatches found between PO totals and Barcode totals.");
    } else {
        console.table(mismatches);
        const totalDiff = mismatches.reduce((acc: number, curr: any) => acc + parseFloat(curr.Difference), 0);
        console.log(`--------------------------------------------------`);
        console.log(`Total Mismatched POs: ${mismatches.length}`);
        console.log(`Net Difference (Extra Barcodes): ${totalDiff}`);
        console.log(`--------------------------------------------------`);
    }
    
    process.exit(0);
}

check().catch(err => {
    console.error(err);
    process.exit(1);
});
