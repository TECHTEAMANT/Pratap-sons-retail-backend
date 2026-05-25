import { AppDataSource } from '../src/config/data-source';

async function main() {
    await AppDataSource.initialize();
    
    console.log("\n--- Purchase Items for TW-032C ---");
    const pi = await AppDataSource.query(`
        SELECT design_no, cost_per_item, mrp, COUNT(*) as cnt, SUM(quantity) as sum_qty
        FROM purchase_items
        WHERE design_no ILIKE '%TW-032C%'
        GROUP BY design_no, cost_per_item, mrp
    `);
    console.table(pi);

    console.log("\n--- Barcode Batches for TW-032C ---");
    const bb = await AppDataSource.query(`
        SELECT design_no, cost_actual, COUNT(*) as cnt, SUM(total_quantity) as sum_qty
        FROM barcode_batches
        WHERE design_no ILIKE '%TW-032C%' AND status != 'deleted'
        GROUP BY design_no, cost_actual
    `);
    console.table(bb);

    await AppDataSource.destroy();
}

main().catch(console.error);
