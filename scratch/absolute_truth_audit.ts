import { AppDataSource } from "../src/config/data-source";
import { BarcodeBatch } from "../src/entities/BarcodeBatch";
import { PurchaseOrder } from "../src/entities/PurchaseOrder";

async function absoluteTruthAudit() {
    try {
        if (!AppDataSource.isInitialized) {
            await AppDataSource.initialize();
        }
        console.log("Database Connected. Performing ABSOLUTE TRUTH audit...");

        const repo = AppDataSource.getRepository(BarcodeBatch);

        // Find EVERY active item in the database that has NO valid Purchase Record
        // (Ignoring dates completely)
        const allOrphans = await repo.createQueryBuilder('bb')
            .leftJoin(PurchaseOrder, 'po', 'po.id = bb.po_id')
            .select(['bb.barcode_alias_8digit', 'bb.design_no', 'bb.total_quantity', 'bb.created_at', 'po.order_date'])
            .where('bb.status IN (:...statuses)', { statuses: ['active', 'Available', 'defective', 'Sold', 'Returned'] })
            .andWhere('(bb.po_id IS NULL OR po.id IS NULL OR po.order_date IS NULL)')
            .getRawMany();

        const totalUnits = allOrphans.reduce((acc, o) => acc + (parseFloat(o.bb_total_quantity) || 0), 0);

        console.log(`\n--- ABSOLUTE TRUTH AUDIT ---`);
        console.log(`Found ${allOrphans.length} total barcodes with no Purchase Record in your ENTIRE database.`);
        console.log(`Total Units: ${totalUnits}`);
        console.log(`---------------------------\n`);

        if (allOrphans.length > 0) {
            console.log("Example of these items:");
            console.table(allOrphans.slice(0, 15));
        }

        process.exit(0);
    } catch (err) {
        console.error("Audit failed:", err);
        process.exit(1);
    }
}

absoluteTruthAudit();
