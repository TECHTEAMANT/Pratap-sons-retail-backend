import { AppDataSource } from '../src/config/data-source';

async function checkDefectiveType() {
    await AppDataSource.initialize();
    
    const res = await AppDataSource.query(`
        SELECT table_name, column_name, data_type 
        FROM information_schema.columns 
        WHERE (table_name = 'defective_stock' AND column_name = 'barcode_batch_id') 
           OR (table_name = 'barcode_batches' AND column_name = 'id')
    `);
    
    console.table(res);
    process.exit(0);
}
checkDefectiveType();
