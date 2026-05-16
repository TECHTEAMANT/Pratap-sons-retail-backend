import { AppDataSource } from "../src/config/data-source";
import { BarcodeBatch } from "../src/entities/BarcodeBatch";
import { PurchaseOrder } from "../src/entities/PurchaseOrder";
import * as fs from 'fs';

async function findGhostDesigns() {
    try {
        await AppDataSource.initialize();
        console.log("Database Connected. Searching for Inventory with no Purchase link...");

        // Scanning ALL TIME to find the absolute source of the mismatch
        const qb = AppDataSource.getRepository(BarcodeBatch).createQueryBuilder('bb')
            .leftJoin(PurchaseOrder, 'po', 'po.id = bb.po_id')
            .select([
                'bb.design_no as design',
                'bb.barcode_alias_8digit as barcode',
                'bb.total_quantity as qty',
                'bb.available_quantity as avail',
                'bb.created_at as printed_date',
                'bb.status as status'
            ])
            .where('bb.po_id IS NULL') 
            .andWhere('bb.status IN (:...statuses)', { statuses: ['active', 'Available', 'defective', 'Sold', 'Returned'] });

        const ghosts = await qb.getRawMany();
        
        const totalGhostUnits = ghosts.reduce((acc, g) => acc + (parseFloat(g.qty) || 0), 0);
        
        console.log(`\n--- GHOST ITEM AUDIT (ALL TIME) ---`);
        console.log(`Found ${ghosts.length} Batches with NO Purchase Order.`);
        console.log(`Total "Extra" Units in Inventory: ${totalGhostUnits}`);
        console.log(`------------------------\n`);

        if (ghosts.length > 0) {
            const csvContent = "Design,Barcode,Qty,Available,Status,PrintedDate\n" + 
                ghosts.map(g => `${g.design},${g.barcode},${g.qty},${g.avail},${g.status},${g.printed_date}`).join("\n");
            
            fs.writeFileSync("scratch/ghost_designs_report.csv", csvContent);
            console.log(`CSV Report with ${ghosts.length} designs saved to: scratch/ghost_designs_report.csv`);
        } else {
            console.log("No items found without POs in this range. The mismatch might be due to stale code on your server.");
        }

        process.exit(0);
    } catch (err) {
        console.error("Audit failed:", err);
        process.exit(1);
    }
}

findGhostDesigns();
