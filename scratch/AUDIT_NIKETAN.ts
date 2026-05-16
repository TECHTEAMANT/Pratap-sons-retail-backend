import { AppDataSource } from '../src/config/data-source';

async function auditVendor() {
    await AppDataSource.initialize();
    
    const vendorId = '850903cf-a0d5-456d-835a-7f835696a9b9';
    
    console.log('--- PURCHASE ORDERS ---');
    const pos = await AppDataSource.query(`
        SELECT id, po_number, total_items, order_date, status 
        FROM purchase_orders 
        WHERE vendor = $1 AND order_date >= '2026-02-01'
    `, [vendorId]);
    console.table(pos);
    
    console.log('--- BARCODE BATCHES ---');
    const barcodes = await AppDataSource.query(`
        SELECT bb.id, bb.barcode_alias_8digit, bb.total_quantity, bb.po_id, po.po_number, po.order_date
        FROM barcode_batches bb
        LEFT JOIN purchase_orders po ON po.id = bb.po_id
        WHERE bb.vendor = $1
    `, [vendorId]);
    console.table(barcodes);
    
    process.exit(0);
}
auditVendor();
