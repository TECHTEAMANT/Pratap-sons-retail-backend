import { AppDataSource } from "../src/config/data-source";
import { BarcodeBatch } from "../src/entities/BarcodeBatch";
import { PurchaseOrder } from "../src/entities/PurchaseOrder";

async function checkJanuaryStock() {
    try {
        if (!AppDataSource.isInitialized) {
            await AppDataSource.initialize();
        }
        console.log("Database Connected. Checking for items BEFORE February 1st...");

        const repo = AppDataSource.getRepository(BarcodeBatch);

        // Count items with a PO date before Feb 1st
        const preFeb = await repo.createQueryBuilder('bb')
            .innerJoin(PurchaseOrder, 'po', 'po.id = bb.po_id')
            .where('po.order_date < :start', { start: '2026-02-01' })
            .select('SUM(bb.total_quantity)', 'total')
            .getRawOne();

        console.log(`\n--- PRE-FEBRUARY AUDIT ---`);
        console.log(`Total Units found BEFORE February 1st: ${preFeb.total || 0}`);
        console.log(`---------------------------\n`);

        process.exit(0);
    } catch (err) {
        console.error("Check failed:", err);
        process.exit(1);
    }
}

checkJanuaryStock();
