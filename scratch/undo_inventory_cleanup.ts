import { AppDataSource } from "../src/config/data-source";
import { BarcodeBatch } from "../src/entities/BarcodeBatch";

async function undoCleanup() {
    try {
        if (!AppDataSource.isInitialized) {
            await AppDataSource.initialize();
        }
        console.log("Database Connected. UNDOING CLEANUP... Restoring all items.");

        const repo = AppDataSource.getRepository(BarcodeBatch);

        // This will find all items that were marked as 'deleted' and restore them
        // We restore them to 'active' status. 
        // The system will then automatically show them as Available or Sold based on their quantities.
        const result = await repo.createQueryBuilder()
            .update(BarcodeBatch)
            .set({ status: 'active' })
            .where('status = :status', { status: 'deleted' })
            .execute();

        console.log(`SUCCESS: ${result.affected} items have been RESTORED.`);
        
        console.log("\n--- RESTORE COMPLETE ---");
        console.log("Please restart your server. Everything is back to normal.");
        process.exit(0);
    } catch (err) {
        console.error("Restore failed:", err);
        process.exit(1);
    }
}

undoCleanup();
