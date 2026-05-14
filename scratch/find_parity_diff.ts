import { AppDataSource } from "../src/config/data-source";
import { BarcodeBatch } from "../src/entities/BarcodeBatch";
import { PurchaseOrder } from "../src/entities/PurchaseOrder";

async function findParityDiff() {
    try {
        if (!AppDataSource.isInitialized) {
            await AppDataSource.initialize();
        }
        console.log("Database Connected. Finding the exact mismatch...");

        const startDate = "2026-03-01";
        const endDate = "2026-03-27";
        const endPlusOne = "2026-03-28";

        // 1. Get ALL barcodes that the INVENTORY report sees
        const inventoryItems = await AppDataSource.getRepository(BarcodeBatch)
            .createQueryBuilder('bb')
            .leftJoin(PurchaseOrder, 'po', 'po.id = bb.po_id')
            .select(['bb.barcode_alias_8digit', 'bb.total_quantity'])
            .where('bb.status IN (:...statuses)', { statuses: ['active', 'Available', 'defective', 'Sold', 'Returned'] })
            .andWhere('COALESCE(po.order_date, bb.created_at) >= :start AND COALESCE(po.order_date, bb.created_at) < :end', { start: startDate, end: endPlusOne })
            .getRawMany();

        // 2. Get ALL barcodes that the PURCHASE report sees
        const purchaseItems = await AppDataSource.getRepository(BarcodeBatch)
            .createQueryBuilder('bb')
            .innerJoin(PurchaseOrder, 'po', 'po.id = bb.po_id') // Purchase report uses INNER JOIN or requires PO
            .select(['bb.barcode_alias_8digit', 'bb.total_quantity'])
            .where('COALESCE(po.order_date, bb.created_at) >= :start AND COALESCE(po.order_date, bb.created_at) < :end', { start: startDate, end: endPlusOne })
            .getRawMany();

        const invMap = new Set(inventoryItems.map(i => i.bb_barcode_alias_8digit));
        const purMap = new Set(purchaseItems.map(i => i.bb_barcode_alias_8digit));

        const diff = inventoryItems.filter(i => !purMap.has(i.bb_barcode_alias_8digit));
        const totalDiffQty = diff.reduce((acc, i) => acc + (parseFloat(i.bb_total_quantity) || 0), 0);

        console.log(`\n--- PARITY DIFF REPORT ---`);
        console.log(`Inventory Items: ${inventoryItems.length}`);
        console.log(`Purchase Items: ${purchaseItems.length}`);
        console.log(`Mismatch Count: ${diff.length} barcodes`);
        console.log(`Mismatch Total Units: ${totalDiffQty}`);
        console.log(`--------------------------\n`);

        if (diff.length > 0) {
            console.log("Example Mismatched Barcodes (In Inventory but NOT in Purchase):");
            console.table(diff.slice(0, 10));
        }

        process.exit(0);
    } catch (err) {
        console.error("Diff failed:", err);
        process.exit(1);
    }
}

findParityDiff();
