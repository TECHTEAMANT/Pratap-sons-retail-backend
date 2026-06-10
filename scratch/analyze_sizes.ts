import { AppDataSource } from '../src/config/data-source';

async function main() {
    await AppDataSource.initialize();
    
    const batches = await AppDataSource.query(`
        SELECT design_no, color, size, COUNT(*) as cnt, SUM(total_quantity) as sum_qty
        FROM barcode_batches
        WHERE design_no ILIKE '%ssu-034-25%'
        GROUP BY design_no, color, size
    `);
    console.log("Grouped by Color/Size:");
    console.table(batches);

    const pi = await AppDataSource.query(`
        SELECT design_no, color, size, COUNT(*) as cnt, SUM(quantity) as sum_qty
        FROM purchase_items
        WHERE design_no ILIKE '%ssu-034-25%'
        GROUP BY design_no, color, size
    `);
    console.log("Purchase items grouped by Color/Size:");
    console.table(pi);

    await AppDataSource.destroy();
}

main().catch(console.error);
