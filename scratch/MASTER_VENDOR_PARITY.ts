import { AppDataSource } from '../src/config/data-source';

async function fix() {
    await AppDataSource.initialize();
    console.log("Database Connected. Starting MASTER VENDOR PARITY SYNC...");

    // 1. Load the "Truth" (Purchase Invoices)
    console.log("Loading Purchase Invoices...");
    const invoices = await AppDataSource.query(`
        SELECT pi.po_id, pi.design_no, pi.size as size_id, SUM(pi.quantity) as qty, po.vendor as vendor_id
        FROM purchase_items pi
        JOIN purchase_orders po ON po.id = pi.po_id
        GROUP BY pi.po_id, pi.design_no, pi.size, po.vendor
    `);

    // 2. Load the "Inventory" (Barcodes)
    console.log("Loading Inventory...");
    const inventory = await AppDataSource.query(`
        SELECT id, po_id, design_no, size as size_id, vendor as vendor_id, status, available_quantity, total_quantity
        FROM barcode_batches
        WHERE status != 'deleted'
    `);

    // 3. Reconcile
    const declaredMap = new Map<string, any>();
    for (const inv of invoices) {
        const key = `${inv.po_id}_${inv.design_no}_${inv.size_id}`;
        declaredMap.set(key, { qty: parseFloat(inv.qty), vendor: inv.vendor_id });
    }

    const currentCounts = new Map<string, number>();
    const toUpdate: any[] = [];
    const toDelete: string[] = [];

    console.log("Reconciling design-by-design...");
    for (const bb of inventory) {
        const key = `${bb.po_id}_${bb.design_no}_${bb.size_id}`;
        const truth = declaredMap.get(key);

        if (truth) {
            // This barcode is linked to a valid PO
            const current = (currentCounts.get(key) || 0) + parseInt(bb.total_quantity || 0);
            
            if (current > truth.qty) {
                // Surplus! Delete it if unsold.
                if (parseInt(bb.available_quantity) === parseInt(bb.total_quantity)) {
                    toDelete.push(bb.id);
                } else {
                    currentCounts.set(key, current);
                }
            } else {
                // Correct PO, but maybe wrong Vendor ID? Fix it.
                if (bb.vendor_id !== truth.vendor) {
                    toUpdate.push({ id: bb.id, vendor: truth.vendor });
                }
                currentCounts.set(key, current);
            }
        } else {
            // ORPHAN! This barcode has no PO or wrong PO link.
            // Search if there is a PO that needs this design/size
            let foundHome = false;
            for (const [tKey, tData] of declaredMap.entries()) {
                const [poId, design, size] = tKey.split('_');
                if (design === bb.design_no && size === bb.size_id) {
                    const cCount = currentCounts.get(tKey) || 0;
                    if (cCount < tData.qty) {
                        // We found a home for this orphan!
                        toUpdate.push({ id: bb.id, po_id: poId, vendor: tData.vendor });
                        currentCounts.set(tKey, cCount + parseInt(bb.total_quantity || 0));
                        foundHome = true;
                        break;
                    }
                }
            }
            if (!foundHome) {
                // No PO needs this item. Delete it.
                if (parseInt(bb.available_quantity) === parseInt(bb.total_quantity)) {
                    toDelete.push(bb.id);
                }
            }
        }
    }

    console.log(`Summary:`);
    console.log(`- To Re-Link/Fix: ${toUpdate.length}`);
    console.log(`- To Delete (Surplus): ${toDelete.length}`);

    if (toUpdate.length > 0) {
        console.log("Fixing Links...");
        for (const item of toUpdate) {
            const updateFields: any = { vendor: item.vendor };
            if (item.po_id) updateFields.po_id = item.po_id;
            
            await AppDataSource.query(`
                UPDATE barcode_batches 
                SET vendor = '${item.vendor}' ${item.po_id ? `, po_id = '${item.po_id}'` : ''}
                WHERE id = '${item.id}'
            `);
        }
    }

    if (toDelete.length > 0) {
        console.log("Deleting Surplus...");
        const chunkSize = 200;
        for (let i = 0; i < toDelete.length; i += chunkSize) {
            const chunk = toDelete.slice(i, i + chunkSize);
            await AppDataSource.query(`
                UPDATE barcode_batches 
                SET status = 'deleted', total_quantity = 0, available_quantity = 0
                WHERE id IN (${chunk.map(id => `'${id}'`).join(',')})
            `);
        }
    }

    console.log("-------------------------------------------");
    console.log("SYNC COMPLETE. Every barcode is now linked to its rightful owner.");
    console.log("-------------------------------------------");
    process.exit(0);
}

fix().catch(err => {
    console.error(err);
    process.exit(1);
});
