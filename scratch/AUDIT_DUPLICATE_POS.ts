import { AppDataSource } from '../src/config/data-source';

async function auditDuplicatePOs() {
    await AppDataSource.initialize();
    
    console.log("🔍 Scanning for Duplicate Purchase Orders (Same Invoice Number)...");
    
    const res = await AppDataSource.query(`
        SELECT 
            invoice_number, 
            COUNT(*) as occurrences,
            SUM(total_items) as total_items_sum
        FROM purchase_orders
        WHERE status != 'deleted'
        AND invoice_number IS NOT NULL AND invoice_number != ''
        GROUP BY invoice_number
        HAVING COUNT(*) > 1
        ORDER BY occurrences DESC
    `);
    
    console.table(res);
    
    const totalExtra = res.reduce((acc: number, curr: any) => acc + (Number(curr.total_items_sum) / Number(curr.occurrences)) * (Number(curr.occurrences) - 1), 0);
    console.log(`\n🚨 POTENTIAL DUPLICATE INFLATION: ${totalExtra} items`);

    process.exit(0);
}
auditDuplicatePOs();
