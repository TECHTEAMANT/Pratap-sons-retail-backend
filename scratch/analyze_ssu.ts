import { AppDataSource } from '../src/config/data-source';

async function main() {
    await AppDataSource.initialize();
    
    const designNo = 'ssu-034-25';
    
    console.log("--- Barcode Batches ---");
    const batches = await AppDataSource.query(`
        SELECT id, barcode_alias_8digit, design_no, total_quantity, available_quantity, status
        FROM barcode_batches
        WHERE design_no ILIKE $1
    `, [`%${designNo}%`]);
    console.table(batches);

    console.log("--- Purchase Items ---");
    const purchases = await AppDataSource.query(`
        SELECT id, design_no, quantity, po_id, created_at
        FROM purchase_items
        WHERE design_no ILIKE $1
    `, [`%${designNo}%`]);
    console.table(purchases);

    console.log("--- Sales Items ---");
    const sales = await AppDataSource.query(`
        SELECT id, design_no, barcode_8digit, quantity, created_at
        FROM sales_invoice_items
        WHERE design_no ILIKE $1 OR barcode_8digit IN (SELECT barcode_alias_8digit FROM barcode_batches WHERE design_no ILIKE $1)
    `, [`%${designNo}%`]);
    console.table(sales);

    await AppDataSource.destroy();
}

main().catch(console.error);
