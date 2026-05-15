import { AppDataSource } from '../src/config/data-source';

async function auditQuantity() {
    await AppDataSource.initialize();
    const res = await AppDataSource.query(`
        SELECT barcode_alias_8digit, total_quantity, available_quantity, status 
        FROM barcode_batches 
        WHERE total_quantity > 1 
        AND status != 'deleted' 
        LIMIT 50
    `);
    console.table(res);
    
    const sumRes = await AppDataSource.query(`
        SELECT SUM(total_quantity) - COUNT(*) as surplus
        FROM barcode_batches
        WHERE status != 'deleted'
        AND (total_quantity > 1)
    `);
    console.log(`TOTAL SURPLUS FROM QUANTITIES > 1: ${sumRes[0].surplus}`);
    
    process.exit(0);
}
auditQuantity();
