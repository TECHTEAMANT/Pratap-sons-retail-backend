import { AppDataSource } from "../src/config/data-source";
import { BarcodeBatch } from "../src/entities/BarcodeBatch";
import { PurchaseOrder } from "../src/entities/PurchaseOrder";

async function findAllNullDates() {
    try {
        if (!AppDataSource.isInitialized) {
            await AppDataSource.initialize();
        }
        console.log("Database Connected. Finding ALL items missing from Purchase Summary...");

        const repo = AppDataSource.getRepository(BarcodeBatch);

        // Find EVERY item that is active but has NO Purchase Date
        // This is what causes the 1,096 difference.
        const missingFromPurchase = await repo.createQueryBuilder('bb')
            .leftJoin(PurchaseOrder, 'po', 'po.id = bb.po_id')
            .select([
                'bb.barcode_alias_8digit', 
                'bb.design_no', 
                'bb.total_quantity', 
                'bb.created_at', 
                'po.po_number',
                'po.order_date'
            ])
            .where('bb.status IN (:...statuses)', { statuses: ['active', 'Available', 'defective', 'Sold', 'Returned'] })
            .andWhere('(bb.po_id IS NULL OR po.id IS NULL OR po.order_date IS NULL)')
            .getRawMany();

        const totalUnits = missingFromPurchase.reduce((acc, m) => acc + (parseFloat(m.bb_total_quantity) || 0), 0);

        console.log(`\n--- THE 1,096 GAP ANALYSIS ---`);
        console.log(`Found ${missingFromPurchase.length} barcodes with NO Purchase Date.`);
        console.log(`Total Units: ${totalUnits}`);
        console.log(`------------------------------\n`);

        if (missingFromPurchase.length > 0) {
            console.log("These are the items that show in Inventory but NOT in Purchase Summary:");
            console.table(missingFromPurchase.slice(0, 20));
        }

        process.exit(0);
    } catch (err) {
        console.error("Audit failed:", err);
        process.exit(1);
    }
}

findAllNullDates();
