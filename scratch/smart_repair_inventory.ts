import { AppDataSource } from '../src/config/data-source';

async function smartRepair() {
    try {
        await AppDataSource.initialize();
        console.log('DataSource initialized');

        // We will match by PO ID and use a "fuzzy" match for design numbers
        // and also match by the Nth item if names are close.
        const pos = await AppDataSource.query(`
            SELECT DISTINCT po_id FROM barcode_batches WHERE total_quantity = 0 AND po_id IS NOT NULL
        `);

        console.log(`Checking ${pos.length} Purchase Orders for zero-quantity items...`);

        for (const p of pos) {
            const poId = p.po_id;
            
            // Get all 0-qty barcodes for this PO
            const barcodes = await AppDataSource.query(`
                SELECT id, design_no, barcode_alias_8digit FROM barcode_batches 
                WHERE po_id = $1 AND total_quantity = 0
            `, [poId]);

            // Get all purchase items for this PO
            const pItems = await AppDataSource.query(`
                SELECT design_no, quantity FROM purchase_items WHERE po_id = $1
            `, [poId]);

            if (barcodes.length === 0 || pItems.length === 0) continue;

            console.log(`Processing PO ${poId}: ${barcodes.length} barcodes vs ${pItems.length} purchase items`);

            for (const b of barcodes) {
                // Try to find a fuzzy match
                // 1. Try exact match (already failed mostly)
                // 2. Try matching start of string
                // 3. Try matching after removing dashes/spaces
                const clean = (s: string) => (s || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
                const bClean = clean(b.design_no);

                let match = pItems.find((pi: any) => clean(pi.design_no) === bClean);
                
                if (!match) {
                    // Try prefix match (e.g. "DES 6498 BR" matches "DES 6498 BR-1")
                    match = pItems.find((pi: any) => clean(pi.design_no).startsWith(bClean) || bClean.startsWith(clean(pi.design_no)));
                }

                if (match) {
                    console.log(`   Repairing ${b.barcode_alias_8digit}: Match found (${b.design_no} <-> ${match.design_no})`);
                    await AppDataSource.query(`
                        UPDATE barcode_batches 
                        SET total_quantity = $1, available_quantity = $1 
                        WHERE id = $2
                    `, [match.quantity || 1, b.id]);
                }
            }
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
smartRepair();
