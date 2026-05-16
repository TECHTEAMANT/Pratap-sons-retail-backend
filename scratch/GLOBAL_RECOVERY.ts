import { AppDataSource } from '../src/config/data-source';

async function recover() {
    await AppDataSource.initialize();
    console.log("Database Connected. Starting GLOBAL RECOVERY...");

    // 1. Load the "Truth" (Purchase Invoices)
    console.log("Loading Purchase Invoices...");
    const invoices = await AppDataSource.query(`
        SELECT pi.po_id, pi.design_no, pi.size as size_id, SUM(pi.quantity) as qty, po.vendor as vendor_id
        FROM purchase_items pi
        JOIN purchase_orders po ON po.id = pi.po_id
        GROUP BY pi.po_id, pi.design_no, pi.size, po.vendor
    `);

    let totalRecovered = 0;

    console.log("Checking for missing items...");
    for (const inv of invoices) {
        const key = `${inv.po_id}_${inv.design_no}_${inv.size_id}`;
        
        // Count active barcodes for this PO/Design/Size
        const activeRes = await AppDataSource.query(`
            SELECT SUM(total_quantity) as cnt FROM barcode_batches 
            WHERE po_id = '${inv.po_id}' AND design_no = '${inv.design_no}' AND size = '${inv.size_id}' AND status = 'active'
        `);
        const activeCount = parseInt(activeRes[0].cnt || 0);

        if (activeCount < inv.qty) {
            const gap = inv.qty - activeCount;

            // SUPER AGGRESSIVE search: Find ANY deleted barcode for this DESIGN + SIZE (regardless of vendor)
            const deleted = await AppDataSource.query(`
                SELECT id FROM barcode_batches 
                WHERE design_no = '${inv.design_no}' 
                  AND size = '${inv.size_id}' 
                  AND status = 'deleted'
                LIMIT ${gap}
            `);

            if (deleted.length > 0) {
                const ids = deleted.map((d: any) => `'${d.id}'`).join(',');
                await AppDataSource.query(`
                    UPDATE barcode_batches 
                    SET status = 'active', total_quantity = 1, available_quantity = 1, po_id = '${inv.po_id}', vendor = '${inv.vendor_id}'
                    WHERE id IN (${ids})
                `);
                totalRecovered += deleted.length;
            }
        }
    }

    console.log(`-------------------------------------------`);
    console.log(`RECOVERY FINISHED. Total items restored: ${totalRecovered}`);
    console.log(`-------------------------------------------`);
    process.exit(0);
}

recover().catch(err => {
    console.error(err);
    process.exit(1);
});
