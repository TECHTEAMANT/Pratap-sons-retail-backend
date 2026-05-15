import { AppDataSource } from '../src/config/data-source';

async function listAllColumns() {
    await AppDataSource.initialize();
    
    const res = await AppDataSource.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'barcode_batches'
    `);
    
    console.log(res.map((r: any) => r.column_name).join(', '));
    process.exit(0);
}
listAllColumns();
