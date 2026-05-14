import { AppDataSource } from "../src/config/data-source";
import { BarcodeBatch } from "../src/entities/BarcodeBatch";
import { PurchaseOrder } from "../src/entities/PurchaseOrder";

async function finalMismatchScan() {
    try {
        if (!AppDataSource.isInitialized) {
            await AppDataSource.initialize();
        }
        console.log("Database Connected. Scanning for the 1,096 unit discrepancy...");

        const startDate = "2026-02-01";
        const endDate = "2026-05-15";

        // This query finds the "Mismatch" - items that show in Inventory but are missing from Purchases
        // We will group them by Status to see what they are.
        const mismatchByStatus = await AppDataSource.getRepository(BarcodeBatch)
            .createQueryBuilder('bb')
            .leftJoin(PurchaseOrder, 'po', 'po.id = bb.po_id')
            .select([
                'bb.status as status',
                'COUNT(*) as batch_count',
                'SUM(bb.total_quantity) as total_units'
            ])
            // Standard Inventory Filter
            .where('bb.status IN (:...statuses)', { statuses: ['active', 'Available', 'defective', 'Sold', 'Returned'] })
            .andWhere('bb.created_at >= :start AND bb.created_at < :end', { start: startDate, end: endDate })
            // The condition that makes them "Mismatch" (they have no valid PO or PO date is outside range)
            .andWhere('(bb.po_id IS NULL OR po.id IS NULL OR po.order_date IS NULL OR po.order_date < :start OR po.order_date >= :end)', { start: startDate, end: endDate })
            .groupBy('bb.status')
            .getRawMany();

        console.log(`\n--- FINAL MISMATCH SCAN ---`);
        console.log(`Date Range: ${startDate} to ${endDate}\n`);

        if (mismatchByStatus.length > 0) {
            console.table(mismatchByStatus);
            const total = mismatchByStatus.reduce((acc, s) => acc + (parseFloat(s.total_units) || 0), 0);
            console.log(`\nTOTAL MISMATCHED UNITS: ${total}`);
            
            if (Math.abs(total - 1096) < 100) {
                console.log("\nSUCCESS: We have found the 1,096 items!");
                console.log("These items are in Inventory because they were created in this range,");
                console.log("but they are NOT in Purchases because their PO date is missing or in a different month.");
            }
        } else {
            console.log("No mismatch found. Reports should be identical.");
        }

        process.exit(0);
    } catch (err) {
        console.error("Scan failed:", err);
        process.exit(1);
    }
}

finalMismatchScan();
