import { AppDataSource } from '../src/config/data-source';

async function auditUmmedSales() {
    await AppDataSource.initialize();
    
    // 1. Get Vendor ID
    const vendor = await AppDataSource.query(`SELECT id FROM vendors WHERE name = 'UMMED SAREE CENTRE NX'`);
    const vendorId = vendor[0].id;
    
    // 2. Get Sales
    const res = await AppDataSource.query(`
        SELECT si.barcode_8digit, si.quantity, inv.invoice_no, inv.status as invoice_status
        FROM sales_invoice_items si 
        JOIN sales_invoices inv ON inv.id = si.invoice_id
        JOIN barcode_batches bb ON bb.barcode_alias_8digit = si.barcode_8digit 
        WHERE bb.vendor = '${vendorId}'
    `);
    
    console.table(res);
    
    const totalSold = res.reduce((acc: number, curr: any) => acc + Number(curr.quantity), 0);
    console.log('Total Pieces Sold in Records:', totalSold);
    
    process.exit(0);
}
auditUmmedSales();
