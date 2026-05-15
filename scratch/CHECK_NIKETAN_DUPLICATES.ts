import { AppDataSource } from '../src/config/data-source';

async function checkDuplicates() {
    await AppDataSource.initialize();
    
    const res = await AppDataSource.query(`
        SELECT barcode_alias_8digit, COUNT(*) as count 
        FROM barcode_batches 
        WHERE vendor = '850903cf-a0d5-456d-835a-7f835696a9b9'
        GROUP BY barcode_alias_8digit 
        HAVING COUNT(*) > 1
    `);
    
    console.table(res);
    process.exit(0);
}
checkDuplicates();
