import { AppDataSource } from "../src/config/data-source";
import { BarcodeBatch } from "../src/entities/BarcodeBatch";
import { PurchaseOrder } from "../src/entities/PurchaseOrder";

async function findModernOrphans() {
    try {
        if (!AppDataSource.isInitialized) {
            await AppDataSource.initialize();
        }
        
        // Items created in 2026 are NOT opening stock
        const startDate = "2026-01-01";

        console.log(`Scanning for items created in 2026 with NO Purchase Record...`);

        const repo = AppDataSource.getRepository(BarcodeBatch);

        // Find items that:
        // 1. Have NO PO link
        // OR 2. Have a PO link but NO Order Date (The "N/A" items in your Excel)
        const modernOrphans = await repo.createQueryBuilder('bb')
            .leftJoin(PurchaseOrder, 'po', 'po.id = bb.po_id')
            .select(['bb.barcode_alias_8digit', 'bb.design_no', 'bb.total_quantity', 'bb.created_at', 'po.order_date'])
            .where('(bb.po_id IS NULL OR po.order_date IS NULL)')
            .andWhere('bb.created_at >= :start', { start: startDate })
            .andWhere('bb.status != :status', { status: 'deleted' })
            .getRawMany();

        const totalUnits = modernOrphans.reduce((acc, o) => acc + (parseFloat(o.bb_total_quantity) || 0), 0);

        console.log(`\n--- MODERN ORPHAN AUDIT (New items with no Invoice) ---`);
        console.log(`Found ${modernOrphans.length} Modern items with NO Purchase Invoice.`);
        console.log(`Total Units: ${totalUnits}`);
        console.log(`-------------------------------------------------------\n`);

        if (modernOrphans.length > 0) {
            console.log("Example of a likely 'Mistaken' design (New but No Invoice):");
            console.table(modernOrphans.slice(0, 15));
        } else {
            console.log("No modern orphans found. All new items have purchase records.");
        }

        process.exit(0);
    } catch (err) {
        console.error("Audit failed:", err);
        process.exit(1);
    }
}

findModernOrphans();
