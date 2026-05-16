import { AppDataSource } from '../src/config/data-source';

async function distributionFix() {
    try {
        await AppDataSource.initialize();
        console.log('DataSource initialized');

        // Get all POs that we might have over-repaired
        const pos = await AppDataSource.query(`
            SELECT DISTINCT po_id FROM barcode_batches WHERE po_id IS NOT NULL
        `);

        for (const p of pos) {
            const poId = p.po_id;
            
            // Get all purchase items for this PO
            const pItems = await AppDataSource.query(`
                SELECT design_no, quantity FROM purchase_items WHERE po_id = $1
            `, [poId]);

            const clean = (s: string) => (s || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();

            for (const pi of pItems) {
                const piClean = clean(pi.design_no);
                const targetTotal = Number(pi.quantity);

                // Find all barcodes that match this purchase item
                const barcodes = await AppDataSource.query(`
                    SELECT id, barcode_alias_8digit, design_no FROM barcode_batches 
                    WHERE po_id = $1 AND total_quantity > 0
                `, [poId]);

                const matchingBarcodes = barcodes.filter((b: any) => {
                    const bClean = clean(b.design_no);
                    return bClean === piClean || piClean.startsWith(bClean) || bClean.startsWith(piClean);
                });

                if (matchingBarcodes.length > 0) {
                    // Distribute the total quantity among these barcodes
                    // Usually each barcode is 1 piece
                    const qtyPerBarcode = Math.floor(targetTotal / matchingBarcodes.length);
                    const remainder = targetTotal % matchingBarcodes.length;

                    console.log(`PO ${poId} | Design ${pi.design_no}: Distributing ${targetTotal} pieces to ${matchingBarcodes.length} barcodes...`);

                    for (let i = 0; i < matchingBarcodes.length; i++) {
                        const finalQty = qtyPerBarcode + (i < remainder ? 1 : 0);
                        if (finalQty > 0) {
                            await AppDataSource.query(`
                                UPDATE barcode_batches SET total_quantity = $1, available_quantity = $1 WHERE id = $2
                            `, [finalQty, matchingBarcodes[i].id]);
                        }
                    }
                }
            }
        }

        console.log('Distribution Fix Complete.');
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
distributionFix();
