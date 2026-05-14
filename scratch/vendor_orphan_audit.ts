import { AppDataSource } from "../src/config/data-source";
import { BarcodeBatch } from "../src/entities/BarcodeBatch";
import { PurchaseOrder } from "../src/entities/PurchaseOrder";
import { Vendor } from "../src/entities/Vendor";

async function vendorOrphanAudit() {
    try {
        if (!AppDataSource.isInitialized) {
            await AppDataSource.initialize();
        }
        console.log("Database Connected. Starting Vendor-by-Vendor Audit...");

        // We'll check the current report range (Feb to May)
        const startDate = "2026-02-01";
        const endDate = "2026-05-13";

        const repo = AppDataSource.getRepository(BarcodeBatch);

        // This query finds items that appear in Inventory but have NO Purchase Order link
        // grouped by Vendor so you can see exactly where the mistakes are.
        const orphansByVendor = await repo.createQueryBuilder('bb')
            .leftJoin(Vendor, 'v', 'v.id = bb.vendor_id')
            .leftJoin(PurchaseOrder, 'po', 'po.id = bb.po_id')
            .select([
                'v.name as vendor_name',
                'COUNT(*) as orphan_batches',
                'SUM(bb.total_quantity) as orphan_units'
            ])
            .where('bb.po_id IS NULL')
            .andWhere('bb.created_at >= :start AND bb.created_at < :end', { start: startDate, end: endDate })
            .andWhere('bb.status != :status', { status: 'deleted' })
            .groupBy('v.name')
            .getRawMany();

        console.log(`\n--- VENDOR ORPHAN AUDIT (Items with NO Purchase Record) ---`);
        console.log(`Date Range: ${startDate} to ${endDate}\n`);

        if (orphansByVendor.length > 0) {
            console.table(orphansByVendor);
            const grandTotal = orphansByVendor.reduce((acc, v) => acc + (parseFloat(v.orphan_units) || 0), 0);
            console.log(`\nTOTAL ORPHAN UNITS TO REMOVE: ${grandTotal}`);
            console.log(`\nIf this Total (${grandTotal}) matches your mismatch, I will give you the command to fix it.`);
        } else {
            console.log("No orphaned items found in this range. Your inventory and purchases are already clean.");
        }

        process.exit(0);
    } catch (err) {
        console.error("Audit failed:", err);
        process.exit(1);
    }
}

vendorOrphanAudit();
