import { AppDataSource } from '../src/config/data-source';

async function checkOpening() {
    await AppDataSource.initialize();
    const res = await AppDataSource.query(`
        SELECT barcode_alias_8digit, design_no, status, created_at 
        FROM barcode_batches 
        WHERE po_id IS NULL 
        AND status != 'deleted' 
        LIMIT 50
    `);
    console.table(res);
    process.exit(0);
}
checkOpening();
