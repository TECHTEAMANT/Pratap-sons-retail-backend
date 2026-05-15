import { AppDataSource } from '../src/config/data-source';

async function auditGhostSales() {
    await AppDataSource.initialize();
    
    const res = await AppDataSource.query(`
        SELECT COUNT(*) as count 
        FROM sales_invoice_items sii 
        LEFT JOIN barcode_batches bb ON bb.barcode_alias_8digit = sii.barcode_8digit 
        WHERE bb.id IS NULL
    `);
    console.log(`SALES WITHOUT BARCODE RECORDS: ${res[0].count}`);

    process.exit(0);
}
auditGhostSales();
