import { AppDataSource } from '../src/config/data-source';

async function investigate() {
    try {
        await AppDataSource.initialize();
        const po = await AppDataSource.query(`SELECT id FROM purchase_orders WHERE invoice_number = '5407'`);
        if (po.length > 0) {
            const pi = await AppDataSource.query(`SELECT design_no, quantity FROM purchase_items WHERE po_id = $1 LIMIT 5`, [po[0].id]);
            const bb = await AppDataSource.query(`SELECT design_no, total_quantity, barcode_alias_8digit FROM barcode_batches WHERE po_id = $1 LIMIT 5`, [po[0].id]);
            console.log('PO ID:', po[0].id);
            console.log('PI Sample:', JSON.stringify(pi, null, 2));
            console.log('BB Sample:', JSON.stringify(bb, null, 2));
        }
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
investigate();
