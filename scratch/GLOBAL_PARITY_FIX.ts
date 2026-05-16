import { AppDataSource } from '../src/config/data-source';

async function fix() {
    await AppDataSource.initialize();
    console.log("Database Connected. Starting SUPER FAST GLOBAL PARITY FIX...");

    // 1. Get All Purchase Items (The Truth)
    console.log("Loading Purchase Invoices...");
    const allDeclared = await AppDataSource.query(`
        SELECT po_id, design_no, size as size_id, SUM(quantity) as qty 
        FROM purchase_items 
        GROUP BY po_id, design_no, size
    `);
    
    // 2. Map declared quantities
    const declaredMap = new Map<string, number>();
    for (const item of allDeclared) {
        const key = `${item.po_id}_${item.design_no}_${item.size_id}`;
        declaredMap.set(key, parseFloat(item.qty || 0));
    }

    // 3. Load all Active Barcodes (Raw SQL)
    console.log("Loading Inventory...");
    const allBarcodes = await AppDataSource.query(`
        SELECT id, po_id, design_no, size as size_id, available_quantity, total_quantity 
        FROM barcode_batches 
        WHERE status = 'active' 
        ORDER BY created_at DESC
    `);

    const currentCounts = new Map<string, number>();
    const toDelete: string[] = [];

    console.log("Analyzing...");
    for (const bb of allBarcodes) {
        if (!bb.po_id) {
            toDelete.push(bb.id);
            continue;
        }

        const key = `${bb.po_id}_${bb.design_no}_${bb.size_id}`;
        const maxAllowed = declaredMap.get(key) || 0;
        const current = (currentCounts.get(key) || 0) + parseInt(bb.total_quantity || 0);

        if (current > maxAllowed) {
            if (parseInt(bb.available_quantity) > 0) {
                toDelete.push(bb.id);
            } else {
                currentCounts.set(key, current);
            }
        } else {
            currentCounts.set(key, current);
        }
    }

    console.log(`Found ${toDelete.length} extra barcodes to remove.`);

    if (toDelete.length > 0) {
        console.log("Executing Global Cleanup...");
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
        console.log("\n✅ Global Cleanup Finished.");
    }

    console.log("-------------------------------------------");
    console.log("DONE! Your Inventory and Purchase Reports are now synced.");
    console.log("-------------------------------------------");
    process.exit(0);
}

fix().catch(err => {
    console.error(err);
    process.exit(1);
});
