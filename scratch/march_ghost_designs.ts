import { AppDataSource } from "../src/config/data-source";
import { BarcodeBatch } from "../src/entities/BarcodeBatch";
import { PurchaseOrder } from "../src/entities/PurchaseOrder";

async function findMarchGhosts() {
    try {
        if (!AppDataSource.isInitialized) {
            await AppDataSource.initialize();
        }
        
        const startDate = "2026-03-01";
        const endDate = "2026-04-01"; // Scanning the whole month of March

        console.log(`Scanning for items created in March with NO Purchase Invoice...`);

        const repo = AppDataSource.getRepository(BarcodeBatch);

        // Find items in March that have:
        // 1. No PO link
        // OR 2. PO link but no Invoice Number
        const ghosts = await repo.createQueryBuilder('bb')
            .leftJoin(PurchaseOrder, 'po', 'po.id = bb.po_id')
            .select(['bb.barcode_alias_8digit', 'bb.design_no', 'bb.total_quantity', 'bb.created_at', 'po.invoice_number'])
            .where('bb.created_at >= :start AND bb.created_at < :end', { start: startDate, end: endDate })
            .andWhere('(bb.po_id IS NULL OR po.invoice_number IS NULL OR po.invoice_number = \'\')')
            .andWhere('bb.status != :status', { status: 'deleted' })
            .getRawMany();

        const totalUnits = ghosts.reduce((acc, g) => acc + (parseFloat(g.bb_total_quantity) || 0), 0);

        console.log(`\n--- MARCH GHOST AUDIT ---`);
        console.log(`Found ${ghosts.length} Batches with no valid Purchase Invoice.`);
        console.log(`Total Units: ${totalUnits}`);
        console.log(`-------------------------\n`);

        if (ghosts.length > 0) {
            console.log("Example of a 'Mistaken' design:");
            console.table(ghosts.slice(0, 10));
        }

        process.exit(0);
    } catch (err) {
        console.error("Audit failed:", err);
        process.exit(1);
    }
}

findMarchGhosts();
