import { AppDataSource } from '../src/config/data-source';

async function checkMissingInvoice() {
    await AppDataSource.initialize();
    const res = await AppDataSource.query(`
        SELECT bb.barcode_alias_8digit, po.id as po_id, po.invoice_number, bb.status
        FROM barcode_batches bb
        JOIN purchase_orders po ON po.id = bb.po_id
        WHERE (po.invoice_number IS NULL OR po.invoice_number = '')
        AND bb.status != 'deleted'
        LIMIT 50
    `);
    console.table(res);
    process.exit(0);
}
checkMissingInvoice();
