import { AppDataSource } from '../src/config/data-source';

async function syncAvailability() {
    try {
        await AppDataSource.initialize();
        console.log('DataSource initialized');

        // We will recalculate available_quantity for all barcodes
        // Formula: Available = Total - Sold - Returned
        const barcodes = await AppDataSource.query(`
            SELECT id, barcode_alias_8digit, total_quantity FROM barcode_batches
        `);

        console.log(`Syncing availability for ${barcodes.length} barcodes...`);

        for (const b of barcodes) {
            // Get sold quantity for this barcode
            const sales = await AppDataSource.query(`
                SELECT COALESCE(SUM(quantity), 0) as count 
                FROM sales_invoice_items 
                WHERE barcode_8digit = $1
            `, [b.barcode_alias_8digit]);

            // Get returned quantity for this barcode
            const returns = await AppDataSource.query(`
                SELECT COALESCE(SUM(quantity), 0) as count 
                FROM purchase_return_items 
                WHERE barcode_id = $1
            `, [b.barcode_alias_8digit]);

            const nSold = Number(sales[0].count);
            const nRet = Number(returns[0].count);
            const nTotal = Number(b.total_quantity);
            const nAvail = Math.max(0, nTotal - nSold - nRet);

            if (nAvail !== Number(b.available_quantity)) {
                await AppDataSource.query(`
                    UPDATE barcode_batches SET available_quantity = $1 WHERE id = $2
                `, [nAvail, b.id]);
            }
        }

        console.log('Availability Sync Complete.');
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
syncAvailability();
