import { AppDataSource } from '../src/config/data-source';

async function broadCheck() {
    await AppDataSource.initialize();
    const res = await AppDataSource.query(`
        SELECT barcode_alias_8digit, po_id, status, created_at 
        FROM barcode_batches 
        WHERE (po_id IS NULL OR po_id NOT IN (SELECT id FROM purchase_orders))
        AND status != 'deleted'
        LIMIT 50
    `);
    console.log("Orphan Barcodes (No PO or Invalid PO):");
    console.table(res);

    const res2 = await AppDataSource.query(`
        SELECT bb.barcode_alias_8digit, po.invoice_number, bb.status
        FROM barcode_batches bb
        LEFT JOIN purchase_orders po ON po.id = bb.po_id
        WHERE bb.status != 'deleted'
        AND (po.invoice_number IS NULL OR po.invoice_number = '')
        LIMIT 50
    `);
    console.log("Barcodes with Empty Invoice Numbers:");
    console.table(res2);

    process.exit(0);
}
broadCheck();
