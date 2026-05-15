import { AppDataSource } from '../src/config/data-source';

async function checkTypes() {
    await AppDataSource.initialize();
    
    const res = await AppDataSource.query(`
        SELECT table_name, column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name IN ('barcode_batches', 'purchase_orders') 
          AND column_name = 'vendor'
    `);
    
    console.table(res);
    process.exit(0);
}
checkTypes();
