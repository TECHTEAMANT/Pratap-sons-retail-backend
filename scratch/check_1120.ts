import { AppDataSource } from '../src/config/data-source';

async function check1120() {
    try {
        await AppDataSource.initialize();
        const res = await AppDataSource.query(`
            SELECT b.id, b.barcode_alias_8digit, b.design_no, b.po_id, po.invoice_number, po.status as po_status
            FROM barcode_batches b 
            LEFT JOIN purchase_orders po ON po.id = b.po_id 
            WHERE b.barcode_alias_8digit = '00001120'
        `);
        console.log('Barcode 1120 Details:', JSON.stringify(res, null, 2));

        if (res.length > 0 && res[0].po_id) {
            const pi = await AppDataSource.query(`
                SELECT design_no, quantity 
                FROM purchase_items 
                WHERE po_id = $1
            `, [res[0].po_id]);
            console.log('Purchase Items for this PO:', JSON.stringify(pi, null, 2));
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
check1120();
