import { AppDataSource } from '../src/config/data-source';

async function deepRepair() {
    try {
        await AppDataSource.initialize();
        console.log('DataSource initialized');

        // This query finds the EXACT match between purchase_items and barcode_batches
        // based on PO, Design, Size, and Color
        const query = `
            UPDATE barcode_batches bb
            SET 
                total_quantity = pi.quantity,
                available_quantity = pi.quantity
            FROM purchase_items pi
            WHERE 
                bb.po_id = pi.po_id 
                AND bb.design_no = pi.design_no
                AND bb.size = pi.size
                AND (bb.color = pi.color OR (bb.color IS NULL AND pi.color IS NULL))
                AND bb.total_quantity = 0
            RETURNING bb.barcode_alias_8digit, bb.total_quantity;
        `;

        const results = await AppDataSource.query(query);
        console.log(`Successfully Deep-Repaired ${results.length} barcodes with exact matches.`);
        
        if (results.length > 0) {
            console.log('Sample Repaired:', results.slice(0, 5));
        }

        // Second pass: For items where Size/Color might be UUIDs in one table and text in another,
        // we use a broader match on Design + PO if it's unique
        const broadQuery = `
            UPDATE barcode_batches bb
            SET 
                total_quantity = pi.quantity,
                available_quantity = pi.quantity
            FROM purchase_items pi
            WHERE 
                bb.po_id = pi.po_id 
                AND bb.design_no = pi.design_no
                AND bb.total_quantity = 0
                AND (SELECT COUNT(*) FROM purchase_items pi2 WHERE pi2.po_id = bb.po_id AND pi2.design_no = bb.design_no) = 1
            RETURNING bb.barcode_alias_8digit, bb.total_quantity;
        `;
        const broadResults = await AppDataSource.query(broadQuery);
        console.log(`Successfully Broad-Repaired ${broadResults.length} barcodes (unique design per PO).`);

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

deepRepair();
