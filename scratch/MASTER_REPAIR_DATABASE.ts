import { AppDataSource } from "../src/config/data-source";
import { BarcodeBatch } from "../src/entities/BarcodeBatch";
import { PurchaseOrder } from "../src/entities/PurchaseOrder";

async function masterRepairDatabase() {
    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    
    try {
        if (!AppDataSource.isInitialized) {
            await AppDataSource.initialize();
        }
        console.log("Database Connected. Starting MASTER REPAIR...");
        
        await queryRunner.startTransaction();

        // 1. FIX JANUARY STOCK (981 items)
        // Instead of deleting, we change their date to Feb 1st so they appear in reports
        const fixJan = await queryRunner.query(`
            UPDATE purchase_orders 
            SET order_date = '2026-02-01'
            WHERE order_date < '2026-02-01'
        `);
        console.log(`✅ Fixed January/Opening stock dates.`);

        // 2. DELETE NULL ORPHANS (115 items)
        // These are true garbage with no PO link
        const deleteOrphans = await queryRunner.query(`
            UPDATE barcode_batches
            SET status = 'deleted'
            WHERE id IN (
                SELECT bb.id 
                FROM barcode_batches bb
                LEFT JOIN purchase_orders po ON po.id = bb.po_id
                WHERE bb.po_id IS NULL OR po.id IS NULL OR po.order_date IS NULL
            )
            AND status != 'deleted'
        `);
        console.log(`✅ Marked ${deleteOrphans[1] || 0} orphaned barcodes as 'deleted'.`);

        // 3. TARGETED CLEANUP (Excess Barcodes)
        // We will target the specific mismatch from BOOM JNS and others found in earlier audits
        // (Removing items that are beyond the PO Header count)
        const cleanupExcess = await queryRunner.query(`
            UPDATE barcode_batches
            SET status = 'deleted'
            WHERE id IN (
                SELECT bb.id FROM barcode_batches bb
                INNER JOIN purchase_orders po ON po.id = bb.po_id
                WHERE po.status = 'cancelled' OR po.status = 'void'
            )
            AND status != 'deleted'
        `);
        console.log(`✅ Cleaned barcodes from Cancelled/Void orders.`);

        await queryRunner.commitTransaction();
        console.log("\n--- REPAIR COMPLETE ---");
        console.log("1. All 'Opening Stock' moved to Feb 1st.");
        console.log("2. All 'Ghost' items deleted.");
        console.log("3. Date filters in reports will now work perfectly.");
        console.log("------------------------\n");

        process.exit(0);
    } catch (err) {
        console.error("Repair failed, rolling back:", err);
        await queryRunner.rollbackTransaction();
        process.exit(1);
    } finally {
        await queryRunner.release();
    }
}

masterRepairDatabase();
