import { AppDataSource } from '../src/config/data-source';

async function checkPoLinkType() {
    await AppDataSource.initialize();
    
    const res = await AppDataSource.query(`
        SELECT table_name, column_name, data_type 
        FROM information_schema.columns 
        WHERE (table_name = 'barcode_batches' AND column_name = 'po_id') 
           OR (table_name = 'purchase_orders' AND column_name = 'id')
    `);
    
    console.table(res);
    process.exit(0);
}
checkPoLinkType();
