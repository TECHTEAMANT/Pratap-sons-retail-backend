import { AppDataSource } from '../src/config/data-source';

async function auditStatuses() {
    await AppDataSource.initialize();
    
    const res = await AppDataSource.query(`
        SELECT status, COUNT(*) as count 
        FROM barcode_batches 
        GROUP BY status
    `);
    
    console.table(res);
    process.exit(0);
}
auditStatuses();
