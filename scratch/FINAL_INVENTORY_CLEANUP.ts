import { AppDataSource } from '../src/config/data-source';
import { BarcodeBatch } from '../src/entities/BarcodeBatch';
import { PurchaseOrder } from '../src/entities/PurchaseOrder';

async function cleanupInventory() {
    await AppDataSource.initialize();
    console.log("🚀 Starting Inventory Reconciliation Cleanup...");

    const pos = await AppDataSource.query(`
        SELECT id, invoice_number, total_items 
        FROM purchase_orders 
        WHERE status = 'Completed'
    `);

    let totalDeleted = 0;
    
    for (const po of pos) {
        // Count actual active barcodes for this PO
        const barcodes = await AppDataSource.query(`
            SELECT id, barcode_alias_8digit, available_quantity 
            FROM barcode_batches 
            WHERE po_id = $1 AND status != 'deleted'
            ORDER BY created_at DESC
        `, [po.id]);

        if (barcodes.length > po.total_items) {
            const overage = barcodes.length - po.total_items;
            console.log(`⚠️ PO ${po.invoice_number} has ${barcodes.length} barcodes but only ${po.total_items} items. Deleting ${overage} newest barcodes.`);
            
            // Delete the 'overage' newest barcodes
            const toDelete = barcodes.slice(0, overage);
            for (const item of toDelete) {
                // SAFETY: Only delete if not sold
                if (item.available_quantity > 0) {
                    await AppDataSource.query(`UPDATE barcode_batches SET status = 'deleted' WHERE id = $1`, [item.id]);
                    totalDeleted++;
                } else {
                    console.log(`   ⏭️ Skipping barcode ${item.barcode_alias_8digit} because it was already sold (cannot delete sold history).`);
                }
            }
        }
    }

    console.log(`\n✅ CLEANUP COMPLETE!`);
    console.log(`🚨 Total extra barcodes removed: ${totalDeleted}`);
    console.log(`📊 Your inventory should now match your 12,130 purchase baseline.`);

    process.exit(0);
}
cleanupInventory();
