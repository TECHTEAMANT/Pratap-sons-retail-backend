import { AppDataSource } from '../src/config/data-source';

async function checkReturnsLink() {
    await AppDataSource.initialize();
    
    const res = await AppDataSource.query(`
        SELECT table_name, column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'purchase_returns' AND column_name = 'original_po_id'
    `);
    
    console.table(res);
    process.exit(0);
}
checkReturnsLink();
