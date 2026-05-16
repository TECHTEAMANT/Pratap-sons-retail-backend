import { AppDataSource } from '../src/config/data-source';

async function repair() {
    await AppDataSource.initialize();
    console.log("Database Connected. Starting FAST MASTER PARITY REPAIR...");

    // 1. Get Barcode Data (Raw is faster)
    console.log("Loading barcode data...");
    // 1. Get Sizes and Barcode Data
    console.log("Loading sizes...");
    const sizes = await AppDataSource.query(`SELECT id, name FROM sizes`);
    const sizeNameMap = new Map<string, string>();
    for (const sz of sizes) {
        sizeNameMap.set(sz.id.toString(), sz.name);
    }

    console.log("Loading barcode data...");
    const barcodes = await AppDataSource.query(`
        SELECT id, po_id, design_no, size as size_id, available_quantity, total_quantity
        FROM barcode_batches
        WHERE status != 'deleted'
    `);

    // 2. Get PO Declared Data
    console.log("Loading purchase data...");
    const purchaseItems = await AppDataSource.query(`
        SELECT po_id, design_no, size as size_id, SUM(quantity) as qty
        FROM purchase_items
        GROUP BY po_id, design_no, size
    `);
    
    // 3. Build Declared Map
    const declaredMap = new Map<string, number>();
    for (const item of purchaseItems) {
        const key = `${item.po_id}_${item.design_no}_${item.size_id}`;
        declaredMap.set(key, parseFloat(item.qty || 0));
    }

    // 4. Analyze
    const currentCounts = new Map<string, number>();
    const toDelete: string[] = [];

    console.log("Analyzing...");
    for (const bb of barcodes) {
        const key = `${bb.po_id}_${bb.design_no}_${bb.size_id}`;
        const size_name = sizeNameMap.get(bb.size_id?.toString() || "");
        
        // RULE 1: No PO
        if (!bb.po_id) {
            toDelete.push(bb.id);
            continue;
        }

        // RULE 2: Unknown Size
        if (!size_name || size_name.toUpperCase().includes('UNKNOWN')) {
            toDelete.push(bb.id);
            continue;
        }

        // RULE 3: Surplus
        const declared = declaredMap.get(key) || 0;
        const current = (currentCounts.get(key) || 0) + parseInt(bb.total_quantity || 0);
        
        if (current > declared) {
            if (parseInt(bb.available_quantity) === parseInt(bb.total_quantity)) {
                toDelete.push(bb.id);
            } else {
                currentCounts.set(key, current);
            }
        } else {
            currentCounts.set(key, current);
        }
    }

    console.log(`Identified ${toDelete.length} items to remove.`);

    if (toDelete.length > 0) {
        console.log("Executing removal...");
        const chunkSize = 200;
        for (let i = 0; i < toDelete.length; i += chunkSize) {
            const chunk = toDelete.slice(i, i + chunkSize);
            await AppDataSource.query(`
                UPDATE barcode_batches 
                SET status = 'deleted', total_quantity = 0, available_quantity = 0
                WHERE id IN (${chunk.map(id => `'${id}'`).join(',')})
            `);
            process.stdout.write(".");
        }
        console.log("\n✅ Removal complete.");
    }

    console.log("-------------------------------------------");
    console.log("REPAIR COMPLETE.");
    console.log("-------------------------------------------");

    process.exit(0);
}

repair().catch(err => {
    console.error(err);
    process.exit(1);
});
