import { AppDataSource } from '../src/config/data-source';

async function auditDuplicates() {
    await AppDataSource.initialize();
    
    const res = await AppDataSource.query(`
        SELECT barcode_alias_8digit, COUNT(*) as count 
        FROM barcode_batches 
        WHERE status != 'deleted' 
        GROUP BY barcode_alias_8digit 
        HAVING COUNT(*) > 1
        ORDER BY count DESC
    `);
    console.table(res);
    console.log(`TOTAL DUPLICATE ALIASES FOUND: ${res.length}`);

    process.exit(0);
}
auditDuplicates();
