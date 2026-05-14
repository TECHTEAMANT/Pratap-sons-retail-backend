import { AppDataSource } from "../src/config/data-source";
import { BarcodeBatch } from "../src/entities/BarcodeBatch";
import { PurchaseOrder } from "../src/entities/PurchaseOrder";

async function findBrokenLinks() {
    try {
        if (!AppDataSource.isInitialized) {
            await AppDataSource.initialize();
        }
        
        const startDate = "2026-02-01";
        const endDate = "2026-05-15";

        console.log(`Scanning for "Broken Links" (Items with PO_ID but no PO record)...`);

        const repo = AppDataSource.getRepository(BarcodeBatch);

        // This query finds items that have a po_id, but the record is missing from purchase_orders table
        const broken = await repo.createQueryBuilder('bb')
            .leftJoin(PurchaseOrder, 'po', 'po.id = bb.po_id')
            .select(['bb.barcode_alias_8digit', 'bb.design_no', 'bb.total_quantity', 'bb.po_id'])
            .where('bb.po_id IS NOT NULL')
            .andWhere('po.id IS NULL') // The link is broken
            .andWhere('bb.created_at >= :start AND bb.created_at < :end', { start: startDate, end: endDate })
            .getRawMany();

        const totalBroken = broken.reduce((acc, b) => acc + (parseFloat(b.bb_total_quantity) || 0), 0);

        console.log(`\n--- BROKEN LINK AUDIT ---`);
        console.log(`Found ${broken.length} items with broken Purchase Order links.`);
        console.log(`Total Units: ${totalBroken}`);
        console.log(`-------------------------\n`);

        if (broken.length > 0) {
            console.log("Example of a broken link barcode:");
            console.table(broken.slice(0, 10));
        } else {
            console.log("No broken links found. The mismatch must be due to Date Logic.");
        }

        process.exit(0);
    } catch (err) {
        console.error("Audit failed:", err);
        process.exit(1);
    }
}

findBrokenLinks();
