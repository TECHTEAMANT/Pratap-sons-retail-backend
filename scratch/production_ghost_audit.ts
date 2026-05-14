import { DataSource } from "typeorm";
import { BarcodeBatch } from "../src/entities/BarcodeBatch";
import { PurchaseOrder } from "../src/entities/PurchaseOrder";
import * as fs from 'fs';

// PRODUCTION DATABASE CREDENTIALS (from your .env)
const ProdSource = new DataSource({
    type: "postgres",
    host: "98.70.48.200",
    port: 5432,
    username: "postgres_dev", 
    password: "ant-admin@123_dev",
    database: "invento_erp_dev",
    entities: [BarcodeBatch, PurchaseOrder],
    synchronize: false
});

async function auditProduction() {
    try {
        console.log("Connecting to PRODUCTION DATABASE (98.70.48.200)...");
        await ProdSource.initialize();
        console.log("CONNECTED. Scanning for orphaned inventory...");

        // Querying for items that exist in Inventory but have NO PO link
        // We'll filter by the same logic as your reports
        const repo = ProdSource.getRepository(BarcodeBatch);
        const ghosts = await repo.createQueryBuilder('bb')
            .leftJoin(PurchaseOrder, 'po', 'po.id = bb.po_id')
            .select(['bb.barcode_alias_8digit', 'bb.design_no', 'bb.total_quantity', 'bb.available_quantity', 'bb.created_at'])
            .where('bb.po_id IS NULL AND bb.total_quantity > 0')
            .andWhere('bb.status IN (:...statuses)', { statuses: ['active', 'Available', 'defective', 'Sold', 'Returned'] })
            .getRawMany();

        const totalGhostUnits = ghosts.reduce((acc, g) => acc + (parseFloat(g.bb_total_quantity) || 0), 0);

        console.log(`\n--- PRODUCTION GHOST AUDIT ---`);
        console.log(`Found ${ghosts.length} Batches with NO Purchase Order.`);
        console.log(`Total "Extra" Units on Production: ${totalGhostUnits}`);
        console.log(`------------------------------\n`);

        if (ghosts.length > 0) {
            const csv = "Barcode,Design,Qty,Avail,PrintedAt\n" + 
                ghosts.map(g => `${g.bb_barcode_alias_8digit},${g.bb_design_no},${g.bb_total_quantity},${g.bb_available_quantity},${g.bb_created_at}`).join("\n");
            
            fs.writeFileSync("scratch/PRODUCTION_ghosts.csv", csv);
            console.log("Detailed list of Production ghosts saved to: scratch/PRODUCTION_ghosts.csv");
            console.log("Check this list. If these look wrong, we can delete them from Production.");
        } else {
            console.log("No items without POs found on Production. The mismatch might be due to historical date drifting.");
        }

        await ProdSource.destroy();
        process.exit(0);
    } catch (err) {
        console.error("Production Audit failed:", err);
        process.exit(1);
    }
}

auditProduction();
