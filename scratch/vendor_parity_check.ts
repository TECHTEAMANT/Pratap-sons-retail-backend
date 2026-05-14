import { AppDataSource } from "../src/config/data-source";
import { BarcodeBatch } from "../src/entities/BarcodeBatch";
import { PurchaseOrder } from "../src/entities/PurchaseOrder";
import { Vendor } from "../src/entities/Vendor";

async function vendorParityCheck() {
    try {
        if (!AppDataSource.isInitialized) {
            await AppDataSource.initialize();
        }
        console.log("Database Connected. Analyzing Vendor Parity (All Time)...");

        // 1. Get Inventory Totals by Vendor
        const invTotals = await AppDataSource.getRepository(BarcodeBatch)
            .createQueryBuilder('bb')
            .leftJoin(Vendor, 'v', 'v.id = bb.vendor_id')
            .select(['v.name as vendor_name', 'SUM(bb.total_quantity) as total_inv'])
            .where('bb.status IN (:...statuses)', { statuses: ['active', 'Available', 'defective', 'Sold', 'Returned'] })
            .groupBy('v.name')
            .getRawMany();

        // 2. Get Purchase Totals by Vendor
        const purTotals = await AppDataSource.getRepository(BarcodeBatch)
            .createQueryBuilder('bb')
            .innerJoin(PurchaseOrder, 'po', 'po.id = bb.po_id')
            .leftJoin(Vendor, 'v', 'v.id = bb.vendor_id')
            .select(['v.name as vendor_name', 'SUM(bb.total_quantity) as total_pur'])
            .groupBy('v.name')
            .getRawMany();

        const purMap = new Map(purTotals.map(t => [t.vendor_name, parseFloat(t.total_pur) || 0]));
        
        const parity = invTotals.map(t => {
            const pur = purMap.get(t.vendor_name) || 0;
            const inv = parseFloat(t.total_inv) || 0;
            return {
                vendor: t.vendor_name,
                inventory: inv,
                purchase: pur,
                diff: inv - pur
            };
        }).filter(p => p.diff !== 0).sort((a, b) => b.diff - a.diff);

        console.log("\n--- VENDOR PARITY REPORT (ALL TIME) ---");
        console.table(parity);

        const totalDiff = parity.reduce((acc, p) => acc + p.diff, 0);
        console.log(`\nGRAND TOTAL DIFFERENCE: ${totalDiff}`);

        process.exit(0);
    } catch (err) {
        console.error("Parity check failed:", err);
        process.exit(1);
    }
}

vendorParityCheck();
