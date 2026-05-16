import { AppDataSource } from "../src/config/database";
import { BarcodeBatch } from "../src/entities/BarcodeBatch";
import { PurchaseOrder } from "../src/entities/PurchaseOrder";

async function audit() {
    try {
        await AppDataSource.initialize();
        console.log("Database Connected. Auditing Purchase vs Inventory...");

        // We'll audit the last 60 days to be sure we catch everything
        const now = new Date();
        const start = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const endPlusOne = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        const qb = AppDataSource.getRepository(BarcodeBatch).createQueryBuilder('bb')
            .leftJoin(PurchaseOrder, 'po', 'po.id = bb.po_id')
            .select([
                'COUNT(*) as "rowCount"',
                'SUM(bb.total_quantity) as "totalUnits"',
                'SUM(CASE WHEN bb.po_id IS NULL THEN bb.total_quantity ELSE 0 END) as "openingStockUnits"',
                'SUM(CASE WHEN bb.po_id IS NOT NULL THEN bb.total_quantity ELSE 0 END) as "poLinkedUnits"'
            ])
            .where('COALESCE(po.order_date, bb.created_at) >= :start AND COALESCE(po.order_date, bb.created_at) < :endPlusOne', { start, endPlusOne })
            .andWhere('bb.status IN (:...statuses)', { statuses: ['active', 'Available', 'defective', 'Sold', 'Returned'] });

        const result = await qb.getRawOne();
        console.log("\n--- AUDIT RESULTS (Last 60 Days) ---");
        console.log(`Total Batches found: ${result.rowCount}`);
        console.log(`Total Units (Gross Purchase): ${result.totalUnits}`);
        console.log(`Units with NO Purchase Order (Opening): ${result.openingStockUnits}`);
        console.log(`Units WITH Purchase Order: ${result.poLinkedUnits}`);
        console.log("------------------------------------\n");

        process.exit(0);
    } catch (err) {
        console.error("Audit failed:", err);
        process.exit(1);
    }
}

audit();
