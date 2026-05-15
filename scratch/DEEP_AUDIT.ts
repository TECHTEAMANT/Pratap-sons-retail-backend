import { AppDataSource } from '../src/config/data-source';

async function deepAudit() {
    await AppDataSource.initialize();
    
    const res = await AppDataSource.query(`
        SELECT 
            t.relname as table_name,
            a.attname as column_name, 
            format_type(a.atttypid, a.atttypmod) AS data_type 
        FROM pg_attribute a 
        JOIN pg_class t ON a.attrelid = t.oid 
        JOIN pg_namespace n ON t.relnamespace = n.oid 
        WHERE t.relname IN ('barcode_batches', 'purchase_orders') 
          AND a.attname = 'vendor' 
          AND NOT a.attisdropped
    `);
    
    console.table(res);
    process.exit(0);
}
deepAudit();
