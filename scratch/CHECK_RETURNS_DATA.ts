import { AppDataSource } from '../src/config/data-source';

async function checkReturnsData() {
    await AppDataSource.initialize();
    
    const res = await AppDataSource.query(`
        SELECT ri.barcode_id, bb.barcode_alias_8digit
        FROM purchase_return_items ri
        LEFT JOIN barcode_batches bb ON bb.id = ri.barcode_id
        LIMIT 5
    `);
    
    console.table(res);
    process.exit(0);
}
checkReturnsData();
