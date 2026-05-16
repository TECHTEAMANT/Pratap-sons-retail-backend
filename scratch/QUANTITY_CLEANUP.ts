import { AppDataSource } from '../src/config/data-source';

async function cleanupQuantities() {
    await AppDataSource.initialize();
    console.log("🚀 Starting Quantity-Based Reconciliation...");

    const pos = await AppDataSource.query(`
        SELECT id, invoice_number, total_items 
        FROM purchase_orders 
        WHERE status = 'Completed'
    `);

    let totalReduced = 0;
    
    for (const po of pos) {
        const res = await AppDataSource.query(`
            SELECT SUM(total_quantity) as total 
            FROM barcode_batches 
            WHERE po_id = $1 AND status != 'deleted'
        `, [po.id]);

        const actualQty = Number(res[0].total || 0);

        if (actualQty > po.total_items) {
            const overage = actualQty - po.total_items;
            console.log(`⚠️ PO ${po.invoice_number} has ${actualQty} pieces but only ${po.total_items} on invoice. Reducing by ${overage}.`);
            
            // Find barcodes to reduce
            const barcodes = await AppDataSource.query(`
                SELECT id, total_quantity, available_quantity 
                FROM barcode_batches 
                WHERE po_id = $1 AND status != 'deleted'
                ORDER BY created_at DESC
            `, [po.id]);

            let remainingToReduce = overage;
            for (const item of barcodes) {
                if (remainingToReduce <= 0) break;

                const currentQty = Number(item.total_quantity);
                const canReduce = Math.min(currentQty, remainingToReduce);

                // If we reduce it to 0, mark as deleted
                if (canReduce === currentQty) {
                    await AppDataSource.query(`UPDATE barcode_batches SET status = 'deleted', total_quantity = 0, available_quantity = 0 WHERE id = $1`, [item.id]);
                } else {
                    await AppDataSource.query(`UPDATE barcode_batches SET total_quantity = total_quantity - $1, available_quantity = GREATEST(0, available_quantity - $1) WHERE id = $2`, [canReduce, item.id]);
                }
                
                remainingToReduce -= canReduce;
                totalReduced += canReduce;
            }
        }
    }

    // FINAL STEP: Delete Orphans again just in case
    await AppDataSource.query(`UPDATE barcode_batches SET status = 'deleted', total_quantity = 0, available_quantity = 0 WHERE po_id IS NULL AND status != 'deleted'`);

    console.log(`\n✅ QUANTITY CLEANUP COMPLETE!`);
    console.log(`🚨 Total extra pieces removed: ${totalReduced}`);
    
    const final = await AppDataSource.query(`SELECT SUM(total_quantity) as total FROM barcode_batches WHERE status != 'deleted'`);
    console.log(`✨ NEW SYSTEM TOTAL: ${final[0].total}`);

    process.exit(0);
}
cleanupQuantities();
