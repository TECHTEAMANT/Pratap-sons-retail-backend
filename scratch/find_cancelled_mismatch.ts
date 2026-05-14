import { AppDataSource } from "../src/config/data-source";
import { BarcodeBatch } from "../src/entities/BarcodeBatch";
import { PurchaseOrder } from "../src/entities/PurchaseOrder";

async function findCancelledMismatch() {
    try {
        if (!AppDataSource.isInitialized) {
            await AppDataSource.initialize();
        }
        console.log("Database Connected. Scanning for items with CANCELLED Purchase Orders...");

        const startDate = "2026-02-01";
        const endDate = "2026-05-15";

        const repo = AppDataSource.getRepository(BarcodeBatch);

        // Find items that are in Inventory but their PO is not "Good"
        const cancelledMismatch = await repo.createQueryBuilder('bb')
            .innerJoin(PurchaseOrder, 'po', 'po.id = bb.po_id')
            .select(['bb.barcode_alias_8digit', 'bb.design_no', 'bb.total_quantity', 'po.status', 'po.po_number'])
            .where('bb.status IN (:...statuses)', { statuses: ['active', 'Available', 'defective', 'Sold', 'Returned'] })
            .andWhere('bb.created_at >= :start AND bb.created_at < :end', { start: startDate, end: endDate })
            // PO statuses that are NOT counted in Purchase Summary
            .andWhere('po.status NOT IN (:...goodStatuses)', { goodStatuses: ['active', 'received', 'completed', 'Approved'] })
            .getRawMany();

        const totalUnits = cancelledMismatch.reduce((acc, m) => acc + (parseFloat(m.bb_total_quantity) || 0), 0);

        console.log(`\n--- CANCELLED PO AUDIT ---`);
        console.log(`Found ${cancelledMismatch.length} items linked to Cancelled/Draft/Void Purchase Orders.`);
        console.log(`Total Units: ${totalUnits}`);
        console.log(`--------------------------\n`);

        if (cancelledMismatch.length > 0) {
            console.log("Example of these items:");
            console.table(cancelledMismatch.slice(0, 15));
        } else {
            console.log("No cancelled PO items found in this range.");
        }

        process.exit(0);
    } catch (err) {
        console.error("Audit failed:", err);
        process.exit(1);
    }
}

findCancelledMismatch();
