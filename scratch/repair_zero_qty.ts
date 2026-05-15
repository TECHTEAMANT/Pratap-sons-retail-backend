import { AppDataSource } from '../src/config/data-source';
import { BarcodeBatch } from '../src/entities/BarcodeBatch';
import { PurchaseItem } from '../src/entities/PurchaseItem';

async function auditAndRepair() {
    try {
        await AppDataSource.initialize();
        console.log('DataSource initialized');

        // Find barcodes with 0 quantity that are linked to a PO
        const zeros = await AppDataSource.query(`
            SELECT bb.id, bb.barcode_alias_8digit, bb.design_no, bb.po_id, po.invoice_number
            FROM barcode_batches bb
            JOIN purchase_orders po ON po.id = bb.po_id
            WHERE bb.total_quantity = 0 AND po.status = 'Completed'
        `);

        console.log(`Found ${zeros.length} barcodes with 0 total_quantity`);

        for (const z of zeros) {
            // Try to find the matching purchase item to see what the quantity should be
            const [pi] = await AppDataSource.query(`
                SELECT quantity 
                FROM purchase_items 
                WHERE po_id = $1 AND design_no = $2
                LIMIT 1
            `, [z.po_id, z.design_no]);

            if (pi && pi.quantity > 0) {
                console.log(`Repairing Barcode ${z.barcode_alias_8digit}: Setting total_quantity to ${pi.quantity}`);
                await AppDataSource.query(`
                    UPDATE barcode_batches 
                    SET total_quantity = $1, available_quantity = $1 
                    WHERE id = $2
                `, [pi.quantity, z.id]);
            } else {
                console.log(`Barcode ${z.barcode_alias_8digit}: No matching purchase item quantity found.`);
            }
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

auditAndRepair();
