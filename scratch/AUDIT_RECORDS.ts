import { AppDataSource } from '../src/config/data-source';

async function auditDuplicates() {
    await AppDataSource.initialize();
    const res = await AppDataSource.query(`
        SELECT barcode_alias_8digit, COUNT(*) as occurrence
        FROM barcode_batches
        WHERE status != 'deleted'
        GROUP BY barcode_alias_8digit
        HAVING COUNT(*) > 1
        LIMIT 50
    `);
    console.log("Duplicate Barcode Aliases Found:");
    console.table(res);
    
    const countRes = await AppDataSource.query(`
        SELECT SUM(occurrence - 1) as total_duplicates
        FROM (
            SELECT COUNT(*) as occurrence
            FROM barcode_batches
            WHERE status != 'deleted'
            GROUP BY barcode_alias_8digit
            HAVING COUNT(*) > 1
        ) as sub
    `);
    console.log(`TOTAL DUPLICATE RECORDS TO CLEAN: ${countRes[0].total_duplicates}`);
    
    process.exit(0);
}
auditDuplicates();
