import { AppDataSource } from "../src/config/data-source";
import { BarcodeBatch } from "../src/entities/BarcodeBatch";

async function checkAllStatuses() {
    try {
        if (!AppDataSource.isInitialized) {
            await AppDataSource.initialize();
        }
        console.log("Database Connected. Checking ALL statuses in the system...");

        const result = await AppDataSource.getRepository(BarcodeBatch)
            .createQueryBuilder('bb')
            .select('bb.status', 'status')
            .addSelect('COUNT(*)', 'count')
            .addSelect('SUM(bb.total_quantity)', 'total_units')
            .groupBy('bb.status')
            .getRawMany();

        console.log("\n--- GLOBAL STATUS COUNT ---");
        console.table(result);
        
        const grandTotal = result.reduce((acc, r) => acc + (parseFloat(r.total_units) || 0), 0);
        console.log(`\nGRAND TOTAL UNITS IN DATABASE: ${grandTotal}`);

        process.exit(0);
    } catch (err) {
        console.error("Check failed:", err);
        process.exit(1);
    }
}

checkAllStatuses();
