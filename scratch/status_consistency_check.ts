import { AppDataSource } from "../src/config/data-source";
import { BarcodeBatch } from "../src/entities/BarcodeBatch";

async function statusConsistencyCheck() {
    try {
        if (!AppDataSource.isInitialized) {
            await AppDataSource.initialize();
        }
        console.log("Database Connected. Checking for Status Overlaps...");

        const repo = AppDataSource.getRepository(BarcodeBatch);

        // Sum up the database raw numbers
        const stats = await repo.createQueryBuilder('bb')
            .select([
                'SUM(bb.available_quantity) as "db_available"',
                'SUM(bb.total_quantity - bb.available_quantity) as "db_sold_and_returned"',
                'COUNT(*) as "batch_count"',
                'SUM(bb.total_quantity) as "db_total_units"'
            ])
            .where('bb.status IN (:...statuses)', { statuses: ['active', 'Available', 'Sold', 'Returned'] })
            .getRawOne();

        console.log(`\n--- STATUS CONSISTENCY REPORT ---`);
        console.log(`Total Units in DB: ${stats.db_total_units}`);
        console.log(`Available Units: ${stats.db_available}`);
        console.log(`Sold/Returned Units: ${stats.db_sold_and_returned}`);
        console.log(`--------------------------------\n`);

        // Now check for specific "Returned" flag in your system
        // Some items might be marked as Sold but also have a Return record
        const returns = await repo.query(`
            SELECT SUM(quantity) as total_returns 
            FROM sales_return_items
        `);

        console.log(`Total Returns in Table: ${returns[0].total_returns}`);

        const sum = parseFloat(stats.db_available) + parseFloat(stats.db_sold_and_returned);
        console.log(`\nMath Check: Available (${stats.db_available}) + Sold/Returned (${stats.db_sold_and_returned}) = ${sum}`);
        
        if (sum > stats.db_total_units) {
            console.log("⚠️ WARNING: Your system is double-counting items!");
        } else {
            console.log("✅ Math is correct. The mismatch must be in the Filtering logic.");
        }

        process.exit(0);
    } catch (err) {
        console.error("Check failed:", err);
        process.exit(1);
    }
}

statusConsistencyCheck();
