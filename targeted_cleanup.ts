import { AppDataSource } from "./src/config/data-source";
import { BarcodeBatch } from "./src/entities/BarcodeBatch";
import { PurchaseOrder } from "./src/entities/PurchaseOrder";

async function targetedCleanup() {
    try {
        if (!AppDataSource.isInitialized) {
            await AppDataSource.initialize();
        }
        
        // SET YOUR REPORT DATES HERE
        const startDate = "2026-02-01"; 
        const endDate = "2026-05-13";

        console.log(`Auditing Inventory created between ${startDate} and ${endDate}...`);

        const repo = AppDataSource.getRepository(BarcodeBatch);

        // Finding items created in this month that have NO Purchase Order
        const orphans = await repo.createQueryBuilder('bb')
            .leftJoin(PurchaseOrder, 'po', 'po.id = bb.po_id')
            .select(['bb.id', 'bb.barcode_alias_8digit', 'bb.total_quantity'])
            .where('bb.po_id IS NULL')
            .andWhere('bb.created_at >= :start AND bb.created_at < :end', { start: startDate, end: endDate })
            .andWhere('bb.status != :status', { status: 'deleted' })
            .getRawMany();

        const totalQty = orphans.reduce((acc, o) => acc + (parseFloat(o.bb_total_quantity) || 0), 0);

        console.log(`\n--- TARGETED AUDIT ---`);
        console.log(`Found ${orphans.length} batches in this date range with no Purchase Record.`);
        console.log(`Total units to remove: ${totalQty}`);
        console.log(`----------------------\n`);

        if (orphans.length > 0) {
            const ids = orphans.map(o => o.bb_id);
            // Mark only these items as deleted
            await repo.update(ids, { status: 'deleted' });
            console.log(`SUCCESS: ${totalQty} units have been removed. Your reports should now match.`);
        } else {
            console.log("No orphaned items found in this specific date range.");
        }

        process.exit(0);
    } catch (err) {
        console.error("Cleanup failed:", err);
        process.exit(1);
    }
}

targetedCleanup();
