import { AppDataSource } from '../src/config/data-source';

async function finalCount() {
    await AppDataSource.initialize();
    
    const res = await AppDataSource.query(`
        SELECT COUNT(*) as count 
        FROM barcode_batches 
        WHERE status != 'deleted'
    `);
    
    console.log(`\n✨ FINAL SYSTEM TOTAL: ${res[0].count}`);
    process.exit(0);
}
finalCount();
