import { AppDataSource } from '../src/config/data-source';

async function checkAllTypes() {
    await AppDataSource.initialize();
    
    const res = await AppDataSource.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'barcode_batches' 
          AND column_name IN ('product_group', 'size', 'color', 'vendor', 'floor')
    `);
    
    console.table(res);
    process.exit(0);
}
checkAllTypes();
