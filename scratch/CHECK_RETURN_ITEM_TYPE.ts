import { AppDataSource } from '../src/config/data-source';

async function checkReturnItemType() {
    await AppDataSource.initialize();
    
    const res = await AppDataSource.query(`
        SELECT table_name, column_name, data_type 
        FROM information_schema.columns 
        WHERE (table_name = 'purchase_return_items' AND column_name = 'item_id') 
           OR (table_name = 'barcode_batches' AND column_name = 'id')
    `);
    
    console.table(res);
    process.exit(0);
}
checkReturnItemType();
