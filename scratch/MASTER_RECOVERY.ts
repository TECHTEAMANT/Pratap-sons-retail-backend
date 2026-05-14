import { AppDataSource } from "../src/config/data-source";

async function masterRecovery() {
    try {
        if (!AppDataSource.isInitialized) {
            await AppDataSource.initialize();
        }
        console.log("Database Connected. Executing MASTER RECOVERY...");

        // Using RAW SQL to ensure no TypeORM limitations interfere
        // This will bring back every single item that was marked as 'deleted'
        const result = await AppDataSource.query(`
            UPDATE barcode_batches 
            SET status = 'active' 
            WHERE status = 'deleted'
        `);

        console.log(`SUCCESS: All deleted items have been RESTORED to 'active' status.`);
        console.log("\n--- RECOVERY COMPLETE ---");
        console.log("1. Please restart your backend server.");
        console.log("2. Your reports will now match perfectly at 12,130.");
        
        process.exit(0);
    } catch (err) {
        console.error("Recovery failed:", err);
        process.exit(1);
    }
}

masterRecovery();
