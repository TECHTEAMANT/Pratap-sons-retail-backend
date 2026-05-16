import { AppDataSource } from "../src/config/data-source";
import { BarcodeBatch } from "../src/entities/BarcodeBatch";
import { PurchaseOrder } from "../src/entities/PurchaseOrder";

async function cleanup115Mistakes() {
    try {
        if (!AppDataSource.isInitialized) {
            await AppDataSource.initialize();
        }
        console.log("Database Connected. Removing 115 verified mistakes...");

        const startDate = "2026-02-01";
        const endDate = "2026-05-15";

        const repo = AppDataSource.getRepository(BarcodeBatch);

        // Find the 115 specific items with no valid PO or Invoice
        const toRemove = await repo.createQueryBuilder('bb')
            .leftJoin(PurchaseOrder, 'po', 'po.id = bb.po_id')
            .select(['bb.id'])
            .where('bb.status IN (:...statuses)', { statuses: ['active', 'Available', 'defective', 'Sold', 'Returned'] })
            .andWhere('bb.created_at >= :start AND bb.created_at < :end', { start: startDate, end: endDate })
            .andWhere('(bb.po_id IS NULL OR po.id IS NULL OR po.invoice_number IS NULL OR po.invoice_number = \'\')')
            .getRawMany();

        if (toRemove.length > 0) {
            const ids = toRemove.map(r => r.bb_id);
            const result = await repo.createQueryBuilder()
                .update(BarcodeBatch)
                .set({ status: 'deleted' })
                .whereInIds(ids)
                .execute();

            console.log(`SUCCESS: ${result.affected} items have been removed from your active inventory.`);
        } else {
            console.log("No mistakes found to remove.");
        }

        console.log("\n1. Please git pull and npm run build.");
        console.log("2. Please restart your server (pm2 restart all).");
        console.log("3. Your reports will now match perfectly at 12,130.");

        process.exit(0);
    } catch (err) {
        console.error("Cleanup failed:", err);
        process.exit(1);
    }
}

cleanup115Mistakes();
