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

        // 1. Finding items with NO Purchase Order
        const orphans = await repo.createQueryBuilder('bb')
            .leftJoin(PurchaseOrder, 'po', 'po.id = bb.po_id')
            .select(['bb.id', 'bb.barcode_alias_8digit', 'bb.total_quantity'])
            .where('bb.po_id IS NULL')
            .andWhere('bb.created_at >= :start AND bb.created_at < :end', { start: startDate, end: endDate })
            .andWhere('bb.status != :status', { status: 'deleted' })
            .getRawMany();

        // 2. Finding items with CANCELLED/INVALID Purchase Orders in this range
        const badPOItems = await repo.createQueryBuilder('bb')
            .innerJoin(PurchaseOrder, 'po', 'po.id = bb.po_id')
            .select(['bb.id', 'bb.barcode_alias_8digit', 'bb.total_quantity'])
            .where('po.status NOT IN (:...goodStatuses)', { goodStatuses: ['active', 'received', 'completed', 'Approved'] })
            .andWhere('bb.created_at >= :start AND bb.created_at < :end', { start: startDate, end: endDate })
            .andWhere('bb.status != :status', { status: 'deleted' })
            .getRawMany();

        const allToDelele = [...orphans, ...badPOItems];
        const totalQty = allToDelele.reduce((acc, o) => acc + (parseFloat(o.bb_total_quantity) || 0), 0);

        console.log(`\n--- TARGETED AUDIT ---`);
        console.log(`Date Range: ${startDate} to ${endDate}`);
        console.log(`Orphans found: ${orphans.length}`);
        console.log(`Items with Cancelled/Draft POs: ${badPOItems.length}`);
        console.log(`Total units to remove: ${totalQty}`);
        console.log(`----------------------\n`);

        if (allToDelele.length > 0) {
            const ids = allToDelele.map(o => o.bb_id);
            await repo.update(ids, { status: 'deleted' });
            console.log(`SUCCESS: ${totalQty} units have been removed.`);
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
