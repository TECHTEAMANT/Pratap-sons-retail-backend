import { AppDataSource } from '../src/config/data-source';

async function main() {
    await AppDataSource.initialize();
    
    const pi = await AppDataSource.query(`
        SELECT design_no, cost_per_item, mrp, COUNT(*) as cnt, SUM(quantity) as sum_qty
        FROM purchase_items
        WHERE design_no ILIKE '%ssu-034-25%'
        GROUP BY design_no, cost_per_item, mrp
    `);
    console.log("Purchase items grouped by cost/mrp:");
    console.table(pi);

    await AppDataSource.destroy();
}

main().catch(console.error);
