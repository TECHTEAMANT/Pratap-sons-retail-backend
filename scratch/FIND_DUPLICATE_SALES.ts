import { AppDataSource } from '../src/config/data-source';

async function findDuplicateSales() {
    await AppDataSource.initialize();
    
    // 1. Get Vendor ID
    const vendor = await AppDataSource.query(`SELECT id FROM vendors WHERE name = 'UMMED SAREE CENTRE NX'`);
    const vendorId = vendor[0].id;
    
    // 2. Find duplicates
    const res = await AppDataSource.query(`
        SELECT si.barcode_8digit, COUNT(*) as count 
        FROM sales_invoice_items si 
        JOIN barcode_batches bb ON bb.barcode_alias_8digit = si.barcode_8digit 
        WHERE bb.vendor = '${vendorId}' 
        GROUP BY si.barcode_8digit 
        HAVING COUNT(*) > 1
    `);
    
    console.table(res);
    process.exit(0);
}
findDuplicateSales();
