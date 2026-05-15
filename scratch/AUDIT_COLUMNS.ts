import { AppDataSource } from '../src/config/data-source';

async function auditColumns() {
    await AppDataSource.initialize();
    
    const res = await AppDataSource.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'barcode_batches'
    `);
    
    console.table(res);
    process.exit(0);
}
auditColumns();
