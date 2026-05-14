import { AppDataSource } from "../src/config/data-source";
import { BarcodeBatch } from "../src/entities/BarcodeBatch";
import { PurchaseOrder } from "../src/entities/PurchaseOrder";
import * as fs from 'fs';

async function auditRemovables() {
    try {
        await AppDataSource.initialize();
        console.log("Database Connected. Identifying removable ghost stock...");

        // 1. Find items with NO Purchase Order but with Quantity > 0
        const orphans = await AppDataSource.getRepository(BarcodeBatch).createQueryBuilder('bb')
            .leftJoin(PurchaseOrder, 'po', 'po.id = bb.po_id')
            .select(['bb.barcode_alias_8digit', 'bb.design_no', 'bb.total_quantity', 'bb.available_quantity', 'bb.created_at'])
            .where('bb.po_id IS NULL AND bb.total_quantity > 0')
            .andWhere('bb.status != :status', { status: 'deleted' })
            .getRawMany();

        // 2. Find items where the Vendor on the item doesn't match the Vendor on the PO
        // This is a common cause of reporting mismatches
        const mismatches = await AppDataSource.getRepository(BarcodeBatch).createQueryBuilder('bb')
            .innerJoin(PurchaseOrder, 'po', 'po.id = bb.po_id')
            .select(['bb.barcode_alias_8digit', 'bb.design_no', 'bb.total_quantity', 'po.po_number', 'bb.vendor_id', 'po.vendor_id'])
            .where('bb.vendor_id != po.vendor_id')
            .getRawMany();

        console.log(`\n--- REMOVABLE STOCK REPORT ---`);
        console.log(`Orphaned items (No PO): ${orphans.length}`);
        console.log(`Vendor Mismatches (Wrong Vendor): ${mismatches.length}`);
        
        const totalOrphanQty = orphans.reduce((acc, o) => acc + (parseFloat(o.bb_total_quantity) || 0), 0);
        console.log(`Total units to remove: ${totalOrphanQty}`);
        console.log(`-------------------------------\n`);

        if (orphans.length > 0 || mismatches.length > 0) {
            let csv = "Barcode,Design,Qty,Avail,Reason,Details\n";
            orphans.forEach(o => {
                csv += `${o.bb_barcode_alias_8digit},${o.bb_design_no},${o.bb_total_quantity},${o.bb_available_quantity},NO_PO,Printed: ${o.bb_created_at}\n`;
            });
            mismatches.forEach(m => {
                csv += `${m.bb_barcode_alias_8digit},${m.bb_design_no},${m.bb_total_quantity},0,VENDOR_MISMATCH,ItemVendor: ${m.bb_vendor_id} vs POVendor: ${m.po_vendor_id_2}\n`;
            });
            
            fs.writeFileSync("scratch/removable_items.csv", csv);
            console.log("Detailed list saved to: scratch/removable_items.csv");
        } else {
            console.log("No ghost items found. If your reports still mismatch, it is definitely a code-refresh issue.");
        }

        process.exit(0);
    } catch (err) {
        console.error("Audit failed:", err);
        process.exit(1);
    }
}

auditRemovables();
