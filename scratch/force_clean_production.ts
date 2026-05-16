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

        // 1. Clean up items with NO Purchase Order
        const orphanResult = await repo.createQueryBuilder('bb')
            .update(BarcodeBatch)
            .set({ status: 'deleted' })
            .where('po_id IS NULL')
            .andWhere('status != :status', { status: 'deleted' })
            .execute();

        // 2. Clean up items linked to INVALID Purchase Orders
        const subQuery = AppDataSource.getRepository(PurchaseOrder)
            .createQueryBuilder('po')
            .select('po.id')
            .where('po.status NOT IN (:...goodStatuses)', { goodStatuses: ['active', 'received', 'completed', 'Approved'] });

        const badPOResult = await repo.createQueryBuilder('bb')
            .update(BarcodeBatch)
            .set({ status: 'deleted' })
            .where(`po_id IN (${subQuery.getQuery()})`)
            .setParameters(subQuery.getParameters())
            .andWhere('status != :status', { status: 'deleted' })
            .execute();

        const totalRemoved = (orphanResult.affected || 0) + (badPOResult.affected || 0);
        console.log(`SUCCESS: ${totalRemoved} items have been removed from your production inventory.`);

        console.log("\n--- CLEANUP COMPLETE ---");
        process.exit(0);
    } catch (err) {
        console.error("Cleanup failed:", err);
        process.exit(1);
    }
}

forceCleanProduction();
