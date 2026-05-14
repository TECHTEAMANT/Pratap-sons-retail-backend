import { AppDataSource } from "../src/config/data-source";
import { BarcodeBatch } from "../src/entities/BarcodeBatch";
import { PurchaseOrder } from "../src/entities/PurchaseOrder";

async function forceCleanProduction() {
    try {
        if (!AppDataSource.isInitialized) {
            await AppDataSource.initialize();
        }
        console.log("Database Connected. Starting FORCE CLEANUP of Production Inventory...");

        const repo = AppDataSource.getRepository(BarcodeBatch);

        // 1. Identify items with NO Purchase Order
        const orphans = await repo.createQueryBuilder('bb')
            .leftJoin(PurchaseOrder, 'po', 'po.id = bb.po_id')
            .where('bb.po_id IS NULL')
            .andWhere('bb.status != :status', { status: 'deleted' })
            .getMany();

        // 2. Identify items linked to INVALID Purchase Orders (Cancelled, Draft, etc.)
        const badPOItems = await repo.createQueryBuilder('bb')
            .innerJoin(PurchaseOrder, 'po', 'po.id = bb.po_id')
            .where('po.status NOT IN (:...goodStatuses)', { goodStatuses: ['active', 'received', 'completed', 'Approved'] })
            .andWhere('bb.status != :status', { status: 'deleted' })
            .getMany();

        const allBadItems = [...orphans, ...badPOItems];
        console.log(`Found ${allBadItems.length} total items to remove.`);

        if (allBadItems.length > 0) {
            const ids = allBadItems.map(item => item.id);
            
            // Removing them from inventory (marking as deleted)
            await repo.update(ids, { status: 'deleted' });

            console.log(`SUCCESS: ${ids.length} items have been removed from your production inventory.`);
        } else {
            console.log("No invalid items found to remove.");
        }

        console.log("\n--- CLEANUP COMPLETE ---");
        process.exit(0);
    } catch (err) {
        console.error("Cleanup failed:", err);
        process.exit(1);
    }
}

forceCleanProduction();
