import { AppDataSource } from '../src/config/data-source';

async function main() {
    await AppDataSource.initialize();
    
    const batches = await AppDataSource.query(`
        SELECT id, barcode_alias_8digit, design_no, total_quantity, available_quantity, po_id, created_at
        FROM barcode_batches
        WHERE design_no ILIKE '%ssu-034-25%'
    `);
    console.log("Total batches for ssu-034-25:", batches.length);
    for (const b of batches) {
        console.log(`Alias: ${b.barcode_alias_8digit}, TQ: ${b.total_quantity}, AQ: ${b.available_quantity}, PO: ${b.po_id}`);
    }

    const pos = await AppDataSource.query(`
        SELECT po_number, invoice_number, id FROM purchase_orders WHERE id IN (
            SELECT DISTINCT po_id FROM barcode_batches WHERE design_no ILIKE '%ssu-034-25%'
        )
    `);
    console.log("POs:", pos);

    await AppDataSource.destroy();
}

main().catch(console.error);
