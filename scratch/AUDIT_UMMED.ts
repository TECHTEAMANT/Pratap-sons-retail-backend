import { AppDataSource } from '../src/config/data-source';

async function auditUmmed() {
    await AppDataSource.initialize();
    
    // 1. Get Vendor ID
    const vendor = await AppDataSource.query(`SELECT id FROM vendors WHERE name = 'UMMED SAREE CENTRE NX'`);
    if (!vendor.length) { console.log('Vendor not found'); process.exit(0); }
    const vendorId = vendor[0].id;
    
    // 2. Get Barcodes
    const res = await AppDataSource.query(`
        SELECT bb.barcode_alias_8digit, bb.total_quantity, po.po_number
        FROM barcode_batches bb 
        JOIN purchase_orders po ON po.id = bb.po_id 
        WHERE bb.vendor = '${vendorId}'
    `);
    
    console.table(res);
    
    const totalQty = res.reduce((acc: number, curr: any) => acc + Number(curr.total_quantity), 0);
    console.log('Total Pieces in Inventory:', totalQty);
    
    // 3. Get PO Totals
    const poTotals = await AppDataSource.query(`
        SELECT po_number, total_items 
        FROM purchase_orders 
        WHERE vendor = '${vendorId}'
    `);
    console.table(poTotals);
    
    process.exit(0);
}
auditUmmed();
