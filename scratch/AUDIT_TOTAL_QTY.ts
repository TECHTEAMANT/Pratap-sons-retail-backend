import { AppDataSource } from '../src/config/data-source';

async function auditTotalQty() {
    await AppDataSource.initialize();
    
    const res = await AppDataSource.query(`
        SELECT SUM(total_quantity) as total 
        FROM barcode_batches 
        WHERE status != 'deleted'
    `);
    
    console.log(`\n📊 LOCAL SUM OF TOTAL_QUANTITY: ${res[0].total}`);
    process.exit(0);
}
auditTotalQty();
