import { AppDataSource } from "../src/config/data-source";
import { BarcodeBatch } from "../src/entities/BarcodeBatch";
import { PurchaseOrder } from "../src/entities/PurchaseOrder";

async function repairProduction() {
    try {
        if (!AppDataSource.isInitialized) {
            await AppDataSource.initialize();
        }
        console.log("Database Connected. Starting PRODUCTION REPAIR...");

        const repo = AppDataSource.getRepository(BarcodeBatch);

        // 1. Identify items with NO Purchase Order that are currently showing in reports
        const ghosts = await repo.createQueryBuilder('bb')
            .leftJoin(PurchaseOrder, 'po', 'po.id = bb.po_id')
            .where('bb.po_id IS NULL')
            .andWhere('bb.status IN (:...statuses)', { statuses: ['active', 'Available', 'defective', 'Sold', 'Returned'] })
            .getMany();

        console.log(`Found ${ghosts.length} ghost items with no Purchase Record.`);

        if (ghosts.length > 0) {
            console.log(`Removing ${ghosts.length} items from inventory...`);
            
            // We mark them as 'deleted' so they disappear from all reports
            // This is safer than a hard delete.
            const ids = ghosts.map(g => g.id);
            await repo.update(ids, { status: 'deleted' });

            console.log("SUCCESS: Ghost items have been removed.");
        } else {
            console.log("No ghost items found. Your database is already clean.");
        }

        console.log("\n--- REPAIR COMPLETE ---");
        console.log("Please restart your server and check your reports.");
        process.exit(0);
    } catch (err) {
        console.error("Repair failed:", err);
        process.exit(1);
    }
}

repairProduction();
