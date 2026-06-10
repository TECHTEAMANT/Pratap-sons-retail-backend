import { AppDataSource } from '../src/config/data-source';

async function main() {
    await AppDataSource.initialize();
    
    console.log("--- Missing Barcodes in Barcode Batches ---");
    const batches = await AppDataSource.query(`
        SELECT id, barcode_alias_8digit, design_no, total_quantity, available_quantity, status
        FROM barcode_batches
        WHERE barcode_alias_8digit IN ('00003533', '00003557', '00003546', '00003549', '00003528', '00003520', '00003552', '00003560')
    `);
    console.table(batches);

    console.log("--- Checking Purchase Invoices ---");
    const poIds = await AppDataSource.query(`
        SELECT DISTINCT po_id FROM purchase_items WHERE design_no ILIKE '%ssu-034-25%'
    `);
    console.log("Purchase Invoices IDs:", poIds.map((p: any) => p.po_id));

    await AppDataSource.destroy();
}

main().catch(console.error);
