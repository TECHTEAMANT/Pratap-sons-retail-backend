import { AppDataSource } from '../src/config/data-source';

async function check() {
    await AppDataSource.initialize();
    const res = await AppDataSource.query(`
        SELECT COUNT(*) as cnt 
        FROM barcode_batches bb 
        WHERE bb.status = 'sold' 
        AND EXISTS (
            SELECT 1 FROM sales_invoice_items sii 
            JOIN sales_invoices si ON si.id = sii.invoice_id 
            WHERE sii.barcode_8digit = bb.barcode_alias_8digit 
            AND si.invoice_date BETWEEN '2026-02-01'::date AND '2026-05-15'::date
        )
    `);
    console.log(res);
    process.exit(0);
}
check().catch(console.error);
