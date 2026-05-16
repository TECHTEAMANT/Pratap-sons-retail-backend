import { AppDataSource } from '../src/config/data-source';

async function rawTypeAudit() {
    await AppDataSource.initialize();
    
    const res = await AppDataSource.query(`
        SELECT table_name, column_name, udt_name 
        FROM information_schema.columns 
        WHERE table_name IN ('barcode_batches', 'purchase_orders') 
          AND column_name IN ('vendor', 'po_id', 'id')
    `);
    
    console.table(res);
    process.exit(0);
}
rawTypeAudit();
