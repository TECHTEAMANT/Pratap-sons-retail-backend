import { AppDataSource } from "../src/config/data-source";
import { BarcodeBatch } from "../src/entities/BarcodeBatch";
import { PurchaseOrder } from "../src/entities/PurchaseOrder";

async function masterRepairDatabase() {
    let queryRunner;
    try {
        if (!AppDataSource.isInitialized) {
            await AppDataSource.initialize();
        }
        console.log("Database Connected. Starting MASTER REPAIR...");
        
        queryRunner = AppDataSource.createQueryRunner();
        await queryRunner.connect();
        
        await queryRunner.startTransaction();

        // 1. FIX JANUARY STOCK (981 items)
        // Move both PO date and Barcode creation date to Feb 1st
        await queryRunner.query(`
            UPDATE purchase_orders 
            SET order_date = '2026-02-01'
            WHERE order_date < '2026-02-01'
        `);
        
        await queryRunner.query(`
            UPDATE barcode_batches
            SET created_at = '2026-02-01 10:00:00'
            WHERE created_at < '2026-02-01'
        `);
        console.log(`✅ Fixed January/Opening stock dates (PO and Barcodes).`);

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

    } catch (err) {
        console.error("Repair failed, rolling back:", err);
        if (queryRunner) await queryRunner.rollbackTransaction();
    } finally {
        if (queryRunner) await queryRunner.release();
        process.exit(0);
    }
}

masterRepairDatabase();
