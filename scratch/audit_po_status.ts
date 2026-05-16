import { DataSource } from "typeorm";
import { BarcodeBatch } from "../src/entities/BarcodeBatch";
import { PurchaseOrder } from "../src/entities/PurchaseOrder";

const ProdSource = new DataSource({
    type: "postgres",
    host: "localhost", // Running directly on the server
    port: 5432,
    username: "postgres", 
    password: "Root@123",
    database: "invento_erp",
    entities: [BarcodeBatch, PurchaseOrder],
    synchronize: false
});

async function auditPOStatus() {
    try {
        await ProdSource.initialize();
        console.log("Connected to Production. Auditing PO Statuses...");

        const repo = ProdSource.getRepository(BarcodeBatch);

        // Find items linked to POs that are NOT 'active' or 'received'
        // (Adjust these status names based on your actual system)
        const badStatusItems = await repo.createQueryBuilder('bb')
            .innerJoin(PurchaseOrder, 'po', 'po.id = bb.po_id')
            .select(['bb.barcode_alias_8digit', 'bb.design_no', 'bb.total_quantity', 'po.status as po_status', 'po.po_number'])
            .where('po.status NOT IN (:...goodStatuses)', { goodStatuses: ['active', 'received', 'completed', 'Approved'] })
            .getRawMany();

        const totalBadQty = badStatusItems.reduce((acc, i) => acc + (parseFloat(i.bb_total_quantity) || 0), 0);

        console.log(`\n--- PO STATUS AUDIT ---`);
        console.log(`Found ${badStatusItems.length} items linked to Non-Active Purchase Orders.`);
        console.log(`Total "Bad" Units: ${totalBadQty}`);
        console.log(`-----------------------\n`);

        if (badStatusItems.length > 0) {
            console.log("Example of a 'Bad' item:");
            console.table(badStatusItems.slice(0, 5));
        }

        await ProdSource.destroy();
        process.exit(0);
    } catch (err) {
        console.error("Audit failed:", err);
        process.exit(1);
    }
}

auditPOStatus();
